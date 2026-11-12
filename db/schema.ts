import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const events = sqliteTable("events", {
  id: text().primaryKey(),
  name: text().notNull(),
  min_size: integer().notNull().default(2),
  max_size: integer().notNull().default(6),
});
export const people = sqliteTable(
  "people",
  {
    id: text().primaryKey(),
    event_id: text()
      .notNull()
      .references(() => events.id),
    name: text().notNull(),
    skills: text().notNull().default("[]"),
    utc_offset: integer().notNull().default(330),
    bio: text().notNull().default(""),
    created_at: integer().notNull(),
  },
  (t) => [
    index("people_event").on(t.event_id, t.id),
    check("valid_offset", sql`${t.utc_offset} BETWEEN -720 AND 840`),
  ],
);
export const teams = sqliteTable(
  "teams",
  {
    id: text().primaryKey(),
    event_id: text()
      .notNull()
      .references(() => events.id),
    name: text().notNull(),
    pitch: text().notNull(),
    skills: text().notNull(),
    leader_id: text()
      .notNull()
      .references(() => people.id),
    min_size: integer().notNull(),
    max_size: integer().notNull(),
    member_count: integer().notNull().default(0),
    looking_for: integer().notNull().default(1),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
  },
  (t) => [
    index("team_board").on(t.event_id, t.looking_for, t.updated_at, t.id),
    check(
      "valid_sizes",
      sql`${t.min_size} >= 2 AND ${t.max_size} >= ${t.min_size} AND ${t.max_size} <= 6`,
    ),
    check(
      "valid_count",
      sql`${t.member_count} >= 0 AND ${t.member_count} <= ${t.max_size}`,
    ),
  ],
);
export const members = sqliteTable(
  "members",
  {
    event_id: text().notNull(),
    user_id: text()
      .notNull()
      .references(() => people.id),
    team_id: text()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    joined_at: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.event_id, t.user_id] }),
    index("members_team").on(t.team_id, t.joined_at, t.user_id),
  ],
);
export const requests = sqliteTable(
  "requests",
  {
    id: text().primaryKey(),
    event_id: text().notNull(),
    team_id: text()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    user_id: text()
      .notNull()
      .references(() => people.id),
    message: text().notNull(),
    status: text().notNull().default("pending"),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
  },
  (t) => [
    uniqueIndex("request_person_team").on(t.team_id, t.user_id),
    index("requests_user").on(t.user_id, t.status),
  ],
);
export const invites = sqliteTable(
  "invites",
  {
    hash: text().primaryKey(),
    team_id: text()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    expires_at: integer().notNull(),
    created_by: text().notNull(),
  },
  (t) => [index("invites_team").on(t.team_id)],
);
export const operations = sqliteTable(
  "operations",
  {
    id: text().primaryKey(),
    actor_id: text().notNull(),
    key: text().notNull(),
    fingerprint: text().notNull(),
    response: text().notNull(),
    created_at: integer().notNull(),
  },
  (t) => [uniqueIndex("operation_key").on(t.actor_id, t.key)],
);
export const audit = sqliteTable(
  "audit",
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    event_id: text().notNull(),
    team_id: text(),
    actor_id: text().notNull(),
    action: text().notNull(),
    details: text().notNull(),
    created_at: integer().notNull(),
  },
  (t) => [
    index("audit_event").on(t.event_id, t.seq),
    index("audit_team").on(t.team_id, t.seq),
  ],
);
export const guards = sqliteTable(
  "guards",
  { id: text().primaryKey(), valid: integer().notNull() },
  (t) => [check("guard_holds", sql`${t.valid} = 1`)],
);
export const rateLimits = sqliteTable("rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  expires_at: integer().notNull(),
});
