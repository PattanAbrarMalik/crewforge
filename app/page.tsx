"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  Layers,
  LayoutGrid,
  Users,
  Compass,
  Activity,
  Plus,
  Search,
  ArrowLeft,
  Menu,
  X,
  Check,
  Globe,
  ChevronRight,
  Clipboard,
  ShieldCheck,
  LogOut,
  ArrowUpRight,
  Clock,
  Settings,
  ArrowRight,
} from "lucide-react";
import { SKILLS } from "../core/types";
type Tab = "board" | "team" | "matches" | "activity";
const initials = (name: string = "Builder") =>
  name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
const time = (n: number) =>
  new Date(n).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
    >
      <div className="dialog-title">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function SkillPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="skill-picker">
      {SKILLS.map((s) => (
        <button
          key={s}
          type="button"
          className={value.includes(s) ? "chosen" : ""}
          aria-pressed={value.includes(s)}
          onClick={() =>
            onChange(
              value.includes(s) ? value.filter((x) => x !== s) : [...value, s],
            )
          }
        >
          {value.includes(s) && <Check size={12} />} {s}
        </button>
      ))}
    </div>
  );
}
export default function Home() {
  const [tab, setTab] = useState<Tab>("board"),
    [mode, setMode] = useState("sandbox"),
    [persona, setPersona] = useState("alex"),
    [mobile, setMobile] = useState(false);
  const [data, setData] = useState<any>({
    board: [],
    stats: {},
    profile: null,
    team: null,
    detail: null,
    requests: [],
    activity: [],
    suggestions: [],
  });
  const [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [skill, setSkill] = useState(""),
    [openOnly, setOpenOnly] = useState(true),
    [cursor, setCursor] = useState<string | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [live, setLive] = useState(false),
    [unauth, setUnauth] = useState(false);
  const [modal, setModal] = useState<string | null>(null),
    [form, setForm] = useState<any>({}),
    [code, setCode] = useState<any>(null),
    [confirm, setConfirm] = useState<any>(null);
  const keys = useRef(new Map<string, string>()),
    busyRef = useRef(false),
    generation = useRef(0),
    reads = useRef(0),
    refreshRef = useRef<() => Promise<void>>(async () => {});
  const api = useCallback(
    async (path: string, method = "GET", body?: any, key?: string) => {
      const r = await fetch("/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Workspace": mode,
          "X-Persona": persona,
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const d: any = await r.json();
      if (!r.ok) {
        if (r.status === 401) setUnauth(true);
        throw Object.assign(new Error(d.error || "Please try again."), {
          status: r.status,
        });
      }
      return d;
    },
    [mode, persona],
  );
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 220);
    return () => clearTimeout(t);
  }, [query]);
  const boardPath = useCallback(
    (next?: string) =>
      "/board?" +
      new URLSearchParams({
        q: search,
        skill,
        open: String(openOnly),
        ...(next ? { cursor: next } : {}),
      }),
    [search, skill, openOnly],
  );
  const refresh = useCallback(async () => {
    const rev = generation.current,
      read = ++reads.current;
    const [me, stats, board, requests, activity] = await Promise.all([
      api("/me"),
      api("/stats"),
      api(boardPath()),
      api("/requests"),
      api("/audit"),
    ]);
    const id =
      selected || (tab === "team" || tab === "matches" ? me.team?.id : null);
    let detail: any = null,
      suggestions: any[] = [];
    if (id) {
      try {
        detail = await api("/teams/" + id);
        if (tab === "matches" && detail.team.leader_id === me.profile?.id)
          suggestions = (await api("/teams/" + id + "/suggestions")).items;
      } catch (e: any) {
        if (e.status !== 404) throw e;
        setSelected(null);
      }
    }
    if (rev !== generation.current || read !== reads.current) return;
    setData({
      profile: me.profile,
      team: me.team,
      stats,
      board: board.items,
      detail,
      requests: requests.items,
      activity: activity.items,
      suggestions,
    });
    setCursor(board.nextCursor);
  }, [api, boardPath, selected, tab]);
  refreshRef.current = refresh;
  useEffect(() => {
    generation.current++;
    setReady(false);
    setSelected(null);
    setError("");
    setUnauth(false);
    let cancelled = false;
    api("/bootstrap", "POST", {})
      .then(async () => {
        await refreshRef.current();
        if (!cancelled) setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);
  useEffect(() => {
    if (ready) void refresh().catch((e) => setError(e.message));
  }, [refresh, ready]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let revision = -1,
      timer: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        const r = await fetch("/api/events?after=" + Math.max(0, revision), {
          headers: { "X-Workspace": mode, "X-Persona": persona },
          signal: controller.signal,
        });
        if (!r.ok) throw Error("Stream disconnected");
        const reader = r.body!.getReader(),
          decoder = new TextDecoder();
        let buffer = "";
        setLive(true);
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const line = event.split("\n").find((l) => l.startsWith("data:"));
            if (line) {
              const n = JSON.parse(line.slice(5)).revision;
              if (n !== revision) {
                revision = n;
                void refreshRef.current().catch(() => {});
              }
            }
          }
        }
      } catch {
        setLive(false);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(connect, 1500);
      }
    }
    void connect();
    return () => {
      controller.abort();
      clearTimeout(timer);
      setLive(false);
    };
  }, [mode, persona, ready]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function mutate(
    path: string,
    method: string,
    body: any,
    message = "Changes saved",
  ) {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const signature = method + path + JSON.stringify(body),
      key = keys.current.get(signature) || crypto.randomUUID();
    keys.current.set(signature, key);
    try {
      const result = await api(path, method, body, key);
      keys.current.delete(signature);
      await refreshRef.current();
      setToast(message);
      return result;
    } catch (e: any) {
      if (e.status && e.status < 500) keys.current.delete(signature);
      setError(e.message);
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function navigate(t: Tab) {
    setTab(t);
    setSelected(null);
    setMobile(false);
  }
  function openForm(kind: string) {
    setError("");
    setModal(kind);
    setCode(null);
    setForm(
      kind === "profile"
        ? {
            name: data.profile?.name ?? "",
            bio: data.profile?.bio ?? "",
            skills: data.profile?.skills ?? [],
            utcOffset: data.profile?.utc_offset ?? 330,
          }
        : kind === "create"
          ? { name: "", pitch: "", skills: [], minSize: 2, maxSize: 4 }
          : { code: "", message: "" },
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let result;
    if (modal === "create") {
      result = await mutate(
        "/teams",
        "POST",
        form,
        "Your team is ready to grow.",
      );
      if (result) {
        setSelected(result.teamId);
        setTab("team");
      }
    }
    if (modal === "join") {
      result = await mutate(
        "/join",
        "POST",
        { code: form.code.trim().toLowerCase() },
        "You joined the team.",
      );
      if (result) {
        setSelected(result.teamId);
        setTab("team");
      }
    }
    if (modal === "profile")
      result = await mutate(
        "/profile",
        "PATCH",
        form,
        "Your profile is updated.",
      );
    if (modal === "request")
      result = await mutate(
        "/teams/" + data.detail.team.id + "/requests",
        "POST",
        { message: form.message },
        "Request sent to the team leader.",
      );
    if (result) setModal(null);
  }
  const leader = data.detail?.team.leader_id === data.profile?.id,
    detail = data.detail,
    myMember = detail?.members.some((p: any) => p.id === data.profile?.id);
  const navs: [Tab, string, any][] = [
    ["board", "Team board", LayoutGrid],
    ["team", "My team", Users],
    ["matches", "Find teammates", Compass],
    ["activity", "Activity", Activity],
  ];
  const title =
    tab === "board"
      ? "Find your people."
      : tab === "team"
        ? "A small team. Big possibilities."
        : tab === "matches"
          ? "Good teams complement each other."
          : "Every change, accounted for.";
  async function pause() {
    const before = data.detail;
    setData((d: any) => ({
      ...d,
      detail: {
        ...d.detail,
        team: { ...d.detail.team, looking_for: !d.detail.team.looking_for },
      },
    }));
    const r = await mutate(
      "/teams/" + before.team.id,
      "PATCH",
      { lookingFor: !before.team.looking_for },
      before.team.looking_for ? "Recruiting paused." : "Recruiting reopened.",
    );
    if (!r) setData((d: any) => ({ ...d, detail: before }));
  }
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a className="brand" href="/" aria-label="CrewForge home">
          <span>
            <Layers size={23} />
          </span>
          CrewForge<span className="brand-dot">.</span>
        </a>
        <button
          className="mobile-close icon-button"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <div className="event-switch">
          <span className="event-icon">H4</span>
          <div>
            <small>YOUR WORKSPACE</small>
            <strong>Hack4Hack Crew</strong>
            <span>Challenge 2026</span>
          </div>
          <ChevronRight size={15} />
        </div>
        <div className="nav-label">BUILD SOMETHING TOGETHER</div>
        <nav>
          {navs.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              className={tab === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {label}
              {id === "team" && data.team && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="shapes">
            <span>✳</span>
            <span>✦</span>
            <span>+</span>
          </div>
          <h3>
            Different skills.
            <br />
            Shared ambition.
          </h3>
          <p>
            The best things are built
            <br />
            with the right people.
          </p>
        </div>
        <div className="sidebar-bottom">
          <a href="/evidence">
            <ShieldCheck size={17} /> Built to hold up{" "}
            <ArrowUpRight size={14} />
          </a>
          <button onClick={() => openForm("profile")} disabled={!ready}>
            <span className="avatar">{initials(data.profile?.name)}</span>
            <span>
              <strong>{data.profile?.name || "Your profile"}</strong>
              <small>
                {mode === "sandbox" ? "Sandbox builder" : "Live participant"}
              </small>
            </span>
            <Settings size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{navs.find((n) => n[0] === tab)?.[1]}</strong>
          </div>
          <div className="connection">
            <i className={live ? "online" : ""} />
            {live ? "Live updates" : "Connecting"}
            <span className="top-avatar">{initials(data.profile?.name)}</span>
          </div>
        </header>
        <main>
          <div className="sandbox-bar">
            <span className="sandbox-icon">
              <Layers size={18} />
            </span>
            <div>
              <strong>
                {mode === "sandbox"
                  ? "Your private sandbox"
                  : "Live challenge workspace"}
              </strong>
              <p>
                {mode === "sandbox"
                  ? "Sample people. Real transactions. Explore every role."
                  : "Your profile and team are shared with signed-in participants."}
              </p>
            </div>
            <div className="sandbox-controls">
              <label className="sr-only" htmlFor="workspace-mode">
                Workspace mode
              </label>
              <select
                id="workspace-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="sandbox">Sandbox</option>
                <option value="live">Live workspace</option>
              </select>
              {mode === "sandbox" && (
                <>
                  <label className="sr-only" htmlFor="persona">
                    Explore as
                  </label>
                  <select
                    id="persona"
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                  >
                    <option value="alex">Alex · builder</option>
                    <option value="maya">Maya · leader</option>
                    <option value="noor">Noor · builder</option>
                    <option value="leo">Leo · member</option>
                  </select>
                </>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              {unauth && (
                <a href="/signin-with-chatgpt?return_to=/" target="_top">
                  Sign in with ChatGPT <ArrowRight size={16} />
                </a>
              )}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          <section className="page-heading">
            <div>
              <div className="eyebrow">A PLACE FOR BUILDERS</div>
              <h1>
                {title}
                {tab === "board" && (
                  <>
                    <br />
                    <span>Build your next.</span>
                  </>
                )}
              </h1>
              <p>
                {tab === "board"
                  ? "Find a crew that shares your curiosity. Bring the skill only you can."
                  : tab === "team"
                    ? "Keep your people, requests, and next steps in one place."
                    : tab === "matches"
                      ? "Discover builders who bring what your team is missing."
                      : "A durable record of your profile and team’s progress."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                disabled={!ready || !!data.team}
                onClick={() => openForm("join")}
              >
                <Clipboard size={16} />
                Join with code
              </button>
              <button
                className="button primary"
                disabled={!ready || !!data.team}
                onClick={() => openForm("create")}
              >
                <Plus size={17} />
                Create a team
              </button>
            </div>
          </section>
          {!ready ? (
            <div className="loading" role="status">
              <span className="spinner" />
              Getting your workspace ready…
            </div>
          ) : (
            <>
              {tab === "board" && !selected && (
                <>
                  <div className="stats-row">
                    <div>
                      <span className="stat-icon">
                        <Users size={20} />
                      </span>
                      <span>
                        <strong>{data.stats.builders}</strong>
                        <small>builders, many possibilities</small>
                      </span>
                    </div>
                    <div>
                      <span className="stat-icon">
                        <LayoutGrid size={20} />
                      </span>
                      <span>
                        <strong>
                          {data.stats.openTeams} <em>open teams</em>
                        </strong>
                        <small>looking for their missing piece</small>
                      </span>
                    </div>
                    <div>
                      <span className="stat-icon">
                        <Globe size={20} />
                      </span>
                      <span>
                        <strong>Worldwide</strong>
                        <small>different time zones, one ambition</small>
                      </span>
                    </div>
                  </div>
                  <div className="board-layout">
                    <section>
                      <div className="section-heading">
                        <h2>
                          Find your next crew <span>{data.stats.teams}</span>
                        </h2>
                        <span className="muted">A good match starts here</span>
                      </div>
                      <div className="filters">
                        <label className="search">
                          <Search size={17} />
                          <input
                            aria-label="Search teams"
                            placeholder="Search teams or ideas…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </label>
                        <select
                          aria-label="Filter by skill"
                          value={skill}
                          onChange={(e) => setSkill(e.target.value)}
                        >
                          <option value="">All skills</option>
                          {SKILLS.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <label className="open-filter">
                          <input
                            type="checkbox"
                            checked={openOnly}
                            onChange={(e) => setOpenOnly(e.target.checked)}
                          />
                          Open spots
                        </label>
                      </div>
                      <div className="team-grid">
                        {data.board.map((t: any, i: number) => (
                          <article className="team-card" key={t.id}>
                            <div className="card-top">
                              <span className={"project-icon color-" + (i % 5)}>
                                {
                                  [
                                    <Layers key="a" size={24} />,
                                    <ArrowUpRight key="b" size={26} />,
                                    <Compass key="c" size={24} />,
                                    <LayoutGrid key="d" size={23} />,
                                    <Globe key="e" size={24} />,
                                  ][i % 5]
                                }
                              </span>
                              <span className="seat-badge">
                                <i />
                                {t.max_size - t.member_count}{" "}
                                {t.max_size - t.member_count === 1
                                  ? "spot"
                                  : "spots"}{" "}
                                open
                              </span>
                            </div>
                            <h3>{t.name}</h3>
                            <p className="pitch">{t.pitch}</p>
                            <span className="tiny-label">LOOKING FOR</span>
                            <div className="tags">
                              {t.skills.map((s: string) => (
                                <span key={s}>{s}</span>
                              ))}
                            </div>
                            <div className="card-footer">
                              <div>
                                <span className="avatar small">
                                  {initials(t.leader_name)}
                                </span>
                                <span>
                                  {t.member_count}/{t.max_size} members
                                </span>
                              </div>
                              <button onClick={() => setSelected(t.id)}>
                                View team <ArrowUpRight size={15} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                      {!data.board.length && (
                        <div className="empty-state">
                          <Search size={28} />
                          <h3>No teams match yet</h3>
                          <p>
                            Try another skill or create a crew for your idea.
                          </p>
                        </div>
                      )}
                      {cursor && (
                        <button
                          className="button secondary load-more"
                          onClick={async () => {
                            try {
                              const b = await api(boardPath(cursor));
                              setData((d: any) => ({
                                ...d,
                                board: [
                                  ...d.board,
                                  ...b.items.filter(
                                    (t: any) =>
                                      !d.board.some((x: any) => x.id === t.id),
                                  ),
                                ],
                              }));
                              setCursor(b.nextCursor);
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          Explore more teams <ArrowRight size={16} />
                        </button>
                      )}
                    </section>
                    <aside className="board-aside">
                      <div className="profile-card">
                        <span className="avatar large">
                          {initials(data.profile.name)}
                        </span>
                        <div className="eyebrow">YOUR NEXT CHAPTER</div>
                        <h3>Hey, {data.profile.name.split(" ")[0]}.</h3>
                        <p>
                          Your perspective could be
                          <br />a team’s missing piece.
                        </p>
                        <div className="tags">
                          {data.profile.skills.map((s: string) => (
                            <span key={s}>{s}</span>
                          ))}
                        </div>
                        <button onClick={() => openForm("profile")}>
                          Make your profile yours <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <div className="how-card">
                        <h3>
                          A little spark.
                          <br />A great team.
                        </h3>
                        {[
                          [
                            "01",
                            "Find your people",
                            "Explore ideas that pull you in.",
                          ],
                          ["02", "Say hello", "Request to join or use a code."],
                          [
                            "03",
                            "Make it happen",
                            "Bring your skills. Build together.",
                          ],
                        ].map(([n, a, b]) => (
                          <div key={n}>
                            <span>{n}</span>
                            <p>
                              <strong>{a}</strong>
                              <small>{b}</small>
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="small-note">
                        <ShieldCheck size={16} />
                        Every seat is backed by an atomic transaction.
                      </p>
                    </aside>
                  </div>
                </>
              )}
              {(selected || tab === "team") && (
                <section className="detail-section">
                  {selected && (
                    <button
                      className="back-link"
                      onClick={() => {
                        setSelected(null);
                        if (tab === "board") navigate("board");
                      }}
                    >
                      <ArrowLeft size={15} />
                      Back to {tab === "board" ? "teams" : "my team"}
                    </button>
                  )}
                  {!detail && (selected || data.team) ? (
                    <div className="loading" role="status">
                      Loading your team…
                    </div>
                  ) : detail ? (
                    <>
                      <div className="detail-heading">
                        <span className="project-icon color-0">✳</span>
                        <div>
                          <h2>{detail.team.name}</h2>
                          <p>{detail.team.pitch}</p>
                          <div className="tags">
                            {detail.team.skills.map((s: string) => (
                              <span key={s}>{s}</span>
                            ))}
                          </div>
                        </div>
                        <span className="seat-badge">
                          {detail.team.member_count}/{detail.team.max_size}{" "}
                          members
                        </span>
                      </div>
                      <div className="readiness">
                        <span>
                          <i
                            className={
                              detail.team.member_count >= detail.team.min_size
                                ? "ready-dot"
                                : ""
                            }
                          />
                          {detail.team.member_count >= detail.team.min_size
                            ? "Ready to build"
                            : "Still forming"}{" "}
                          · minimum {detail.team.min_size}, maximum{" "}
                          {detail.team.max_size}
                        </span>
                        <span>
                          {detail.team.looking_for
                            ? "Recruiting is open"
                            : "Recruiting paused"}
                        </span>
                      </div>
                      <div className="detail-columns">
                        <div className="panel">
                          <div className="section-heading">
                            <h3>The people behind the idea</h3>
                            <Users size={18} />
                          </div>
                          {detail.members.map((p: any) => (
                            <div className="member-row" key={p.id}>
                              <span className="avatar">{initials(p.name)}</span>
                              <div>
                                <strong>
                                  {p.name}
                                  {p.id === data.profile.id && " (you)"}
                                </strong>
                                <small>
                                  {p.skills.join(" · ") ||
                                    "Skills not added yet"}
                                </small>
                              </div>
                              {p.id === detail.team.leader_id ? (
                                <span className="role-badge">Leader</span>
                              ) : leader ? (
                                <button
                                  className="text-danger"
                                  disabled={busy}
                                  onClick={() => {
                                    setConfirm({
                                      path: `/teams/${detail.team.id}/members/${p.id}`,
                                      method: "DELETE",
                                      title: "Remove " + p.name + "?",
                                      message:
                                        "They will be able to join another team.",
                                    });
                                    setModal("confirm");
                                  }}
                                >
                                  Remove
                                </button>
                              ) : (
                                <span className="muted">Member</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="panel team-actions">
                          <h3>
                            {leader
                              ? "Lead with clarity"
                              : myMember
                                ? "You’re part of this crew"
                                : "Like the idea?"}
                          </h3>
                          <p>
                            {leader
                              ? "Keep your crew in sync. Every change is recorded."
                              : myMember
                                ? "Your team is ready for what you bring."
                                : "Introduce yourself and tell the leader how you can help."}
                          </p>
                          {leader ? (
                            <>
                              <button
                                className="button primary"
                                disabled={busy}
                                onClick={async () => {
                                  const r = await mutate(
                                    "/teams/" + detail.team.id + "/invites",
                                    "POST",
                                    { hours: 24 },
                                    "A new invite is ready.",
                                  );
                                  if (r) {
                                    setCode(r);
                                    setModal("invite");
                                  }
                                }}
                              >
                                <Clipboard size={16} />
                                Create 24h invite
                              </button>
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={pause}
                              >
                                {detail.team.looking_for
                                  ? "Pause recruiting"
                                  : "Reopen recruiting"}
                              </button>
                              <button
                                className="plain-link"
                                onClick={() => {
                                  setTab("matches");
                                  setSelected(null);
                                }}
                              >
                                Find complementary teammates{" "}
                                <ArrowRight size={15} />
                              </button>
                            </>
                          ) : (
                            !data.team && (
                              <button
                                className="button primary"
                                disabled={
                                  busy ||
                                  !detail.team.looking_for ||
                                  detail.team.member_count >=
                                    detail.team.max_size
                                }
                                onClick={() => openForm("request")}
                              >
                                Request to join <ArrowUpRight size={16} />
                              </button>
                            )
                          )}
                          {myMember && (
                            <button
                              className="leave-button"
                              disabled={busy}
                              onClick={() => {
                                setConfirm({
                                  path: `/teams/${detail.team.id}/leave`,
                                  method: "POST",
                                  title: "Leave this team?",
                                  message:
                                    detail.members.length === 1
                                      ? "You are the last member. The empty team will be deleted."
                                      : leader
                                        ? "Leadership will pass to the earliest remaining member."
                                        : "You will be free to join another team.",
                                });
                                setModal("confirm");
                              }}
                            >
                              <LogOut size={15} />
                              Leave team
                            </button>
                          )}
                        </div>
                      </div>
                      {leader && (
                        <div className="panel requests-panel">
                          <h3>
                            People who want to build with you{" "}
                            <span className="count">
                              {detail.requests.length}
                            </span>
                          </h3>
                          {detail.requests.length ? (
                            detail.requests.map((r: any) => (
                              <div className="request-row" key={r.id}>
                                <span className="avatar">
                                  {initials(r.name)}
                                </span>
                                <div>
                                  <strong>{r.name}</strong>
                                  <p>
                                    {r.message ||
                                      "Ready to contribute to your team."}
                                  </p>
                                  <small>
                                    {JSON.parse(r.skills).join(" · ")}
                                  </small>
                                </div>
                                <button
                                  className="button secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    mutate(
                                      "/requests/" + r.id,
                                      "PATCH",
                                      { decision: "declined" },
                                      "Request declined.",
                                    )
                                  }
                                >
                                  Decline
                                </button>
                                <button
                                  className="button primary"
                                  disabled={busy}
                                  onClick={() =>
                                    mutate(
                                      "/requests/" + r.id,
                                      "PATCH",
                                      { decision: "accepted" },
                                      "Welcome to the team.",
                                    )
                                  }
                                >
                                  Accept
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="muted">
                              No pending requests. Keep your profile and skills
                              clear so the right people can find you.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-state panel">
                      <Users size={34} />
                      <h2>Your next team starts here.</h2>
                      <p>
                        Explore the board, use an invite code, or gather people
                        around your own idea.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => navigate("board")}
                      >
                        Explore the board <ArrowRight size={16} />
                      </button>
                      {data.requests.length > 0 && (
                        <div className="my-requests">
                          <h3>Your requests</h3>
                          {data.requests.map((r: any) => (
                            <div key={r.id}>
                              <strong>{r.team_name}</strong>
                              <span className="role-badge">{r.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}
              {tab === "matches" && !selected && (
                <section>
                  {data.team && data.team.leader_id === data.profile.id ? (
                    <>
                      <div className="scoring-note">
                        <Compass size={22} />
                        <p>
                          <strong>A match you can understand.</strong> 70 points
                          for skills your team needs, 30 for timezone proximity.
                          Scores are a starting point for a conversation.
                        </p>
                      </div>
                      <div className="match-grid">
                        {data.suggestions.map((p: any) => (
                          <article className="panel match-card" key={p.id}>
                            <div className="match-top">
                              <span className="avatar large">
                                {initials(p.name)}
                              </span>
                              <span className="match-score">
                                {p.score}
                                <small>/ 100</small>
                              </span>
                            </div>
                            <h3>{p.name}</h3>
                            <p>{p.bio}</p>
                            <div className="tags">
                              {p.skills.map((s: string) => (
                                <span
                                  className={
                                    p.adds.includes(s) ? "complement" : ""
                                  }
                                  key={s}
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                            <div className="score-line">
                              <span>Missing skill coverage</span>
                              <strong>{p.skillScore}/70</strong>
                            </div>
                            <progress value={p.skillScore} max={70} />
                            <div className="score-line">
                              <span>Timezone proximity</span>
                              <strong>{p.timeScore}/30</strong>
                            </div>
                            <progress value={p.timeScore} max={30} />
                            <small className="muted">{p.explanation}</small>
                          </article>
                        ))}
                      </div>
                      {!data.suggestions.length && (
                        <p className="empty-state">
                          No available builders yet. Check back as the community
                          grows.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="empty-state panel">
                      <Compass size={34} />
                      <h2>A team gives matching its context.</h2>
                      <p>
                        Create a team to find builders with complementary
                        skills, or explore as Maya in the sandbox.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => navigate("team")}
                      >
                        Go to my team <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </section>
              )}
              {tab === "activity" && (
                <section className="panel activity-panel">
                  <div className="section-heading">
                    <h2>Your team’s story</h2>
                    <span className="muted">Saved with every change</span>
                  </div>
                  {data.activity.length ? (
                    data.activity.map((a: any) => (
                      <div className="activity-row" key={a.seq}>
                        <span className="activity-dot">
                          <Activity size={16} />
                        </span>
                        <div>
                          <strong>
                            {a.action.replaceAll(".", " ").replaceAll("_", " ")}
                          </strong>
                          <p>
                            {a.actor_name || "Builder"}
                            {a.details.name ? " · " + a.details.name : ""}
                            {a.details.teamDeleted
                              ? " · Empty team deleted"
                              : ""}
                          </p>
                        </div>
                        <time dateTime={new Date(a.created_at).toISOString()}>
                          {time(a.created_at)}
                        </time>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Activity size={30} />
                      <h3>Your first chapter is waiting.</h3>
                      <p>
                        Create a team, update your profile, or send a request to
                        begin.
                      </p>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
          <footer>
            Made for the people who make things.{" "}
            <span>CrewForge · Hack4Hack 2026</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <Dialog
          title={
            modal === "create"
              ? "Start something worth building"
              : modal === "join"
                ? "Your crew is one code away"
                : modal === "profile"
                  ? "Let your skills speak"
                  : modal === "request"
                    ? "Say hello to your next team"
                    : modal === "invite"
                      ? "Invite someone to build with you"
                      : (confirm?.title ?? "Confirm")
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {["create", "join", "profile", "request"].includes(modal) && (
            <form onSubmit={submit}>
              {modal === "create" && (
                <>
                  <p className="muted">
                    A clear idea makes it easier for the right people to find
                    you.
                  </p>
                  <label>
                    Team name
                    <input
                      required
                      minLength={3}
                      maxLength={60}
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="Give your crew a name"
                    />
                  </label>
                  <label>
                    The idea
                    <textarea
                      required
                      minLength={12}
                      maxLength={320}
                      value={form.pitch}
                      onChange={(e) =>
                        setForm({ ...form, pitch: e.target.value })
                      }
                      placeholder="What will you build, and why does it matter?"
                    />
                  </label>
                  <fieldset>
                    <legend>Skills you’re looking for</legend>
                    <SkillPicker
                      value={form.skills}
                      onChange={(skills) => setForm({ ...form, skills })}
                    />
                  </fieldset>
                  <div className="form-pair">
                    <label>
                      Minimum team size
                      <input
                        type="number"
                        min={2}
                        max={6}
                        value={form.minSize}
                        onChange={(e) =>
                          setForm({ ...form, minSize: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Maximum team size
                      <input
                        type="number"
                        min={form.minSize}
                        max={6}
                        value={form.maxSize}
                        onChange={(e) =>
                          setForm({ ...form, maxSize: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                </>
              )}
              {modal === "join" && (
                <>
                  <p className="muted">
                    Paste the 32-character code shared by your team leader.
                    Codes expire and may be replaced.
                  </p>
                  <label>
                    Invite code
                    <input
                      required
                      pattern="[a-fA-F0-9]{32}"
                      maxLength={32}
                      autoComplete="off"
                      value={form.code}
                      onChange={(e) =>
                        setForm({ ...form, code: e.target.value.trim() })
                      }
                      placeholder="Paste your invite code"
                    />
                  </label>
                </>
              )}
              {modal === "profile" && (
                <>
                  <label>
                    Your name
                    <input
                      required
                      minLength={2}
                      maxLength={60}
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    A little about you
                    <textarea
                      maxLength={240}
                      value={form.bio}
                      onChange={(e) =>
                        setForm({ ...form, bio: e.target.value })
                      }
                      placeholder="What do you love building?"
                    />
                  </label>
                  <fieldset>
                    <legend>Your skills</legend>
                    <SkillPicker
                      value={form.skills}
                      onChange={(skills) => setForm({ ...form, skills })}
                    />
                  </fieldset>
                  <label>
                    UTC offset in minutes
                    <input
                      type="number"
                      min={-720}
                      max={840}
                      value={form.utcOffset}
                      onChange={(e) =>
                        setForm({ ...form, utcOffset: Number(e.target.value) })
                      }
                    />
                    <small>
                      India: 330 · UTC: 0 · New York standard time: −300
                    </small>
                  </label>
                </>
              )}
              {modal === "request" && (
                <>
                  <p className="muted">
                    The leader will review your profile and message.
                  </p>
                  <label>
                    How would you like to contribute?
                    <textarea
                      maxLength={300}
                      value={form.message}
                      onChange={(e) =>
                        setForm({ ...form, message: e.target.value })
                      }
                      placeholder="Tell them what you bring to the idea…"
                    />
                  </label>
                </>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : modal === "create"
                      ? "Create team"
                      : modal === "join"
                        ? "Join team"
                        : modal === "request"
                          ? "Send request"
                          : "Save profile"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
          {modal === "invite" && code && (
            <>
              <p className="muted">
                Share this code directly. Creating another invite replaces this
                one.
              </p>
              <code className="invite-code">{code.code}</code>
              <p className="expiry">
                <Clock size={15} />
                Expires {time(code.expiresAt)}
              </p>
              <button
                className="button primary full-width"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(code.code);
                    setToast("Invite code copied.");
                  } catch {
                    setError("Select and copy the code above.");
                  }
                }}
              >
                <Clipboard size={16} />
                Copy invite code
              </button>
            </>
          )}
          {modal === "confirm" && (
            <>
              <p className="muted">{confirm.message}</p>
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  onClick={() => setModal(null)}
                  disabled={busy}
                >
                  Keep team as is
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={async () => {
                    const r = await mutate(
                      confirm.path,
                      confirm.method,
                      {},
                      "Team updated.",
                    );
                    if (r) {
                      setModal(null);
                      setSelected(null);
                    }
                  }}
                >
                  {busy ? "Updating…" : "Confirm"}
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
