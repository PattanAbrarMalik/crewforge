import { SKILLS, type Database } from "./types.ts";
const projects = [
  [
    "FrameShift",
    "Turn messy ideas into thoughtful, accessible digital experiences.",
    ["Design", "React", "TypeScript"],
  ],
  [
    "Carbon Collective",
    "Make everyday climate choices understandable and measurable.",
    ["Python", "Data", "Design"],
  ],
  [
    "Signal Garden",
    "Find the useful signals hidden in your community’s open data.",
    ["Data", "React", "AI / ML"],
  ],
  [
    "Open Atlas",
    "Build a friendlier map of the resources around us.",
    ["Mobile", "Node.js", "Design"],
  ],
  [
    "Orbit Labs",
    "Help student builders move from a spark to a working prototype.",
    ["React", "Product", "DevOps"],
  ],
  [
    "Care Loop",
    "Give caregivers a calmer way to coordinate everyday tasks.",
    ["Design", "Mobile", "Node.js"],
  ],
  [
    "Patchwork",
    "Bring local volunteers together around small, useful projects.",
    ["React", "Node.js", "Product"],
  ],
  [
    "Byte Kitchen",
    "Reduce household food waste with smarter shared planning.",
    ["AI / ML", "Python", "Design"],
  ],
  [
    "Field Notes",
    "Make knowledge from the field easy to capture and share.",
    ["Mobile", "Data", "DevOps"],
  ],
  [
    "Nexus Studio",
    "Make collaboration feel more human for distributed teams.",
    ["TypeScript", "React", "Design"],
  ],
  [
    "Sound Commons",
    "Create accessible ways to explore the sounds around us.",
    ["AI / ML", "Mobile", "Product"],
  ],
  [
    "Rooted",
    "Connect curious learners with community-led growing projects.",
    ["Node.js", "Design", "Data"],
  ],
] as const;
export async function seedSandbox(db: Database, event: string, now: number) {
  const marker = event + "-seed-v1";
  if (
    await db
      .prepare("SELECT id FROM operations WHERE id=?")
      .bind(marker)
      .first()
  )
    return;
  const s = (sql: string, ...args: any[]) => db.prepare(sql).bind(...args);
  const list = [
    s(
      "INSERT INTO operations VALUES (?,?,?,?,?,?)",
      marker,
      event,
      "seed",
      "seed",
      "{}",
      now,
    ),
  ];
  const names = [
    "Alex Morgan",
    "Maya Chen",
    "Noor Khan",
    "Leo Santos",
    "Isha Patel",
    "Sam Rivera",
    "Avery Kim",
    "Rohan Das",
    "Zoe Martin",
    "Kai Brooks",
    "Anika Rao",
    "Eli Park",
  ];
  for (let i = 0; i < 48; i++) {
    const id =
      i < 4
        ? event + "-" + ["alex", "maya", "noor", "leo"][i]
        : event + "-p" + i;
    list.push(
      s(
        "INSERT OR IGNORE INTO people VALUES (?,?,?,?,?,?,?)",
        id,
        event,
        i < 12
          ? names[i]
          : `${names[i % 12].split(" ")[0]} ${["Walker", "Ali", "Shah", "Reed"][i % 4]}`,
        JSON.stringify([SKILLS[i % 10], SKILLS[(i + 3) % 10]]),
        [330, 60, 0, -300, 480][i % 5],
        "Curious builder. Ready to make something useful.",
        now + i,
      ),
    );
  }
  for (let i = 0; i < 12; i++) {
    const leader = i === 0 ? event + "-maya" : event + "-p" + (i + 4),
      id = event + "-team-" + i;
    list.push(
      s(
        "INSERT INTO teams (id,event_id,name,pitch,skills,leader_id,min_size,max_size,created_at,updated_at) VALUES (?,?,?,?,?,?,2,4,?,?)",
        id,
        event,
        projects[i][0],
        projects[i][1],
        JSON.stringify(projects[i][2]),
        leader,
        now - i * 1000,
        now - i * 1000,
      ),
    );
    list.push(
      s("INSERT INTO members VALUES (?,?,?,?)", event, leader, id, now + i),
    );
    if (i === 0)
      list.push(
        s(
          "INSERT INTO members VALUES (?,?,?,?)",
          event,
          event + "-leo",
          id,
          now + 100,
        ),
      );
    else if (i % 2 === 0)
      list.push(
        s(
          "INSERT INTO members VALUES (?,?,?,?)",
          event,
          event + "-p" + (i + 24),
          id,
          now + 100 + i,
        ),
      );
  }
  try {
    await db.batch(list);
  } catch (error) {
    if (
      !(await db
        .prepare("SELECT id FROM operations WHERE id=?")
        .bind(marker)
        .first())
    )
      throw error;
  }
}
