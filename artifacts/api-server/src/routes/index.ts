import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meetingsRouter from "./meetings";
import actionItemsRouter from "./action-items";
import intelligenceRouter from "./intelligence";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meetingsRouter);
router.use(actionItemsRouter);
router.use(intelligenceRouter);

export default router;
