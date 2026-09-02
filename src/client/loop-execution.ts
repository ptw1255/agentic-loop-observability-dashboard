type ExecutionWindow = "1h" | "24h" | "7d" | "all";
type FocusFilter = "all" | "attention" | "errors" | "degraded" | "slow";

interface LoopExecutionRun {
  runId: string;
  outputId: string;
  title: string;
  outputStatus: string;
  updatedAt: string;
  creator: string;
  durationMs: number | null;
  spanCount: number;
  errorSpanCount: number;
  traceState: "observed" | "degraded" | "not_linked";
  traceId: string | null;
  rootSpanId: string | null;
  actionCount: number;
  staleReason: string | null;
  attention: boolean;
}

interface LoopExecutionDetail extends LoopExecutionRun {
  sessionId: string | null;
  projectName: string;
  message: string;
  outline: string[];
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
  annotations: Array<{
    spanId: string;
    name: string;
    annotatorKind: string | null;
    label: string | null;
    score: number | null;
    explanation: string | null;
  }>;
  conformance: {
    available: boolean;
    message: string;
    loopId: string;
    loopVersion: string;
    loopTitle: string;
    nodeStates: Array<{
      nodeId: string;
      title: string;
      kind: string;
      observed: boolean;
      attemptCount: number;
      status: "ok" | "error" | "missing";
      latencyMs: number | null;
      missingTelemetry: string[];
    }>;
    declaredNotObserved: string[];
    criticalPath: { nodeIds: string[]; totalLatencyMs: number } | null;
    criticalPathReason: string | null;
  };
}

interface LoopExecutionData {
  generatedAt: string;
  window: ExecutionWindow;
  windowLabel: string;
  windowStart: string | null;
  summary: {
    runsRecorded: number;
    runsWithObservedTrace: number;
    runsWithErrors: number;
    attentionRuns: number;
    traceCoveragePercentage: number | null;
    medianDurationMs: number | null;
  };
  runs: LoopExecutionRun[];
  selectedRun: LoopExecutionDetail | null;
}

const state = {
  data: null as LoopExecutionData | null,
  window: readWindow(),
  selectedOutputId: new URLSearchParams(window.location.search).get("outputId"),
  focus: "all" as FocusFilter,
  loading: false,
  error: ""
};

const content = document.querySelector<HTMLElement>('[data-role="execution-content"]');
const status = document.querySelector<HTMLElement>('[data-role="execution-status"]');

async function loadData(): Promise<void> {
  state.loading = true;
  state.error = "";
  if (status) {
    status.textContent = "Refreshing run history...";
  }
  render();

  try {
    const params = new URLSearchParams({ window: state.window });
    if (state.selectedOutputId) {
      params.set("outputId", state.selectedOutputId);
    }
    const response = await fetch(`/api/loop-execution?${params.toString()}`);
    const payload = (await response.json()) as LoopExecutionData | { error: string };
    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : `Loop execution request failed with ${response.status}`);
    }

    state.data = payload;
    state.selectedOutputId = payload.selectedRun?.outputId ?? null;
    if (status) {
      status.textContent = `${payload.windowLabel} · updated ${formatDateTime(payload.generatedAt)}`;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Loop execution request failed.";
    if (status) {
      status.textContent = "Run history unavailable.";
    }
  } finally {
    state.loading = false;
    updateUrl();
    render();
  }
}

function render(): void {
  if (!content) {
    return;
  }

  if (state.error) {
    content.innerHTML = `<section class="panel panel--error"><h2>Run history unavailable</h2><p>${escapeHtml(state.error)}</p></section>`;
    return;
  }

  if (state.loading && !state.data) {
    content.innerHTML = `<section class="panel"><p class="muted">Loading run history...</p></section>`;
    return;
  }

  const data = state.data;
  if (!data) {
    return;
  }

  const filteredRuns = filterRuns(data.runs);
  content.innerHTML = `
    <section class="execution-kpis" aria-label="Execution KPIs">
      ${renderKpi("all", "Runs recorded", data.summary.runsRecorded, data.windowLabel)}
      ${renderKpi("attention", "Needs attention", data.summary.attentionRuns, "errors, degraded, or stale")}
      ${renderKpi("errors", "Runs with errors", data.summary.runsWithErrors, "one or more error spans")}
      ${renderKpi("degraded", "Trace coverage", data.summary.traceCoveragePercentage == null ? "n/a" : `${data.summary.traceCoveragePercentage}%`, "observed spans in window")}
      ${renderKpi("slow", "Median duration", formatDuration(data.summary.medianDurationMs), "click to isolate slow runs")}
      ${renderKpi("all", "Observed traces", data.summary.runsWithObservedTrace, "runs with queryable spans")}
    </section>

    <section class="execution-health">
      <div>
        <h2>Run health · ${escapeHtml(data.windowLabel)}</h2>
        <p class="muted">Select a KPI or run marker to narrow the table and inspect the cause.</p>
      </div>
      <div class="health-strip" aria-label="Recent run health">
        ${data.runs.slice(0, 24).map((run) => `
          <button class="health-mark health-mark--${healthClass(run)} ${run.outputId === state.selectedOutputId ? "is-selected" : ""}" data-run-output-id="${escapeHtml(run.outputId)}" title="${escapeHtml(run.title)} · ${escapeHtml(runStateLabel(run))}"></button>
        `).join("") || `<span class="muted">No runs in this time window.</span>`}
      </div>
    </section>

    <section class="execution-grid">
      <section class="panel execution-table">
        <div class="execution-table__header">
          <div>
            <h2>Runs</h2>
            <p class="muted">${filteredRuns.length} shown of ${data.runs.length} recorded · click a row to open command detail</p>
          </div>
          <span class="muted">Window: ${escapeHtml(data.windowLabel)}</span>
        </div>
        ${renderRunTable(filteredRuns, data)}
      </section>
      ${renderRunDetail(data.selectedRun)}
    </section>
  `;

  wireInteractions();
}

