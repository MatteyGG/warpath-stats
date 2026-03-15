import express from "express";
import swaggerUi from "swagger-ui-express";
import { getLogger, log4js } from "../lib/logger.js";

import jobsRouter from "./routes/jobs.routes.js";
import alliancesRouter from "./routes/alliances.routes.js";
import playersRouter from "./routes/players.routes.js";
import citiesRouter from "./routes/cities.routes.js";
import worldsRouter from "./routes/worlds.routes.js";
import referenceRouter from "./routes/reference.routes.js";
import viewsRouter from "./routes/views.routes.js";
import v1Router from "./routes/v1.routes.js";
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
app.use("/cities", citiesRouter);
app.use("/worlds", worldsRouter);
app.use("/reference", referenceRouter);
app.use("/views", viewsRouter);
app.use("/api/v1", v1Router);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => httpLogger.info(`[api] listening on :${port}`));
