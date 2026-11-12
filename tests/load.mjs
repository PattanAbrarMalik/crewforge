import autocannon from "autocannon";
import { harness } from "./harness.ts";
import { mkdir, writeFile } from "node:fs/promises";
const h = await harness();
try {
  const db = h.db,
    now = Date.now();
  await db
    .prepare("INSERT INTO events VALUES ('crew-2026','Scale fixture',2,6)")
    .run();
  async function batches(rows) {
    for (let i = 0; i < rows.length; i += 50)
      await db.batch(rows.slice(i, i + 50));
  }
  const statements = [];
  for (let n = 0; n < 10000; n += 12) {
    const args = [],
      rows = [];
    for (let i = n; i < Math.min(n + 12, 10000); i++) {
      rows.push("(?,?,?,?,?,?,?)");
      args.push(
        "live-load-" + String(i).padStart(5, "0"),
        "crew-2026",
        "Builder " + i,
        JSON.stringify([
          ["React", "Design", "Python", "Node.js"][i % 4],
          "Data",
        ]),
        330,
        "Synthetic scale fixture",
        now,
      );
    }
    statements.push(
      db.prepare("INSERT INTO people VALUES " + rows.join(",")).bind(...args),
    );
  }
  await batches(statements);
  statements.length = 0;
  for (let n = 0; n < 2000; n += 8) {
    const args = [],
      rows = [];
    for (let i = n; i < Math.min(n + 8, 2000); i++) {
      rows.push("(?,'crew-2026',?,?,?, ?,2,4,?,?)");
      args.push(
        "scale-team-" + i,
        "Scale Team " + i,
        "A synthetic collaboration project. " +
          ["Climate", "Learning", "Community", "Accessibility"][i % 4],
        JSON.stringify(["React", "Design", "Node.js"]),
        "live-load-" + String(i * 3).padStart(5, "0"),
        now - i,
        now - i,
      );
    }
    statements.push(
      db
        .prepare(
          "INSERT INTO teams (id,event_id,name,pitch,skills,leader_id,min_size,max_size,created_at,updated_at) VALUES " +
            rows.join(","),
        )
        .bind(...args),
    );
  }
  await batches(statements);
  statements.length = 0;
  for (let n = 0; n < 6000; n += 20) {
    const args = [],
      rows = [];
    for (let i = n; i < Math.min(n + 20, 6000); i++) {
      rows.push("('crew-2026',?,?,?)");
      args.push(
        "live-load-" + String(i).padStart(5, "0"),
        "scale-team-" + Math.floor(i / 3),
        now - Math.floor(i / 3),
      );
    }
    statements.push(
      db.prepare("INSERT INTO members VALUES " + rows.join(",")).bind(...args),
    );
  }
  await batches(statements);
  const counts = await db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM people) users,(SELECT COUNT(*) FROM teams) teams,(SELECT COUNT(*) FROM members) members",
    )
    .first();
  const origin = String(await h.mf.ready);
  async function run(label, paths, duration) {
    let clientNumber = 0,
      logged = false;
    const samples = [],
      statuses = {};
    const result = await new Promise((resolve, reject) => {
      const run = autocannon(
        {
          url: origin,
          connections: 100,
          duration,
          pipelining: 1,
          requests: paths.map((path) => ({ path })),
          setupClient(client) {
            const id =
              "load-" + String(6000 + (clientNumber++ % 100)).padStart(5, "0");
            client.setRequests(
              paths.map((path) => ({ path, headers: { "x-test-user": id } })),
            );
            client.on("body", (body) => {
              client.diagnosticBody = body.toString().slice(0, 2500);
            });
          },
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
      run.on("response", (client, status, _bytes, latency) => {
        samples.push(latency);
        if (status !== 200 && !logged) {
          console.log("FIRST FAILURE", status, client.diagnosticBody);
          logged = true;
        }
        statuses[status] = (statuses[status] || 0) + 1;
      });
    });
    samples.sort((a, b) => a - b);
    const pct = (p) =>
      Math.round(samples[Math.ceil(samples.length * p) - 1] * 1000) / 1000;
    return {
      label,
      connections: 100,
      durationSeconds: duration,
      completed: result.requests.total,
      requestsPerSecond: result.requests.average,
      p50Ms: pct(0.5),
      p95Ms: pct(0.95),
      p99Ms: pct(0.99),
      errors: result.errors,
      timeouts: result.timeouts,
      statuses,
      targetP95Ms: 200,
      targetMet:
        pct(0.95) < 200 &&
        result.errors === 0 &&
        Object.keys(statuses).every((k) => k === "200"),
    };
  }
  console.log("Seeded", counts);
  const board = await run(
    "Default paginated board",
    ["/api/board?limit=12"],
    process.env.DEBUG_LOAD ? 2 : 30,
  );
  console.log(board);
  const varied = await run(
    "Four rotating search queries",
    [
      "/api/board?q=Climate&limit=12",
      "/api/board?q=Learning&limit=12",
      "/api/board?q=Community&limit=12",
      "/api/board?q=Accessibility&limit=12",
    ],
    process.env.DEBUG_LOAD ? 20 : 20,
  );
  console.log(varied);
  const report = {
    measuredAt: new Date().toISOString(),
    runtime: process.version,
    fixture: counts,
    scope:
      "Local workerd + SQLite via Miniflare, loopback HTTP, 100 authenticated identities. Excludes public-network/TLS latency and Vinext routing. In-flight query coalescing enabled; no timed response cache.",
    results: [board, varied],
  };
  await mkdir("reports", { recursive: true });
  await writeFile(
    process.env.DEBUG_LOAD ? "reports/load-debug.json" : "reports/load.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  if (!board.targetMet) process.exitCode = 1;
} finally {
  await h.mf.dispose();
}
