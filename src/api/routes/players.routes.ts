import { Router } from "express";
import * as playersController from "../controllers/players.controller.js";

const router = Router();

router.get("/:wid/:pid/dataset", playersController.getPlayerDataset);

export default router;