function renderKpi(focus: FocusFilter, label: string, value: string | number, detail: string): string {
  const active = state.focus === focus || (focus === "all" && state.focus === "all");
  return `
    <button class="execution-kpi ${active ? "is-active" : ""}" data-focus="${focus}">
      <span>${label}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${detail}</small>
    </button>
  `;
}

function renderRunTable(runs: LoopExecutionRun[], data: LoopExecutionData): string {
  if (runs.length === 0) {
    return `<p class="run-detail__empty">No runs match this focus and time window.</p>`;
  }

  return `
    <div class="table-wrap">
      <table class="output-table run-table">
        <thead>
          <tr>
            <th scope="col">Started</th>
            <th scope="col">Output</th>
            <th scope="col">Result</th>
            <th scope="col">Took</th>
            <th scope="col">Trace</th>
            <th scope="col">Errors</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${runs.map((run) => `
            <tr class="${run.outputId === data.selectedRun?.outputId ? "is-selected" : ""}">
              <td>${formatDateTime(run.updatedAt)}</td>
              <td>
                <button class="run-table__link" data-run-output-id="${escapeHtml(run.outputId)}">
                  <strong>${escapeHtml(run.title)}</strong>
                  <span>${escapeHtml(run.runId)}</span>
                </button>
              </td>
              <td><span class="run-state run-state--${runStateClass(run)}">${escapeHtml(runStateLabel(run))}</span></td>
              <td>${formatDuration(run.durationMs)}</td>
              <td><span class="run-state run-state--${run.traceState}">${escapeHtml(run.traceState)}</span></td>
              <td>${run.errorSpanCount}</td>
              <td>${run.actionCount}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRunDetail(run: LoopExecutionDetail | null): string {
  if (!run) {
    return `<aside class="panel run-detail"><h2>Run detail</h2><p class="run-detail__empty">Select a run to inspect its trace, span flow, and DSL conformance.</p></aside>`;
  }

  const conformance = run.conformance;
  const nodeStates = conformance.nodeStates.length === 0
    ? `<p class="run-detail__empty">No declared node comparison is available.</p>`
    : `<ul class="execution-list">${conformance.nodeStates.map((node) => `
        <li><strong>${escapeHtml(node.nodeId)}</strong><span class="run-state run-state--${node.status}">${escapeHtml(node.status)} · ${node.attemptCount} attempts · ${formatDuration(node.latencyMs)}</span></li>
      `).join("")}</ul>`;

  const spanRows = run.spans.length === 0
    ? `<p class="run-detail__empty">No observed spans. Trace state is ${escapeHtml(run.traceState)}.</p>`
    : `<div class="table-wrap"><table class="json-table"><thead><tr><th>Span</th><th>Kind</th><th>Status</th><th>Latency</th><th>DSL node</th></tr></thead><tbody>${run.spans.map((span) => `
        <tr><td>${escapeHtml(span.name)}</td><td>${escapeHtml(span.spanKind)}</td><td>${escapeHtml(span.statusCode)}</td><td>${formatDuration(span.latencyMs)}</td><td>${escapeHtml(readAttribute(span.attributes, "alo.dsl.node_id") ?? "unmapped")}</td></tr>
      `).join("")}</tbody></table></div>`;

  const traceLinks = [
    run.traceId ? `<a href="${escapeHtml(buildPhoenixLink("traces", run.traceId))}" target="_blank" rel="noreferrer">Open trace</a>` : "",
    run.rootSpanId ? `<a href="${escapeHtml(buildPhoenixLink("spans", run.rootSpanId))}" target="_blank" rel="noreferrer">Open root span</a>` : ""
  ].filter(Boolean).join(" · ");

  return `
    <aside class="panel run-detail" id="run-detail">
      <div class="run-detail__header">
        <div><h2>${escapeHtml(run.title)}</h2><p class="muted">${escapeHtml(run.runId)}</p></div>
        <a href="/#output=${encodeURIComponent(run.outputId)}">Open output review</a>
      </div>
      <div class="run-detail__summary">
        <div><span>Result</span><strong class="run-state run-state--${runStateClass(run)}">${escapeHtml(runStateLabel(run))}</strong></div>
        <div><span>Duration</span><strong>${formatDuration(run.durationMs)}</strong></div>
        <div><span>Errors</span><strong>${run.errorSpanCount}</strong></div>
      </div>
      <dl class="stacked-list">
        <div><dt>Trace status</dt><dd>${escapeHtml(run.message)}</dd></div>
        <div><dt>Project</dt><dd>${escapeHtml(run.projectName)}</dd></div>
        <div><dt>Session</dt><dd>${escapeHtml(run.sessionId ?? "Not recorded")}</dd></div>
        <div><dt>Trace links</dt><dd>${traceLinks || "Not available"}</dd></div>
      </dl>
      <section class="run-detail__section"><h3>Execution outline</h3>${run.outline.length ? `<ol class="timeline">${run.outline.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : `<p class="run-detail__empty">No outline returned.</p>`}</section>
      <section class="run-detail__section"><h3>Observed spans</h3>${spanRows}</section>
      <section class="run-detail__section"><h3>DSL conformance</h3><p class="muted">${escapeHtml(conformance.message)}</p>${conformance.criticalPath ? `<p><strong>Critical path:</strong> ${escapeHtml(conformance.criticalPath.nodeIds.join(" → "))} · ${formatDuration(conformance.criticalPath.totalLatencyMs)}</p>` : `<p class="run-detail__empty">${escapeHtml(conformance.criticalPathReason ?? "Critical path unavailable")}</p>`}${nodeStates}</section>
      <section class="run-detail__section"><h3>Annotations</h3>${run.annotations.length ? `<ul class="execution-list">${run.annotations.map((annotation) => `<li><strong>${escapeHtml(annotation.name)}</strong><span>${escapeHtml(annotation.label ?? "unlabeled")} · ${escapeHtml(annotation.explanation ?? "No explanation")}</span></li>`).join("")}</ul>` : `<p class="run-detail__empty">No annotations returned for this run.</p>`}</section>
    </aside>
  `;
}

function filterRuns(runs: LoopExecutionRun[]): LoopExecutionRun[] {
  const medianValue = state.data?.summary.medianDurationMs;
  switch (state.focus) {
    case "attention": return runs.filter((run) => run.attention);
    case "errors": return runs.filter((run) => run.errorSpanCount > 0);
    case "degraded": return runs.filter((run) => run.traceState !== "observed");
    case "slow": return runs.filter((run) => medianValue != null && run.durationMs != null && run.durationMs > medianValue * 1.5);
    default: return runs;
  }
}

function wireInteractions(): void {
  content?.querySelectorAll<HTMLButtonElement>("[data-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      state.focus = button.dataset.focus as FocusFilter;
      render();
    });
  });

  content?.querySelectorAll<HTMLButtonElement>("[data-run-output-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedOutputId = button.dataset.runOutputId ?? null;
      updateUrl();
      void loadData();
    });
  });
}

document.querySelectorAll<HTMLAnchorElement>("[data-window]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    state.window = link.dataset.window as ExecutionWindow;
    state.selectedOutputId = null;
    state.focus = "all";
    updateUrl();
    void loadData();
  });
});

function updateUrl(): void {
  const params = new URLSearchParams({ window: state.window });
  if (state.selectedOutputId) {
    params.set("outputId", state.selectedOutputId);
  }
  window.history.replaceState(null, "", `?${params.toString()}`);
  document.querySelectorAll<HTMLAnchorElement>("[data-window]").forEach((link) => {
    link.classList.toggle("viewbar__link--active", link.dataset.window === state.window);
  });
}

function readWindow(): ExecutionWindow {
  const value = new URLSearchParams(window.location.search).get("window");
  return value === "1h" || value === "24h" || value === "7d" || value === "all" ? value : "24h";
}

function healthClass(run: LoopExecutionRun): string {
  if (run.errorSpanCount > 0) return "problem";
  if (run.traceState !== "observed") return "degraded";
  return "observed";
}

function runStateClass(run: LoopExecutionRun): string {
  if (run.errorSpanCount > 0) return "problem";
  return run.outputStatus;
}

function runStateLabel(run: LoopExecutionRun): string {
  if (run.errorSpanCount > 0) return "Problem";
  return formatLabel(run.outputStatus);
}

function readAttribute(attributes: Record<string, unknown>, key: string): string | null {
  const value = attributes[key];
  return typeof value === "string" ? value : null;
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds == null) return "n/a";
  if (milliseconds >= 60_000) return `${(milliseconds / 60_000).toFixed(1)}m`;
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  return `${milliseconds}ms`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildPhoenixLink(kind: "traces" | "spans", id: string): string {
  return `http://localhost:6006/redirects/${kind}/${encodeURIComponent(id)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

void loadData();
