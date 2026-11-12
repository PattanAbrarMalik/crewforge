import { Miniflare, Log, LogLevel } from "miniflare";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
export async function harness(
  options: { persist?: string; migrate?: boolean } = {},
) {
  const bundle = await build({
    entryPoints: ["tests/worker.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  const mf = new Miniflare({
    log: new Log(LogLevel.ERROR),
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-05-15",
    d1Databases: ["DB"],
    d1Persist: options.persist,
    host: "127.0.0.1",
    port: 0,
  });
  const db = await mf.getD1Database("DB");
  if (options.migrate !== false)
    for (const name of (await readdir("drizzle"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = await readFile("drizzle/" + name, "utf8");
      await db.batch(
        sql
          .split("--> statement-breakpoint")
          .filter((s) => s.trim())
          .map((s) => db.prepare(s)),
      );
    }
  async function call(
    user: string | null,
    path: string,
    method = "GET",
    body?: any,
    key = crypto.randomUUID(),
    extra: Record<string, string> = {},
  ) {
    const res = await mf.dispatchFetch("http://localhost/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        ...(user ? { "x-test-user": user } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: (await res.json()) as any,
      headers: res.headers,
    };
  }
  async function user(id = crypto.randomUUID()) {
    const r = await call(id, "/bootstrap", "POST", {});
    if (r.status !== 200) throw Error(JSON.stringify(r));
    return id;
  }
  async function create(id: string, max = 4, name = "Test team") {
    const r = await call(id, "/teams", "POST", {
      name,
      pitch: "Build something useful together.",
      skills: ["React", "Design"],
      minSize: 2,
      maxSize: max,
    });
    if (r.status !== 200) throw Error(JSON.stringify(r));
    return r.body.teamId as string;
  }
  async function invite(id: string, team: string, hours = 24) {
    const r = await call(id, `/teams/${team}/invites`, "POST", { hours });
    if (r.status !== 200) throw Error(JSON.stringify(r));
    return r.body.code as string;
  }
  return { mf, db, call, user, create, invite };
}
