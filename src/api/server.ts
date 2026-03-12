import express from "express";
import swaggerUi from "swagger-ui-express";
import { getLogger, log4js } from "../lib/logger.js";

import jobsRouter from "./routes/jobs.routes.js";
import alliancesRouter from "./routes/alliances.routes.js";
import playersRouter from "./routes/players.routes.js";
import { openApiSpec } from "./openapi.js";

const app = express();
app.use(express.json());

const httpLogger = getLogger("api");

// лог входящих запросов
app.use(
  log4js.connectLogger(httpLogger, {
    level: "info",
    format: ":method :url :status :response-time ms",
    // чтобы не шуметь healthcheck-ами:
    nolog: ["/health"],
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/openapi.json", (_req, res) => res.json(openApiSpec));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use("/jobs", jobsRouter);
app.use("/alliances", alliancesRouter);
app.use("/players", playersRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => httpLogger.info(`[api] listening on :${port}`));
