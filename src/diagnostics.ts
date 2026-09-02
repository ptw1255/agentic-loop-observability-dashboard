import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type Database from "better-sqlite3";
import { listAppliedMigrations, openDatabase } from "./db.js";
import { StructuredLogger } from "./logger.js";
import { isPhoenixAvailable } from "./phoenix.js";
import { readPilotMetrics } from "./projections.js";
import { EventStore } from "./store.js";
import type { DiagnosticsBundle } from "./types.js";

export async function buildDiagnosticsBundle(params: {
  rootDir: string;
  db: Database.Database;
  store: EventStore;
  logger: StructuredLogger;
  appVersion: string;
}): Promise<DiagnosticsBundle> {
  const generatedAt = new Date().toISOString();
  const migrationRecords = listAppliedMigrations(params.db);
  const pilotMetrics = readPilotMetrics(params.db);
  const eventCount = readScalarCount(params.db, "events");
  const outputCount = readScalarCount(params.db, "output_projection");
  const actionItemCount = readScalarCount(params.db, "action_projection");
  const decisionCount = readScalarCount(params.db, "decision_projection");
  const backupRestoreDrill = runBackupRestoreDrill(params.rootDir, params.store);
  const migrationVerification = runMigrationVerification(params.rootDir, params.store);

  params.logger.info("diagnostics.bundle_generated", {
    outputs: outputCount,
    events: eventCount,
    migrations: migrationRecords.length
  });

  return {
    generatedAt,
    appVersion: params.appVersion,
    environment: {
      nodeVersion: process.version,
      platform: `${process.platform}-${process.arch}`,
      phoenixReachable: await isPhoenixAvailable(),
      githubCliReachable: isGithubCliReachable()
    },
    migrationRecords,
    counts: {
      events: eventCount,
      outputs: outputCount,
      actionItems: actionItemCount,
      decisions: decisionCount
    },
    pilotMetrics,
    backupRestoreDrill,
    migrationVerification,
    recentLogs: params.logger.readRecent(50).map((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      event: entry.event,
      requestId: entry.requestId ?? null,
      data: entry.data
    })),
    threatModel: {
      docPath: "docs/THREAT-MODEL.md",
      coveredAreas: ["secrets", "prompts", "tool payloads", "local ports", "file access", "GitHub tokens"]
    },
    operationsRunbook: {
      docPath: "docs/OPERATIONS-RUNBOOK.md",
      lifecycleFlows: ["startup", "shutdown", "upgrade", "recovery", "purge"]
    }
  };
}

function runBackupRestoreDrill(rootDir: string, store: EventStore): DiagnosticsBundle["backupRestoreDrill"] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alo-backup-drill-"));
  const dbPath = path.join(tempDir, "restore.sqlite");
  const exportPayload = store.exportState();
  const eventCountBefore = exportPayload.events.length;

  try {
    const drillDb = openDatabase(dbPath);
    const drillStore = new EventStore(drillDb);
    drillStore.restoreState(exportPayload);
    const eventCountAfter = drillStore.listEvents().length;
    drillDb.close();

    return {
      passed: eventCountBefore === eventCountAfter,
      eventCountBefore,
      eventCountAfter,
      details: eventCountBefore === eventCountAfter
        ? "Export and restore replayed the full append-only event log successfully."
        : "Export and restore changed the event count."
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runMigrationVerification(rootDir: string, store: EventStore): DiagnosticsBundle["migrationVerification"] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alo-migration-verify-"));
  const dbPath = path.join(tempDir, "migration.sqlite");
  const exportPayload = store.exportState();

  try {
    const firstDb = openDatabase(dbPath);
    const firstStore = new EventStore(firstDb);
    firstStore.restoreState(exportPayload);
    const firstMigrations = listAppliedMigrations(firstDb).map((record) => record.id);
    firstDb.close();

    const secondDb = openDatabase(dbPath);
    const secondMigrations = listAppliedMigrations(secondDb).map((record) => record.id);
    const eventCount = readScalarCount(secondDb, "events");
    secondDb.close();

    const passed =
      firstMigrations.length === secondMigrations.length &&
      firstMigrations.every((id, index) => id === secondMigrations[index]) &&
      eventCount === exportPayload.events.length;

    return {
      passed,
      appliedMigrationIds: secondMigrations,
      details: passed
        ? "Versioned migrations were applied once and remained stable across reopen."
        : "Migration verification detected drift across reopen."
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function readScalarCount(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function isGithubCliReachable(): boolean {
  try {
    execFileSync("gh", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
