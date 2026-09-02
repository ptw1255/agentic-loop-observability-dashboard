import type Database from "better-sqlite3";
import type {
  ActionItemRecord,
  ArtifactRecord,
  DashboardData,
  DecisionRecord,
  DecisionState,
  DomainEvent,
  OutputDetail,
  OutputListItem,
  PullRequestSnapshot,
  PullRequestSyncStatus,
  TelemetryCoverageRecord
} from "./types.js";

interface OutputState {
  summary: OutputListItem;
  artifacts: ArtifactRecord[];
  actions: ActionItemRecord[];
  decisions: DecisionRecord[];
  telemetryCoverage: TelemetryCoverageRecord[];
  pullRequestSnapshots: PullRequestSnapshot[];
  pullRequestSyncStatus: PullRequestSyncStatus | null;
}

function assertDecisionState(value: string): DecisionState {
  return value as DecisionState;
}

function sortByOccurred<T extends { occurredAt?: string; capturedAt?: string; createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftValue = left.occurredAt ?? left.capturedAt ?? left.createdAt ?? "";
    const rightValue = right.occurredAt ?? right.capturedAt ?? right.createdAt ?? "";
    return rightValue.localeCompare(leftValue);
  });
}

export function buildProjection(events: DomainEvent[]): Map<string, OutputState> {
  const outputs = new Map<string, OutputState>();

  const orderedEvents = [...events].sort((left, right) => {
    const occurred = left.occurred_at.localeCompare(right.occurred_at);
    return occurred === 0 ? left.recorded_at.localeCompare(right.recorded_at) : occurred;
  });

  for (const event of orderedEvents) {
    if (event.entity_type === "output" && event.event_type === "output.created") {
      const payload = event.payload as {
        title: string;
        output_type: string;
        summary: string;
        creator: string;
      };
      outputs.set(event.entity_id, {
        summary: {
          outputId: event.entity_id,
          title: payload.title,
          outputType: payload.output_type,
          summary: payload.summary,
          status: "draft",
          creator: payload.creator,
          runId: null,
          createdAt: event.occurred_at,
          updatedAt: event.occurred_at,
          currentVersion: 0,
          artifactCount: 0,
          openActionCount: 0,
          lastDecisionAt: null,
          lastDecisionActor: null,
          staleReason: null,
          pullRequestRepo: null,
          pullRequestNumber: null,
          pullRequestSyncState: null,
          pullRequestSyncMessage: null,
          pullRequestLastSyncedAt: null,
          pullRequestCanonicalRepo: null,
          pullRequestRateLimitResetAt: null
        },
        artifacts: [],
        actions: [],
        decisions: [],
        telemetryCoverage: [],
        pullRequestSnapshots: [],
        pullRequestSyncStatus: null
      });
      continue;
    }

    const outputId = resolveOutputId(event);
    if (!outputId) {
      continue;
    }

    const output = outputs.get(outputId);
    if (!output) {
      continue;
    }

    output.summary.updatedAt = event.occurred_at;

    switch (event.event_type) {
      case "output.version_added": {
        const payload = event.payload as {
          output_version: number;
          artifacts: ArtifactRecord[];
        };
        output.summary.currentVersion = payload.output_version;
        output.artifacts = payload.artifacts;
        output.summary.artifactCount = payload.artifacts.length;
        break;
      }
      case "output.submitted_for_review": {
        output.summary.status = "awaiting_review";
        break;
      }
      case "run.linked": {
        const payload = event.payload as { run_id: string };
        output.summary.runId = payload.run_id;
        break;
      }
      case "action.created": {
        const payload = event.payload as unknown as ActionItemRecord;
        output.actions = [...output.actions, payload];
        output.summary.openActionCount = output.actions.filter((action) => action.state !== "done").length;
        break;
      }
      case "action.state_changed": {
        const payload = event.payload as { actionId: string; state: string; completionEvidence?: string | null };
        output.actions = output.actions.map((action) =>
          action.actionId === payload.actionId
            ? {
                ...action,
                state: payload.state,
                completionEvidence: payload.completionEvidence ?? action.completionEvidence
              }
            : action
        );
        output.summary.openActionCount = output.actions.filter((action) => action.state !== "done").length;
        break;
      }
      case "decision.recorded": {
        const payload = event.payload as {
          state: DecisionState;
          rationale?: string | null;
          output_version: number;
          supersedes_version?: number | null;
        };
        const decision: DecisionRecord = {
          eventId: event.event_id,
          state: payload.state,
          rationale: payload.rationale ?? null,
          actor: event.actor.display_name ?? event.actor.id,
          occurredAt: event.occurred_at,
          outputVersion: payload.output_version,
          supersedesVersion: payload.supersedes_version ?? null
        };
        output.decisions = sortByOccurred([...output.decisions, decision]);
        output.summary.status = payload.state;
        output.summary.lastDecisionAt = decision.occurredAt;
        output.summary.lastDecisionActor = decision.actor;
        break;
      }
      case "output.superseded": {
        output.summary.status = "superseded";
        break;
      }
      case "telemetry.coverage_assessed": {
        const payload = event.payload as unknown as TelemetryCoverageRecord;
        output.telemetryCoverage = [
          ...output.telemetryCoverage.filter((record) => record.signal !== payload.signal),
          payload
        ];
        break;
      }
      case "pull_request.linked": {
        const payload = event.payload as { repository: string; pull_request_number: number };
        output.summary.pullRequestRepo = payload.repository;
        output.summary.pullRequestNumber = payload.pull_request_number;
        output.summary.pullRequestSyncState = null;
        output.summary.pullRequestSyncMessage = null;
        output.summary.pullRequestLastSyncedAt = null;
        output.summary.pullRequestCanonicalRepo = null;
        output.summary.pullRequestRateLimitResetAt = null;
        output.summary.staleReason = "Linked PR has not been synced yet.";
        output.pullRequestSyncStatus = null;
        break;
      }
      case "pull_request.snapshot_recorded": {
        const payload = event.payload as unknown as PullRequestSnapshot;
        output.pullRequestSnapshots = sortByOccurred([...output.pullRequestSnapshots, payload]);
        break;
      }
      case "pull_request.sync_status_recorded": {
        const payload = event.payload as {
          repository: string;
          pull_request_number: number;
          sync_state: OutputListItem["pullRequestSyncState"];
          sync_message: string;
          canonical_repository: string | null;
          last_attempted_at: string;
          last_successful_at: string | null;
          rate_limit_reset_at: string | null;
        };
        output.pullRequestSyncStatus = {
          repository: payload.repository,
          pullRequestNumber: payload.pull_request_number,
          syncState: payload.sync_state ?? "sync_error",
          syncMessage: payload.sync_message,
          canonicalRepository: payload.canonical_repository,
          lastAttemptedAt: payload.last_attempted_at,
          lastSuccessfulAt: payload.last_successful_at,
          rateLimitResetAt: payload.rate_limit_reset_at
        };
        output.summary.pullRequestSyncState = output.pullRequestSyncStatus.syncState;
        output.summary.pullRequestSyncMessage = output.pullRequestSyncStatus.syncMessage;
        output.summary.pullRequestLastSyncedAt = output.pullRequestSyncStatus.lastSuccessfulAt;
        output.summary.pullRequestCanonicalRepo = output.pullRequestSyncStatus.canonicalRepository;
        output.summary.pullRequestRateLimitResetAt = output.pullRequestSyncStatus.rateLimitResetAt;
        output.summary.staleReason =
          output.pullRequestSyncStatus.syncState === "sync_ok" || output.pullRequestSyncStatus.syncState === "repo_renamed"
            ? null
            : output.pullRequestSyncStatus.syncMessage;
        break;
      }
      default:
        break;
    }
  }

  return outputs;
}

