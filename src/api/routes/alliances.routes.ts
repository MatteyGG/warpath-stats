import { Router } from "express";
import {
  listTrackedAlliances,
  getTrackedAlliance,
  deleteTrackedAlliance,
  createTrackedAlliance, // добавили
} from "../controllers/alliances.controller.js";

const router = Router();

router.get("/", listTrackedAlliances);
router.get("/:wid/:gid", getTrackedAlliance);
router.delete("/:wid/:gid", deleteTrackedAlliance);
router.post("/", createTrackedAlliance);

export default router;
