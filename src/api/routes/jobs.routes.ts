import { Router } from "express";
import * as jobsController from "../controllers/jobs.controller.js";

const router = Router();

router.post("/fetch", jobsController.addFetchJob);
router.post("/server-scan", jobsController.serverScan);
router.post("/server-backfill", jobsController.serverBackfill);
router.post("/sync-latest", jobsController.syncLatest);
export default router;
