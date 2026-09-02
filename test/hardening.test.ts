import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDiagnosticsBundle } from "../src/diagnostics.js";
import { listAppliedMigrations, openDatabase } from "../src/db.js";
import { StructuredLogger } from "../src/logger.js";
import { readDashboardData, readPilotMetrics } from "../src/projections.js";
import { seedDemoData } from "../src/seed.js";
import { EventStore } from "../src/store.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

function createTempStore(): { store: EventStore; close: () => void; tempDir: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alo-dashboard-hardening-"));
  const dbPath = path.join(tempDir, "test.sqlite");
  const db = openDatabase(dbPath);
  const store = new EventStore(db);
  return {
    store,
    tempDir,
    close: () => {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

test("pilot metrics report denominators for the seeded 20-output review set", () => {
  const { store, close } = createTempStore();

  try {
    seedDemoData(store);
    store.refreshProjection();

    const dashboard = readDashboardData(store.database, "output-demo-kiro-observability");
    const metrics = dashboard.pilotMetrics;

    assert.equal(metrics.totalOutputs, 20);
    assert.deepEqual(metrics.reviewStateCounts, {
      draft: 2,
      awaiting_review: 5,
      needs_changes: 3,
      accepted: 5,
      declined: 3,
      superseded: 2
    });
    assert.equal(metrics.reviewCompleteness.denominator, 20);
    assert.equal(metrics.traceLinkage.denominator, 20);
    assert.equal(metrics.dslMappingCoverage.denominator, 20);
    assert.equal(metrics.reviewLeadTime.submittedCount, 18);
    assert.equal(metrics.reviewLeadTime.decidedCount, 13);
  } finally {
    close();
  }
});

test("diagnostics bundle includes migrations, backup drill, logs, and operator docs", async () => {
  const { store, close, tempDir } = createTempStore();

  try {
    seedDemoData(store);
    store.refreshProjection();

    const logger = new StructuredLogger(path.join(tempDir, "logs", "app.ndjson"));
    logger.info("test.event", { area: "hardening" });

    const bundle = await buildDiagnosticsBundle({
      rootDir: repoRoot,
      db: store.database,
      store,
      logger,
      appVersion: "0.1.0"
    });

    assert.equal(bundle.counts.outputs, 20);
    assert.equal(bundle.pilotMetrics.totalOutputs, 20);
    assert.equal(bundle.backupRestoreDrill.passed, true);
    assert.equal(bundle.migrationVerification.passed, true);
    assert.ok(bundle.migrationRecords.length > 0);
    assert.ok(bundle.recentLogs.length > 0);
    assert.equal(bundle.threatModel.docPath, "docs/THREAT-MODEL.md");
    assert.equal(bundle.operationsRunbook.docPath, "docs/OPERATIONS-RUNBOOK.md");
  } finally {
    close();
  }
});

test("applied migrations are versioned and stable in database metadata", () => {
  const { store, close } = createTempStore();

  try {
    const migrations = listAppliedMigrations(store.database);
    assert.deepEqual(
      migrations.map((migration) => migration.id),
      [
        "0001_events",
        "0002_projection_reset_v1",
        "0003_output_projection",
        "0004_artifact_projection",
        "0005_action_projection",
        "0006_decision_projection",
        "0007_telemetry_projection",
        "0008_run_projection",
        "0009_pull_request_projection",
        "0010_pull_request_sync_projection"
      ]
    );
  } finally {
    close();
  }
});
