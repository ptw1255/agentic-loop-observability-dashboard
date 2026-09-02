import crypto from "node:crypto";
import { EventStore } from "./store.js";
import type { ArtifactRecord } from "./types.js";

function hashValue(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function seedDemoData(store: EventStore): void {
  if (store.listEvents().length > 0) {
    return;
  }

  const outputId = "output-demo-kiro-observability";
  const actionId = "action-wire-prd";
  const runId = "run-2026-09-02-001";
  const repository = "ptw1255/factorio";
  const pullRequestNumber = 1;

  const prdPayload = {
    objective: "Create a DSL-backed observability surface for agent loops.",
    outcomes: [
      "Trace every output to the run that produced it.",
      "Separate accepted from merely completed work.",
      "Expose telemetry gaps as evidence states."
    ],
    next_actions: [
      "Implement local event store.",
      "Map alo.* fields at runtime boundaries.",
      "Add JSON evidence surfaces."
    ]
  };

  const coveragePayload = {
    mappedSignals: [
      { signal: "alo.run_id", status: "observed" },
      { signal: "alo.output_id", status: "observed" },
      { signal: "alo.dsl.node_id", status: "missing" },
      { signal: "retry.identity", status: "missing" }
    ]
  };

  const artifacts: ArtifactRecord[] = [
    {
      artifactId: "artifact-prd",
      label: "PRD outcome summary",
      mimeType: "application/json",
      contentHash: hashValue(prdPayload),
      jsonContent: prdPayload,
      sourceKind: "agent-output",
      sourceLabel: "Product spec draft",
      capturedAt: "2026-09-02T14:20:00.000Z",
      transformationLabel: null,
      schemaId: "prd.summary/v1",
      missingness: []
    },
    {
      artifactId: "artifact-coverage",
      label: "Telemetry coverage register",
      mimeType: "application/json",
      contentHash: hashValue(coveragePayload),
      jsonContent: coveragePayload,
      sourceKind: "derived-evidence",
      sourceLabel: "Coverage assessment",
      capturedAt: "2026-09-02T14:25:00.000Z",
      transformationLabel: "Coverage rollup by signal",
      schemaId: "telemetry.coverage/v1",
      missingness: ["alo.dsl.node_id", "retry.identity"]
    }
  ];

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "output.created",
    actor: { kind: "agent", id: "codex", display_name: "Codex" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:00:00.000Z",
    payload: {
      title: "Agentic Loop Observability PRD",
      output_type: "prd",
      summary: "Outcome-centric PRD and wireframe bundle for a local-first observability dashboard.",
      creator: "Codex"
    }
  });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "run.linked",
    actor: { kind: "agent", id: "codex", display_name: "Codex" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:05:00.000Z",
    payload: {
      output_id: outputId,
      run_id: runId,
      alo_loop_definition_id: "implement-change",
      alo_dsl_version: "1.0.0",
      phoenix_project: "agentic-loop-observability-dashboard",
      session_id: runId
    }
  });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "output.version_added",
    actor: { kind: "agent", id: "codex", display_name: "Codex" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:12:00.000Z",
    payload: {
      output_version: 1,
      artifacts
    }
  });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "output.submitted_for_review",
    actor: { kind: "agent", id: "codex", display_name: "Codex" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:13:00.000Z",
    payload: {
      output_id: outputId
    }
  });

  store.append({
    entityId: actionId,
    entityType: "action_item",
    eventType: "action.created",
    actor: { kind: "agent", id: "codex", display_name: "Codex" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:14:00.000Z",
    payload: {
      actionId,
      outputId,
      title: "Turn the PRD into a branch-ready implementation plan",
      owner: "ptw1255",
      state: "open",
      priority: "high",
      dueDate: "2026-09-05",
      provenance: "Review follow-up",
      completionEvidence: null
    }
  });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "telemetry.coverage_assessed",
    actor: { kind: "system", id: "coverage-bot", display_name: "Coverage Bot" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:16:00.000Z",
    payload: {
      output_id: outputId,
      signal: "alo.dsl.node_id",
      status: "missing",
      source: "runtime.adapter",
      details: "Node-level mapping has not been emitted by the pilot loop yet."
    }
  });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "telemetry.coverage_assessed",
    actor: { kind: "system", id: "coverage-bot", display_name: "Coverage Bot" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:17:00.000Z",
    payload: {
      output_id: outputId,
      signal: "alo.run_id",
      status: "observed",
      source: "runtime.adapter",
      details: "Run ID captured at root span and output event creation."
    }
  });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "pull_request.linked",
    actor: { kind: "agent", id: "codex", display_name: "Codex" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:18:00.000Z",
    payload: {
      output_id: outputId,
      repository,
      pull_request_number: pullRequestNumber
    }
  });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "pull_request.snapshot_recorded",
    actor: { kind: "system", id: "github-sync", display_name: "GitHub Sync" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:19:00.000Z",
    payload: {
      output_id: outputId,
      snapshotId: "pr-snapshot-1",
      repository,
      pullRequestNumber: pullRequestNumber,
      state: "open",
      reviewSummary: "1 reviewer requested changes",
      checksSummary: "No checks reported",
      commitCount: 11,
      fileCount: 27,
      capturedAt: "2026-09-02T14:19:00.000Z"
    }
  });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "pull_request.sync_status_recorded",
    actor: { kind: "system", id: "github-cli-sync", display_name: "GitHub CLI Sync" },
    source: "seed.demo",
    occurredAt: "2026-09-02T14:19:30.000Z",
    payload: {
      output_id: outputId,
      repository,
      pull_request_number: pullRequestNumber,
      sync_state: "sync_ok",
      sync_message: "Seeded cached snapshot available before the first live sync.",
      canonical_repository: repository,
      last_attempted_at: "2026-09-02T14:19:30.000Z",
      last_successful_at: "2026-09-02T14:19:30.000Z",
      rate_limit_reset_at: null
    }
  });
}
