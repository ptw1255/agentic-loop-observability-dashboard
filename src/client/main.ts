type DecisionState =
  | "draft"
  | "awaiting_review"
  | "needs_changes"
  | "accepted"
  | "declined"
  | "superseded";

interface OutputListItem {
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
  pullRequestSyncState: string | null;
  pullRequestSyncMessage: string | null;
  pullRequestLastSyncedAt: string | null;
  pullRequestCanonicalRepo: string | null;
  pullRequestRateLimitResetAt: string | null;
}

interface ArtifactRecord {
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
  validationStatus: "valid" | "invalid" | "unavailable";
  validationDetails: string | null;
}

interface OutputDetail {
  summary: OutputListItem;
  runLink: {
    outputId: string;
    runId: string;
    loopDefinitionId: string | null;
    dslVersion: string | null;
    phoenixProject: string | null;
    traceId: string | null;
    rootSpanId: string | null;
    sessionId: string | null;
    lastUpdatedAt: string;
  } | null;
  artifacts: ArtifactRecord[];
  actions: Array<{
    actionId: string;
    title: string;
    owner: string;
    state: string;
    priority: string;
    dueDate: string | null;
    provenance: string;
    completionEvidence: string | null;
  }>;
  decisions: Array<{
    eventId: string;
    state: DecisionState;
    rationale: string | null;
    actor: string;
    occurredAt: string;
    outputVersion: number;
    supersedesVersion: number | null;
  }>;
  telemetryCoverage: Array<{
    signal: string;
    status: string;
    source: string;
    details: string;
  }>;
  pullRequestSnapshots: Array<{
    snapshotId: string;
    repository: string;
    pullRequestNumber: number;
    state: string;
    reviewSummary: string;
    checksSummary: string;
    commitCount: number;
    fileCount: number;
    capturedAt: string;
  }>;
  pullRequestSyncStatus: {
    repository: string;
    pullRequestNumber: number;
    syncState: string;
    syncMessage: string;
    canonicalRepository: string | null;
    lastAttemptedAt: string;
    lastSuccessfulAt: string | null;
    rateLimitResetAt: string | null;
  } | null;
}

interface ObservabilitySummary {
  available: boolean;
  message: string;
  projectName: string;
  traceId: string | null;
  rootSpanId: string | null;
  runId: string | null;
  sessionId: string | null;
  traceLink: string | null;
  spanLink: string | null;
  spans: Array<{
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
  }>;
  outline: string[];
  tree: ObservabilityTreeNode[];
  annotations: Array<{
    spanId: string;
    name: string;
    annotatorKind: string | null;
    label: string | null;
    score: number | null;
    explanation: string | null;
  }>;
}

interface ObservabilityTreeNode {
  spanId: string;
  label: string;
  spanKind: string;
  statusCode: string;
  latencyMs: number | null;
  children: ObservabilityTreeNode[];
}

interface DslConformanceSummary {
  available: boolean;
  message: string;
  loopId: string;
  loopVersion: string;
  loopTitle: string;
  outcomes: Array<{
    id: string;
    measure: string;
    target: number | string | boolean | null;
  }>;
  declaredNodes: Array<{
    id: string;
    kind: string;
    title: string;
    requiredTelemetry: string[];
  }>;
  declaredEdges: Array<{
    from: string;
    to: string;
    meaning: string;
  }>;
  observedEdges: Array<{
    fromNodeId: string | null;
    toNodeId: string | null;
    fromSpanId: string;
    toSpanId: string;
    meaning: "observed_execution";
  }>;
  nodeStates: Array<{
    nodeId: string;
    title: string;
    kind: string;
    observed: boolean;
    spanIds: string[];
    attemptCount: number;
    status: "ok" | "error" | "missing";
    latencyMs: number | null;
    missingTelemetry: string[];
  }>;
  declaredNotObserved: string[];
  unmappedSpans: Array<{
    spanId: string;
    name: string;
    reason: string;
  }>;
  dependencyRecords: Array<{
    type: "fan_in" | "fan_out" | "cross_run_link";
    description: string;
  }>;
  criticalPath: {
    nodeIds: string[];
    totalLatencyMs: number;
  } | null;
  criticalPathReason: string | null;
}

interface DashboardData {
  generatedAt: string;
  outputs: OutputListItem[];
  selectedOutput: OutputDetail | null;
  pilotLoop: {
    id: string;
    version: string;
    title: string;
  };
}

const state = {
  data: null as DashboardData | null,
  selectedOutputId: null as string | null,
  selectedArtifactId: null as string | null,
  artifactView: "compact" as "compact" | "table" | "tree" | "raw",
  artifactPathFilter: "",
  observability: null as ObservabilitySummary | null,
  observabilityLoading: false,
  conformance: null as DslConformanceSummary | null,
  conformanceLoading: false,
  statusText: "Loading local state...",
  errorText: ""
};

let pollingHandle: number | null = null;
let syncInFlight = false;

const elements = {
  status: document.querySelector<HTMLElement>("[data-role=status]"),
  outputList: document.querySelector<HTMLElement>("[data-role=output-list]"),
  detail: document.querySelector<HTMLElement>("[data-role=detail]"),
  actorInput: document.querySelector<HTMLInputElement>("#actorName"),
  rationaleInput: document.querySelector<HTMLTextAreaElement>("#rationale"),
  exportButton: document.querySelector<HTMLButtonElement>("[data-action=export]"),
  restoreInput: document.querySelector<HTMLInputElement>("#restoreFile")
};

