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
}

interface OutputDetail {
  summary: OutputListItem;
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
    setStatus(`Local snapshot refreshed ${formatDateTime(state.data.generatedAt)}`);
    render();
    schedulePullRequestPolling();
  } catch (error) {
    state.errorText = error instanceof Error ? error.message : "Unknown load error";
    setStatus("Unable to load local dashboard state.");
    render();
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
        <h3>Telemetry coverage</h3>
        ${renderCoverage(detail)}
      </section>

      <section class="panel">
        <h3>Observed PR history</h3>
        ${renderPrHistory(detail)}
      </section>
    </section>

    ${artifactPanel}
  `;

  wireDecisionButtons(detail.summary.outputId);
  wireArtifactTabs(detail.artifacts);
  wirePullRequestControls(detail.summary.outputId);
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
        <div><dt>Transform</dt><dd>${escapeHtml(artifact.transformationLabel ?? "Raw evidence")}</dd></div>
        <div><dt>Missingness</dt><dd>${artifact.missingness.length ? artifact.missingness.map(escapeHtml).join(", ") : "None"}</dd></div>
        <div><dt>Deep link</dt><dd>#output=${escapeHtml(state.selectedOutputId ?? "")}&artifact=${escapeHtml(artifact.artifactId)}&view=${state.artifactView}</dd></div>
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
  const params = new URLSearchParams();
  if (state.selectedOutputId) {
    params.set("output", state.selectedOutputId);
  }
  if (state.selectedArtifactId) {
    params.set("artifact", state.selectedArtifactId);
  }
  params.set("view", state.artifactView);
  if (state.artifactPathFilter) {
    params.set("path", state.artifactPathFilter);
  }
  window.location.hash = params.toString();
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
