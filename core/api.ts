import { z } from "zod";
import {
  hash,
  randomCode,
  decodeRow,
  SKILLS,
  PERSONAS,
  type Context,
  type Statement,
} from "./types.ts";
import { seedSandbox } from "./seed.ts";
import { scoreCandidate } from "./scoring.ts";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const skills = z
  .array(z.enum(SKILLS))
  .max(10)
  .transform((v) => [...new Set(v)]);
const teamSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    pitch: z.string().trim().min(12).max(320),
    skills,
    minSize: z.number().int().min(2).max(6),
    maxSize: z.number().int().min(2).max(6),
  })
  .strict()
  .refine((v) => v.maxSize >= v.minSize, {
    message: "Maximum size must be at least the minimum",
  });
const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    bio: z.string().trim().max(240),
    skills,
    utcOffset: z.number().int().min(-720).max(840),
  })
  .strict();
// Cache only completed, public board rows. Never share a pending Promise or
// I/O handle: Workers binds pending I/O to the request that created it.
// Rows are fresh for 100 ms. During one request-owned refresh, other readers
// may use the completed snapshot for up to 1 second from its creation. Membership
// admission always checks the database transaction, never this read cache.
type BoardRead = {
  expiresAt: number;
  staleUntil: number;
  refreshing: boolean;
  rows?: any[];
};
const boardReads = new Map<string, BoardRead>();
async function cachedBoardRead(
  key: string,
  fn: () => Promise<any[]>,
): Promise<any[]> {
  const now = Date.now();
  const existing = boardReads.get(key);
  if (existing?.rows && existing.expiresAt > now) return existing.rows;
  if (existing?.rows && existing.refreshing && existing.staleUntil > now)
    return existing.rows;
  // Bounded per-isolate storage. Replacing the entry also gives each query a
  // generation token: an invalidated read cannot repopulate a newer cache.
  if (!boardReads.has(key) && boardReads.size >= 256)
    boardReads.delete(boardReads.keys().next().value!);
  const entry: BoardRead = {
    expiresAt: existing?.expiresAt ?? 0,
    staleUntil: existing?.staleUntil ?? 0,
    rows: existing?.rows,
    refreshing: true,
  };
  boardReads.set(key, entry);
  try {
    const rows = await fn();
    if (boardReads.get(key) === entry) {
      entry.rows = rows;
      entry.expiresAt = Date.now() + 100;
      entry.staleUntil = Date.now() + 1000;
      entry.refreshing = false;
    }
    return rows;
  } catch (error) {
    if (boardReads.get(key) === entry) boardReads.delete(key);
    throw error;
  }
}

