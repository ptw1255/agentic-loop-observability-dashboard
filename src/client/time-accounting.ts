import type {
  EvidenceState,
  TimeAccountingData,
  TimeAccountingMetric,
  TimeAccountingRun,
  TimeAccountingSpan
} from "../types.js";

type SpanFilter = "all" | "model" | "tool" | "orchestration" | "evaluation" | "other" | "queue_wait" | "errors";

const state = {
  data: null as TimeAccountingData | null,
  window: readWindow(),
  selectedOutputId: new URLSearchParams(window.location.search).get("outputId"),
  spanFilter: "all" as SpanFilter,
  loading: false,
  error: ""
};

const content = document.querySelector<HTMLElement>('[data-role="accounting-content"]');
const status = document.querySelector<HTMLElement>('[data-role="accounting-status"]');

async function loadData(): Promise<void> {
  state.loading = true;
  state.error = "";
  if (status) status.textContent = "Refreshing span accounting...";
  render();

  try {
    const params = new URLSearchParams({ window: state.window });
    if (state.selectedOutputId) params.set("outputId", state.selectedOutputId);
    const response = await fetch(`/api/time-accounting?${params.toString()}`);
    const payload = (await response.json()) as TimeAccountingData | { error: string };
    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : `Time accounting request failed with ${response.status}`);
    }
    state.data = payload;
    state.selectedOutputId = payload.selectedRun?.outputId ?? null;
    if (status) status.textContent = `${payload.windowLabel} · updated ${formatDateTime(payload.generatedAt)}`;
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Time accounting request failed.";
    if (status) status.textContent = "Span accounting unavailable.";
  } finally {
    state.loading = false;
    updateUrl();
    render();
  }
}

function render(): void {
  if (!content) return;
  if (state.error) {
    content.innerHTML = `<section class="panel panel--error"><h2>Time accounting unavailable</h2><p>${escapeHtml(state.error)}</p></section>`;
    return;
  }
  if (state.loading && !state.data) {
    content.innerHTML = `<section class="panel"><p class="muted">Loading span accounting...</p></section>`;
    return;
  }
  if (!state.data) return;

  const data = state.data;
  content.innerHTML = `
    <section class="accounting-intro">
      <div>
        <p class="eyebrow">Execution cost model</p>
        <h2>Where did the loop spend its time?</h2>
        <p class="lede">Exclusive intervals separate model, tool, evaluator, and orchestration work without counting nested spans twice. Select a run to inspect the evidence behind each number.</p>
      </div>
      <div class="accounting-intro__note">
        <strong>Evidence rule</strong>
        <span>Queue and wait time stays visible as not instrumented until the runtime emits an explicit wait span.</span>
      </div>
    </section>

    <section class="accounting-kpis" aria-label="Time accounting KPIs">
      ${renderKpi("Wall clock", data.summary.wallClock, "median / p95")}
      ${renderKpi("Model", data.summary.model, "exclusive span time")}
      ${renderKpi("Tools", data.summary.tool, "exclusive span time")}
      ${renderKpi("Orchestration", data.summary.orchestration, "agent and chain time")}
      ${renderKpi("Evaluations", data.summary.evaluation, "evaluator span time")}
      ${renderKpi("Unaccounted", data.summary.unaccounted, "after measured intervals")}
    </section>

    <section class="panel accounting-breakdown">
      <div class="section-heading">
        <div><h2>Time breakdown</h2><p class="muted">${data.runs.length} runs · totals are for ${escapeHtml(data.windowLabel)} · values are milliseconds</p></div>
        <span class="evidence-state evidence-state--${stateClass(data.summary.wallClock.state)}">${escapeHtml(stateLabel(data.summary.wallClock.state))}</span>
      </div>
      ${renderBreakdownTable(data)}
    </section>

    <section class="panel accounting-runs">
      <div class="section-heading">
        <div><h2>Runs</h2><p class="muted">Select a row to inspect span accounting and timing evidence.</p></div>
        <span class="muted">${data.summary.runsWithCompleteTiming} of ${data.summary.runsRecorded} complete timing</span>
      </div>
      ${renderRunTable(data.runs, data.selectedRun?.outputId ?? null)}
    </section>

    ${renderRunDetail(data.selectedRun)}
  `;
  wireInteractions();
}

function renderKpi(label: string, metric: TimeAccountingMetric, detail: string): string {
  return `<div class="accounting-kpi"><span>${label}</span><strong>${formatDuration(metric.medianMs)}</strong><small>${detail} · ${escapeHtml(stateLabel(metric.state))}</small></div>`;
}

