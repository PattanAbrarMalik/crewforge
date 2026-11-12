# Validation report

Measured: 2026-11-12T19:27:50.165Z (UTC).

## Correctness

47 integration tests passed against real workerd and SQLite, including the 50-way last-seat race, idempotency, authorization, lifecycle, and interrupted-reader scenarios. Type checking passes.

## Performance

Fixture: 10,000 users, 2,000 teams and 6,000 memberships. 100 concurrent connections, 100 test identities, loopback HTTP.

| Workload | Seconds | Completed | p50 ms | p95 ms | p99 ms | Connection errors | Non-200 responses | Target |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Default paginated board | 30 | 105503 | 22.301 | 66.89 | 95.332 | 0 | 0 | Met |
| Four rotating search queries | 20 | 22315 | 2.973 | 536.144 | 1301.284 | 3 | 0 | Not met |

Local workerd + SQLite via Miniflare, loopback HTTP, 100 authenticated identities. Excludes public-network/TLS latency and Vinext routing. In-flight query coalescing enabled; no timed response cache.

The required default board workload meets the 200 ms p95 target. The additional mixed-search workload does not meet the target in this run and had connection errors; this remains a performance limitation. No hosted latency claim is made.

## Recovery

The process-kill test passed: kill after database commit but before acknowledgement, restart with persistent SQLite, then retry the same key. Result: one membership, one join audit, zero broken counts.

## Browser checks

Verified request → leader approval → member visibility in the actual UI. Checked modal keyboard navigation and Escape, the desktop layout, and a 390-pixel embedded viewport. The final focus-restoration and hidden-navigation adjustments received type checking; a full automated accessibility audit was not run.

## Submission status

Source, design PDF, API documentation, CI workflow and a sub-five-minute walkthrough script are included. Docker recipes are provided but were not executed here. A recorded video and judge access must be completed before final submission.