export async function handleApi(req: Request, ctx: Context): Promise<Response> {
  const started = performance.now(),
    trace = crypto.randomUUID(),
    url = new URL(req.url),
    path = url.pathname.replace(/^\/api/, "") || "/",
    method = req.method;
  const reply = (
    data: any,
    status = 200,
    headers: Record<string, string> = {},
  ) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": trace,
        "Server-Timing": `app;dur=${(performance.now() - started).toFixed(1)}`,
        ...headers,
      },
    });
  try {
    if (path === "/health" && method === "GET")
      return reply({ ok: true, service: "CrewForge" });
    if (!ctx.user) fail(401, "Sign in to continue.");
    const user = ctx.user!,
      db = ctx.db,
      now = (ctx.now ?? Date.now)();
    const sandbox = req.headers.get("X-Workspace") === "sandbox";
    const persona = req.headers.get("X-Persona") ?? "alex";
    if (sandbox && !PERSONAS.includes(persona as any))
      fail(400, "Unknown sandbox persona.");
    const event = sandbox
      ? "sandbox-" + (await hash(user.id)).slice(0, 24)
      : "crew-2026";
    const actor = sandbox ? event + "-" + persona : "live-" + user.id;
    const s = (sql: string, ...args: any[]) => db.prepare(sql).bind(...args);
    const first = (sql: string, ...args: any[]) => s(sql, ...args).first();
    const all = async (sql: string, ...args: any[]) =>
      (await s(sql, ...args).all()).results;
    const myTeam = () =>
      first(
        "SELECT t.* FROM teams t JOIN members m ON m.team_id=t.id WHERE m.event_id=? AND m.user_id=?",
        event,
        actor,
      );
    const getTeam = async (id: string) => {
      const t = await first(
        "SELECT * FROM teams WHERE id=? AND event_id=?",
        id,
        event,
      );
      if (!t) fail(404, "Team not found.");
      return t;
    };
    const requireLeader = (t: any) => {
      if (t.leader_id !== actor)
        fail(403, "Only the current team leader can do that.");
    };
    async function limit(scope: string, max: number) {
      const key = scope + ":" + Math.floor(now / 60000);
      const row = await first(
        "INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
        key,
        now + 120000,
      );
      if (row.count > max)
        fail(429, "Too many attempts. Please try again in a minute.");
      if (row.count === 1)
        await s(
          "DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at<? LIMIT 100)",
          now,
        ).run();
    }
    let body: any = {};
    if (!["GET", "HEAD"].includes(method)) {
      const origin = req.headers.get("Origin");
      if (origin && origin !== url.origin)
        fail(403, "Cross-origin writes are not allowed.");
      if (!req.headers.get("Content-Type")?.includes("application/json"))
        fail(415, "Send application/json.");
      const raw = await req.text();
      if (raw.length > 8192) fail(413, "Request too large.");
      try {
        body = JSON.parse(raw);
      } catch {
        fail(400, "Invalid JSON.");
      }
    }
    if (path === "/bootstrap" && method === "POST") {
      z.object({}).strict().parse(body);
      await s(
        "INSERT OR IGNORE INTO events VALUES (?,?,2,6)",
        event,
        sandbox ? "Your private sandbox" : "Hack4Hack Crew Challenge 2026",
      ).run();
      if (sandbox) await seedSandbox(db, event, now);
      else
        await s(
          "INSERT OR IGNORE INTO people VALUES (?,?,?,?,?,?,?)",
          actor,
          event,
          (user.name || "New builder").slice(0, 60),
          "[]",
          330,
          "",
          now,
        ).run();
      return reply({ ok: true, workspace: sandbox ? "sandbox" : "live" });
    }
    if (method === "GET") {
      if (path === "/me")
        return reply({
          profile: decodeRow(
            await first(
              "SELECT * FROM people WHERE id=? AND event_id=?",
              actor,
              event,
            ),
          ),
          team: decodeRow(await myTeam()),
          workspace: sandbox ? "sandbox" : "live",
        });
      if (path === "/stats")
        return reply(
          await first(
            "SELECT (SELECT COUNT(*) FROM people WHERE event_id=?) builders,(SELECT COUNT(*) FROM teams WHERE event_id=?) teams,(SELECT COUNT(*) FROM teams WHERE event_id=? AND looking_for=1 AND member_count<max_size) openTeams,(SELECT COALESCE(MAX(seq),0) FROM audit WHERE event_id=?) revision",
            event,
            event,
            event,
            event,
          ),
        );
      if (path === "/board") {
        const q = url.searchParams.get("q") ?? "",
          skill = url.searchParams.get("skill") ?? "",
          limitN = Number(url.searchParams.get("limit") ?? 12);
        if (
          q.length > 80 ||
          skill.length > 30 ||
          !Number.isInteger(limitN) ||
          limitN < 1 ||
          limitN > 50
        )
          fail(400, "Invalid board filters.");
        const terms = ["t.event_id=?"],
          args: any[] = [event];
        if (url.searchParams.get("open") !== "false")
          terms.push("t.looking_for=1 AND t.member_count<t.max_size");
        if (q) {
          const words = q.match(/[\p{L}\p{N}]+/gu) ?? [];
          if (words.length) {
            terms.push(
              "t.rowid IN (SELECT rowid FROM teams_search WHERE teams_search MATCH ?)",
            );
            args.push(words.map((w) => '"' + w + '"*').join(" AND "));
          } else terms.push("0");
        }
        if (skill) {
          terms.push(
            "EXISTS (SELECT 1 FROM json_each(t.skills) WHERE value=?)",
          );
          args.push(skill);
        }
        const cursor = url.searchParams.get("cursor");
        if (cursor) {
          let c: any;
          try {
            c = JSON.parse(atob(cursor));
          } catch {
            fail(400, "Invalid cursor.");
          }
          if (
            !Array.isArray(c) ||
            c.length !== 2 ||
            !Number.isFinite(c[0]) ||
            typeof c[1] !== "string" ||
            c[1].length > 150
          )
            fail(400, "Invalid cursor.");
          terms.push("(t.updated_at<? OR (t.updated_at=? AND t.id<?))");
          args.push(c[0], c[0], c[1]);
        }
        const query = `SELECT t.*,p.name leader_name FROM teams t JOIN people p ON p.id=t.leader_id WHERE ${terms.join(" AND ")} ORDER BY t.updated_at DESC,t.id DESC LIMIT ?`;
        args.push(limitN + 1);
        const rows = await cachedBoardRead(
          event + "|" + query + JSON.stringify(args),
          () => all(query, ...args),
        );
        const items = rows.slice(0, limitN).map(decodeRow),
          last = items.at(-1);
        return reply({
          items,
          nextCursor:
            rows.length > limitN && last
              ? btoa(JSON.stringify([last.updated_at, last.id]))
              : null,
        });
      }
      if (path === "/requests")
        return reply({
          items: await all(
            "SELECT r.*,t.name team_name FROM requests r JOIN teams t ON t.id=r.team_id WHERE r.event_id=? AND r.user_id=? ORDER BY r.updated_at DESC",
            event,
            actor,
          ),
        });
      if (path === "/audit")
        return reply({
          items: (
            await all(
              "SELECT a.*,p.name actor_name FROM audit a LEFT JOIN people p ON p.id=a.actor_id WHERE a.event_id=? AND (a.actor_id=? OR a.team_id IN (SELECT team_id FROM members WHERE event_id=? AND user_id=?)) ORDER BY a.seq DESC LIMIT 80",
              event,
              actor,
              event,
              actor,
            )
          ).map((a) => ({ ...a, details: JSON.parse(a.details) })),
        });
      const detail = path.match(/^\/teams\/([^/]+)$/);
      if (detail) {
        const team = await getTeam(detail[1]);
        return reply({
          team: decodeRow(team),
          members: (
            await all(
              "SELECT p.*,m.joined_at FROM members m JOIN people p ON p.id=m.user_id WHERE m.team_id=? ORDER BY m.joined_at,p.id",
              team.id,
            )
          ).map(decodeRow),
          requests:
            team.leader_id === actor
              ? await all(
                  "SELECT r.*,p.name,p.skills FROM requests r JOIN people p ON p.id=r.user_id WHERE r.team_id=? AND r.status='pending' ORDER BY r.created_at",
                  team.id,
                )
              : [],
        });
      }
      const suggestions = path.match(/^\/teams\/([^/]+)\/suggestions$/);
      if (suggestions) {
        const team = await getTeam(suggestions[1]);
        requireLeader(team);
        const members = (
          await all(
            "SELECT p.skills,p.utc_offset FROM people p JOIN members m ON m.user_id=p.id WHERE m.team_id=?",
            team.id,
          )
        ).map(decodeRow);
        const candidates = (
          await all(
            "SELECT * FROM people p WHERE p.event_id=? AND NOT EXISTS (SELECT 1 FROM members m WHERE m.event_id=p.event_id AND m.user_id=p.id) ORDER BY p.id LIMIT 10000",
            event,
          )
        ).map(decodeRow);
        const offset =
          members.reduce((sum, p) => sum + p.utc_offset, 0) /
          Math.max(members.length, 1);
        const ranked = candidates
          .map((p) => ({
            ...p,
            ...scoreCandidate(
              JSON.parse(team.skills),
              members.flatMap((m) => m.skills),
              p.skills,
              p.utc_offset,
              offset,
            ),
          }))
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        return reply({
          items: ranked.slice(0, 12),
          weights: { skills: 70, timezone: 30 },
          considered: ranked.length,
        });
      }
      if (path === "/events") {
        let timer: ReturnType<typeof setTimeout> | undefined,
          stopped = false,
          ticks = 0,
          revision = Number(url.searchParams.get("after") ?? 0) || 0;
        const encoder = new TextEncoder();
        const stop = () => {
          stopped = true;
          if (timer) clearTimeout(timer);
        };
        const stream = new ReadableStream({
          start(controller) {
            const send = (v: string) => {
              if (!stopped) controller.enqueue(encoder.encode(v));
            };
            send("retry: 1500\n\n");
            const poll = async () => {
              try {
                const row = await first(
                  "SELECT COALESCE(MAX(seq),0) revision FROM audit WHERE event_id=?",
                  event,
                );
                if (row.revision !== revision || ticks === 0) {
                  revision = row.revision;
                  send(
                    `id: ${revision}\nevent: change\ndata: {"revision":${revision}}\n\n`,
                  );
                } else send(": heartbeat\n\n");
                if (++ticks >= 16) {
                  if (!stopped) controller.close();
                  stop();
                } else if (!stopped) timer = setTimeout(poll, 1500);
              } catch {
                if (!stopped) controller.close();
                stop();
              }
            };
            void poll();
            req.signal.addEventListener("abort", stop, { once: true });
          },
          cancel: stop,
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Request-ID": trace,
          },
        });
      }
      fail(404, "Endpoint not found.");
    }
    const key = req.headers.get("Idempotency-Key") ?? "";
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key))
      fail(400, "A valid Idempotency-Key is required.");
    const fingerprint = await hash(
      method + ":" + path + ":" + JSON.stringify(body),
    );
    const replay = async () => {
      const op = await first(
        "SELECT * FROM operations WHERE actor_id=? AND key=?",
        actor,
        key,
      );
      if (!op) return null;
      if (op.fingerprint !== fingerprint)
        fail(409, "This idempotency key was used for a different request.");
      return reply(JSON.parse(op.response), 200, {
        "Idempotency-Replayed": "true",
      });
    };
    const previous = await replay();
    if (previous) return previous;
    if (
      !(await first(
        "SELECT id FROM people WHERE id=? AND event_id=?",
        actor,
        event,
      ))
    )
      fail(409, "Initialize your profile first.");
    await limit("write:" + actor, 120);
    const guard = (condition: string, ...args: any[]) =>
      s(
        `INSERT INTO guards VALUES (?,CASE WHEN ${condition} THEN 1 ELSE 0 END)`,
        crypto.randomUUID(),
        ...args,
      );
    const leaderGuard = (id: string) =>
      guard(
        "EXISTS (SELECT 1 FROM teams WHERE id=? AND event_id=? AND leader_id=?)",
        id,
        event,
        actor,
      );
    const noMembership = (id = actor) =>
      guard(
        "NOT EXISTS (SELECT 1 FROM members WHERE event_id=? AND user_id=?)",
        event,
        id,
      );
    async function commit(
      statements: Statement[],
      result: any,
      action: string,
      teamId: string | null,
      details: any = {},
    ) {
      const batch = [
        s(
          "INSERT INTO operations VALUES (?,?,?,?,?,?)",
          crypto.randomUUID(),
          actor,
          key,
          fingerprint,
          JSON.stringify(result),
          now,
        ),
        ...statements,
        s(
          "INSERT INTO audit (event_id,team_id,actor_id,action,details,created_at) VALUES (?,?,?,?,json_set(?,'$.leaderId',(SELECT leader_id FROM teams WHERE id=?),'$.teamDeleted',CASE WHEN ? IS NOT NULL AND NOT EXISTS(SELECT 1 FROM teams WHERE id=?) THEN 1 ELSE 0 END),?)",
          event,
          teamId,
          actor,
          action,
          JSON.stringify(details),
          teamId,
          teamId,
          teamId,
          now,
        ),
        s("DELETE FROM guards"),
      ];
      try {
        await db.batch(batch);
      } catch (error) {
        const p = await replay();
        if (p) return p;
        const message =
          String(error) + (error instanceof Error ? String(error.cause) : "");
        if (/TEAM_FULL|valid_count/.test(message))
          fail(409, "The last seat was just taken.");
        if (/constraint|guard_holds|TEAM_MISMATCH|TEAM_RULES/i.test(message))
          fail(409, "The team changed. Refresh and try again.");
        throw error;
      }
      for (const cacheKey of boardReads.keys())
        if (cacheKey.startsWith(event + "|")) boardReads.delete(cacheKey);
      return reply(result);
    }
    if (path === "/profile" && method === "PATCH") {
      const b = profileSchema.parse(body);
      return await commit(
        [
          s(
            "UPDATE people SET name=?,bio=?,skills=?,utc_offset=? WHERE id=?",
            b.name,
            b.bio,
            JSON.stringify(b.skills),
            b.utcOffset,
            actor,
          ),
        ],
        { ok: true },
        "profile.updated",
        null,
      );
    }
    if (path === "/teams" && method === "POST") {
      const b = teamSchema.parse(body),
        id = crypto.randomUUID();
      return await commit(
        [
          noMembership(),
          s(
            "INSERT INTO teams (id,event_id,name,pitch,skills,leader_id,min_size,max_size,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            id,
            event,
            b.name,
            b.pitch,
            JSON.stringify(b.skills),
            actor,
            b.minSize,
            b.maxSize,
            now,
            now,
          ),
          s("INSERT INTO members VALUES (?,?,?,?)", event, actor, id, now),
          s(
            "UPDATE requests SET status='cancelled',updated_at=? WHERE user_id=? AND event_id=? AND status='pending'",
            now,
            actor,
            event,
          ),
        ],
        { teamId: id },
        "team.created",
        id,
        { name: b.name },
      );
    }
    if (path === "/join" && method === "POST") {
      await limit("invite:" + actor, 10);
      const ip = req.headers.get("CF-Connecting-IP");
      if (ip) await limit("invite-ip:" + (await hash(ip)), 150);
      const b = z
          .object({ code: z.string().regex(/^[a-f0-9]{32}$/) })
          .strict()
          .parse(body),
        digest = await hash(b.code);
      const invite = await first(
        "SELECT i.* FROM invites i JOIN teams t ON t.id=i.team_id WHERE i.hash=? AND t.event_id=? AND i.expires_at>?",
        digest,
        event,
        now,
      );
      if (!invite) fail(404, "Invite is invalid or expired.");
      return await commit(
        [
          noMembership(),
          guard(
            "EXISTS (SELECT 1 FROM invites WHERE hash=? AND expires_at>?)",
            digest,
            now,
          ),
          s(
            "INSERT INTO members VALUES (?,?,?,?)",
            event,
            actor,
            invite.team_id,
            now,
          ),
          s(
            "UPDATE requests SET status='cancelled',updated_at=? WHERE event_id=? AND user_id=? AND status='pending'",
            now,
            event,
            actor,
          ),
        ],
        { teamId: invite.team_id },
        "member.joined",
        invite.team_id,
      );
    }
    const tRoute = path.match(
      /^\/teams\/([^/]+)(?:\/(invites|leave|requests|members)(?:\/([^/]+))?)?$/,
    );
    if (tRoute) {
      const t = await getTeam(tRoute[1]),
        action = tRoute[2];
      if (!action && method === "PATCH") {
        requireLeader(t);
        const b = z.object({ lookingFor: z.boolean() }).strict().parse(body);
        return await commit(
          [
            leaderGuard(t.id),
            s(
              "UPDATE teams SET looking_for=?,updated_at=? WHERE id=?",
              Number(b.lookingFor),
              now,
              t.id,
            ),
          ],
          { ok: true },
          "team.recruiting",
          t.id,
          { open: b.lookingFor },
        );
      }
      if (action === "invites" && method === "POST") {
        requireLeader(t);
        const b = z
            .object({ hours: z.number().int().min(1).max(72) })
            .strict()
            .parse(body),
          code = randomCode(),
          expiresAt = now + b.hours * 3600000;
        return await commit(
          [
            leaderGuard(t.id),
            s("DELETE FROM invites WHERE team_id=?", t.id),
            s(
              "INSERT INTO invites VALUES (?,?,?,?)",
              await hash(code),
              t.id,
              expiresAt,
              actor,
            ),
          ],
          { code, expiresAt },
          "invite.rotated",
          t.id,
          { expiresAt },
        );
      }
      if (action === "leave" && method === "POST") {
        z.object({}).strict().parse(body);
        return await commit(
          [
            guard(
              "EXISTS (SELECT 1 FROM members WHERE team_id=? AND user_id=?)",
              t.id,
              actor,
            ),
            s("DELETE FROM members WHERE team_id=? AND user_id=?", t.id, actor),
          ],
          { ok: true },
          "member.left",
          t.id,
          { userId: actor },
        );
      }
      if (action === "members" && method === "DELETE" && tRoute[3]) {
        requireLeader(t);
        z.object({}).strict().parse(body);
        if (tRoute[3] === actor) fail(400, "Use leave to transfer leadership.");
        return await commit(
          [
            leaderGuard(t.id),
            guard(
              "EXISTS (SELECT 1 FROM members WHERE team_id=? AND user_id=?)",
              t.id,
              tRoute[3],
            ),
            s(
              "DELETE FROM members WHERE team_id=? AND user_id=?",
              t.id,
              tRoute[3],
            ),
          ],
          { ok: true },
          "member.removed",
          t.id,
          { userId: tRoute[3] },
        );
      }
      if (action === "requests" && method === "POST") {
        const b = z
          .object({ message: z.string().trim().max(300) })
          .strict()
          .parse(body);
        return await commit(
          [
            noMembership(),
            guard(
              "EXISTS (SELECT 1 FROM teams WHERE id=? AND looking_for=1 AND member_count<max_size)",
              t.id,
            ),
            s(
              "INSERT INTO requests VALUES (?,?,?,?,?,'pending',?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET message=excluded.message,status='pending',updated_at=excluded.updated_at",
              crypto.randomUUID(),
              event,
              t.id,
              actor,
              b.message,
              now,
              now,
            ),
          ],
          { ok: true },
          "request.sent",
          t.id,
        );
      }
    }
    const decision = path.match(/^\/requests\/([^/]+)$/);
    if (decision && method === "PATCH") {
      const b = z
          .object({ decision: z.enum(["accepted", "declined"]) })
          .strict()
          .parse(body),
        r = await first(
          "SELECT * FROM requests WHERE id=? AND event_id=?",
          decision[1],
          event,
        );
      if (!r) fail(404, "Request not found.");
      const t = await getTeam(r.team_id);
      requireLeader(t);
      const batch = [
        leaderGuard(t.id),
        guard(
          "EXISTS (SELECT 1 FROM requests WHERE id=? AND status='pending')",
          r.id,
        ),
      ];
      if (b.decision === "accepted")
        batch.push(
          noMembership(r.user_id),
          s(
            "INSERT INTO members VALUES (?,?,?,?)",
            event,
            r.user_id,
            t.id,
            now,
          ),
        );
      batch.push(
        s(
          "UPDATE requests SET status=?,updated_at=? WHERE id=?",
          b.decision,
          now,
          r.id,
        ),
      );
      if (b.decision === "accepted")
        batch.push(
          s(
            "UPDATE requests SET status='cancelled',updated_at=? WHERE event_id=? AND user_id=? AND id<>? AND status='pending'",
            now,
            event,
            r.user_id,
            r.id,
          ),
        );
      return await commit(batch, { ok: true }, "request." + b.decision, t.id, {
        userId: r.user_id,
      });
    }
    return fail(404, "Endpoint not found.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return reply(
        { error: error.issues.map((i) => i.message).join(" ") },
        400,
      );
    if (error instanceof HttpError)
      return reply(
        { error: error.message },
        error.status,
        error.status === 429 ? { "Retry-After": "60" } : {},
      );
    console.error(
      JSON.stringify({
        trace,
        path,
        message:
          error instanceof Error
            ? error.message + " " + String(error.cause)
            : "Unknown error",
      }),
    );
    return reply(
      {
        error: "Something went wrong. Retry with the same request key.",
        requestId: trace,
        ...(ctx.debug
          ? {
              debug:
                String(error) +
                " " +
                String(error instanceof Error ? error.cause : ""),
            }
          : {}),
      },
      500,
    );
  }
}
