# Validation report

Measured: 2026-11-13T02:11:03.772Z (UTC). [Independent GitHub Actions run](https://github.com/PattanAbrarMalik/crewforge/actions/runs/43350146016), source commit `9db949961ae1eca2123fcc03c84a463140794af2`. Both correctness and performance jobs passed. The downloaded load artifact was verified by SHA-256; provenance is in `reports/ci.json`.

## Correctness

49 integration tests passed against real workerd and SQLite, including the 50-way last-seat race, idempotency, authorization, lifecycle, interrupted-reader, cache invalidation and expiry scenarios. Type checking and crash recovery also pass in GitHub Actions.

## Performance

Fixture: 10,000 users, 2,000 teams and 6,000 memberships. 100 concurrent connections, 100 test identities, loopback HTTP. Runner: GitHub Actions Ubuntu, 2 vCPUs, AMD EPYC 9V74, approximately 8.3 GB RAM, Node v24.22.2.

| Workload | Seconds | Completed | p50 ms | p95 ms | p99 ms | Connection errors | Non-200 responses | Target |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Default paginated board | 30 | 109893 | 2.557 | 111.385 | 434.092 | 0 | 0 | Met |
| Four rotating search queries | 20 | 57435 | 2.7 | 40.441 | 998.006 | 0 | 0 | Met |

Local workerd + SQLite via Miniflare, loopback HTTP, 100 authenticated identities. Excludes public-network/TLS latency and Vinext routing. Completed public board rows use a bounded per-isolate cache: 100 ms fresh, at most 1 second old while one request refreshes; local writes invalidate it. No pending I/O is shared.

Both workloads meet the 200 ms p95 and zero-error targets in this independent run. Tail latency remains higher: search p99 is approximately 998 ms. This is a short, loopback benchmark, not a hosted latency or sustained-capacity guarantee.

Earlier managed-environment runs had intermittent TCP connection resets. Those results are retained in `reports/load-local.json`, `reports/load-before-cache.json` and `reports/load-cache-refresh-bursts.json`. The resets did not reproduce in this GitHub run; their precise cause remains unconfirmed. Failed local runs have not been relabeled as passes.

## Recovery

The process-kill test passed locally and in GitHub Actions: kill after database commit but before acknowledgement, restart with persistent SQLite, then retry the same key. Result: one membership, one join audit, zero broken counts. This does not simulate a provider-wide outage.

## Browser checks

Verified request → leader approval → member visibility in the actual local UI. Checked modal keyboard navigation, Escape and focus restoration, the desktop layout, a 390-pixel embedded viewport, and the final evidence table. A full automated accessibility audit was not run. Native hosting confirmed deployment; signed-in production browser verification remains pending ChatGPT authentication.

## Submission status

The private GitHub repository, live private deployment, design PDF, API documentation, CI checks and a sub-five-minute walkthrough script are included. Docker recipes are provided but were not executed here. A recorded video and judge access must be completed before final submission. No competition rank is claimed.