function renderBreakdownTable(data: TimeAccountingData): string {
  const rows: Array<[string, TimeAccountingMetric, string]> = [
    ["Wall clock", data.summary.wallClock, "Root span duration"],
    ["Model", data.summary.model, "LLM spans"],
    ["Tools", data.summary.tool, "TOOL spans"],
    ["Orchestration", data.summary.orchestration, "AGENT and CHAIN spans"],
    ["Evaluations", data.summary.evaluation, "EVALUATOR spans"],
    ["Other", data.summary.other, "Other measured span kinds"],
    ["Accounted execution", data.summary.accounted, "Union of exclusive measured intervals"],
    ["Unaccounted", data.summary.unaccounted, "Wall clock minus accounted and explicit wait"],
    ["Queue / wait", data.summary.queueWait, "Requires explicit wait telemetry"]
  ];
  return `<div class="table-wrap"><table class="output-table accounting-table"><thead><tr><th>Category</th><th>Definition</th><th>Median</th><th>P95</th><th>Total</th><th>Runs</th><th>Evidence</th></tr></thead><tbody>${rows.map(([label, metric, definition]) => `
    <tr><td><strong>${label}</strong></td><td>${definition}</td><td>${formatDuration(metric.medianMs)}</td><td>${formatDuration(metric.p95Ms)}</td><td>${formatDuration(metric.totalMs)}</td><td>${metric.runCount}/${data.runs.length}</td><td><span class="evidence-state evidence-state--${stateClass(metric.state)}">${escapeHtml(stateLabel(metric.state))}</span></td></tr>
  `).join("")}</tbody></table></div>`;
}

function renderRunTable(runs: TimeAccountingRun[], selectedOutputId: string | null): string {
  if (runs.length === 0) return `<p class="run-detail__empty">No runs in this time window.</p>`;
  return `<div class="table-wrap"><table class="output-table accounting-run-table"><thead><tr><th>Started</th><th>Output</th><th>Wall clock</th><th>Model</th><th>Tools</th><th>Orchestration</th><th>Eval</th><th>Unaccounted</th><th>Evidence</th></tr></thead><tbody>${runs.map((run) => `
    <tr class="${run.outputId === selectedOutputId ? "is-selected" : ""}">
      <td>${formatDateTime(run.updatedAt)}</td>
      <td><button class="accounting-run-link" data-run-output-id="${escapeHtml(run.outputId)}"><strong>${escapeHtml(run.title)}</strong><span>${escapeHtml(run.runId)}</span></button></td>
      <td>${formatDuration(run.breakdown.wallClockMs)}</td><td>${formatDuration(run.breakdown.modelMs)}</td><td>${formatDuration(run.breakdown.toolMs)}</td><td>${formatDuration(run.breakdown.orchestrationMs)}</td><td>${formatDuration(run.breakdown.evaluationMs)}</td><td>${formatDuration(run.breakdown.unaccountedMs)}</td>
      <td><span class="evidence-state evidence-state--${stateClass(run.breakdown.state)}">${escapeHtml(stateLabel(run.breakdown.state))}</span><span class="accounting-table__subtext">${run.spanCount} spans · ${run.errorSpanCount} errors</span></td>
    </tr>
  `).join("")}</tbody></table></div>`;
}

function renderRunDetail(run: TimeAccountingRun | null): string {
  if (!run) return `<section class="panel"><h2>Run detail</h2><p class="run-detail__empty">Select a run to inspect its span timing.</p></section>`;
  const filteredSpans = run.spans.filter((span) => state.spanFilter === "all" || (state.spanFilter === "errors" ? span.statusCode === "ERROR" : span.bucket === state.spanFilter));
  return `<section class="panel accounting-detail">
    <div class="section-heading"><div><p class="eyebrow">Selected run</p><h2>${escapeHtml(run.title)}</h2><p class="muted">${escapeHtml(run.runId)} · ${run.spanCount} spans · ${run.errorSpanCount} errors · ${escapeHtml(run.breakdown.detail)}</p></div><div class="detail-links">${run.traceLink ? `<a href="${escapeHtml(run.traceLink)}" target="_blank" rel="noreferrer">Open trace ↗</a>` : ""}${run.spanLink ? `<a href="${escapeHtml(run.spanLink)}" target="_blank" rel="noreferrer">Open root span ↗</a>` : ""}</div></div>
    <div class="table-wrap"><table class="output-table accounting-detail-summary"><thead><tr><th>Wall clock</th><th>Model</th><th>Tools</th><th>Orchestration</th><th>Evaluations</th><th>Accounted</th><th>Unaccounted</th><th>Critical path</th></tr></thead><tbody><tr><td>${formatDuration(run.breakdown.wallClockMs)}</td><td>${formatDuration(run.breakdown.modelMs)}</td><td>${formatDuration(run.breakdown.toolMs)}</td><td>${formatDuration(run.breakdown.orchestrationMs)}</td><td>${formatDuration(run.breakdown.evaluationMs)}</td><td>${formatDuration(run.breakdown.accountedMs)}</td><td>${formatDuration(run.breakdown.unaccountedMs)}</td><td>${run.breakdown.criticalPathMs == null ? "n/a" : `${formatDuration(run.breakdown.criticalPathMs)}<span class="accounting-table__subtext">${escapeHtml(run.breakdown.criticalPathNodeIds.join(" → "))}</span>`}</td></tr></tbody></table></div>
    <div class="accounting-detail__toolbar"><h3>Span accounting</h3><label>Filter <select data-span-filter><option value="all" ${state.spanFilter === "all" ? "selected" : ""}>All spans</option><option value="model" ${state.spanFilter === "model" ? "selected" : ""}>Model</option><option value="tool" ${state.spanFilter === "tool" ? "selected" : ""}>Tools</option><option value="orchestration" ${state.spanFilter === "orchestration" ? "selected" : ""}>Orchestration</option><option value="evaluation" ${state.spanFilter === "evaluation" ? "selected" : ""}>Evaluations</option><option value="other" ${state.spanFilter === "other" ? "selected" : ""}>Other</option><option value="queue_wait" ${state.spanFilter === "queue_wait" ? "selected" : ""}>Queue / wait</option><option value="errors" ${state.spanFilter === "errors" ? "selected" : ""}>Errors</option></select></label></div>
    ${renderSpanTable(filteredSpans)}
  </section>`;
}

