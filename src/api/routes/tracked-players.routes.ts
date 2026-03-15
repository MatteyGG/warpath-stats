import { Router } from "express";
import {
  listTrackedPlayers,
  getTrackedPlayer,
  deleteTrackedPlayer,
  createTrackedPlayer,
} from "../controllers/tracked-players.controller.js";

const router = Router();

router.get("/", listTrackedPlayers);
router.get("/:wid/:pid", getTrackedPlayer);
router.delete("/:wid/:pid", deleteTrackedPlayer);
router.post("/", createTrackedPlayer);

export default router;
