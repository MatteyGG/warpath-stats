import { Router } from "express";
import * as worldsController from "../controllers/worlds.controller.js";

const router = Router();

router.get("/cities", worldsController.getCityReference);
router.post("/cities/refresh", worldsController.refreshCityReference);

export default router;
