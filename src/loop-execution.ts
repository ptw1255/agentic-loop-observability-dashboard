import type Database from "better-sqlite3";
import { buildDslConformance, parseLoopDefinition } from "./dsl.js";
import { getObservabilityForOutput } from "./phoenix.js";
import { readDashboardData, readOutputDetail } from "./projections.js";
import type { ObservabilitySummary } from "./types.js";

export type ExecutionWindow = "1h" | "24h" | "7d" | "all";

const WINDOW_LABELS: Record<ExecutionWindow, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  all: "All available"
};

export interface LoopExecutionRun {
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

export interface LoopExecutionDetail extends LoopExecutionRun {
  sessionId: string | null;
  projectName: string;
  message: string;
  outline: string[];
  spans: ObservabilitySummary["spans"];
  annotations: ObservabilitySummary["annotations"];
  conformance: ReturnType<typeof buildDslConformance>;
}

export interface LoopExecutionData {
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

export async function readLoopExecutionData(
  db: Database.Database,
  rootDir: string,
  requestedWindow: string | null,
  selectedOutputId: string | null
): Promise<LoopExecutionData> {
  const window = normalizeWindow(requestedWindow);
  const dashboard = readDashboardData(db);
  const windowStart = getWindowStart(window);
  const candidates = dashboard.outputs.filter((output) => {
    if (!output.runId) {
      return false;
    }
    return windowStart == null || Date.parse(output.updatedAt) >= Date.parse(windowStart);
  });

  const observations = await Promise.all(
    candidates.map(async (output) => [output.outputId, await getObservabilityForOutput(db, output.outputId)] as const)
  );
  const observationByOutput = new Map(observations);

  const runs = candidates.map((output) => buildRunSummary(output, observationByOutput.get(output.outputId)));
  const selectedSummary = runs.find((run) => run.outputId === selectedOutputId) ?? runs[0] ?? null;
  let selectedRun: LoopExecutionDetail | null = null;

  if (selectedSummary) {
    const detail = readOutputDetail(db, selectedSummary.outputId);
    const observation = observationByOutput.get(selectedSummary.outputId);
    if (detail && observation) {
      selectedRun = {
        ...selectedSummary,
        sessionId: observation.sessionId,
        projectName: observation.projectName,
        message: observation.message,
        outline: observation.outline,
        spans: observation.spans,
        annotations: observation.annotations,
        conformance: buildDslConformance(parseLoopDefinition(rootDir), observation)
      };
    }
  }

  const observedTraceCount = runs.filter((run) => run.traceState === "observed").length;
  const durationValues = runs
    .map((run) => run.durationMs)
    .filter((duration): duration is number => duration != null);

  return {
    generatedAt: new Date().toISOString(),
    window,
    windowLabel: WINDOW_LABELS[window],
    windowStart,
    summary: {
      runsRecorded: runs.length,
      runsWithObservedTrace: observedTraceCount,
      runsWithErrors: runs.filter((run) => run.errorSpanCount > 0).length,
      attentionRuns: runs.filter((run) => run.attention).length,
      traceCoveragePercentage: runs.length === 0 ? null : Math.round((observedTraceCount / runs.length) * 100),
      medianDurationMs: median(durationValues)
    },
    runs,
    selectedRun
  };
}

function buildRunSummary(
  output: ReturnType<typeof readDashboardData>["outputs"][number],
  observation: ObservabilitySummary | undefined
): LoopExecutionRun {
  const spans = observation?.spans ?? [];
  const rootSpan = spans.find((span) => span.parentId === null) ?? spans[0];
  const errorSpanCount = spans.filter((span) => span.statusCode === "ERROR").length;
  const traceState: LoopExecutionRun["traceState"] = observation?.available && spans.length > 0
    ? "observed"
    : output.runId && observation
      ? "degraded"
      : "not_linked";

  return {
    runId: output.runId ?? "",
    outputId: output.outputId,
    title: output.title,
    outputStatus: output.status,
    updatedAt: output.updatedAt,
    creator: output.creator,
    durationMs: rootSpan?.latencyMs ?? null,
    spanCount: spans.length,
    errorSpanCount,
    traceState,
    traceId: observation?.traceId ?? null,
    rootSpanId: observation?.rootSpanId ?? null,
    actionCount: output.openActionCount,
    staleReason: output.staleReason,
    attention: errorSpanCount > 0 || traceState !== "observed" || output.status === "needs_changes" || output.staleReason !== null
  };
}

function normalizeWindow(value: string | null): ExecutionWindow {
  return value === "1h" || value === "24h" || value === "7d" || value === "all" ? value : "24h";
}

function getWindowStart(window: ExecutionWindow): string | null {
  if (window === "all") {
    return null;
  }

  const durationMs = window === "1h" ? 60 * 60 * 1000 : window === "24h" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - durationMs).toISOString();
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? Math.round((ordered[middle - 1] + ordered[middle]) / 2)
    : ordered[middle];
}
