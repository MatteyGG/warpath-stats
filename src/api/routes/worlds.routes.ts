import { Router } from "express";
import * as worldsController from "../controllers/worlds.controller.js";

const router = Router();

router.get("/:wid/mode", worldsController.getWorldMode);

export default router;
