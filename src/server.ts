import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDiagnosticsBundle } from "./diagnostics.js";
import { ensureDataDirectory, openDatabase } from "./db.js";
import { buildDslConformance, parseLoopDefinition } from "./dsl.js";
import { GithubPullRequestAdapter } from "./github.js";
import { StructuredLogger } from "./logger.js";
import { getObservabilityForOutput, isPhoenixAvailable, runAndLinkDemoTrace } from "./phoenix.js";
import { readLoopExecutionData } from "./loop-execution.js";
import { readDashboardData } from "./projections.js";
import { seedDemoData } from "./seed.js";
import { EventStore } from "./store.js";
import { readTimeAccountingData } from "./time-accounting.js";
import type { DecisionState } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = ensureDataDirectory(rootDir);
const dbPath = process.env.DASHBOARD_DB_PATH ?? path.join(dataDir, "dashboard.sqlite");
const appVersion = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")) as { version: string };

const app = express();
const db = openDatabase(dbPath);
const store = new EventStore(db);
const githubAdapter = new GithubPullRequestAdapter(db, store);
const logger = new StructuredLogger(path.join(dataDir, "logs", "app.ndjson"));

seedDemoData(store);
store.refreshProjection();

app.use(express.json({ limit: "1mb" }));
app.use((request, response, next) => {
  const requestId = logger.createRequestId();
  const startedAt = Date.now();
  response.setHeader("x-request-id", requestId);
  response.on("finish", () => {
    logger.info(
      "http.request",
      {
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt
      },
      requestId
    );
  });
  next();
});
app.use(express.static(path.join(rootDir, "public")));

app.get("/api/dashboard", (request, response) => {
  const selectedOutputId = typeof request.query.outputId === "string" ? request.query.outputId : null;
  response.json(readDashboardData(db, selectedOutputId));
});

app.get("/api/observability", async (request, response) => {
  const outputId = typeof request.query.outputId === "string" ? request.query.outputId : null;
  if (!outputId) {
    logger.warn("api.observability.bad_request", { path: request.path }, String(response.getHeader("x-request-id") ?? ""));
    response.status(400).json({ error: "outputId is required." });
    return;
  }

  response.json(await getObservabilityForOutput(db, outputId));
});

app.get("/api/conformance", async (request, response) => {
  const outputId = typeof request.query.outputId === "string" ? request.query.outputId : null;
  if (!outputId) {
    logger.warn("api.conformance.bad_request", { path: request.path }, String(response.getHeader("x-request-id") ?? ""));
    response.status(400).json({ error: "outputId is required." });
    return;
  }

  const definition = parseLoopDefinition(rootDir);
  const observability = await getObservabilityForOutput(db, outputId);
  response.json(buildDslConformance(definition, observability));
});

app.get("/api/loop-execution", async (request, response) => {
  const window = typeof request.query.window === "string" ? request.query.window : null;
  const outputId = typeof request.query.outputId === "string" ? request.query.outputId : null;

  try {
    response.json(await readLoopExecutionData(db, rootDir, window, outputId));
  } catch (error) {
    logger.error(
      "api.loop_execution.failed",
      { window, outputId, error: error instanceof Error ? error.message : "unknown error" },
      String(response.getHeader("x-request-id") ?? "")
    );
    response.status(500).json({ error: error instanceof Error ? error.message : "Loop execution query failed." });
  }
});

app.get("/api/time-accounting", async (request, response) => {
  const window = typeof request.query.window === "string" ? request.query.window : null;
  const outputId = typeof request.query.outputId === "string" ? request.query.outputId : null;

  try {
    response.json(await readTimeAccountingData(db, rootDir, window, outputId));
  } catch (error) {
    logger.error(
      "api.time_accounting.failed",
      { window, outputId, error: error instanceof Error ? error.message : "unknown error" },
      String(response.getHeader("x-request-id") ?? "")
    );
    response.status(500).json({ error: error instanceof Error ? error.message : "Time accounting query failed." });
  }
});

app.post("/api/observability/demo-run", async (request, response) => {
  const { outputId } = request.body as { outputId?: string };
  if (!outputId) {
    logger.warn("api.observability_demo.bad_request", { path: request.path }, String(response.getHeader("x-request-id") ?? ""));
    response.status(400).json({ error: "outputId is required." });
    return;
  }

  if (!(await isPhoenixAvailable())) {
    logger.warn("api.observability_demo.phoenix_unavailable", { outputId }, String(response.getHeader("x-request-id") ?? ""));
    response.status(503).json({ error: "Phoenix is not reachable at http://localhost:6006. Start it with npm run phoenix:up." });
    return;
  }

  try {
    await runAndLinkDemoTrace(db, store, outputId);
    response.status(201).json({
      dashboard: readDashboardData(db, outputId),
      observability: await getObservabilityForOutput(db, outputId)
    });
  } catch (error) {
    logger.error(
      "api.observability_demo.failed",
      { outputId, error: error instanceof Error ? error.message : "unknown error" },
      String(response.getHeader("x-request-id") ?? "")
    );
    response.status(500).json({ error: error instanceof Error ? error.message : "Demo trace emission failed." });
  }
});

