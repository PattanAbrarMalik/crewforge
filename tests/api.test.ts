import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness.ts";
import { scoreCandidate } from "../core/scoring.ts";
let h: Awaited<ReturnType<typeof harness>>;
before(async () => {
  h = await harness();
});
after(async () => {
  await h.mf.dispose();
});
const payload = {
  name: "Bright idea",
  pitch: "A useful project for our community.",
  skills: ["React"],
  minSize: 2,
  maxSize: 4,
};
test("01 public health check", async () =>
  assert.equal((await h.call(null, "/health")).status, 200));
test("02 authentication is required", async () =>
  assert.equal((await h.call(null, "/board")).status, 401));
test("03 bootstrap is idempotent", async () => {
  const u = await h.user();
  await h.call(u, "/bootstrap", "POST", {});
  assert.equal(
    (
      await h.db
        .prepare("SELECT COUNT(*) n FROM people WHERE id=?")
        .bind("live-" + u)
        .first<any>()
    ).n,
    1,
  );
});
test("04 create atomically includes leader membership", async () => {
  const u = await h.user(),
    t = await h.create(u),
    r = await h.call(u, "/teams/" + t);
  assert.equal(r.body.team.member_count, 1);
  assert.equal(r.body.members[0].id, "live-" + u);
});
test("05 one person cannot create two teams", async () => {
  const u = await h.user();
  await h.create(u);
  assert.equal((await h.call(u, "/teams", "POST", payload)).status, 409);
});
test("06 idempotent create converges under 15 retries", async () => {
  const u = await h.user(),
    key = crypto.randomUUID(),
    r = await Promise.all(
      Array.from({ length: 15 }, () =>
        h.call(u, "/teams", "POST", payload, key),
      ),
    );
  assert.ok(r.every((x) => x.status === 200));
  assert.equal(new Set(r.map((x) => x.body.teamId)).size, 1);
});
test("07 key reuse with changed body conflicts", async () => {
  const u = await h.user(),
    key = crypto.randomUUID();
  await h.call(u, "/teams", "POST", payload, key);
  assert.equal(
    (await h.call(u, "/teams", "POST", { ...payload, name: "Different" }, key))
      .status,
    409,
  );
});
test("08 idempotency key is mandatory", async () => {
  const u = await h.user();
  assert.equal(
    (await h.call(u, "/teams", "POST", payload, "short")).status,
    400,
  );
});
for (const [label, value] of [
  ["minimum", { ...payload, minSize: 1 }],
  ["maximum", { ...payload, maxSize: 7 }],
  ["inverted sizes", { ...payload, minSize: 5, maxSize: 4 }],
  ["short name", { ...payload, name: "x" }],
  ["unknown skill", { ...payload, skills: ["injection"] }],
  ["extra field", { ...payload, admin: true }],
] as const) {
  test("09 validation rejects " + label, async () => {
    const u = await h.user();
    assert.equal((await h.call(u, "/teams", "POST", value)).status, 400);
  });
}
test("10 50 concurrent contenders yield exactly one final-seat winner", async () => {
  const leader = await h.user(),
    t = await h.create(leader, 2),
    code = await h.invite(leader, t);
  const users = await Promise.all(Array.from({ length: 50 }, () => h.user()));
  const r = await Promise.all(
    users.map((u) => h.call(u, "/join", "POST", { code })),
  );
  assert.equal(r.filter((x) => x.status === 200).length, 1);
  assert.equal(r.filter((x) => x.status === 409).length, 49);
  assert.equal((await h.call(leader, "/teams/" + t)).body.team.member_count, 2);
});
test("11 same person racing for two teams joins only one", async () => {
  const [a, b, u] = await Promise.all([h.user(), h.user(), h.user()]),
    ta = await h.create(a),
    tb = await h.create(b),
    ca = await h.invite(a, ta),
    cb = await h.invite(b, tb);
  const r = await Promise.all([
    h.call(u, "/join", "POST", { code: ca }),
    h.call(u, "/join", "POST", { code: cb }),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
});
test("12 retrying a join does not duplicate membership or audit", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a),
    code = await h.invite(a, t),
    key = crypto.randomUUID();
  const r = await Promise.all(
    Array.from({ length: 10 }, () => h.call(u, "/join", "POST", { code }, key)),
  );
  assert.ok(r.every((x) => x.status === 200));
  assert.equal(
    (
      await h.db
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE actor_id=? AND action='member.joined'",
        )
        .bind("live-" + u)
        .first<any>()
    ).n,
    1,
  );
});
test("13 non-leaders cannot rotate codes", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a);
  assert.equal(
    (await h.call(u, `/teams/${t}/invites`, "POST", { hours: 24 })).status,
    403,
  );
});
test("14 rotating invite revokes previous code", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a),
    old = await h.invite(a, t);
  await h.invite(a, t);
  assert.equal((await h.call(u, "/join", "POST", { code: old })).status, 404);
});
test("15 expired invite cannot join", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a),
    code = await h.invite(a, t, 1);
  assert.equal(
    (
      await h.call(u, "/join", "POST", { code }, crypto.randomUUID(), {
        "x-test-time": String(Date.now() + 3600001),
      })
    ).status,
    404,
  );
});
test("16 codes have 128-bit entropy and digest storage", async () => {
  const a = await h.user(),
    t = await h.create(a),
    code = await h.invite(a, t);
  assert.match(code, /^[a-f0-9]{32}$/);
  const row = await h.db
    .prepare("SELECT hash FROM invites WHERE team_id=?")
    .bind(t)
    .first<any>();
  assert.equal(row.hash.length, 64);
  assert.notEqual(row.hash, code);
});
test("17 invite guessing is persistently limited", async () => {
  const u = await h.user();
  let last: any;
  for (let i = 0; i < 11; i++)
    last = await h.call(u, "/join", "POST", { code: "a".repeat(32) });
  assert.equal(last.status, 429);
  assert.equal(last.headers.get("retry-after"), "60");
});
test("18 request accept adds applicant", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a);
  await h.call(u, `/teams/${t}/requests`, "POST", { message: "I can help" });
  const detail = await h.call(a, "/teams/" + t),
    id = detail.body.requests[0].id;
  assert.equal(
    (await h.call(a, "/requests/" + id, "PATCH", { decision: "accepted" }))
      .status,
    200,
  );
  assert.equal((await h.call(u, "/me")).body.team.id, t);
});
test("19 request decline keeps applicant unattached", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a);
  await h.call(u, `/teams/${t}/requests`, "POST", { message: "" });
  const id = (await h.call(a, "/teams/" + t)).body.requests[0].id;
  await h.call(a, "/requests/" + id, "PATCH", { decision: "declined" });
  assert.equal((await h.call(u, "/me")).body.team, null);
  assert.equal((await h.call(u, "/requests")).body.items[0].status, "declined");
});
test("20 applicants cannot approve their own requests", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a);
  await h.call(u, `/teams/${t}/requests`, "POST", { message: "" });
  const id = (await h.call(a, "/teams/" + t)).body.requests[0].id;
  assert.equal(
    (await h.call(u, "/requests/" + id, "PATCH", { decision: "accepted" }))
      .status,
    403,
  );
});
test("21 pending requests are leader-only", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a);
  await h.call(u, `/teams/${t}/requests`, "POST", { message: "private" });
  assert.equal((await h.call(u, "/teams/" + t)).body.requests.length, 0);
});
test("22 acceptance and invite race share the last-seat invariant", async () => {
  const a = await h.user(),
    u = await h.user(),
    v = await h.user(),
    t = await h.create(a, 2),
    code = await h.invite(a, t);
  await h.call(u, `/teams/${t}/requests`, "POST", { message: "" });
  const id = (await h.call(a, "/teams/" + t)).body.requests[0].id;
  const r = await Promise.all([
    h.call(a, "/requests/" + id, "PATCH", { decision: "accepted" }),
    h.call(v, "/join", "POST", { code }),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
});
test("23 leader leaving promotes oldest member", async () => {
  const a = await h.user(),
    u = await h.user(),
    v = await h.user(),
    t = await h.create(a),
    code = await h.invite(a, t);
  await h.call(u, "/join", "POST", { code }, crypto.randomUUID(), {
    "x-test-time": "1000",
  });
  await h.call(v, "/join", "POST", { code }, crypto.randomUUID(), {
    "x-test-time": "2000",
  });
  await h.call(a, `/teams/${t}/leave`, "POST", {});
  assert.equal(
    (await h.call(u, "/teams/" + t)).body.team.leader_id,
    "live-" + u,
  );
});
test("24 final member leaving deletes team and keeps audit", async () => {
  const a = await h.user(),
    t = await h.create(a);
  await h.call(a, `/teams/${t}/leave`, "POST", {});
  assert.equal((await h.call(a, "/teams/" + t)).status, 404);
  assert.equal(
    (
      await h.db
        .prepare("SELECT COUNT(*) n FROM audit WHERE team_id=?")
        .bind(t)
        .first<any>()
    ).n,
    2,
  );
});
test("25 former leader loses authority", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a),
    code = await h.invite(a, t);
  await h.call(u, "/join", "POST", { code });
  await h.call(a, `/teams/${t}/leave`, "POST", {});
  assert.equal(
    (await h.call(a, "/teams/" + t, "PATCH", { lookingFor: false })).status,
    403,
  );
});
test("26 leader can remove a member", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a),
    code = await h.invite(a, t);
  await h.call(u, "/join", "POST", { code });
  assert.equal(
    (await h.call(a, `/teams/${t}/members/live-${u}`, "DELETE", {})).status,
    200,
  );
  assert.equal((await h.call(u, "/me")).body.team, null);
});
test("27 leader cannot remove self through member endpoint", async () => {
  const a = await h.user(),
    t = await h.create(a);
  assert.equal(
    (await h.call(a, `/teams/${t}/members/live-${a}`, "DELETE", {})).status,
    400,
  );
});
test("28 paused teams do not accept requests", async () => {
  const a = await h.user(),
    u = await h.user(),
    t = await h.create(a);
  await h.call(a, "/teams/" + t, "PATCH", { lookingFor: false });
  assert.equal(
    (await h.call(u, `/teams/${t}/requests`, "POST", { message: "" })).status,
    409,
  );
});
test("29 pagination has no duplicate rows", async () => {
  const u = await h.user(),
    a = await h.call(u, "/board?limit=3"),
    b = await h.call(
      u,
      "/board?limit=3&cursor=" + encodeURIComponent(a.body.nextCursor),
    );
  assert.equal(
    new Set([...a.body.items, ...b.body.items].map((t) => t.id)).size,
    6,
  );
});
test("30 malformed cursor is rejected", async () => {
  const u = await h.user();
  assert.equal((await h.call(u, "/board?cursor=garbage")).status, 400);
});
test("31 search is parameterized and filters work", async () => {
  const u = await h.user();
  assert.equal((await h.call(u, "/board?q='+OR+1=1--")).body.items.length, 0);
  const r = await h.call(u, "/board?skill=React");
  assert.ok(r.body.items.every((t: any) => t.skills.includes("React")));
});
test("32 profile edits validate and persist", async () => {
  const u = await h.user();
  assert.equal(
    (
      await h.call(u, "/profile", "PATCH", {
        name: "Builder A",
        bio: "I build",
        skills: ["React", "React"],
        utcOffset: 330,
      })
    ).status,
    200,
  );
  assert.deepEqual((await h.call(u, "/me")).body.profile.skills, ["React"]);
});
test("33 scoring favors complementary skills", () => {
  assert.ok(
    scoreCandidate(["React", "Design"], ["React"], ["Design"], 330, 330).score >
      scoreCandidate(["React", "Design"], ["React"], ["React"], 330, 330).score,
  );
});
test("34 timezone wraps across the date line", () =>
  assert.equal(scoreCandidate([], [], [], 840, -600).timeScore, 30));
