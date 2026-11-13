# CrewForge — PS1 design

An authenticated team board with durable, race-proof membership. One person can belong to one team per event. Event size limits apply; a new team remains forming until it meets the minimum. The maximum is a hard invariant. Only PS1 is in scope because the challenge requires choosing one problem statement.

## Consistency boundary
SQLite/D1 serializes writes. A composite membership primary key enforces one team per event. A BEFORE INSERT trigger rejects full teams. AFTER INSERT/DELETE triggers maintain the count, transfer leadership to the oldest remaining member (stable user-id tie-break), and delete empty teams. State changes, authorization guards, idempotency receipt, and audit entry execute in one atomic D1 batch. A failed guard rolls back everything.

Idempotency receipts bind actor + key to a request fingerprint and original response. Reusing a key for a different payload conflicts. A committed operation with a lost HTTP response is recovered by retrying the original key. Authorization is checked again inside the transaction, so a stale leader cannot mutate after leaving.

## Identity and transport
Production trusts the hosting gateway’s authenticated user ID. Sandbox personas are namespaced by a hash of the authenticated owner and never impersonate live participants. Writes validate JSON, size, origin and strict field schemas. Persistent rate limits cover writes and invite-code attempts. Codes contain 128 random bits, expire, and rotate. The invite table stores only digests; leader-only idempotency receipts retain original responses for safe retries.

## Reads and realtime
Indexed cursor pagination and FTS5 token-prefix search bound board reads. A bounded 256-entry cache stores only completed public board rows: fresh for 100 ms, reusable for up to one second while a request refreshes them. Local writes invalidate the event; other isolates expire snapshots by TTL. This explicitly trades brief read staleness for bounded database traffic. In-flight reads cannot repopulate an invalidated entry. No pending I/O is shared across requests. Admission and authorization always use database state. SSE emits audit revision invalidations every 1.5 seconds; clients refetch authorized data and recover final state on reconnection.

Suggestions score missing skill coverage (70) and circular UTC-offset proximity (30), with visible components. This is an explainable heuristic, not a recruiting prediction.

## Verification and tradeoffs
Real Worker + SQLite integration tests include 50 contenders for one seat. Load tests seed 10,000 people and 2,000 teams and report measured p95. A process-kill test exercises committed-but-unacknowledged retries with persistent SQLite. Local tests do not prove hosted latency or provider-wide outage recovery. D1’s single writer simplifies correctness but limits sustained writes. SSE polling trades simplicity for up to 1.5 seconds of delay. Raw measured reports accompany the source; no competition result is claimed.