function renderSpanTable(spans: TimeAccountingSpan[]): string {
  if (spans.length === 0) return `<p class="run-detail__empty">No spans match this filter.</p>`;
  return `<div class="table-wrap"><table class="output-table accounting-span-table"><thead><tr><th>#</th><th>DSL node</th><th>Span</th><th>Kind</th><th>Inclusive</th><th>Exclusive</th><th>Parent</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${spans.map((span, index) => `
    <tr class="${span.statusCode === "ERROR" ? "accounting-span-table__error" : ""}"><td>${index + 1}</td><td>${escapeHtml(readAttribute(span, "alo.dsl.node_id") ?? "unmapped")}</td><td><strong>${span.spanLink ? `<a href="${escapeHtml(span.spanLink)}" target="_blank" rel="noreferrer">${escapeHtml(span.name)} ↗</a>` : escapeHtml(span.name)} </strong><span class="accounting-table__subtext">${escapeHtml(shortId(span.spanId))}</span></td><td>${escapeHtml(span.spanKind)}</td><td>${formatDuration(span.inclusiveDurationMs)}</td><td>${formatDuration(span.exclusiveDurationMs)}</td><td>${escapeHtml(span.parentId ? shortId(span.parentId) : "root")}</td><td>${escapeHtml(span.statusCode)}</td><td><span class="evidence-state evidence-state--${stateClass(span.evidenceState)}">${escapeHtml(stateLabel(span.evidenceState))}</span></td></tr>
  `).join("")}</tbody></table></div>`;
}

function wireInteractions(): void {
  content?.querySelectorAll<HTMLButtonElement>("[data-run-output-id]").forEach((button) => button.addEventListener("click", () => {
    state.selectedOutputId = button.dataset.runOutputId ?? null;
    state.spanFilter = "all";
    updateUrl();
    void loadData();
  }));
  content?.querySelector<HTMLSelectElement>("[data-span-filter]")?.addEventListener("change", (event) => {
    state.spanFilter = (event.target as HTMLSelectElement).value as SpanFilter;
    render();
  });
}

document.querySelectorAll<HTMLAnchorElement>("[data-window]").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  state.window = link.dataset.window as TimeAccountingData["window"];
  state.selectedOutputId = null;
  state.spanFilter = "all";
  updateUrl();
  void loadData();
}));

function updateUrl(): void {
  const params = new URLSearchParams({ window: state.window });
  if (state.selectedOutputId) params.set("outputId", state.selectedOutputId);
  window.history.replaceState(null, "", `?${params.toString()}`);
  document.querySelectorAll<HTMLAnchorElement>("[data-window]").forEach((link) => link.classList.toggle("viewbar__link--active", link.dataset.window === state.window));
}

function readWindow(): TimeAccountingData["window"] {
  const value = new URLSearchParams(window.location.search).get("window");
  return value === "1h" || value === "24h" || value === "7d" || value === "all" ? value : "24h";
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

function readAttribute(span: TimeAccountingSpan, key: string): string | null {
  const value = span.attributes[key];
  return typeof value === "string" ? value : null;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function stateLabel(stateValue: EvidenceState): string {
  return stateValue.replaceAll("_", " ");
}

function stateClass(stateValue: EvidenceState): string {
  return stateValue.replaceAll("_", "-");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

void loadData();