async function loadDashboard(outputId?: string): Promise<void> {
  setStatus("Refreshing local evidence...");
  state.errorText = "";

  try {
    const search = outputId ? `?outputId=${encodeURIComponent(outputId)}` : "";
    const response = await fetch(`/api/dashboard${search}`);
    if (!response.ok) {
      throw new Error(`Dashboard request failed with ${response.status}`);
    }

    state.data = (await response.json()) as DashboardData;
    state.selectedOutputId = state.data.selectedOutput?.summary.outputId ?? null;
    state.selectedArtifactId = state.data.selectedOutput?.artifacts[0]?.artifactId ?? null;
    state.observability = null;
    state.conformance = null;
    setStatus(`Local snapshot refreshed ${formatDateTime(state.data.generatedAt)}`);
    render();
    schedulePullRequestPolling();
    if (state.selectedOutputId) {
      void loadObservability(state.selectedOutputId, true);
      void loadConformance(state.selectedOutputId, true);
    }
  } catch (error) {
    state.errorText = error instanceof Error ? error.message : "Unknown load error";
    setStatus("Unable to load local dashboard state.");
    render();
  }
}

async function loadConformance(outputId: string, background: boolean): Promise<void> {
  const requestedOutputId = outputId;
  state.conformanceLoading = true;

  try {
    const response = await fetch(`/api/conformance?outputId=${encodeURIComponent(requestedOutputId)}`);
    const payload = (await response.json()) as DslConformanceSummary | { error: string };
    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : `Conformance request failed with ${response.status}`);
    }

    if (state.selectedOutputId !== requestedOutputId) {
      return;
    }

    state.conformance = payload;
    if (!background && state.observabilityLoading === false) {
      setStatus(`DSL conformance refreshed ${formatDateTime(new Date().toISOString())}`);
    }
    render();
  } catch (error) {
    if (state.selectedOutputId !== requestedOutputId) {
      return;
    }

    state.conformance = {
      available: false,
      message: error instanceof Error ? error.message : "Conformance request failed.",
      loopId: "implement-change",
      loopVersion: "1.0.0",
      loopTitle: "Implement and review a product change",
      outcomes: [],
      declaredNodes: [],
      declaredEdges: [],
      observedEdges: [],
      nodeStates: [],
      declaredNotObserved: [],
      unmappedSpans: [],
      dependencyRecords: [],
      criticalPath: null,
      criticalPathReason: "Conformance could not be computed."
    };
    render();
  } finally {
    if (state.selectedOutputId === requestedOutputId) {
      state.conformanceLoading = false;
    }
  }
}

async function loadObservability(outputId: string, background: boolean): Promise<void> {
  const requestedOutputId = outputId;
  state.observabilityLoading = true;

  if (!background) {
    setStatus("Loading observability from local Phoenix...");
    render();
  }

  try {
    const response = await fetch(`/api/observability?outputId=${encodeURIComponent(requestedOutputId)}`);
    const payload = (await response.json()) as ObservabilitySummary | { error: string };
    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : `Observability request failed with ${response.status}`);
    }

    if (state.selectedOutputId !== requestedOutputId) {
      return;
    }

    state.observability = payload;
    if (!background) {
      setStatus(`Observability refreshed ${formatDateTime(new Date().toISOString())}`);
    }
    render();
  } catch (error) {
    if (state.selectedOutputId !== requestedOutputId) {
      return;
    }

    state.observability = {
      available: false,
      message: error instanceof Error ? error.message : "Observability request failed.",
      projectName: "agentic-loop-observability-dashboard",
      traceId: null,
      rootSpanId: null,
      runId: null,
      sessionId: null,
      traceLink: null,
      spanLink: null,
      spans: [],
      outline: [],
      tree: [],
      annotations: []
    };
    render();
  } finally {
    if (state.selectedOutputId === requestedOutputId) {
      state.observabilityLoading = false;
    }
  }
}

function setStatus(message: string): void {
  state.statusText = message;
  if (elements.status) {
    elements.status.textContent = message;
  }
}

function render(): void {
  renderList();
  renderDetail();
}

function renderList(): void {
  if (!elements.outputList) {
    return;
  }

  const outputs = state.data?.outputs ?? [];
  if (outputs.length === 0) {
    elements.outputList.innerHTML = `
      <div class="empty-state">
        <h2>No outputs yet</h2>
        <p>Create or ingest an output to make the review inbox useful.</p>
      </div>
    `;
    return;
  }

  const selectedId = state.selectedOutputId;
  elements.outputList.innerHTML = outputs
    .map(
      (output) => `
        <button class="output-card ${output.outputId === selectedId ? "is-selected" : ""}" data-output-id="${output.outputId}">
          <div class="output-card__topline">
            <span class="pill pill--status pill--${output.status}">${formatLabel(output.status)}</span>
            <span class="muted">v${output.currentVersion}</span>
          </div>
          <h2>${escapeHtml(output.title)}</h2>
          <p>${escapeHtml(output.summary)}</p>
          <dl class="metrics-row">
            <div><dt>Artifacts</dt><dd>${output.artifactCount}</dd></div>
            <div><dt>Actions</dt><dd>${output.openActionCount}</dd></div>
            <div><dt>Run</dt><dd>${escapeHtml(output.runId ?? "not linked")}</dd></div>
          </dl>
          <div class="output-card__footer">
            <span>${escapeHtml(output.creator)}</span>
            <span>${formatDateTime(output.updatedAt)}</span>
          </div>
        </button>
      `
    )
    .join("");

  elements.outputList.querySelectorAll<HTMLButtonElement>("[data-output-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const outputId = button.dataset.outputId;
      if (outputId) {
        void loadDashboard(outputId);
      }
    });
  });
}

