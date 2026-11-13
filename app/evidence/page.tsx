import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ShieldCheck,
  Layers,
} from "lucide-react";
import load from "../../reports/load.json";
import chaos from "../../reports/chaos.json";
import tests from "../../reports/tests.json";
export default function Evidence() {
  return (
    <div
      style={{ maxWidth: 1060, margin: "0 auto", padding: "35px 25px 60px" }}
    >
      <a className="back-link" href="/">
        <ArrowLeft size={15} />
        Back to CrewForge
      </a>
      <div
        style={{
          background: "#235d49",
          borderRadius: 16,
          padding: "34px",
          color: "#fff",
          marginBottom: 26,
        }}
      >
        <div className="eyebrow" style={{ color: "#d1dfc5" }}>
          ENGINEERING, WITH RECEIPTS
        </div>
        <h1 style={{ fontSize: 39 }}>Built to hold up.</h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.9,
            color: "#d2dfca",
            maxWidth: 700,
            marginTop: 16,
          }}
        >
          The interface brings people together. Database invariants keep their
          teams correct. Here is what we tested, how we measured it, and where
          the evidence stops.
        </p>
      </div>
      <div className="stats-row">
        <div>
          <ShieldCheck size={26} />
          <span>
            <strong>{tests.pass} / {tests.tests}</strong>
            <small>integration tests passing</small>
          </span>
        </div>
        <div>
          <UsersIcon />
          <span>
            <strong>1 of 50</strong>
            <small>wins the final seat</small>
          </span>
        </div>
        <div>
          <Check size={26} />
          <span>
            <strong>{chaos.passed ? "Recovered" : "Check report"}</strong>
            <small>commit → kill → restart → retry</small>
          </span>
        </div>
      </div>
      <section className="panel" style={{ marginBottom: 22 }}>
        <div className="section-heading">
          <h2>Measured, not estimated</h2>
          <span className="role-badge">Local benchmark</span>
        </div>
        <p className="muted">
          10,000 users · 2,000 teams · 6,000 memberships · 100 concurrent
          connections. Runs use real workerd and SQLite with 100 authenticated
          test identities.
        </p>
        <div style={{ overflowX: "auto", marginTop: 20 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              textAlign: "left",
            }}
          >
            <thead>
              <tr>
                {[
                  "Workload",
                  "p50",
                  "p95",
                  "p99",
                  "Requests / s",
                  "Failed requests",
                ].map((x) => (
                  <th
                    key={x}
                    style={{
                      padding: "12px 10px",
                      borderBottom: "1px solid #e1e7df",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {load.results.map((r) => (
                <tr key={r.label}>
                  <td
                    style={{
                      padding: "17px 10px",
                      borderBottom: "1px solid #e1e7df",
                    }}
                  >
                    {r.label}
                  </td>
                  {[
                    r.p50Ms + " ms",
                    r.p95Ms + " ms",
                    r.p99Ms + " ms",
                    r.requestsPerSecond.toLocaleString(),
                    String(
                      r.errors +
                        Object.entries(r.statuses).reduce(
                          (sum, [status, n]) =>
                            sum + (status === "200" ? 0 : n),
                          0,
                        ),
                    ),
                  ].map((x, i) => (
                    <td
                      key={i}
                      style={{
                        padding: "17px 10px",
                        borderBottom: "1px solid #e1e7df",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {x}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 17, fontSize: 11 }}>
          Measured{" "}
          {new Date(load.measuredAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          . Target: p95 below 200 ms.{" "}
          {load.results.every((r) => r.targetMet)
            ? "Both workloads meet the latency and zero-error targets in this run."
            : "Some workloads did not meet all targets; inspect latency and errors above."}{" "}
          {load.scope}
        </p>
        <a
          className="plain-link"
          style={{ justifyContent: "flex-start", marginTop: 15 }}
          href="/evidence/load.json"
          download
        >
          Download raw benchmark <ArrowUpRight size={15} />
        </a>
      </section>
      <div className="detail-columns">
        <section className="panel">
          <h3>Correctness at the boundary</h3>
          <p className="muted" style={{ margin: "14px 0" }}>
            The test suite exercises the API against a real Worker runtime and
            database, including:
          </p>
          <ul className="muted" style={{ paddingLeft: 18, lineHeight: 2.1 }}>
            <li>
              50 simultaneous attempts for one seat: one success, 49 conflicts.
            </li>
            <li>Duplicate create and join retries converge on one result.</li>
            <li>One person racing for two teams joins exactly one.</li>
            <li>
              Request approval competing with a direct invite obeys the same
              capacity invariant.
            </li>
            <li>
              Leader succession, empty-team deletion, permissions and rollback.
            </li>
            <li>Invite expiry, rotation, rate limits and sandbox isolation.</li>
          </ul>
        </section>
        <section className="panel">
          <h3>Failure is part of the design</h3>
          <p className="muted" style={{ marginTop: 14 }}>
            {chaos.scenario}
          </p>
          <div
            className="readiness"
            style={{ display: "block", lineHeight: 2.3 }}
          >
            Memberships after retry:{" "}
            <strong>{chaos.invariant.memberships}</strong>
            <br />
            Join audit rows: <strong>{chaos.invariant.audits}</strong>
            <br />
            Broken counts: <strong>{chaos.invariant.brokenCounts}</strong>
          </div>
          <p className="muted" style={{ fontSize: 11 }}>
            {chaos.scope}
          </p>
          <a
            className="plain-link"
            href="/evidence/chaos.json"
            download
            style={{ justifyContent: "flex-start", marginTop: 18 }}
          >
            Download recovery result <ArrowUpRight size={15} />
          </a>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 22 }}>
        <h3>Understand the decisions</h3>
        <p className="muted" style={{ margin: "13px 0 18px" }}>
          Atomic transactions, durable receipts, explainable matching, and
          bounded live updates. The design note includes the tradeoffs: a single
          database writer, polling delay, local-only performance evidence, and a
          heuristic match score.
        </p>
        <a className="button primary" href="/evidence/design.pdf" download>
          One-page system design <ArrowUpRight size={15} />
        </a>
      </section>
      <footer>
        <span>
          <Layers
            size={13}
            style={{ verticalAlign: "middle", marginRight: 5 }}
          />
          CrewForge · Hack4Hack PS1
        </span>
        <span>No ranking or judging outcome is claimed.</span>
      </footer>
    </div>
  );
}
function UsersIcon() {
  return <span style={{ fontSize: 24, color: "#6c8563" }}>↗</span>;
}
