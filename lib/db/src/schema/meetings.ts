import {
  date,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const meetingsTable = pgTable("meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  meetingType: text("meeting_type").notNull(),
  clientName: text("client_name").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  duration: text("duration").notNull().default("0 min"),
  participants: text("participants").array().notNull().default([]),
  status: text("status").notNull().default("completed"),
  summary: text("summary"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const transcriptSegmentsTable = pgTable("transcript_segments", {
  id: uuid("id").defaultRandom().primaryKey(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetingsTable.id, { onDelete: "cascade" }),
  speaker: text("speaker").notNull(),
  timestamp: text("timestamp").notNull(),
  seconds: real("seconds").notNull().default(0),
  text: text("text").notNull(),
  confidence: real("confidence"),
});

export const decisionsTable = pgTable("decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetingsTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  timestamp: text("timestamp").notNull(),
});

export const actionItemsTable = pgTable("action_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetingsTable.id, { onDelete: "cascade" }),
  meetingTitle: text("meeting_title").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  owner: text("owner").notNull(),
  deadline: date("deadline", { mode: "string" }).notNull(),
  priority: text("priority").notNull().default("MEDIUM"),
  status: text("status").notNull().default("pending"),
  confidence: real("confidence").notNull().default(0.85),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({
  id: true,
  createdAt: true,
});
export const insertTranscriptSegmentSchema = createInsertSchema(
  transcriptSegmentsTable,
).omit({ id: true });
export const insertDecisionSchema = createInsertSchema(decisionsTable).omit({
  id: true,
});
export const insertActionItemSchema = createInsertSchema(actionItemsTable).omit(
  { id: true, createdAt: true },
);

export type Meeting = typeof meetingsTable.$inferSelect;
export type TranscriptSegment = typeof transcriptSegmentsTable.$inferSelect;
export type Decision = typeof decisionsTable.$inferSelect;
export type ActionItem = typeof actionItemsTable.$inferSelect;
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;