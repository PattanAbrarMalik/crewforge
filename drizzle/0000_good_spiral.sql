CREATE TABLE `audit` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`team_id` text,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_event` ON `audit` (`event_id`,`seq`);--> statement-breakpoint
CREATE INDEX `audit_team` ON `audit` (`team_id`,`seq`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`min_size` integer DEFAULT 2 NOT NULL,
	`max_size` integer DEFAULT 6 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guards` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "guard_holds" CHECK("guards"."valid" = 1)
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`hash` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invites_team` ON `invites` (`team_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `members_team` ON `members` (`team_id`,`joined_at`,`user_id`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operation_key` ON `operations` (`actor_id`,`key`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`utc_offset` integer DEFAULT 330 NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_offset" CHECK("people"."utc_offset" BETWEEN -720 AND 840)
);
--> statement-breakpoint
CREATE INDEX `people_event` ON `people` (`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_person_team` ON `requests` (`team_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `requests_user` ON `requests` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`pitch` text NOT NULL,
	`skills` text NOT NULL,
	`leader_id` text NOT NULL,
	`min_size` integer NOT NULL,
	`max_size` integer NOT NULL,
	`member_count` integer DEFAULT 0 NOT NULL,
	`looking_for` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leader_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_sizes" CHECK("teams"."min_size" >= 2 AND "teams"."max_size" >= "teams"."min_size" AND "teams"."max_size" <= 6),
	CONSTRAINT "valid_count" CHECK("teams"."member_count" >= 0 AND "teams"."member_count" <= "teams"."max_size")
);
--> statement-breakpoint
CREATE INDEX `team_board` ON `teams` (`event_id`,`looking_for`,`updated_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER members_validate BEFORE INSERT ON members BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM teams t JOIN people p ON p.id=NEW.user_id WHERE t.id=NEW.team_id AND t.event_id=NEW.event_id AND p.event_id=NEW.event_id) THEN RAISE(ABORT,'TEAM_MISMATCH') END;
 SELECT CASE WHEN (SELECT member_count>=max_size FROM teams WHERE id=NEW.team_id) THEN RAISE(ABORT,'TEAM_FULL') END;
END;
--> statement-breakpoint
CREATE TRIGGER members_insert AFTER INSERT ON members BEGIN
 UPDATE teams SET member_count=member_count+1,updated_at=MAX(updated_at,NEW.joined_at) WHERE id=NEW.team_id;
END;
--> statement-breakpoint
CREATE TRIGGER members_delete AFTER DELETE ON members BEGIN
 UPDATE teams SET member_count=member_count-1,updated_at=CAST(unixepoch('subsec')*1000 AS INTEGER) WHERE id=OLD.team_id;
 UPDATE teams SET leader_id=(SELECT user_id FROM members WHERE team_id=OLD.team_id ORDER BY joined_at,user_id LIMIT 1) WHERE id=OLD.team_id AND leader_id=OLD.user_id AND member_count>0;
 DELETE FROM teams WHERE id=OLD.team_id AND member_count=0;
END;
--> statement-breakpoint
CREATE TRIGGER teams_rules BEFORE INSERT ON teams BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM events e WHERE e.id=NEW.event_id AND NEW.min_size>=e.min_size AND NEW.max_size<=e.max_size) THEN RAISE(ABORT,'TEAM_RULES') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM people p WHERE p.id=NEW.leader_id AND p.event_id=NEW.event_id) THEN RAISE(ABORT,'TEAM_MISMATCH') END;
END;

--> statement-breakpoint
CREATE VIRTUAL TABLE teams_search USING fts5(name,pitch,content='teams',content_rowid='rowid',tokenize='unicode61');
--> statement-breakpoint
CREATE TRIGGER teams_search_insert AFTER INSERT ON teams BEGIN
 INSERT INTO teams_search(rowid,name,pitch) VALUES (NEW.rowid,NEW.name,NEW.pitch);
END;
--> statement-breakpoint
CREATE TRIGGER teams_search_delete AFTER DELETE ON teams BEGIN
 INSERT INTO teams_search(teams_search,rowid,name,pitch) VALUES ('delete',OLD.rowid,OLD.name,OLD.pitch);
END;
--> statement-breakpoint
CREATE TRIGGER teams_search_update AFTER UPDATE OF name,pitch ON teams BEGIN
 INSERT INTO teams_search(teams_search,rowid,name,pitch) VALUES ('delete',OLD.rowid,OLD.name,OLD.pitch);
 INSERT INTO teams_search(rowid,name,pitch) VALUES (NEW.rowid,NEW.name,NEW.pitch);
END;
