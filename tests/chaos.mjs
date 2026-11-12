import { fork } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { harness } from "./harness.ts";
const persistent = await mkdtemp(join(tmpdir(), "crewforge-chaos-"));
let child;
async function boot(migrate) {
  child = fork("tests/chaos-child.mjs", [], {
    detached: true,
    env: {
      ...process.env,
      CHAOS_DB: persistent,
      CHAOS_MIGRATE: migrate ? "1" : "0",
    },
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  return new Promise((resolve, reject) => {
    child.on("message", (m) => {
      if (m.type === "ready") resolve("http://127.0.0.1:" + m.port);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code) reject(Error("Child exited " + code));
    });
  });
}
async function stop(signal) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    process.kill(-child.pid, signal);
  });
}
async function call(
  origin,
  user,
  path,
  method = "POST",
  body = {},
  key = crypto.randomUUID(),
  extra = {},
) {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-test-user": user,
      "Idempotency-Key": key,
      ...extra,
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { status: r.status, body: await r.json() };
}
try {
  let origin = await boot(true);
  await call(origin, "chaos-leader", "/bootstrap");
  await call(origin, "chaos-joiner", "/bootstrap");
  const team = await call(origin, "chaos-leader", "/teams", "POST", {
    name: "Chaos crew",
    pitch: "Survive an interrupted response.",
    skills: ["React"],
    minSize: 2,
    maxSize: 2,
  });
  assert.equal(team.status, 200);
  const invite = await call(
    origin,
    "chaos-leader",
    "/teams/" + team.body.teamId + "/invites",
    "POST",
    { hours: 24 },
  );
  const key = crypto.randomUUID();
  const committed = new Promise((resolve) =>
    child.on("message", (m) => {
      if (m.type === "committed") resolve();
    }),
  );
  const lost = call(
    origin,
    "chaos-joiner",
    "/join",
    "POST",
    { code: invite.body.code },
    key,
    { "x-kill-after-commit": "1" },
  ).then(
    () => false,
    () => true,
  );
  await committed;
  await stop("SIGKILL");
  assert.equal(await lost, true);
  origin = await boot(false);
  const retried = await call(
    origin,
    "chaos-joiner",
    "/join",
    "POST",
    { code: invite.body.code },
    key,
  );
  assert.equal(retried.status, 200);
  assert.equal(retried.body.teamId, team.body.teamId);
  await stop("SIGTERM");
  const h = await harness({ persist: persistent, migrate: false });
  const invariant = await h.db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM members WHERE user_id='live-chaos-joiner') memberships,(SELECT COUNT(*) FROM audit WHERE actor_id='live-chaos-joiner' AND action='member.joined') audits,(SELECT COUNT(*) FROM teams t WHERE member_count<>(SELECT COUNT(*) FROM members m WHERE m.team_id=t.id)) brokenCounts",
    )
    .first();
  await h.mf.dispose();
  assert.deepEqual(invariant, { memberships: 1, audits: 1, brokenCounts: 0 });
  const report = {
    measuredAt: new Date().toISOString(),
    passed: true,
    scenario:
      "SIGKILL process group after database commit but before HTTP acknowledgement; restart persistent SQLite and retry original key.",
    retryStatus: retried.status,
    invariant,
    scope:
      "Local workerd and Node bridge restart. Not a simulated provider-wide Cloudflare failure.",
  };
  await mkdir("reports", { recursive: true });
  await writeFile("reports/chaos.json", JSON.stringify(report, null, 2) + "\n");
  console.log(report);
} finally {
  await stop("SIGTERM");
  await rm(persistent, { recursive: true, force: true });
}