function resolveOutputId(event: DomainEvent): string | null {
  if (event.entity_type === "output") {
    return event.entity_id;
  }

  const payload = event.payload as { outputId?: string; output_id?: string };
  return payload.outputId ?? payload.output_id ?? null;
}

export function writeProjection(db: Database.Database, projection: Map<string, OutputState>): void {
  db.exec(`
    DELETE FROM output_projection;
    DELETE FROM artifact_projection;
    DELETE FROM action_projection;
    DELETE FROM decision_projection;
    DELETE FROM telemetry_projection;
    DELETE FROM pull_request_projection;
    DELETE FROM pull_request_sync_projection;
  `);

  const insertOutput = db.prepare(`
    INSERT INTO output_projection (
      output_id, title, output_type, summary, status, creator, run_id, created_at, updated_at,
      current_version, artifact_count, open_action_count, last_decision_at, last_decision_actor,
      stale_reason, pull_request_repo, pull_request_number, pull_request_sync_state,
      pull_request_sync_message, pull_request_last_synced_at, pull_request_canonical_repo,
      pull_request_rate_limit_reset_at
    ) VALUES (
      @outputId, @title, @outputType, @summary, @status, @creator, @runId, @createdAt, @updatedAt,
      @currentVersion, @artifactCount, @openActionCount, @lastDecisionAt, @lastDecisionActor,
      @staleReason, @pullRequestRepo, @pullRequestNumber, @pullRequestSyncState,
      @pullRequestSyncMessage, @pullRequestLastSyncedAt, @pullRequestCanonicalRepo,
      @pullRequestRateLimitResetAt
    );
  `);
  const insertArtifact = db.prepare(`
    INSERT INTO artifact_projection (
      output_id, artifact_id, label, mime_type, content_hash, json_content, source_kind, source_label,
      captured_at, transformation_label, schema_id, missingness_json, output_version
    ) VALUES (
      @outputId, @artifactId, @label, @mimeType, @contentHash, @jsonContent, @sourceKind, @sourceLabel,
      @capturedAt, @transformationLabel, @schemaId, @missingnessJson, @outputVersion
    );
  `);
  const insertAction = db.prepare(`
    INSERT INTO action_projection (
      action_id, output_id, title, owner, state, priority, due_date, provenance, completion_evidence
    ) VALUES (
      @actionId, @outputId, @title, @owner, @state, @priority, @dueDate, @provenance, @completionEvidence
    );
  `);
  const insertDecision = db.prepare(`
    INSERT INTO decision_projection (
      event_id, output_id, state, rationale, actor, occurred_at, output_version, supersedes_version
    ) VALUES (
      @eventId, @outputId, @state, @rationale, @actor, @occurredAt, @outputVersion, @supersedesVersion
    );
  `);
  const insertTelemetry = db.prepare(`
    INSERT INTO telemetry_projection (output_id, signal, status, source, details)
    VALUES (@outputId, @signal, @status, @source, @details);
  `);
  const insertPr = db.prepare(`
    INSERT INTO pull_request_projection (
      snapshot_id, output_id, repository, pull_request_number, state, review_summary, checks_summary,
      commit_count, file_count, captured_at
    ) VALUES (
      @snapshotId, @outputId, @repository, @pullRequestNumber, @state, @reviewSummary, @checksSummary,
      @commitCount, @fileCount, @capturedAt
    );
  `);
  const insertPrSync = db.prepare(`
    INSERT INTO pull_request_sync_projection (
      output_id, repository, pull_request_number, sync_state, sync_message,
      canonical_repository, last_attempted_at, last_successful_at, rate_limit_reset_at
    ) VALUES (
      @outputId, @repository, @pullRequestNumber, @syncState, @syncMessage,
      @canonicalRepository, @lastAttemptedAt, @lastSuccessfulAt, @rateLimitResetAt
    );
  `);

  const transaction = db.transaction(() => {
    for (const [outputId, state] of projection.entries()) {
      insertOutput.run(state.summary);

      for (const artifact of state.artifacts) {
        insertArtifact.run({
          outputId,
          artifactId: artifact.artifactId,
          label: artifact.label,
          mimeType: artifact.mimeType,
          contentHash: artifact.contentHash,
          jsonContent: artifact.jsonContent ? JSON.stringify(artifact.jsonContent) : null,
          sourceKind: artifact.sourceKind,
          sourceLabel: artifact.sourceLabel,
          capturedAt: artifact.capturedAt,
          transformationLabel: artifact.transformationLabel,
          schemaId: artifact.schemaId,
          missingnessJson: JSON.stringify(artifact.missingness),
          outputVersion: state.summary.currentVersion
        });
      }

      for (const action of state.actions) {
        insertAction.run({ outputId, ...action });
      }

      for (const decision of state.decisions) {
        insertDecision.run({ outputId, ...decision });
      }

      for (const coverage of state.telemetryCoverage) {
        insertTelemetry.run({ outputId, ...coverage });
      }

      for (const snapshot of state.pullRequestSnapshots) {
        insertPr.run({ outputId, ...snapshot });
      }

      if (state.pullRequestSyncStatus) {
        insertPrSync.run({ outputId, ...state.pullRequestSyncStatus });
      }
    }
  });

  transaction();
}

