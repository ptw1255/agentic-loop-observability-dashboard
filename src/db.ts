import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = [
  `
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
  `,
  `
    DROP TABLE IF EXISTS output_projection;
    DROP TABLE IF EXISTS artifact_projection;
    DROP TABLE IF EXISTS action_projection;
    DROP TABLE IF EXISTS decision_projection;
    DROP TABLE IF EXISTS telemetry_projection;
    DROP TABLE IF EXISTS pull_request_projection;
    DROP TABLE IF EXISTS pull_request_sync_projection;
    DROP TABLE IF EXISTS run_projection;
  `,
  `
    CREATE TABLE output_projection (
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
  `,
  `
    CREATE TABLE artifact_projection (
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
  `,
  `
    CREATE TABLE action_projection (
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
  `,
  `
    CREATE TABLE decision_projection (
      event_id TEXT PRIMARY KEY,
      output_id TEXT NOT NULL,
      state TEXT NOT NULL,
      rationale TEXT,
      actor TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      output_version INTEGER NOT NULL,
      supersedes_version INTEGER
    );
  `,
  `
    CREATE TABLE telemetry_projection (
      output_id TEXT NOT NULL,
      signal TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      details TEXT NOT NULL,
      PRIMARY KEY (output_id, signal)
    );
  `,
  `
    CREATE TABLE run_projection (
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
  `,
  `
    CREATE TABLE pull_request_projection (
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
  `,
  `
    CREATE TABLE pull_request_sync_projection (
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
];

export function ensureDataDirectory(rootDir: string): string {
  const dataDir = path.join(rootDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function openDatabase(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");

  for (const statement of MIGRATIONS) {
    db.exec(statement);
  }

  return db;
}
