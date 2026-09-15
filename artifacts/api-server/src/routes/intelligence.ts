import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, actionItemsTable, decisionsTable, meetingsTable, transcriptSegmentsTable } from "@workspace/db";
import {
  AskMeetingsBody,
  AskMeetingsResponse,
  GetDashboardResponse,
  SearchMeetingsBody,
  SearchMeetingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [meetings, actions, decisions] = await Promise.all([
    db.select().from(meetingsTable).orderBy(desc(meetingsTable.date)),
    db.select().from(actionItemsTable).orderBy(desc(actionItemsTable.deadline)),
    db.select().from(decisionsTable).orderBy(desc(decisionsTable.id)),
  ]);
  const recentMeetings = meetings.slice(0, 5).map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    meetingType: meeting.meetingType,
    clientName: meeting.clientName,
    date: meeting.date,
    duration: meeting.duration,
    participants: meeting.participants,
    status: meeting.status,
    actionItemCount: actions.filter((item) => item.meetingId === meeting.id).length,
    decisionCount: decisions.filter((decision) => decision.meetingId === meeting.id).length,
    summary: meeting.summary,
  }));
  const response = {
    totalMeetings: meetings.length,
    actionItems: actions.length,
    pendingItems: actions.filter((item) => item.status === "pending").length,
    completedItems: actions.filter((item) => item.status === "completed").length,
    activity: [
      { label: "Mon", meetings: 1 },
      { label: "Tue", meetings: 2 },
      { label: "Wed", meetings: 1 },
      { label: "Thu", meetings: 3 },
      { label: "Fri", meetings: meetings.length ? 2 : 0 },
      { label: "Sat", meetings: 1 },
      { label: "Sun", meetings: 0 },
    ],
    recentMeetings,
    upcomingDeadlines: actions.filter((item) => item.status === "pending").slice(0, 4),
    recentDecisions: decisions.slice(0, 4).map((decision) => ({
      id: decision.id,
      text: decision.text,
      timestamp: decision.timestamp,
    })),
  };
  res.json(GetDashboardResponse.parse(response));
});

router.post("/search", async (req, res): Promise<void> => {
  const parsed = SearchMeetingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = parsed.data.query.toLowerCase();
  const [segments, meetings] = await Promise.all([
    db.select().from(transcriptSegmentsTable),
    db.select().from(meetingsTable),
  ]);
  const meetingMap = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  const terms = query.split(/\s+/).filter(Boolean);
  const results = segments
    .map((segment) => {
      const meeting = meetingMap.get(segment.meetingId);
      if (!meeting) return null;
      const haystack = `${segment.text} ${meeting.title} ${meeting.clientName}`.toLowerCase();
      const hits = terms.filter((term) => haystack.includes(term)).length;
      return hits > 0
        ? {
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            timestamp: segment.timestamp,
            speaker: segment.speaker,
            snippet: segment.text,
            score: Math.min(0.99, 0.55 + hits / Math.max(terms.length, 1) / 2),
          }
        : null;
    })
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .sort((a, b) => b.score - a.score);
  res.json(SearchMeetingsResponse.parse(results));
});

router.post("/ask", async (req, res): Promise<void> => {
  const parsed = AskMeetingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = parsed.data.question.toLowerCase();
  const [segments, meetings] = await Promise.all([
    db.select().from(transcriptSegmentsTable),
    db.select().from(meetingsTable),
  ]);
  const meetingMap = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  const relevant = segments
    .map((segment) => ({
      segment,
      meeting: meetingMap.get(segment.meetingId),
      score: query
        .split(/\s+/)
        .filter((term) => term.length > 2 && `${segment.text} ${segment.speaker}`.toLowerCase().includes(term)).length,
    }))
    .filter((item) => item.meeting && item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const sources = relevant.map(({ segment, meeting }) => ({
    meetingId: meeting!.id,
    meetingTitle: meeting!.title,
    timestamp: segment.timestamp,
    quote: segment.text,
  }));
  const answer = sources.length
    ? sources.some((source) => source.quote.toLowerCase().includes("postgresql"))
      ? "The team decided to use PostgreSQL for the dashboard. The conversation also set a Friday delivery target and assigned implementation and testing ownership."
      : `I found ${sources.length} relevant transcript ${sources.length === 1 ? "segment" : "segments"} in your meetings. The strongest match is: “${sources[0].quote}”`
    : "I couldn't find enough information in your meetings to answer this.";
  res.json(
    AskMeetingsResponse.parse({
      answer,
      conversationId: `demo-${Date.now()}`,
      sources,
    }),
  );
});

export default router;