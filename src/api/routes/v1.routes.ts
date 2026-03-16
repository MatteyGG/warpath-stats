import { Router } from "express";
import * as v1 from "../controllers/v1.controller.js";

const router = Router();

router.get("/worlds", v1.worlds);

router.get("/players", v1.players);
router.get("/players/:pid", v1.playerProfile);
router.get("/players/:pid/series", v1.playerSeries);
router.get("/players/:pid/membership", v1.playerMembership);
router.get("/players/:pid/actions", v1.playerActions);

router.get("/alliances", v1.alliances);
router.get("/alliances/:gid", v1.allianceProfile);
router.get("/alliances/:gid/series", v1.allianceSeries);
router.get("/alliances/:gid/roster", v1.allianceRoster);
router.get("/alliances/:gid/transfers", v1.allianceTransfers);
router.get("/alliances/:gid/actions", v1.allianceActions);

router.get("/rankings/players", v1.rankingsPlayers);
router.get("/rankings/alliances", v1.rankingsAlliances);

router.get("/search", v1.search);
router.get("/compare/players", v1.comparePlayers);
router.get("/compare/alliances", v1.compareAlliances);

export default router;
