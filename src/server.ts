import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDataDirectory, openDatabase } from "./db.js";
import { buildDslConformance, parseLoopDefinition } from "./dsl.js";
import { GithubPullRequestAdapter } from "./github.js";
import { getObservabilityForOutput, isPhoenixAvailable, runAndLinkDemoTrace } from "./phoenix.js";
import { readDashboardData } from "./projections.js";
import { seedDemoData } from "./seed.js";
import { EventStore } from "./store.js";
import type { DecisionState } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = ensureDataDirectory(rootDir);
const dbPath = path.join(dataDir, "dashboard.sqlite");

const app = express();
const db = openDatabase(dbPath);
const store = new EventStore(db);
const githubAdapter = new GithubPullRequestAdapter(db, store);

seedDemoData(store);
store.refreshProjection();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(rootDir, "public")));

app.get("/api/dashboard", (request, response) => {
  const selectedOutputId = typeof request.query.outputId === "string" ? request.query.outputId : null;
  response.json(readDashboardData(db, selectedOutputId));
});

app.get("/api/observability", async (request, response) => {
  const outputId = typeof request.query.outputId === "string" ? request.query.outputId : null;
  if (!outputId) {
    response.status(400).json({ error: "outputId is required." });
    return;
  }

  response.json(await getObservabilityForOutput(db, outputId));
});

app.get("/api/conformance", async (request, response) => {
  const outputId = typeof request.query.outputId === "string" ? request.query.outputId : null;
  if (!outputId) {
    response.status(400).json({ error: "outputId is required." });
    return;
  }

  const definition = parseLoopDefinition(rootDir);
  const observability = await getObservabilityForOutput(db, outputId);
  response.json(buildDslConformance(definition, observability));
});

app.post("/api/observability/demo-run", async (request, response) => {
  const { outputId } = request.body as { outputId?: string };
  if (!outputId) {
    response.status(400).json({ error: "outputId is required." });
    return;
  }

  if (!(await isPhoenixAvailable())) {
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
    response.status(500).json({ error: error instanceof Error ? error.message : "Demo trace emission failed." });
  }
});

app.post("/api/pull-requests/link", async (request, response) => {
  const { outputId, repository, pullRequestNumber } = request.body as {
    outputId?: string;
    repository?: string;
    pullRequestNumber?: number;
  };
  const parsedPullRequestNumber = Number(pullRequestNumber);

  if (!outputId || !repository || !Number.isInteger(parsedPullRequestNumber) || parsedPullRequestNumber < 1) {
    response.status(400).json({ error: "outputId, repository, and a positive pullRequestNumber are required." });
    return;
  }

  try {
    await githubAdapter.linkPullRequest(outputId, repository, parsedPullRequestNumber);
    response.status(201).json(readDashboardData(db, outputId));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Pull request link failed." });
  }
});

app.post("/api/pull-requests/sync", async (request, response) => {
  const { outputId } = request.body as { outputId?: string };
  if (!outputId) {
    response.status(400).json({ error: "outputId is required." });
    return;
  }

  try {
    await githubAdapter.syncOutputPullRequest(outputId);
    response.status(200).json(readDashboardData(db, outputId));
  } catch (error) {
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
    response.status(400).json({ error: "outputId, state, and actorName are required." });
    return;
  }

  try {
    store.recordDecision(outputId, state, rationale ?? null, actorName);
    response.status(201).json(readDashboardData(db, outputId));
  } catch (error) {
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
  console.log(`Agentic Loop Observability Dashboard running at http://localhost:${port}`);
});
