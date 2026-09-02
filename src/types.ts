export const DECISION_STATES = [
  "draft",
  "awaiting_review",
  "needs_changes",
  "accepted",
  "declined",
  "superseded"
] as const;

export type DecisionState = (typeof DECISION_STATES)[number];

export type EntityType =
  | "output"
  | "action_item"
  | "pull_request"
  | "run"
  | "decision"
  | "telemetry_coverage";

export type EventType =
  | "output.created"
  | "output.version_added"
  | "output.submitted_for_review"
  | "action.created"
  | "action.state_changed"
  | "pull_request.linked"
  | "pull_request.snapshot_recorded"
  | "run.linked"
  | "decision.recorded"
  | "output.superseded"
  | "telemetry.coverage_assessed";

export type ActorKind = "human" | "agent" | "system";

export interface Actor {
  kind: ActorKind;
  id: string;
  display_name?: string | null;
}

export interface DomainEvent<TPayload = Record<string, unknown>> {
  event_id: string;
  entity_id: string;
  entity_type: EntityType;
  event_type: EventType;
  idempotency_key?: string | null;
  occurred_at: string;
  recorded_at: string;
  actor: Actor;
  source: string;
  schema_version: "alo.events/v1";
  payload: TPayload;
}

export interface OutputListItem {
  outputId: string;
  title: string;
  outputType: string;
  summary: string;
  status: DecisionState;
  creator: string;
  runId: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: number;
  artifactCount: number;
  openActionCount: number;
  lastDecisionAt: string | null;
  lastDecisionActor: string | null;
  staleReason: string | null;
  pullRequestRepo: string | null;
  pullRequestNumber: number | null;
}

export interface ArtifactRecord {
  artifactId: string;
  label: string;
  mimeType: string;
  contentHash: string;
  jsonContent: unknown | null;
  sourceKind: string;
  sourceLabel: string;
  capturedAt: string;
  transformationLabel: string | null;
  schemaId: string | null;
  missingness: string[];
}

export interface ActionItemRecord {
  actionId: string;
  title: string;
  owner: string;
  state: string;
  priority: string;
  dueDate: string | null;
  provenance: string;
  completionEvidence: string | null;
}

export interface DecisionRecord {
  eventId: string;
  state: DecisionState;
  rationale: string | null;
  actor: string;
  occurredAt: string;
  outputVersion: number;
  supersedesVersion: number | null;
}

export interface TelemetryCoverageRecord {
  signal: string;
  status: string;
  source: string;
  details: string;
}

export interface OutputDetail {
  summary: OutputListItem;
  artifacts: ArtifactRecord[];
  actions: ActionItemRecord[];
  decisions: DecisionRecord[];
  telemetryCoverage: TelemetryCoverageRecord[];
  pullRequestSnapshots: PullRequestSnapshot[];
}

export interface PullRequestSnapshot {
  snapshotId: string;
  repository: string;
  pullRequestNumber: number;
  state: string;
  reviewSummary: string;
  checksSummary: string;
  commitCount: number;
  fileCount: number;
  capturedAt: string;
}

export interface DashboardSnapshot {
  generatedAt: string;
  outputs: OutputListItem[];
}

export interface DashboardData {
  generatedAt: string;
  outputs: OutputListItem[];
  selectedOutput: OutputDetail | null;
  pilotLoop: {
    id: string;
    version: string;
    title: string;
  };
}
