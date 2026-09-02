import crypto from "node:crypto";
import { EventStore } from "./store.js";
import type { ArtifactRecord, DecisionState, PullRequestSyncState } from "./types.js";

interface OutputScenario {
  outputId: string;
  title: string;
  outputType: string;
  summary: string;
  creator: string;
  submitForReview: boolean;
  runLinked: boolean;
  dslMapped: boolean;
  pullRequestLinked: boolean;
  pullRequestSyncState: PullRequestSyncState | null;
  decisionState: DecisionState | null;
  decisionRationale: string | null;
  reviewLeadMinutes: number | null;
  addActionItem: boolean;
}

const OUTPUT_SCENARIOS: OutputScenario[] = [
  {
    outputId: "output-demo-kiro-observability",
    title: "Agentic Loop Observability PRD",
    outputType: "prd",
    summary: "Outcome-centric PRD and wireframe bundle for a local-first observability dashboard.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: false,
    pullRequestLinked: true,
    pullRequestSyncState: "sync_ok",
    decisionState: null,
    decisionRationale: null,
    reviewLeadMinutes: null,
    addActionItem: true
  },
  {
    outputId: "output-accepted-01",
    title: "Accepted retry handling patch",
    outputType: "code",
    summary: "A small accepted patch with trace linkage and valid telemetry mapping.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: true,
    pullRequestSyncState: "sync_ok",
    decisionState: "accepted",
    decisionRationale: "Risk and evidence are aligned.",
    reviewLeadMinutes: 35,
    addActionItem: false
  },
  {
    outputId: "output-accepted-02",
    title: "Accepted JSON evidence cleanup",
    outputType: "code",
    summary: "Refines JSON rendering without changing the review contract.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: true,
    pullRequestSyncState: "sync_ok",
    decisionState: "accepted",
    decisionRationale: "Small change with full evidence.",
    reviewLeadMinutes: 70,
    addActionItem: false
  },
  {
    outputId: "output-accepted-03",
    title: "Accepted PR summary adapter",
    outputType: "code",
    summary: "Adds a lightweight PR summary card backed by local state.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: true,
    pullRequestSyncState: "sync_ok",
    decisionState: "accepted",
    decisionRationale: "Review was complete and implementation is bounded.",
    reviewLeadMinutes: 110,
    addActionItem: false
  },
  {
    outputId: "output-accepted-04",
    title: "Accepted structured logging baseline",
    outputType: "document",
    summary: "Documents and validates the initial log envelope and privacy defaults.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: false,
    pullRequestSyncState: null,
    decisionState: "accepted",
    decisionRationale: "The envelope is sufficient for the MVP.",
    reviewLeadMinutes: 55,
    addActionItem: false
  },
  {
    outputId: "output-accepted-05",
    title: "Accepted review queue labels",
    outputType: "report",
    summary: "Introduces clearer review labels and scoped copy changes.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: true,
    pullRequestSyncState: "repo_renamed",
    decisionState: "accepted",
    decisionRationale: "Canonical repo mapping is explicit and safe.",
    reviewLeadMinutes: 25,
    addActionItem: false
  },
  {
    outputId: "output-declined-01",
    title: "Declined auto-merge workflow",
    outputType: "code",
    summary: "Proposed autonomous merge behavior beyond current scope.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: false,
    pullRequestLinked: true,
    pullRequestSyncState: "sync_ok",
    decisionState: "declined",
    decisionRationale: "Autonomous merge is outside MVP authority.",
    reviewLeadMinutes: 20,
    addActionItem: false
  },
  {
    outputId: "output-declined-02",
    title: "Declined hosted dashboard variant",
    outputType: "prd",
    summary: "A hosted multi-user proposal that broadens the product too early.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: false,
    pullRequestLinked: true,
    pullRequestSyncState: "sync_error",
    decisionState: "declined",
    decisionRationale: "The MVP remains local-first.",
    reviewLeadMinutes: 180,
    addActionItem: false
  },
  {
    outputId: "output-declined-03",
    title: "Declined inferred node matching",
    outputType: "report",
    summary: "Suggested name-based span matching instead of explicit DSL identifiers.",
    creator: "Codex",
    submitForReview: true,
    runLinked: false,
    dslMapped: false,
    pullRequestLinked: false,
    pullRequestSyncState: null,
    decisionState: "declined",
    decisionRationale: "Name matching is not defensible for conformance.",
    reviewLeadMinutes: 45,
    addActionItem: false
  },
  {
    outputId: "output-needs-changes-01",
    title: "Needs changes on retry identity capture",
    outputType: "code",
    summary: "Adds retries without explicit retry IDs.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: false,
    pullRequestLinked: true,
    pullRequestSyncState: "offline",
    decisionState: "needs_changes",
    decisionRationale: "Retry identity must be explicit before acceptance.",
    reviewLeadMinutes: 95,
    addActionItem: true
  },
  {
    outputId: "output-needs-changes-02",
    title: "Needs changes on coverage math",
    outputType: "code",
    summary: "Coverage percentages are rendered without denominators.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: true,
    pullRequestSyncState: "sync_ok",
    decisionState: "needs_changes",
    decisionRationale: "Denominators must remain visible.",
    reviewLeadMinutes: 50,
    addActionItem: true
  },
  {
    outputId: "output-needs-changes-03",
    title: "Needs changes on diagnostics export",
    outputType: "document",
    summary: "Diagnostics export omits migration metadata and restore checks.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: false,
    pullRequestLinked: true,
    pullRequestSyncState: "auth_expired",
    decisionState: "needs_changes",
    decisionRationale: "Operational evidence is incomplete.",
    reviewLeadMinutes: 140,
    addActionItem: true
  },
  {
    outputId: "output-superseded-01",
    title: "Superseded wireframe variant A",
    outputType: "document",
    summary: "An earlier wireframe variant replaced by a cleaner revision.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: false,
    pullRequestSyncState: null,
    decisionState: "superseded",
    decisionRationale: "Replaced by a later output with clearer navigation.",
    reviewLeadMinutes: 210,
    addActionItem: false
  },
  {
    outputId: "output-superseded-02",
    title: "Superseded metrics schema draft",
    outputType: "json",
    summary: "A prior metrics schema replaced by a denominator-safe version.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: false,
    pullRequestSyncState: null,
    decisionState: "superseded",
    decisionRationale: "A newer schema resolved ambiguous metric names.",
    reviewLeadMinutes: 240,
    addActionItem: false
  },
  {
    outputId: "output-awaiting-01",
    title: "Awaiting review on DAG view copy",
    outputType: "document",
    summary: "Copy update for declared vs observed DAG explanation.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: true,
    pullRequestSyncState: "sync_ok",
    decisionState: null,
    decisionRationale: null,
    reviewLeadMinutes: null,
    addActionItem: false
  },
  {
    outputId: "output-awaiting-02",
    title: "Awaiting review on lead-time cards",
    outputType: "code",
    summary: "Adds median and average lead-time cards to the dashboard shell.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: true,
    pullRequestLinked: true,
    pullRequestSyncState: "sync_ok",
    decisionState: null,
    decisionRationale: null,
    reviewLeadMinutes: null,
    addActionItem: false
  },
  {
    outputId: "output-awaiting-03",
    title: "Awaiting review on stale-state guidance",
    outputType: "report",
    summary: "Explains what counts as stale versus failed in the pilot metrics.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: false,
    pullRequestLinked: true,
    pullRequestSyncState: "rate_limited",
    decisionState: null,
    decisionRationale: null,
    reviewLeadMinutes: null,
    addActionItem: false
  },
  {
    outputId: "output-awaiting-04",
    title: "Awaiting review on offline PR sync fallback",
    outputType: "code",
    summary: "Carries cached PR state forward when GitHub is unavailable.",
    creator: "Codex",
    submitForReview: true,
    runLinked: true,
    dslMapped: false,
    pullRequestLinked: true,
    pullRequestSyncState: "offline",
    decisionState: null,
    decisionRationale: null,
    reviewLeadMinutes: null,
    addActionItem: false
  },
  {
    outputId: "output-draft-01",
    title: "Draft cross-run dependency model",
    outputType: "json",
    summary: "A draft proposal for future cross-run dependency records.",
    creator: "Codex",
    submitForReview: false,
    runLinked: false,
    dslMapped: false,
    pullRequestLinked: false,
    pullRequestSyncState: null,
    decisionState: null,
    decisionRationale: null,
    reviewLeadMinutes: null,
    addActionItem: false
  },
  {
    outputId: "output-draft-02",
    title: "Draft local purge UI",
    outputType: "code",
    summary: "Early UI sketch for local purge controls and retention messaging.",
    creator: "Codex",
    submitForReview: false,
    runLinked: false,
    dslMapped: false,
    pullRequestLinked: false,
    pullRequestSyncState: null,
    decisionState: null,
    decisionRationale: null,
    reviewLeadMinutes: null,
    addActionItem: false
  }
];