export function readDashboardData(db: Database.Database, selectedOutputId?: string | null): DashboardData {
  const outputs = db
    .prepare(`
      SELECT
        output_id AS outputId,
        title,
        output_type AS outputType,
        summary,
        status,
        creator,
        run_id AS runId,
        created_at AS createdAt,
        updated_at AS updatedAt,
        current_version AS currentVersion,
        artifact_count AS artifactCount,
        open_action_count AS openActionCount,
        last_decision_at AS lastDecisionAt,
        last_decision_actor AS lastDecisionActor,
        stale_reason AS staleReason,
        pull_request_repo AS pullRequestRepo,
        pull_request_number AS pullRequestNumber,
        pull_request_sync_state AS pullRequestSyncState,
        pull_request_sync_message AS pullRequestSyncMessage,
        pull_request_last_synced_at AS pullRequestLastSyncedAt,
        pull_request_canonical_repo AS pullRequestCanonicalRepo,
        pull_request_rate_limit_reset_at AS pullRequestRateLimitResetAt
      FROM output_projection
      ORDER BY updated_at DESC, output_id ASC
    `)
    .all() as OutputListItem[];

  const selectedId = selectedOutputId ?? outputs[0]?.outputId ?? null;
  const selectedOutput = selectedId ? readOutputDetail(db, selectedId) : null;

  return {
    generatedAt: new Date().toISOString(),
    outputs,
    selectedOutput,
    pilotLoop: {
      id: "implement-change",
      version: "1.0.0",
      title: "Implement and review a product change"
    }
  };
}

