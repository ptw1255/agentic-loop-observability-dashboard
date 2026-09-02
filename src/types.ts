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
  | "pull_request.sync_status_recorded"
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
  pullRequestSyncState: PullRequestSyncState | null;
  pullRequestSyncMessage: string | null;
  pullRequestLastSyncedAt: string | null;
  pullRequestCanonicalRepo: string | null;
  pullRequestRateLimitResetAt: string | null;
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

export interface ArtifactDetailRecord extends ArtifactRecord {
  validationStatus: "valid" | "invalid" | "unavailable";
  validationDetails: string | null;
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
  runLink: RunLinkRecord | null;
  artifacts: ArtifactDetailRecord[];
  actions: ActionItemRecord[];
  decisions: DecisionRecord[];
  telemetryCoverage: TelemetryCoverageRecord[];
  pullRequestSnapshots: PullRequestSnapshot[];
  pullRequestSyncStatus: PullRequestSyncStatus | null;
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

export type PullRequestSyncState =
  | "not_linked"
  | "sync_ok"
  | "repo_renamed"
  | "rate_limited"
  | "auth_expired"
  | "offline"
  | "not_found"
  | "sync_error";

export interface PullRequestSyncStatus {
  repository: string;
  pullRequestNumber: number;
  syncState: PullRequestSyncState;
  syncMessage: string;
  canonicalRepository: string | null;
  lastAttemptedAt: string;
  lastSuccessfulAt: string | null;
  rateLimitResetAt: string | null;
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
  pilotMetrics: PilotMetrics;
}

export interface RunLinkRecord {
  outputId: string;
  runId: string;
  loopDefinitionId: string | null;
  dslVersion: string | null;
  phoenixProject: string | null;
  traceId: string | null;
  rootSpanId: string | null;
  sessionId: string | null;
  lastUpdatedAt: string;
}

export interface ObservabilitySummary {
  available: boolean;
  message: string;
  projectName: string;
  traceId: string | null;
  rootSpanId: string | null;
  runId: string | null;
  sessionId: string | null;
  traceLink: string | null;
  spanLink: string | null;
  spans: ObservedSpan[];
  outline: string[];
  tree: ObservedSpanTreeNode[];
  annotations: ObservedAnnotation[];
}

export interface ObservedSpan {
  spanId: string;
  traceId: string;
  parentId: string | null;
  name: string;
  spanKind: string;
  statusCode: string;
  startTime: string | null;
  endTime: string | null;
  latencyMs: number | null;
  attributes: Record<string, unknown>;
}

export interface ObservedSpanTreeNode {
  spanId: string;
  label: string;
  spanKind: string;
  statusCode: string;
  latencyMs: number | null;
  children: ObservedSpanTreeNode[];
}

export interface ObservedAnnotation {
  spanId: string;
  name: string;
  annotatorKind: string | null;
  label: string | null;
  score: number | null;
  explanation: string | null;
}

export interface LoopDefinitionNode {
  id: string;
  kind: string;
  title: string;
  requiredTelemetry: string[];
}

export interface LoopDefinitionEdge {
  from: string;
  to: string;
  meaning: string;
}

export interface LoopDefinitionOutcome {
  id: string;
  measure: string;
  target: number | string | boolean | null;
}

export interface ObservedExecutionEdge {
  fromNodeId: string | null;
  toNodeId: string | null;
  fromSpanId: string;
  toSpanId: string;
  meaning: "observed_execution";
}

export interface NodeConformanceRecord {
  nodeId: string;
  title: string;
  kind: string;
  observed: boolean;
  spanIds: string[];
  attemptCount: number;
  status: "ok" | "error" | "missing";
  latencyMs: number | null;
  missingTelemetry: string[];
}

export interface UnmappedSpanRecord {
  spanId: string;
  name: string;
  reason: string;
}

export interface DependencyRecord {
  type: "fan_in" | "fan_out" | "cross_run_link";
  description: string;
}

export interface CriticalPathRecord {
  nodeIds: string[];
  totalLatencyMs: number;
}

export interface DslConformanceSummary {
  available: boolean;
  message: string;
  loopId: string;
  loopVersion: string;
  loopTitle: string;
  outcomes: LoopDefinitionOutcome[];
  declaredNodes: LoopDefinitionNode[];
  declaredEdges: LoopDefinitionEdge[];
  observedEdges: ObservedExecutionEdge[];
  nodeStates: NodeConformanceRecord[];
  declaredNotObserved: string[];
  unmappedSpans: UnmappedSpanRecord[];
  dependencyRecords: DependencyRecord[];
  criticalPath: CriticalPathRecord | null;
  criticalPathReason: string | null;
}

export interface RatioMetric {
  numerator: number;
  denominator: number;
  percentage: number;
  asOf: string;
}

export interface ReviewLeadTimeMetric {
  decidedCount: number;
  submittedCount: number;
  averageHours: number | null;
  medianHours: number | null;
  asOf: string;
}

export interface PilotMetrics {
  totalOutputs: number;
  reviewStateCounts: Record<DecisionState, number>;
  operationalSlices: {
    staleCount: number;
    failedCount: number;
    traceLinkedCount: number;
    dslMappedCount: number;
  };
  reviewCompleteness: RatioMetric;
  traceLinkage: RatioMetric;
  dslMappingCoverage: RatioMetric;
  reviewLeadTime: ReviewLeadTimeMetric;
  generatedAt: string;
}

export interface MigrationRecord {
  id: string;
  appliedAt: string;
}

export interface DiagnosticsBundle {
  generatedAt: string;
  appVersion: string;
  environment: {
    nodeVersion: string;
    platform: string;
    phoenixReachable: boolean;
    githubCliReachable: boolean;
  };
  migrationRecords: MigrationRecord[];
  counts: {
    events: number;
    outputs: number;
    actionItems: number;
    decisions: number;
  };
  pilotMetrics: PilotMetrics;
  backupRestoreDrill: {
    passed: boolean;
    eventCountBefore: number;
    eventCountAfter: number;
    details: string;
  };
  migrationVerification: {
    passed: boolean;
    appliedMigrationIds: string[];
    details: string;
  };
  recentLogs: Array<Record<string, unknown>>;
  threatModel: {
    docPath: string;
    coveredAreas: string[];
  };
  operationsRunbook: {
    docPath: string;
    lifecycleFlows: string[];
  };
}