function renderDetail(): void {
  if (!elements.detail) {
    return;
  }

  if (state.errorText) {
    elements.detail.innerHTML = `
      <section class="panel panel--error">
        <h2>State unavailable</h2>
        <p>${escapeHtml(state.errorText)}</p>
      </section>
    `;
    return;
  }

  const detail = state.data?.selectedOutput;
  if (!detail) {
    elements.detail.innerHTML = `
      <section class="panel">
        <h2>Select an output</h2>
        <p>The detail pane will render local state, evidence, and review controls here.</p>
      </section>
    `;
    return;
  }

  const selectedArtifact = detail.artifacts.find((artifact) => artifact.artifactId === state.selectedArtifactId) ?? detail.artifacts[0] ?? null;
  const artifactPanel = selectedArtifact ? renderArtifactPanel(selectedArtifact) : `
    <section class="panel">
      <h3>Artifacts</h3>
      <p class="muted">No artifacts captured for this output version.</p>
    </section>
  `;

  elements.detail.innerHTML = `
    <section class="hero-card">
      <div>
        <p class="eyebrow">Pilot loop ${escapeHtml(state.data?.pilotLoop.id ?? "")} · v${escapeHtml(state.data?.pilotLoop.version ?? "")}</p>
        <h1>${escapeHtml(detail.summary.title)}</h1>
        <p class="lede">${escapeHtml(detail.summary.summary)}</p>
      </div>
      <div class="hero-card__metrics">
        <div><span>Status</span><strong>${formatLabel(detail.summary.status)}</strong></div>
        <div><span>Output version</span><strong>${detail.summary.currentVersion}</strong></div>
        <div><span>Last update</span><strong>${formatDateTime(detail.summary.updatedAt)}</strong></div>
      </div>
    </section>

    <section class="panel-grid">
      <section class="panel">
        <h3>Review actions</h3>
        <p class="muted">Human decisions are append-only and independent from pull request state.</p>
        <div class="decision-actions">
          <button data-decision-state="accepted" class="action-button">Accept</button>
          <button data-decision-state="needs_changes" class="action-button">Needs changes</button>
          <button data-decision-state="declined" class="action-button action-button--danger">Decline</button>
        </div>
        <label class="field">
          <span>Reviewer</span>
          <input id="actorName" type="text" value="${escapeHtml(elements.actorInput?.value || "ptw1255")}" />
        </label>
        <label class="field">
          <span>Rationale</span>
          <textarea id="rationale" rows="4" placeholder="Required for decline or supersede. Optional for accept.">${escapeHtml(elements.rationaleInput?.value || "")}</textarea>
        </label>
      </section>

      <section class="panel">
        <h3>Implementation context</h3>
        <dl class="stacked-list">
          <div><dt>Run ID</dt><dd>${escapeHtml(detail.summary.runId ?? "Not linked yet")}</dd></div>
          <div><dt>Trace project</dt><dd>${escapeHtml(detail.runLink?.phoenixProject ?? "No Phoenix project linked")}</dd></div>
          <div><dt>PR summary</dt><dd>${renderPrSummary(detail)}</dd></div>
          <div><dt>Sync state</dt><dd>${renderPullRequestSyncState(detail)}</dd></div>
          <div><dt>Staleness</dt><dd>${escapeHtml(detail.summary.staleReason ?? "Fresh local snapshot")}</dd></div>
        </dl>
        <div class="decision-actions">
          <button data-action="sync-pr" class="action-button">Sync PR now</button>
        </div>
        <label class="field">
          <span>Repository</span>
          <input id="pullRequestRepo" type="text" value="${escapeHtml(detail.summary.pullRequestRepo ?? "")}" placeholder="ptw1255/factorio" />
        </label>
        <label class="field">
          <span>PR number</span>
          <input id="pullRequestNumber" type="number" min="1" value="${detail.summary.pullRequestNumber ?? ""}" />
        </label>
        <div class="decision-actions">
          <button data-action="link-pr" class="action-button">Link PR</button>
        </div>
      </section>
    </section>

    <section class="panel-grid">
      <section class="panel">
        <h3>Action items</h3>
        ${renderActionItems(detail)}
      </section>

      <section class="panel">
        <h3>Decision ledger</h3>
        ${renderDecisionLedger(detail)}
      </section>
    </section>

    <section class="panel-grid">
      <section class="panel">
        <h3>Execution observability</h3>
        <p class="muted">Trace evidence is optional to local review. When Phoenix is reachable, the run stays deep-linkable to spans and evaluations.</p>
        <div class="decision-actions">
          <button data-action="demo-trace" class="action-button">Run traced demo</button>
          <button data-action="refresh-observability" class="action-button">Refresh observability</button>
        </div>
        ${renderObservability(detail)}
      </section>

      <section class="panel">
        <h3>Telemetry coverage</h3>
        ${renderCoverage(detail)}
      </section>
    </section>

    <section class="panel">
      <h3>Observed PR history</h3>
      ${renderPrHistory(detail)}
    </section>

    <section class="panel">
      <h3>DSL conformance</h3>
      <p class="muted">Declared workflow edges stay separate from observed execution edges. Critical path is withheld whenever graph or timing completeness is insufficient.</p>
      ${renderConformance()}
    </section>

    ${artifactPanel}
  `;

  wireDecisionButtons(detail.summary.outputId);
  wireArtifactTabs(detail.artifacts);
  wirePullRequestControls(detail.summary.outputId);
  wireObservabilityControls(detail.summary.outputId);
}