test("35 suggestions exclude already-teamed users", async () => {
  const u = await h.user(),
    t = await h.create(u),
    r = await h.call(u, `/teams/${t}/suggestions`);
  assert.equal(r.status, 200);
  assert.ok(r.body.items.every((p: any) => p.id !== "live-" + u));
  assert.ok(
    r.body.items.every((p: any) => p.score === p.skillScore + p.timeScore),
  );
});
test("36 cross-origin mutation rejected", async () => {
  const u = await h.user();
  assert.equal(
    (
      await h.call(u, "/teams", "POST", payload, crypto.randomUUID(), {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
});
test("37 SSE emits a revision event", async () => {
  const u = await h.user();
  const r = await h.mf.dispatchFetch("http://localhost/api/events", {
    headers: { "x-test-user": u },
  });
  assert.match(r.headers.get("content-type")!, /event-stream/);
  const reader = r.body!.getReader();
  let text = "";
  while (!text.includes("event: change"))
    text += new TextDecoder().decode((await reader.read()).value);
  assert.match(text, /"revision":/);
  await reader.cancel();
});
test("38 sandbox personas cannot cross owners", async () => {
  for (const owner of ["owner-a", "owner-b"])
    await h.call(owner, "/bootstrap", "POST", {}, crypto.randomUUID(), {
      "X-Workspace": "sandbox",
      "X-Persona": "maya",
    });
  const a = await h.call(
      "owner-a",
      "/me",
      "GET",
      undefined,
      crypto.randomUUID(),
      { "X-Workspace": "sandbox", "X-Persona": "maya" },
    ),
    b = await h.call(
      "owner-b",
      "/teams/" + a.body.team.id,
      "GET",
      undefined,
      crypto.randomUUID(),
      { "X-Workspace": "sandbox", "X-Persona": "maya" },
    );
  assert.equal(b.status, 404);
});
test("39 failed transaction has no receipt or audit fragment", async () => {
  const u = await h.user();
  await h.create(u);
  const before = await h.db
      .prepare("SELECT COUNT(*) n FROM audit")
      .first<any>(),
    key = crypto.randomUUID();
  await h.call(u, "/teams", "POST", payload, key);
  assert.equal(
    (await h.db.prepare("SELECT COUNT(*) n FROM audit").first<any>()).n,
    before.n,
  );
  assert.equal(
    await h.db
      .prepare("SELECT id FROM operations WHERE key=?")
      .bind(key)
      .first(),
    null,
  );
});
test("40 membership counts and leader invariants hold globally", async () => {
  const broken = await h.db
    .prepare(
      "SELECT COUNT(*) n FROM teams t WHERE member_count<>(SELECT COUNT(*) FROM members m WHERE m.team_id=t.id) OR member_count>max_size OR member_count<1 OR NOT EXISTS(SELECT 1 FROM members m WHERE m.team_id=t.id AND m.user_id=t.leader_id)",
    )
    .first<any>();
  assert.equal(broken.n, 0);
});

test("41 token-prefix search returns matching teams", async () => {
  const u = await h.user();
  const t = await h.create(u, 4, "Zebracrew");
  const r = await h.call(u, "/board?q=zebra");
  assert.equal(r.status, 200);
  assert.ok(r.body.items.some((x: any) => x.id === t));
});
test("42 interrupted readers do not poison other board requests", async () => {
  const u = await h.user();
  for (let round = 0; round < 3; round++) {
    const controller = new AbortController();
    const interrupted = h.mf
      .dispatchFetch("http://localhost/api/board?q=Bright", {
        headers: { "x-test-user": u },
        signal: controller.signal as any,
      })
      .catch(() => null);
    const requests = Array.from({ length: 20 }, () =>
      h.call(u, "/board?q=Bright"),
    );
    controller.abort();
    const responses = await Promise.all(requests);
    await interrupted;
    assert.ok(responses.every((r) => r.status === 200));
  }
});