function hashValue(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function seedDemoData(store: EventStore): void {
  if (store.listEvents().length > 0) {
    return;
  }

  const baseTime = new Date("2026-09-02T08:00:00.000Z").getTime();

  OUTPUT_SCENARIOS.forEach((scenario, index) => {
    seedScenario(store, scenario, baseTime + index * 30 * 60_000, index);
  });
}

function seedScenario(store: EventStore, scenario: OutputScenario, startTimeMs: number, index: number): void {
  const runId = `run-2026-09-02-${String(index + 1).padStart(3, "0")}`;
  const pullRequestNumber = index + 1;
  const repository = "ptw1255/factorio";
  const createdAt = iso(startTimeMs);
  const runLinkedAt = iso(startTimeMs + 2 * 60_000);
  const versionAt = iso(startTimeMs + 5 * 60_000);
  const submittedAt = iso(startTimeMs + 8 * 60_000);
  const decidedAt = scenario.reviewLeadMinutes == null ? null : iso(startTimeMs + (8 + scenario.reviewLeadMinutes) * 60_000);

  const prdPayload = {
    objective: scenario.summary,
    outcomes: [
      `Keep ${scenario.title.toLowerCase()} reviewable in one local surface.`,
      "Preserve joins between outputs, decisions, and runs.",
      "Show evidence gaps explicitly instead of hiding them."
    ],
    next_actions: scenario.decisionState === "needs_changes"
      ? ["Address requested changes", "Resubmit for review"]
      : ["Confirm evidence completeness", "Retain deterministic state"]
  };

  const coveragePayload = {
    mappedSignals: [
      { signal: "alo.run_id", status: scenario.runLinked ? "observed" : "missing" },
      { signal: "alo.output_id", status: "observed" },
      { signal: "alo.dsl.node_id", status: scenario.dslMapped ? "observed" : "missing" },
      { signal: "retry.identity", status: "missing" }
    ]
  };

  const artifacts: ArtifactRecord[] = [
    {
      artifactId: `${scenario.outputId}-artifact-prd`,
      label: "PRD outcome summary",
      mimeType: "application/json",
      contentHash: hashValue(prdPayload),
      jsonContent: prdPayload,
      sourceKind: "agent-output",
      sourceLabel: "Product spec draft",
      capturedAt: versionAt,
      transformationLabel: null,
      schemaId: "prd.summary/v1",
      missingness: []
    },
    {
      artifactId: `${scenario.outputId}-artifact-coverage`,
      label: "Telemetry coverage register",
      mimeType: "application/json",
      contentHash: hashValue(coveragePayload),
      jsonContent: coveragePayload,
      sourceKind: "derived-evidence",
      sourceLabel: "Coverage assessment",
      capturedAt: iso(startTimeMs + 6 * 60_000),
      transformationLabel: "Coverage rollup by signal",
      schemaId: "telemetry.coverage/v1",
      missingness: scenario.dslMapped ? ["retry.identity"] : ["alo.dsl.node_id", "retry.identity"]
    }
  ];

  store.append({
    entityId: scenario.outputId,
    entityType: "output",
    eventType: "output.created",
    actor: { kind: "agent", id: "codex", display_name: "Codex" },
    source: "seed.demo",
    occurredAt: createdAt,
    payload: {
      title: scenario.title,
      output_type: scenario.outputType,
      summary: scenario.summary,
      creator: scenario.creator
    }
  });

  if (scenario.runLinked) {
    store.append({
      entityId: scenario.outputId,
      entityType: "output",
      eventType: "run.linked",
      actor: { kind: "agent", id: "codex", display_name: "Codex" },
      source: "seed.demo",
      occurredAt: runLinkedAt,
      payload: {
        output_id: scenario.outputId,
        run_id: runId,
        alo_loop_definition_id: "implement-change",
        alo_dsl_version: "1.0.0",
        phoenix_project: "agentic-loop-observability-dashboard",
        session_id: runId
      }
    });
  }

  store.append({
    entityId: scenario.outputId,
    entityType: "output",
    eventType: "output.version_added",
    actor: { kind: "agent", id: "codex", display_name: "Codex" },
    source: "seed.demo",
    occurredAt: versionAt,
    payload: {
      output_version: 1,
      artifacts
    }
  });

  if (scenario.submitForReview) {
    store.append({
      entityId: scenario.outputId,
      entityType: "output",
      eventType: "output.submitted_for_review",
      actor: { kind: "agent", id: "codex", display_name: "Codex" },
      source: "seed.demo",
      occurredAt: submittedAt,
      payload: {
        output_id: scenario.outputId
      }
    });
  }

  if (scenario.addActionItem) {
    store.append({
      entityId: `${scenario.outputId}-action-01`,
      entityType: "action_item",
      eventType: "action.created",
      actor: { kind: "agent", id: "codex", display_name: "Codex" },
      source: "seed.demo",
      occurredAt: iso(startTimeMs + 9 * 60_000),
      payload: {
        actionId: `${scenario.outputId}-action-01`,
        outputId: scenario.outputId,
        title: `Follow up on ${scenario.title.toLowerCase()}`,
        owner: "ptw1255",
        state: scenario.decisionState === "accepted" ? "done" : "open",
        priority: scenario.decisionState === "needs_changes" ? "high" : "medium",
        dueDate: "2026-09-05",
        provenance: "Review follow-up",
        completionEvidence: scenario.decisionState === "accepted" ? "Accepted as complete." : null
      }
    });
  }

  store.append({
    entityId: scenario.outputId,
    entityType: "output",
    eventType: "telemetry.coverage_assessed",
    actor: { kind: "system", id: "coverage-bot", display_name: "Coverage Bot" },
    source: "seed.demo",
    occurredAt: iso(startTimeMs + 10 * 60_000),
    payload: {
      output_id: scenario.outputId,
      signal: "alo.run_id",
      status: scenario.runLinked ? "observed" : "missing",
      source: "runtime.adapter",
      details: scenario.runLinked
        ? "Run ID captured at root span and output creation."
        : "No run link was captured for this output."
    }
  });

  store.append({
    entityId: scenario.outputId,
    entityType: "output",
    eventType: "telemetry.coverage_assessed",
    actor: { kind: "system", id: "coverage-bot", display_name: "Coverage Bot" },
    source: "seed.demo",
    occurredAt: iso(startTimeMs + 11 * 60_000),
    payload: {
      output_id: scenario.outputId,
      signal: "alo.dsl.node_id",
      status: scenario.dslMapped ? "observed" : "missing",
      source: "runtime.adapter",
      details: scenario.dslMapped
        ? "Explicit DSL node IDs were emitted for the observed run."
        : "Node-level mapping has not been emitted by the pilot loop yet."
    }
  });

  if (scenario.pullRequestLinked) {
    store.append({
      entityId: scenario.outputId,
      entityType: "output",
      eventType: "pull_request.linked",
      actor: { kind: "agent", id: "codex", display_name: "Codex" },
      source: "seed.demo",
      occurredAt: iso(startTimeMs + 12 * 60_000),
      payload: {
        output_id: scenario.outputId,
        repository,
        pull_request_number: pullRequestNumber
      }
    });

    if (scenario.pullRequestSyncState) {
      store.append({
        entityId: scenario.outputId,
        entityType: "output",
        eventType: "pull_request.snapshot_recorded",
        actor: { kind: "system", id: "github-sync", display_name: "GitHub Sync" },
        source: "seed.demo",
        occurredAt: iso(startTimeMs + 13 * 60_000),
        payload: {
          output_id: scenario.outputId,
          snapshotId: `${scenario.outputId}-snapshot-01`,
          repository,
          pullRequestNumber: pullRequestNumber,
          state: scenario.decisionState === "accepted" ? "merged" : "open",
          reviewSummary: scenario.decisionState === "needs_changes"
            ? "1 reviewer requested changes"
            : scenario.decisionState === "declined"
              ? "No review decision"
              : "Review pending or completed",
          checksSummary: scenario.pullRequestSyncState === "sync_ok" || scenario.pullRequestSyncState === "repo_renamed"
            ? "Checks reported"
            : "No fresh checks reported",
          commitCount: 2 + (index % 5),
          fileCount: 3 + (index % 7),
          capturedAt: iso(startTimeMs + 13 * 60_000)
        }
      });

      store.append({
        entityId: scenario.outputId,
        entityType: "output",
        eventType: "pull_request.sync_status_recorded",
        actor: { kind: "system", id: "github-cli-sync", display_name: "GitHub CLI Sync" },
        source: "seed.demo",
        occurredAt: iso(startTimeMs + 14 * 60_000),
        payload: {
          output_id: scenario.outputId,
          repository,
          pull_request_number: pullRequestNumber,
          sync_state: scenario.pullRequestSyncState,
          sync_message: syncMessageForState(scenario.pullRequestSyncState),
          canonical_repository: scenario.pullRequestSyncState === "repo_renamed" ? repository : repository,
          last_attempted_at: iso(startTimeMs + 14 * 60_000),
          last_successful_at: scenario.pullRequestSyncState === "sync_ok" || scenario.pullRequestSyncState === "repo_renamed"
            ? iso(startTimeMs + 14 * 60_000)
            : null,
          rate_limit_reset_at: scenario.pullRequestSyncState === "rate_limited"
            ? iso(startTimeMs + 74 * 60_000)
            : null
        }
      });
    }
  }

  if (scenario.decisionState && decidedAt) {
    store.append({
      entityId: scenario.outputId,
      entityType: "output",
      eventType: "decision.recorded",
      actor: { kind: "human", id: "ptw1255", display_name: "ptw1255" },
      source: "seed.demo",
      occurredAt: decidedAt,
      payload: {
        state: scenario.decisionState,
        rationale: scenario.decisionRationale,
        output_version: 1
      }
    });
  }
}

function syncMessageForState(state: PullRequestSyncState): string {
  switch (state) {
    case "sync_ok":
      return "GitHub pull request synced successfully.";
    case "repo_renamed":
      return "GitHub pull request synced using the canonical repository name.";
    case "rate_limited":
      return "GitHub sync is rate limited. Cached state remains visible.";
    case "auth_expired":
      return "GitHub authentication expired. Cached state remains visible.";
    case "offline":
      return "GitHub was unreachable. Cached state remains visible.";
    case "not_found":
      return "Linked pull request was not found. Cached state remains visible.";
    case "sync_error":
      return "GitHub sync failed. Cached state remains visible.";
    case "not_linked":
      return "No pull request linked.";
  }
}

function iso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}