function renderPrSummary(detail: OutputDetail): string {
  const latest = detail.pullRequestSnapshots[0];
  if (!latest || !detail.summary.pullRequestRepo || !detail.summary.pullRequestNumber) {
    return "Placeholder only: no adapter snapshot yet.";
  }

  return `${detail.summary.pullRequestRepo} #${detail.summary.pullRequestNumber} · ${latest.state} · ${latest.checksSummary}`;
}

function renderPullRequestSyncState(detail: OutputDetail): string {
  const status = detail.pullRequestSyncStatus;
  if (!status) {
    return "No sync attempt recorded yet.";
  }

  const canonical = status.canonicalRepository && status.canonicalRepository !== status.repository
    ? ` · canonical ${status.canonicalRepository}`
    : "";
  const reset = status.rateLimitResetAt ? ` · reset ${formatDateTime(status.rateLimitResetAt)}` : "";
  return `${formatLabel(status.syncState)} · ${status.syncMessage}${canonical}${reset}`;
}

function renderActionItems(detail: OutputDetail): string {
  if (detail.actions.length === 0) {
    return `<p class="muted">No follow-up actions recorded.</p>`;
  }

  return `
    <ul class="simple-list">
      ${detail.actions
        .map(
          (action) => `
            <li>
              <strong>${escapeHtml(action.title)}</strong>
              <span class="muted">${escapeHtml(action.owner)} · ${escapeHtml(action.priority)} priority · ${escapeHtml(action.state)}</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderDecisionLedger(detail: OutputDetail): string {
  if (detail.decisions.length === 0) {
    return `<p class="muted">No human decision recorded yet. State is currently ${formatLabel(detail.summary.status)}.</p>`;
  }

  return `
    <ol class="timeline">
      ${detail.decisions
        .map(
          (decision) => `
            <li>
              <div class="timeline__row">
                <span class="pill pill--status pill--${decision.state}">${formatLabel(decision.state)}</span>
                <span class="muted">${escapeHtml(decision.actor)} · ${formatDateTime(decision.occurredAt)}</span>
              </div>
              <p>${escapeHtml(decision.rationale ?? "No rationale captured.")}</p>
            </li>
          `
        )
        .join("")}
    </ol>
  `;
}

function renderCoverage(detail: OutputDetail): string {
  if (detail.telemetryCoverage.length === 0) {
    return `<p class="muted">No coverage assessment recorded yet.</p>`;
  }

  return `
    <ul class="simple-list">
      ${detail.telemetryCoverage
        .map(
          (row) => `
            <li>
              <div class="timeline__row">
                <strong>${escapeHtml(row.signal)}</strong>
                <span class="pill pill--signal pill--${escapeClass(row.status)}">${escapeHtml(row.status)}</span>
              </div>
              <span class="muted">${escapeHtml(row.source)} · ${escapeHtml(row.details)}</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderObservability(detail: OutputDetail): string {
  if (state.observabilityLoading && !state.observability) {
    return `<p class="muted">Loading trace state...</p>`;
  }

  const observability = state.observability;
  const runLink = detail.runLink;

  if (!observability) {
    return `<p class="muted">${runLink?.runId ? "Observability is available to load for this run." : "No linked run found for this output yet."}</p>`;
  }

  const outlineMarkup = observability.outline.length === 0
    ? `<p class="muted">No observed span outline yet.</p>`
    : `<ol class="timeline">${observability.outline.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join("")}</ol>`;

  const treeMarkup = observability.tree.length === 0
    ? `<p class="muted">No parent-child span tree rendered yet.</p>`
    : `<ul class="tree-list">${observability.tree.map(renderObservedTree).join("")}</ul>`;

  const annotationsMarkup = observability.annotations.length === 0
    ? `<p class="muted">No Phoenix annotations or evaluations were returned for this run.</p>`
    : `
      <ul class="simple-list">
        ${observability.annotations.map((annotation) => `
          <li>
            <div class="timeline__row">
              <strong>${escapeHtml(annotation.name)}</strong>
              <span class="muted">${escapeHtml(annotation.label ?? "unlabeled")} · ${escapeHtml(annotation.annotatorKind ?? "unknown annotator")}</span>
            </div>
            <p>${escapeHtml(annotation.explanation ?? "No explanation attached.")}</p>
          </li>
        `).join("")}
      </ul>
    `;

  return `
    <dl class="stacked-list">
      <div><dt>Status</dt><dd>${escapeHtml(observability.message)}</dd></div>
      <div><dt>Project</dt><dd>${escapeHtml(observability.projectName)}</dd></div>
      <div><dt>Run</dt><dd>${escapeHtml(observability.runId ?? runLink?.runId ?? "Not linked")}</dd></div>
      <div><dt>Session</dt><dd>${escapeHtml(observability.sessionId ?? runLink?.sessionId ?? "Not recorded")}</dd></div>
      <div><dt>Trace</dt><dd>${renderLink(observability.traceLink, observability.traceId ?? "Trace unavailable")}</dd></div>
      <div><dt>Root span</dt><dd>${renderLink(observability.spanLink, observability.rootSpanId ?? "Root span unavailable")}</dd></div>
    </dl>
    <div class="panel-grid panel-grid--tight">
      <section class="panel panel--nested">
        <h4>Execution outline</h4>
        ${outlineMarkup}
      </section>
      <section class="panel panel--nested">
        <h4>Span tree</h4>
        ${treeMarkup}
      </section>
    </div>
    <section class="panel panel--nested">
      <h4>Annotations and evaluations</h4>
      ${annotationsMarkup}
    </section>
  `;
}

function renderPrHistory(detail: OutputDetail): string {
  if (detail.pullRequestSnapshots.length === 0) {
    return `<p class="muted">No pull request snapshot cached yet. The adapter issue can wire this later without changing the review model.</p>`;
  }

  return `
    <ol class="timeline">
      ${detail.pullRequestSnapshots
        .map(
          (snapshot) => `
            <li>
              <div class="timeline__row">
                <strong>${escapeHtml(snapshot.repository)} #${snapshot.pullRequestNumber}</strong>
                <span class="muted">${formatDateTime(snapshot.capturedAt)}</span>
              </div>
              <p>${escapeHtml(snapshot.state)} · ${escapeHtml(snapshot.reviewSummary)} · ${escapeHtml(snapshot.checksSummary)} · ${snapshot.commitCount} commits · ${snapshot.fileCount} files</p>
            </li>
          `
        )
        .join("")}
    </ol>
  `;
}

function renderConformance(): string {
  if (state.conformanceLoading && !state.conformance) {
    return `<p class="muted">Loading declared-versus-observed comparison...</p>`;
  }

  const conformance = state.conformance;
  if (!conformance) {
    return `<p class="muted">Conformance has not been loaded for this output yet.</p>`;
  }

  const nodeMarkup = conformance.nodeStates.length === 0
    ? `<p class="muted">No declared node state is available yet.</p>`
    : `
      <ul class="simple-list">
        ${conformance.nodeStates.map((node) => `
          <li>
            <div class="timeline__row">
              <strong>${escapeHtml(node.nodeId)}</strong>
              <span class="pill pill--signal pill--${escapeClass(node.status)}">${escapeHtml(node.status)}</span>
            </div>
            <p>${escapeHtml(node.kind)} · attempts ${node.attemptCount} · latency ${node.latencyMs == null ? "n/a" : `${node.latencyMs}ms`}</p>
            <p class="muted">${escapeHtml(node.missingTelemetry.length ? `Missing telemetry: ${node.missingTelemetry.join(", ")}` : "Required telemetry present for current checks.")}</p>
          </li>
        `).join("")}
      </ul>
    `;

  const declaredEdges = conformance.declaredEdges.length === 0
    ? `<p class="muted">No declared edges loaded.</p>`
    : `
      <ul class="simple-list">
        ${conformance.declaredEdges.map((edge) => `
          <li><strong>${escapeHtml(edge.from)}</strong> → <strong>${escapeHtml(edge.to)}</strong> <span class="muted">(${escapeHtml(edge.meaning)})</span></li>
        `).join("")}
      </ul>
    `;

  const observedEdges = conformance.observedEdges.length === 0
    ? `<p class="muted">No observed execution edges are available yet.</p>`
    : `
      <ul class="simple-list">
        ${conformance.observedEdges.map((edge) => `
          <li><strong>${escapeHtml(edge.fromNodeId ?? "unmapped")}</strong> → <strong>${escapeHtml(edge.toNodeId ?? "unmapped")}</strong> <span class="muted">(${escapeHtml(edge.fromSpanId)} → ${escapeHtml(edge.toSpanId)})</span></li>
        `).join("")}
      </ul>
    `;

  return `
    <dl class="stacked-list">
      <div><dt>Loop</dt><dd>${escapeHtml(`${conformance.loopTitle} · ${conformance.loopId} v${conformance.loopVersion}`)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(conformance.message)}</dd></div>
      <div><dt>Divergence</dt><dd>${escapeHtml(renderDivergenceSummary(conformance))}</dd></div>
      <div><dt>Critical path</dt><dd>${escapeHtml(conformance.criticalPath ? `${conformance.criticalPath.nodeIds.join(" → ")} · ${conformance.criticalPath.totalLatencyMs}ms` : (conformance.criticalPathReason ?? "Not available"))}</dd></div>
    </dl>
    <div class="panel-grid panel-grid--tight">
      <section class="panel panel--nested">
        <h4>Declared workflow edges</h4>
        ${declaredEdges}
      </section>
      <section class="panel panel--nested">
        <h4>Observed execution edges</h4>
        ${observedEdges}
      </section>
    </div>
    <section class="panel panel--nested">
      <h4>Node conformance</h4>
      ${nodeMarkup}
    </section>
  `;
}

function renderObservedTree(node: ObservabilityTreeNode): string {
  const latency = node.latencyMs == null ? "n/a" : `${node.latencyMs}ms`;
  return `
    <li>
      <div class="timeline__row">
        <strong>${escapeHtml(node.label)}</strong>
        <span class="muted">${escapeHtml(node.spanKind)} · ${escapeHtml(node.statusCode)} · ${escapeHtml(latency)}</span>
      </div>
      ${node.children.length ? `<ul class="tree-list">${node.children.map(renderObservedTree).join("")}</ul>` : ""}
    </li>
  `;
}

function renderDivergenceSummary(conformance: DslConformanceSummary): string {
  const parts: string[] = [];
  if (conformance.declaredNotObserved.length > 0) {
    parts.push(`declared not observed: ${conformance.declaredNotObserved.join(", ")}`);
  }
  if (conformance.unmappedSpans.length > 0) {
    parts.push(`unmapped spans: ${conformance.unmappedSpans.map((span) => span.name).join(", ")}`);
  }
  if (conformance.dependencyRecords.length > 0) {
    parts.push(`dependencies: ${conformance.dependencyRecords.map((record) => record.description).join(" | ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No declared-versus-observed divergence detected in the current view.";
}

function renderArtifactPanel(artifact: ArtifactRecord): string {
  const jsonData = artifact.jsonContent;
  const jsonString = JSON.stringify(jsonData, null, 2);
  const tableRows = createTableRows(jsonData, state.artifactPathFilter);
  const treeMarkup = renderTreeNode(jsonData, "$", state.artifactPathFilter);

  return `
    <section class="panel artifact-panel">
      <div class="artifact-panel__header">
        <div>
          <h3>${escapeHtml(artifact.label)}</h3>
          <p class="muted">${escapeHtml(artifact.sourceLabel)} · ${escapeHtml(artifact.sourceKind)} · captured ${formatDateTime(artifact.capturedAt)}</p>
        </div>
        <div class="artifact-panel__controls">
          <label class="field field--inline">
            <span>Artifact</span>
            <select data-role="artifact-select">
              ${(state.data?.selectedOutput?.artifacts ?? [])
                .map(
                  (item) => `
                    <option value="${item.artifactId}" ${item.artifactId === artifact.artifactId ? "selected" : ""}>${escapeHtml(item.label)}</option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label class="field field--inline">
            <span>Path filter</span>
            <input type="text" data-role="artifact-filter" value="${escapeHtml(state.artifactPathFilter)}" placeholder="$.next_actions" />
          </label>
        </div>
      </div>
      <dl class="stacked-list">
        <div><dt>Schema</dt><dd>${escapeHtml(artifact.schemaId ?? "No schema attached")}</dd></div>
        <div><dt>Validation</dt><dd>${escapeHtml(formatLabel(artifact.validationStatus))} · ${escapeHtml(artifact.validationDetails ?? "No validation details available")}</dd></div>
        <div><dt>Provenance</dt><dd>${escapeHtml(`${artifact.sourceKind} · ${artifact.sourceLabel}`)}</dd></div>
        <div><dt>Transform</dt><dd>${escapeHtml(artifact.transformationLabel ?? "Raw evidence")}</dd></div>
        <div><dt>Missingness</dt><dd>${artifact.missingness.length ? artifact.missingness.map(escapeHtml).join(", ") : "None"}</dd></div>
        <div><dt>Deep link</dt><dd>${escapeHtml(`#${buildArtifactHash(artifact.artifactId)}`)}</dd></div>
      </dl>
      <div class="tab-row">
        ${["compact", "table", "tree", "raw"]
          .map(
            (view) => `
              <button class="tab ${state.artifactView === view ? "is-active" : ""}" data-artifact-view="${view}">${formatLabel(view)}</button>
            `
          )
          .join("")}
      </div>
      <div class="artifact-view">
        ${
          state.artifactView === "compact"
            ? renderCompactArtifact(jsonData)
            : state.artifactView === "table"
              ? `<table class="json-table"><thead><tr><th>Path</th><th>Value</th></tr></thead><tbody>${tableRows}</tbody></table>`
              : state.artifactView === "tree"
                ? `<div class="json-tree">${treeMarkup}</div>`
                : `<pre class="json-raw"><code>${escapeHtml(jsonString)}</code></pre>`
        }
      </div>
    </section>
  `;
}

function renderCompactArtifact(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return `<p class="muted">Compact view requires a JSON object.</p>`;
  }

  const objectData = data as Record<string, unknown>;
  return `
    <div class="compact-grid">
      ${Object.entries(objectData)
        .map(
          ([key, value]) => `
            <article class="compact-card">
              <h4>${escapeHtml(key)}</h4>
              <p>${escapeHtml(formatValue(value))}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function createTableRows(data: unknown, filter: string): string {
  const rows = flattenJson(data);
  const filteredRows = filter.trim() ? rows.filter((row) => row.path.includes(filter.trim())) : rows;

  if (filteredRows.length === 0) {
    return `<tr><td colspan="2">No JSON paths matched the current filter.</td></tr>`;
  }

  return filteredRows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.path)}</td>
          <td>${escapeHtml(row.value)}</td>
        </tr>
      `
    )
    .join("");
}

function flattenJson(value: unknown, path = "$"): Array<{ path: string; value: string }> {
  if (value === null || typeof value !== "object") {
    return [{ path, value: formatValue(value) }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenJson(item, `${path}[${index}]`));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nextValue]) =>
    flattenJson(nextValue, `${path}.${key}`)
  );
}

function renderTreeNode(value: unknown, path: string, filter: string): string {
  const normalizedFilter = filter.trim();
  if (normalizedFilter && !path.includes(normalizedFilter) && typeof value !== "object") {
    return "";
  }

  if (value === null || typeof value !== "object") {
    return `<div class="tree-node"><span class="tree-path">${escapeHtml(path)}</span><span>${escapeHtml(formatValue(value))}</span></div>`;
  }

  if (Array.isArray(value)) {
    const children = value
      .map((item, index) => renderTreeNode(item, `${path}[${index}]`, filter))
      .filter(Boolean)
      .join("");
    if (!children) {
      return "";
    }
    return `<details class="tree-branch" open><summary>${escapeHtml(path)} <span class="muted">[${value.length}]</span></summary>${children}</details>`;
  }

  const childEntries = Object.entries(value as Record<string, unknown>)
    .map(([key, child]) => renderTreeNode(child, `${path}.${key}`, filter))
    .filter(Boolean)
    .join("");

  if (!childEntries && normalizedFilter && !path.includes(normalizedFilter)) {
    return "";
  }

  return `<details class="tree-branch" open><summary>${escapeHtml(path)}</summary>${childEntries}</details>`;
}

function wireDecisionButtons(outputId: string): void {
  document.querySelectorAll<HTMLButtonElement>("[data-decision-state]").forEach((button) => {
    button.addEventListener("click", async () => {
      const actorInput = document.querySelector<HTMLInputElement>("#actorName");
      const rationaleInput = document.querySelector<HTMLTextAreaElement>("#rationale");
      const actorName = actorInput?.value.trim() || "ptw1255";
      const rationale = rationaleInput?.value.trim() || null;
      const stateValue = button.dataset.decisionState as DecisionState;

      setStatus(`Recording ${formatLabel(stateValue)}...`);

      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outputId,
          state: stateValue,
          rationale,
          actorName
        })
      });

      const payload = (await response.json()) as DashboardData | { error: string };
      if (!response.ok || "error" in payload) {
        state.errorText = "error" in payload ? payload.error : "Decision request failed.";
        render();
        return;
      }

      state.data = payload;
      state.selectedOutputId = payload.selectedOutput?.summary.outputId ?? null;
      state.selectedArtifactId = payload.selectedOutput?.artifacts[0]?.artifactId ?? null;
      state.errorText = "";
      setStatus(`Decision recorded ${formatDateTime(payload.generatedAt)}`);
      render();
    });
  });
}

function wirePullRequestControls(outputId: string): void {
  const syncButton = document.querySelector<HTMLButtonElement>("[data-action=sync-pr]");
  syncButton?.addEventListener("click", () => {
    void syncPullRequest(outputId, false);
  });

  const linkButton = document.querySelector<HTMLButtonElement>("[data-action=link-pr]");
  linkButton?.addEventListener("click", async () => {
    const repositoryInput = document.querySelector<HTMLInputElement>("#pullRequestRepo");
    const numberInput = document.querySelector<HTMLInputElement>("#pullRequestNumber");
    const repository = repositoryInput?.value.trim() ?? "";
    const pullRequestNumber = Number(numberInput?.value ?? "");

    setStatus("Linking pull request...");

    const response = await fetch("/api/pull-requests/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outputId, repository, pullRequestNumber })
    });
    const payload = (await response.json()) as DashboardData | { error: string };
    if (!response.ok || "error" in payload) {
      state.errorText = "error" in payload ? payload.error : "Pull request link failed.";
      render();
      return;
    }

    state.data = payload;
    state.selectedOutputId = payload.selectedOutput?.summary.outputId ?? null;
    state.errorText = "";
    setStatus("Pull request link recorded.");
    render();
    schedulePullRequestPolling();
  });
}

