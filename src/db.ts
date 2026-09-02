import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { MigrationRecord } from "./types.js";

interface MigrationStep {
  id: string;
  sql: string;
}

const MIGRATIONS: MigrationStep[] = [
  {
    id: "0001_events",
    sql: `
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      event_type TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      occurred_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      actor_kind TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_display_name TEXT,
      source TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
  `
  },
  {
    id: "0002_projection_reset_v1",
    sql: `
    DROP TABLE IF EXISTS output_projection;
    DROP TABLE IF EXISTS artifact_projection;
    DROP TABLE IF EXISTS action_projection;
    DROP TABLE IF EXISTS decision_projection;
    DROP TABLE IF EXISTS telemetry_projection;
    DROP TABLE IF EXISTS pull_request_projection;
    DROP TABLE IF EXISTS pull_request_sync_projection;
    DROP TABLE IF EXISTS run_projection;
  `
  },
  {
    id: "0003_output_projection",
    sql: `
    CREATE TABLE IF NOT EXISTS output_projection (
      output_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      output_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      creator TEXT NOT NULL,
      run_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      current_version INTEGER NOT NULL,
      artifact_count INTEGER NOT NULL,
      open_action_count INTEGER NOT NULL,
      last_decision_at TEXT,
      last_decision_actor TEXT,
      stale_reason TEXT,
      pull_request_repo TEXT,
      pull_request_number INTEGER,
      pull_request_sync_state TEXT,
      pull_request_sync_message TEXT,
      pull_request_last_synced_at TEXT,
      pull_request_canonical_repo TEXT,
      pull_request_rate_limit_reset_at TEXT
    );
  `
  },
  {
    id: "0004_artifact_projection",
    sql: `
    CREATE TABLE IF NOT EXISTS artifact_projection (
      output_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      label TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      json_content TEXT,
      source_kind TEXT NOT NULL,
      source_label TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      transformation_label TEXT,
      schema_id TEXT,
      missingness_json TEXT NOT NULL,
      output_version INTEGER NOT NULL,
      PRIMARY KEY (output_id, artifact_id)
    );
  `
  },
  {
    id: "0005_action_projection",
    sql: `
    CREATE TABLE IF NOT EXISTS action_projection (
      action_id TEXT PRIMARY KEY,
      output_id TEXT NOT NULL,
      title TEXT NOT NULL,
      owner TEXT NOT NULL,
      state TEXT NOT NULL,
      priority TEXT NOT NULL,
      due_date TEXT,
      provenance TEXT NOT NULL,
      completion_evidence TEXT
    );
  `
  },
  {
    id: "0006_decision_projection",
    sql: `
    CREATE TABLE IF NOT EXISTS decision_projection (
      event_id TEXT PRIMARY KEY,
      output_id TEXT NOT NULL,
      state TEXT NOT NULL,
      rationale TEXT,
      actor TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      output_version INTEGER NOT NULL,
      supersedes_version INTEGER
    );
  `
  },
  {
    id: "0007_telemetry_projection",
    sql: `
    CREATE TABLE IF NOT EXISTS telemetry_projection (
      output_id TEXT NOT NULL,
      signal TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      details TEXT NOT NULL,
      PRIMARY KEY (output_id, signal)
    );
  `
  },
  {
    id: "0008_run_projection",
    sql: `
    CREATE TABLE IF NOT EXISTS run_projection (
      output_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      loop_definition_id TEXT,
      dsl_version TEXT,
      phoenix_project TEXT,
      trace_id TEXT,
      root_span_id TEXT,
      session_id TEXT,
      last_updated_at TEXT NOT NULL
    );
  `
  },
  {
    id: "0009_pull_request_projection",
    sql: `
    CREATE TABLE IF NOT EXISTS pull_request_projection (
      snapshot_id TEXT PRIMARY KEY,
      output_id TEXT NOT NULL,
      repository TEXT NOT NULL,
      pull_request_number INTEGER NOT NULL,
      state TEXT NOT NULL,
      review_summary TEXT NOT NULL,
      checks_summary TEXT NOT NULL,
      commit_count INTEGER NOT NULL,
      file_count INTEGER NOT NULL,
      captured_at TEXT NOT NULL
    );
  `
  },
  {
    id: "0010_pull_request_sync_projection",
    sql: `
    CREATE TABLE IF NOT EXISTS pull_request_sync_projection (
      output_id TEXT PRIMARY KEY,
      repository TEXT NOT NULL,
      pull_request_number INTEGER NOT NULL,
      sync_state TEXT NOT NULL,
      sync_message TEXT NOT NULL,
      canonical_repository TEXT,
      last_attempted_at TEXT NOT NULL,
      last_successful_at TEXT,
      rate_limit_reset_at TEXT
    );
  `
  }
];

export function ensureDataDirectory(rootDir: string): string {
  const dataDir = path.join(rootDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function openDatabase(filePath: string): Database.Database {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const hasMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE id = ? LIMIT 1");
  const recordMigration = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");

  for (const migration of MIGRATIONS) {
    const applied = hasMigration.get(migration.id);
    if (applied) {
      continue;
    }

    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      db.exec(migration.sql);
      recordMigration.run(migration.id, now);
    });
    transaction();
  }

  return db;
}

export function listAppliedMigrations(db: Database.Database): MigrationRecord[] {
  return db
    .prepare(`
      SELECT id, applied_at AS appliedAt
      FROM schema_migrations
      ORDER BY id ASC
    `)
    .all() as MigrationRecord[];
}
