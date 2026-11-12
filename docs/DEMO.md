# CrewForge — 4 minute 40 second walkthrough

Record the deployed app and your terminal. Use real results, show the URL, and keep the video below five minutes. This file is a script, not a recorded video.

**0:00–0:30 — Problem and promise.** “CrewForge helps builders find complementary teammates. The hard part is making the last seat safe under concurrent requests. I chose PS1 as required.” Show the board, filters and profile.

**0:30–1:20 — Full user journey.** In the sandbox as Alex, open FrameShift and send a request. Switch to Maya, see the request arrive, and accept. Switch back to Alex to see membership. Explain that personas are isolated to this authenticated owner's sandbox, while the live workspace uses real identities.

**1:20–2:00 — Leader controls.** As Maya, generate a 24-hour invite, pause and reopen recruiting, and view complementary teammate suggestions. Explain the 70/30 components. As Leo, show membership without leader controls. Show activity history.

**2:00–2:45 — Concurrency evidence.** Run `npm test` and point to the test with 50 contenders: one success, 49 conflicts, final count exactly two for a two-person team. Show the primary key and membership trigger. Explain the atomic D1 batch and why a read-then-write counter alone would race.

**2:45–3:20 — Retry and failure.** Show the idempotency tests and `reports/chaos.json`. Explain the killed process after commit but before acknowledgement, then retrying the same key after restart: one membership, one audit entry. State that this tests local process recovery, not a provider-wide outage.

**3:20–3:55 — Performance.** Show `reports/load.json`: 10,000 users, 2,000 teams, 100 connections. Read the actual p95 result. Explain index-backed pagination and in-flight query coalescing. Clearly distinguish local Worker results from hosted network latency.

**3:55–4:25 — Lifecycle and UX.** Leave as leader and show deterministic succession; use a fresh single-person team to show empty-team deletion. Demonstrate Tab/Enter and a narrow browser window. Explain optimistic rollback and errors.

**4:25–4:40 — Close.** “The central invariant lives in the database. Every committed change has a durable audit record, every retry has a receipt, and the interface makes those guarantees usable.” Show GitHub, live URL, design note and test report links.

Before recording: reset by using another sandbox owner only if available, or choose fresh team names. Never claim fabricated participation, external AI, production latency, or a judging rank. Be ready to explain every line used in the final submission.