function wireObservabilityControls(outputId: string): void {
  const refreshButton = document.querySelector<HTMLButtonElement>("[data-action=refresh-observability]");
  refreshButton?.addEventListener("click", () => {
    void loadObservability(outputId, false);
    void loadConformance(outputId, false);
  });

  const demoButton = document.querySelector<HTMLButtonElement>("[data-action=demo-trace]");
  demoButton?.addEventListener("click", async () => {
    setStatus("Running traced demo loop...");

    const response = await fetch("/api/observability/demo-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outputId })
    });
    const payload = (await response.json()) as
      | { dashboard: DashboardData; observability: ObservabilitySummary }
      | { error: string };

    if (!response.ok || "error" in payload) {
      state.observability = {
        available: false,
        message: "error" in payload ? payload.error : "Demo trace request failed.",
        projectName: "agentic-loop-observability-dashboard",
        traceId: null,
        rootSpanId: null,
        runId: null,
        sessionId: null,
        traceLink: null,
        spanLink: null,
        spans: [],
        outline: [],
        tree: [],
        annotations: []
      };
      render();
      return;
    }

    state.data = payload.dashboard;
    state.selectedOutputId = payload.dashboard.selectedOutput?.summary.outputId ?? null;
    state.selectedArtifactId = payload.dashboard.selectedOutput?.artifacts[0]?.artifactId ?? null;
    state.observability = payload.observability;
    state.errorText = "";
    setStatus(`Demo trace recorded ${formatDateTime(payload.dashboard.generatedAt)}`);
    render();
    void loadConformance(outputId, true);
  });
}

