import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, actionItemsTable } from "@workspace/db";
import {
  ListActionItemsQueryParams,
  ListActionItemsResponse,
  UpdateActionItemBody,
  UpdateActionItemParams,
  UpdateActionItemResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/action-items", async (req, res): Promise<void> => {
  const parsed = ListActionItemsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const items = await db
    .select()
    .from(actionItemsTable)
    .where(
      parsed.data.status === "all"
        ? undefined
        : eq(actionItemsTable.status, parsed.data.status === "overdue" ? "pending" : parsed.data.status),
    )
    .orderBy(desc(actionItemsTable.deadline));
  res.json(
    ListActionItemsResponse.parse(
      items.filter((item) =>
        parsed.data.status === "overdue"
          ? item.deadline < new Date().toISOString().slice(0, 10)
          : true,
      ),
    ),
  );
});

router.patch("/action-items/:id", async (req, res): Promise<void> => {
  const params = UpdateActionItemParams.safeParse(req.params);
  const body = UpdateActionItemBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid action item update" });
    return;
  }
  const [item] = await db
    .update(actionItemsTable)
    .set(body.data)
    .where(eq(actionItemsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Action item not found" });
    return;
  }
  res.json(UpdateActionItemResponse.parse(item));
});

export default router;