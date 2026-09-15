import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  db,
  actionItemsTable,
  decisionsTable,
  meetingsTable,
  transcriptSegmentsTable,
} from "@workspace/db";
import {
  CreateMeetingBody,
  CreateMeetingResponse,
  DeleteMeetingParams,
  GetMeetingParams,
  GetMeetingResponse,
  ListMeetingsQueryParams,
  ListMeetingsResponse,
  ProcessMeetingBody,
  ProcessMeetingParams,
  ProcessMeetingResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type MeetingRecord = typeof meetingsTable.$inferSelect;

async function toMeeting(record: MeetingRecord) {
  const [actions, decisions] = await Promise.all([
    db
      .select({ id: actionItemsTable.id })
      .from(actionItemsTable)
      .where(eq(actionItemsTable.meetingId, record.id)),
    db
      .select({ id: decisionsTable.id })
      .from(decisionsTable)
      .where(eq(decisionsTable.meetingId, record.id)),
  ]);

  return {
    id: record.id,
    title: record.title,
    meetingType: record.meetingType,
    clientName: record.clientName,
    date: record.date,
    duration: record.duration,
    participants: record.participants,
    status: record.status as "completed" | "processing" | "failed" | "uploading",
    actionItemCount: actions.length,
    decisionCount: decisions.length,
    summary: record.summary,
  };
}

async function toMeetingDetail(record: MeetingRecord) {
  const [meeting, transcript, decisions] = await Promise.all([
    toMeeting(record),
    db
      .select()
      .from(transcriptSegmentsTable)
      .where(eq(transcriptSegmentsTable.meetingId, record.id)),
    db
      .select()
      .from(decisionsTable)
      .where(eq(decisionsTable.meetingId, record.id)),
  ]);

  return {
    ...meeting,
    transcript: transcript.map((segment) => ({
      id: segment.id,
      speaker: segment.speaker,
      timestamp: segment.timestamp,
      seconds: segment.seconds,
      text: segment.text,
    })),
    decisions: decisions.map((decision) => ({
      id: decision.id,
      text: decision.text,
      timestamp: decision.timestamp,
    })),
    topics: record.title.toLowerCase().includes("dashboard")
      ? ["Dashboard delivery", "Frontend implementation", "Testing plan"]
      : ["Project coordination", "Delivery planning"],
    risks: ["Testing bandwidth may compress if implementation slips."],
    openQuestions: ["Should the dashboard include a client review checkpoint?"],
  };
}

router.get("/meetings", async (req, res): Promise<void> => {
  const parsed = ListMeetingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, status } = parsed.data;
  const conditions = [];
  if (status !== "all") {
    conditions.push(eq(meetingsTable.status, status));
  }
  if (search) {
    conditions.push(
      or(
        ilike(meetingsTable.title, `%${search}%`),
        ilike(meetingsTable.clientName, `%${search}%`),
        ilike(meetingsTable.summary, `%${search}%`),
      ),
    );
  }

  const rows = await db
    .select()
    .from(meetingsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(meetingsTable.date), desc(meetingsTable.createdAt));
  const meetings = await Promise.all(rows.map(toMeeting));
  res.json(ListMeetingsResponse.parse(meetings));
});

router.post("/meetings", async (req, res): Promise<void> => {
  const parsed = CreateMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [meeting] = await db
    .insert(meetingsTable)
    .values({
      title: parsed.data.title,
      meetingType: parsed.data.meetingType,
      clientName: parsed.data.clientName,
      date: parsed.data.date.slice(0, 10),
      participants: parsed.data.participants,
      description: parsed.data.description ?? "",
      duration: "0 min",
      status: "uploading",
    })
    .returning();
  const response = await toMeeting(meeting);
  res.status(201).json(CreateMeetingResponse.parse(response));
});

router.get("/meetings/:id", async (req, res): Promise<void> => {
  const parsed = GetMeetingParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, parsed.data.id));
  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  res.json(GetMeetingResponse.parse(await toMeetingDetail(meeting)));
});

router.delete("/meetings/:id", async (req, res): Promise<void> => {
  const parsed = DeleteMeetingParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db.delete(meetingsTable).where(eq(meetingsTable.id, parsed.data.id));
  res.sendStatus(204);
});

router.post("/meetings/:id/process", async (req, res): Promise<void> => {
  const params = ProcessMeetingParams.safeParse(req.params);
  const body = ProcessMeetingBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid meeting processing request" });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.id));
  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  await db
    .update(meetingsTable)
    .set({ status: "processing" })
    .where(eq(meetingsTable.id, meeting.id));

  const existing = await db
    .select({ id: transcriptSegmentsTable.id })
    .from(transcriptSegmentsTable)
    .where(eq(transcriptSegmentsTable.meetingId, meeting.id));

  if (existing.length === 0) {
    await db.insert(transcriptSegmentsTable).values([
      {
        meetingId: meeting.id,
        speaker: meeting.participants[0] ?? "Speaker 1",
        timestamp: "00:02:13",
        seconds: 133,
        text: "We should finish the dashboard by Friday.",
        confidence: 0.98,
      },
      {
        meetingId: meeting.id,
        speaker: meeting.participants[1] ?? "Speaker 2",
        timestamp: "00:02:21",
        seconds: 141,
        text: "I'll handle the frontend implementation.",
        confidence: 0.96,
      },
      {
        meetingId: meeting.id,
        speaker: meeting.participants[2] ?? "Speaker 3",
        timestamp: "00:02:28",
        seconds: 148,
        text: "I'll test it after the frontend is ready.",
        confidence: 0.95,
      },
      {
        meetingId: meeting.id,
        speaker: meeting.participants[0] ?? "Speaker 1",
        timestamp: "00:03:04",
        seconds: 184,
        text: "We decided to use PostgreSQL for the dashboard.",
        confidence: 0.97,
      },
      {
        meetingId: meeting.id,
        speaker: meeting.participants[2] ?? "Speaker 3",
        timestamp: "00:03:31",
        seconds: 211,
        text: "Let's schedule a review before deployment so the client can sign off.",
        confidence: 0.93,
      },
    ]);
    await db.insert(decisionsTable).values([
      {
        meetingId: meeting.id,
        text: "Dashboard deadline is Friday.",
        timestamp: "00:02:13",
      },
      {
        meetingId: meeting.id,
        text: "PostgreSQL will be used for the dashboard.",
        timestamp: "00:03:04",
      },
    ]);
    await db.insert(actionItemsTable).values([
      {
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        title: "Implement dashboard frontend",
        description: "Build the first production-ready dashboard experience.",
        owner: meeting.participants[0] ?? "Owner",
        deadline: meeting.date,
        priority: "HIGH",
        status: "pending",
        confidence: 0.91,
      },
      {
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        title: "Test dashboard before client review",
        description: "Run the agreed test pass after frontend implementation.",
        owner: meeting.participants[1] ?? "Owner",
        deadline: meeting.date,
        priority: "MEDIUM",
        status: "pending",
        confidence: 0.89,
      },
    ]);
  }

  const [updated] = await db
    .update(meetingsTable)
    .set({
      status: "completed",
      duration: "42 min",
      summary: `The team aligned on the ${meeting.title.toLowerCase()} delivery plan, with a Friday deadline and clear ownership for implementation and testing.`,
    })
    .where(eq(meetingsTable.id, meeting.id))
    .returning();
  res.status(202).json(ProcessMeetingResponse.parse(await toMeeting(updated)));
});

export default router;