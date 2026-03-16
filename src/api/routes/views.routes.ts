import { Router } from "express";
import * as viewsController from "../controllers/views.controller.js";

const router = Router();

router.get("/worlds/:wid/overview", viewsController.worldOverview);
router.get("/worlds/:wid/cities", viewsController.worldCitiesLeaderboard);
router.get("/worlds/:wid/cities/:ccid/trend", viewsController.cityTrend);
router.get("/worlds/:wid/alliances/city-heatmap", viewsController.worldAllianceCityHeatmap);

export default router;