function wireArtifactTabs(artifacts: ArtifactRecord[]): void {
  document.querySelectorAll<HTMLButtonElement>("[data-artifact-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.artifactView = button.dataset.artifactView as typeof state.artifactView;
      updateHash();
      render();
    });
  });

  const artifactSelect = document.querySelector<HTMLSelectElement>("[data-role=artifact-select]");
  artifactSelect?.addEventListener("change", () => {
    state.selectedArtifactId = artifactSelect.value;
    updateHash();
    render();
  });

  const artifactFilter = document.querySelector<HTMLInputElement>("[data-role=artifact-filter]");
  artifactFilter?.addEventListener("input", () => {
    state.artifactPathFilter = artifactFilter.value;
    updateHash();
    render();
  });

  if (!state.selectedArtifactId && artifacts[0]) {
    state.selectedArtifactId = artifacts[0].artifactId;
  }
}

function updateHash(): void {
  window.location.hash = buildArtifactHash(state.selectedArtifactId);
}

function buildArtifactHash(selectedArtifactId: string | null): string {
  const params = new URLSearchParams();
  if (state.selectedOutputId) {
    params.set("output", state.selectedOutputId);
  }
  if (selectedArtifactId) {
    params.set("artifact", selectedArtifactId);
  }
  params.set("view", state.artifactView);
  if (state.artifactPathFilter) {
    params.set("path", state.artifactPathFilter);
  }
  return params.toString();
}

