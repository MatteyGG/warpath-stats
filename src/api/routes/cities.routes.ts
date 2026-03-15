import { Router } from "express";
import * as citiesController from "../controllers/cities.controller.js";

const router = Router();

router.get("/:wid/dataset", citiesController.getCityDataset);

export default router;