export function readOutputDetail(db: Database.Database, outputId: string): OutputDetail | null {
  const summary = db
    .prepare(`
      SELECT
        output_id AS outputId,
        title,
        output_type AS outputType,
        summary,
        status,
        creator,
        run_id AS runId,
        created_at AS createdAt,
        updated_at AS updatedAt,
        current_version AS currentVersion,
        artifact_count AS artifactCount,
        open_action_count AS openActionCount,
        last_decision_at AS lastDecisionAt,
        last_decision_actor AS lastDecisionActor,
        stale_reason AS staleReason,
        pull_request_repo AS pullRequestRepo,
        pull_request_number AS pullRequestNumber,
        pull_request_sync_state AS pullRequestSyncState,
        pull_request_sync_message AS pullRequestSyncMessage,
        pull_request_last_synced_at AS pullRequestLastSyncedAt,
        pull_request_canonical_repo AS pullRequestCanonicalRepo,
        pull_request_rate_limit_reset_at AS pullRequestRateLimitResetAt
      FROM output_projection
      WHERE output_id = ?
    `)
    .get(outputId) as OutputListItem | undefined;

  if (!summary) {
    return null;
  }

  const artifacts = db
    .prepare(`
      SELECT
        artifact_id AS artifactId,
        label,
        mime_type AS mimeType,
        content_hash AS contentHash,
        json_content AS jsonContent,
        source_kind AS sourceKind,
        source_label AS sourceLabel,
        captured_at AS capturedAt,
        transformation_label AS transformationLabel,
        schema_id AS schemaId,
        missingness_json AS missingnessJson
      FROM artifact_projection
      WHERE output_id = ?
      ORDER BY artifact_id ASC
    `)
    .all(outputId) as Array<{
      artifactId: string;
      label: string;
      mimeType: string;
      contentHash: string;
      jsonContent: string | null;
      sourceKind: string;
      sourceLabel: string;
      capturedAt: string;
      transformationLabel: string | null;
      schemaId: string | null;
      missingnessJson: string;
    }>;
  const parsedArtifacts = artifacts.map((record) => ({
      artifactId: record.artifactId,
      label: record.label,
      mimeType: record.mimeType,
      contentHash: record.contentHash,
      jsonContent: record.jsonContent ? JSON.parse(record.jsonContent) : null,
      sourceKind: record.sourceKind,
      sourceLabel: record.sourceLabel,
      capturedAt: record.capturedAt,
      transformationLabel: record.transformationLabel,
      schemaId: record.schemaId,
      missingness: JSON.parse(record.missingnessJson)
    })) as ArtifactRecord[];

  const actions = db
    .prepare(`
      SELECT
        action_id AS actionId,
        title,
        owner,
        state,
        priority,
        due_date AS dueDate,
        provenance,
        completion_evidence AS completionEvidence
      FROM action_projection
      WHERE output_id = ?
      ORDER BY state ASC, priority DESC, action_id ASC
    `)
    .all(outputId) as ActionItemRecord[];

  const decisions = db
    .prepare(`
      SELECT
        event_id AS eventId,
        state,
        rationale,
        actor,
        occurred_at AS occurredAt,
        output_version AS outputVersion,
        supersedes_version AS supersedesVersion
      FROM decision_projection
      WHERE output_id = ?
      ORDER BY occurred_at DESC, event_id DESC
    `)
    .all(outputId) as Array<{
      eventId: string;
      state: string;
      rationale: string | null;
      actor: string;
      occurredAt: string;
      outputVersion: number;
      supersedesVersion: number | null;
    }>;
  const parsedDecisions = decisions.map((record) => ({
      ...record,
      state: assertDecisionState(record.state)
    })) as DecisionRecord[];

  const telemetryCoverage = db
    .prepare(`
      SELECT signal, status, source, details
      FROM telemetry_projection
      WHERE output_id = ?
      ORDER BY signal ASC
    `)
    .all(outputId) as TelemetryCoverageRecord[];

  const pullRequestSnapshots = db
    .prepare(`
      SELECT
        snapshot_id AS snapshotId,
        repository,
        pull_request_number AS pullRequestNumber,
        state,
        review_summary AS reviewSummary,
        checks_summary AS checksSummary,
        commit_count AS commitCount,
        file_count AS fileCount,
        captured_at AS capturedAt
      FROM pull_request_projection
      WHERE output_id = ?
      ORDER BY captured_at DESC, snapshot_id DESC
    `)
    .all(outputId) as PullRequestSnapshot[];
  const filteredPullRequestSnapshots = pullRequestSnapshots.filter((snapshot) =>
      snapshot.repository === summary.pullRequestRepo &&
      snapshot.pullRequestNumber === summary.pullRequestNumber
    );

  const pullRequestSyncStatus = db
    .prepare(`
      SELECT
        repository,
        pull_request_number AS pullRequestNumber,
        sync_state AS syncState,
        sync_message AS syncMessage,
        canonical_repository AS canonicalRepository,
        last_attempted_at AS lastAttemptedAt,
        last_successful_at AS lastSuccessfulAt,
        rate_limit_reset_at AS rateLimitResetAt
      FROM pull_request_sync_projection
      WHERE output_id = ?
    `)
    .get(outputId) as PullRequestSyncStatus | undefined;

  return {
    summary,
    artifacts: parsedArtifacts,
    actions,
    decisions: parsedDecisions,
    telemetryCoverage,
    pullRequestSnapshots: filteredPullRequestSnapshots,
    pullRequestSyncStatus: pullRequestSyncStatus ?? null
  };
}