function loadHashState(): void {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  state.selectedOutputId = params.get("output");
  state.selectedArtifactId = params.get("artifact");
  state.artifactView = (params.get("view") as typeof state.artifactView) || "compact";
  state.artifactPathFilter = params.get("path") || "";
}

function schedulePullRequestPolling(): void {
  if (pollingHandle !== null) {
    window.clearInterval(pollingHandle);
    pollingHandle = null;
  }

  const detail = state.data?.selectedOutput;
  if (!detail?.summary.pullRequestRepo || !detail.summary.pullRequestNumber) {
    return;
  }

  const shouldSyncImmediately =
    !detail.pullRequestSyncStatus ||
    !detail.pullRequestSyncStatus.lastSuccessfulAt ||
    Date.now() - new Date(detail.pullRequestSyncStatus.lastSuccessfulAt).getTime() > 5 * 60 * 1000;

  if (shouldSyncImmediately) {
    void syncPullRequest(detail.summary.outputId, true);
  }

  pollingHandle = window.setInterval(() => {
    void syncPullRequest(detail.summary.outputId, true);
  }, 60_000);
}

async function syncPullRequest(outputId: string, background: boolean): Promise<void> {
  if (syncInFlight) {
    return;
  }

  syncInFlight = true;
  if (!background) {
    setStatus("Syncing pull request from local GitHub CLI...");
  }

  try {
    const response = await fetch("/api/pull-requests/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outputId })
    });
    const payload = (await response.json()) as DashboardData | { error: string };
    if (!response.ok || "error" in payload) {
      state.errorText = "error" in payload ? payload.error : "Pull request sync failed.";
      render();
      return;
    }

    state.data = payload;
    state.selectedOutputId = payload.selectedOutput?.summary.outputId ?? null;
    state.errorText = "";
    if (!background) {
      setStatus(`Pull request sync updated ${formatDateTime(payload.generatedAt)}`);
    } else {
      setStatus(`Background sync refreshed ${formatDateTime(payload.generatedAt)}`);
    }
    render();
  } finally {
    syncInFlight = false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeClass(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function renderLink(href: string | null, label: string): string {
  if (!href) {
    return escapeHtml(label);
  }

  return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

async function exportState(): Promise<void> {
  const response = await fetch("/api/export");
  const data = await response.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "agentic-loop-observability-export.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function restoreState(file: File): Promise<void> {
  const text = await file.text();
  const payload = JSON.parse(text);
  const response = await fetch("/api/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as DashboardData | { error: string };
  if (!response.ok || "error" in data) {
    state.errorText = "error" in data ? data.error : "Restore failed.";
    render();
    return;
  }

  state.data = data;
  state.selectedOutputId = data.selectedOutput?.summary.outputId ?? null;
  state.selectedArtifactId = data.selectedOutput?.artifacts[0]?.artifactId ?? null;
  state.errorText = "";
  setStatus(`Restore complete ${formatDateTime(data.generatedAt)}`);
  render();
}

elements.exportButton?.addEventListener("click", () => {
  void exportState();
});

elements.restoreInput?.addEventListener("change", () => {
  const file = elements.restoreInput?.files?.[0];
  if (file) {
    void restoreState(file);
  }
});

window.addEventListener("hashchange", () => {
  loadHashState();
  void loadDashboard(state.selectedOutputId ?? undefined);
});

loadHashState();
void loadDashboard(state.selectedOutputId ?? undefined);