app.get("/api/diagnostics", async (request, response) => {
  const bundle = await buildDiagnosticsBundle({
    rootDir,
    db,
    store,
    logger,
    appVersion: appVersion.version
  });

  if (request.query.download === "1") {
    response.setHeader("content-disposition", "attachment; filename=\"agentic-loop-observability-diagnostics.json\"");
  }

  response.json(bundle);
});

app.post("/api/pull-requests/link", async (request, response) => {
  const { outputId, repository, pullRequestNumber } = request.body as {
    outputId?: string;
    repository?: string;
    pullRequestNumber?: number;
  };
  const parsedPullRequestNumber = Number(pullRequestNumber);

  if (!outputId || !repository || !Number.isInteger(parsedPullRequestNumber) || parsedPullRequestNumber < 1) {
    logger.warn("api.pull_request_link.bad_request", { path: request.path }, String(response.getHeader("x-request-id") ?? ""));
    response.status(400).json({ error: "outputId, repository, and a positive pullRequestNumber are required." });
    return;
  }

  try {
    await githubAdapter.linkPullRequest(outputId, repository, parsedPullRequestNumber);
    response.status(201).json(readDashboardData(db, outputId));
  } catch (error) {
    logger.warn(
      "api.pull_request_link.failed",
      { outputId, repository, pullRequestNumber: parsedPullRequestNumber, error: error instanceof Error ? error.message : "unknown error" },
      String(response.getHeader("x-request-id") ?? "")
    );
    response.status(400).json({ error: error instanceof Error ? error.message : "Pull request link failed." });
  }
});

app.post("/api/pull-requests/sync", async (request, response) => {
  const { outputId } = request.body as { outputId?: string };
  if (!outputId) {
    logger.warn("api.pull_request_sync.bad_request", { path: request.path }, String(response.getHeader("x-request-id") ?? ""));
    response.status(400).json({ error: "outputId is required." });
    return;
  }

  try {
    await githubAdapter.syncOutputPullRequest(outputId);
    response.status(200).json(readDashboardData(db, outputId));
  } catch (error) {
    logger.warn(
      "api.pull_request_sync.failed",
      { outputId, error: error instanceof Error ? error.message : "unknown error" },
      String(response.getHeader("x-request-id") ?? "")
    );
    response.status(400).json({ error: error instanceof Error ? error.message : "Pull request sync failed." });
  }
});

app.post("/api/decisions", (request, response) => {
  const { outputId, state, rationale, actorName } = request.body as {
    outputId?: string;
    state?: DecisionState;
    rationale?: string | null;
    actorName?: string;
  };

  if (!outputId || !state || !actorName) {
    logger.warn("api.decisions.bad_request", { path: request.path }, String(response.getHeader("x-request-id") ?? ""));
    response.status(400).json({ error: "outputId, state, and actorName are required." });
    return;
  }

  try {
    store.recordDecision(outputId, state, rationale ?? null, actorName);
    response.status(201).json(readDashboardData(db, outputId));
  } catch (error) {
    logger.warn(
      "api.decisions.failed",
      { outputId, state, actorName, error: error instanceof Error ? error.message : "unknown error" },
      String(response.getHeader("x-request-id") ?? "")
    );
    response.status(400).json({ error: error instanceof Error ? error.message : "Unknown decision error." });
  }
});

app.get("/api/export", (_request, response) => {
  response.json(store.exportState());
});

app.post("/api/restore", (request, response) => {
  try {
    store.restoreState(request.body);
    response.status(200).json(readDashboardData(db));
  } catch (error) {
    logger.error(
      "api.restore.failed",
      { error: error instanceof Error ? error.message : "unknown error" },
      String(response.getHeader("x-request-id") ?? "")
    );
    response.status(400).json({ error: error instanceof Error ? error.message : "Restore failed." });
  }
});

app.get("/api/contracts", (_request, response) => {
  const dslPath = path.join(rootDir, "dsl", "implement-change.v1.yaml");
  const reviewPolicyPath = path.join(rootDir, "docs", "REVIEW-AND-OPERATIONS.md");
  response.json({
    pilotLoopDsl: fs.readFileSync(dslPath, "utf8"),
    reviewPolicy: fs.readFileSync(reviewPolicyPath, "utf8")
  });
});

app.use((_request, response) => {
  response.sendFile(path.join(rootDir, "public", "index.html"));
});

const port = Number(process.env.PORT ?? 4173);

app.listen(port, () => {
  logger.info("app.started", { port, dbPath, appVersion: appVersion.version, date: "2026-09-02" });
  console.log(`Agentic Loop Observability Dashboard running at http://localhost:${port}`);
});
