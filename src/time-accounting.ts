import type Database from "better-sqlite3";
import { buildDslConformance, parseLoopDefinition } from "./dsl.js";
import { buildSpanLink, getObservabilityForOutput } from "./phoenix.js";
import { readDashboardData } from "./projections.js";
import type {
  DslConformanceSummary,
  EvidenceState,
  ObservabilitySummary,
  ObservedSpan,
  TimeAccountingBreakdown,
  TimeAccountingData,
  TimeAccountingMetric,
  TimeAccountingRun,
  TimeAccountingSpan,
  TimeAccountingBucket
} from "./types.js";

type ExecutionWindow = TimeAccountingData["window"];

const WINDOW_LABELS: Record<ExecutionWindow, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  all: "All available"
};

interface Interval {
  start: number;
  end: number;
}

interface SpanAccounting {
  spans: TimeAccountingSpan[];
  breakdown: TimeAccountingBreakdown;
}

export async function readTimeAccountingData(
  db: Database.Database,
  rootDir: string,
  requestedWindow: string | null,
  selectedOutputId: string | null
): Promise<TimeAccountingData> {
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
  const definition = parseLoopDefinition(rootDir);
  const runs = candidates.map((output) => {
    const observation = observationByOutput.get(output.outputId);
    const conformance = observation ? buildDslConformance(definition, observation) : null;
    return buildRun(output, observation, conformance);
  });
  const selectedRun = runs.find((run) => run.outputId === selectedOutputId) ?? runs[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    window,
    windowLabel: WINDOW_LABELS[window],
    windowStart,
    summary: {
      runsRecorded: runs.length,
      runsWithObservedTrace: runs.filter((run) => run.traceState === "observed").length,
      runsWithCompleteTiming: runs.filter((run) => run.breakdown.timingCoveragePercentage === 100).length,
      wallClock: buildMetric(runs.map((run) => run.breakdown.wallClockMs), runs.length),
      model: buildMetric(runs.map((run) => run.breakdown.modelMs), runs.length),
      tool: buildMetric(runs.map((run) => run.breakdown.toolMs), runs.length),
      orchestration: buildMetric(runs.map((run) => run.breakdown.orchestrationMs), runs.length),
      evaluation: buildMetric(runs.map((run) => run.breakdown.evaluationMs), runs.length),
      other: buildMetric(runs.map((run) => run.breakdown.otherMs), runs.length),
      queueWait: buildMetric(runs.map((run) => run.breakdown.queueWaitMs), runs.length),
      accounted: buildMetric(runs.map((run) => run.breakdown.accountedMs), runs.length),
      unaccounted: buildMetric(runs.map((run) => run.breakdown.unaccountedMs), runs.length)
    },
    runs,
    selectedRun
  };
}

export function calculateTimeAccounting(spans: ObservedSpan[], traceAvailable = true): SpanAccounting {
  const intervalById = new Map(spans.map((span) => [span.spanId, toInterval(span)]));
  const childrenByParent = new Map<string, ObservedSpan[]>();
  for (const span of spans) {
    if (!span.parentId) {
      continue;
    }
    const children = childrenByParent.get(span.parentId) ?? [];
    children.push(span);
    childrenByParent.set(span.parentId, children);
  }

  const fragmentBySpanId = new Map<string, Interval[] | null>();
  const accountingSpans = spans.map((span) => {
    const interval = intervalById.get(span.spanId) ?? null;
    const children = childrenByParent.get(span.spanId) ?? [];
    const childIntervals = children.map((child) => intervalById.get(child.spanId) ?? null);
    const fragments = interval == null || childIntervals.some((childInterval) => childInterval == null)
      ? null
      : subtractIntervals([interval], childIntervals as Interval[]);
    fragmentBySpanId.set(span.spanId, fragments);

    return {
      ...span,
      inclusiveDurationMs: span.latencyMs ?? (interval ? duration(interval) : null),
      exclusiveDurationMs: fragments == null ? null : sumIntervals(fragments),
      bucket: bucketForSpan(span),
      evidenceState: interval == null ? "not_instrumented" : "observed",
      spanLink: traceAvailable && span.spanId ? buildSpanLink(span.spanId) : null
    } satisfies TimeAccountingSpan;
  });

  const root = spans.find((span) => span.parentId === null) ?? spans[0] ?? null;
  const rootInterval = root ? intervalById.get(root.spanId) ?? null : null;
  const timedSpanCount = spans.filter((span) => intervalById.get(span.spanId) != null).length;
  const timingCoveragePercentage = spans.length === 0 ? null : Math.round((timedSpanCount / spans.length) * 100);
  const bucketFragments = new Map<TimeAccountingBucket, Interval[]>();

  accountingSpans.forEach((span) => {
    const fragments = fragmentBySpanId.get(span.spanId) ?? null;
    if (!fragments) {
      return;
    }
    const current = bucketFragments.get(span.bucket) ?? [];
    current.push(...fragments);
    bucketFragments.set(span.bucket, current);
  });

  const bucketMs = (bucket: TimeAccountingBucket): number | null => {
    const fragments = bucketFragments.get(bucket);
    return fragments == null ? null : sumIntervals(mergeIntervals(fragments));
  };
  const wallClockMs = rootInterval ? duration(rootInterval) : null;
  const modelMs = bucketMs("model");
  const toolMs = bucketMs("tool");
  const orchestrationMs = bucketMs("orchestration");
  const evaluationMs = bucketMs("evaluation");
  const otherMs = bucketMs("other");
  const queueWaitMs = bucketMs("queue_wait");
  const accountedIntervals = mergeIntervals(
    [...bucketFragments.entries()]
      .filter(([bucket]) => bucket !== "queue_wait")
      .flatMap(([, fragments]) => fragments)
  );
  const accountedMs = rootInterval && timingCoveragePercentage === 100 ? sumIntervals(accountedIntervals) : null;
  const unaccountedMs = wallClockMs == null || accountedMs == null
    ? null
    : Math.max(0, wallClockMs - accountedMs - (queueWaitMs ?? 0));
  const state: EvidenceState = !traceAvailable
    ? "unavailable"
    : spans.length === 0
      ? "not_instrumented"
      : timingCoveragePercentage === 100
        ? "derived"
        : "not_instrumented";

  return {
    spans: accountingSpans,
    breakdown: {
      wallClockMs,
      modelMs,
      toolMs,
      orchestrationMs,
      evaluationMs,
      otherMs,
      queueWaitMs,
      accountedMs,
      unaccountedMs,
      criticalPathMs: null,
      criticalPathNodeIds: [],
      timingCoveragePercentage,
      state,
      detail: detailForState(state, timingCoveragePercentage)
    }
  };
}

function buildRun(
  output: ReturnType<typeof readDashboardData>["outputs"][number],
  observation: ObservabilitySummary | undefined,
  conformance: DslConformanceSummary | null
): TimeAccountingRun {
  const traceState: TimeAccountingRun["traceState"] = observation?.available && observation.spans.length > 0
    ? "observed"
    : output.runId && observation
      ? "degraded"
      : "not_linked";
  const accounting = calculateTimeAccounting(observation?.spans ?? [], traceState === "observed");
  accounting.breakdown.criticalPathMs = conformance?.criticalPath?.totalLatencyMs ?? null;
  accounting.breakdown.criticalPathNodeIds = conformance?.criticalPath?.nodeIds ?? [];

  return {
    runId: output.runId ?? "",
    outputId: output.outputId,
    title: output.title,
    outputStatus: output.status,
    updatedAt: output.updatedAt,
    durationMs: accounting.breakdown.wallClockMs,
    spanCount: accounting.spans.length,
    errorSpanCount: accounting.spans.filter((span) => span.statusCode === "ERROR").length,
    traceState,
    traceId: observation?.traceId ?? null,
    rootSpanId: observation?.rootSpanId ?? null,
    traceLink: observation?.traceLink ?? null,
    spanLink: observation?.spanLink ?? null,
    breakdown: accounting.breakdown,
    spans: accounting.spans
  };
}

function buildMetric(values: Array<number | null>, runCount: number): TimeAccountingMetric {
  const observed = values.filter((value): value is number => value != null);
  const state: EvidenceState = observed.length === 0
    ? "not_instrumented"
    : observed.length === runCount
      ? "derived"
      : "not_instrumented";
  return {
    medianMs: median(observed),
    p95Ms: percentile(observed, 0.95),
    totalMs: observed.length === 0 ? null : observed.reduce((total, value) => total + value, 0),
    runCount: observed.length,
    state
  };
}

function bucketForSpan(span: ObservedSpan): TimeAccountingBucket {
  const explicitCategory = readStringAttribute(span, "alo.time.category")?.toLowerCase();
  if (explicitCategory === "queue" || explicitCategory === "wait" || explicitCategory === "queue_wait") {
    return "queue_wait";
  }

  switch (span.spanKind.toUpperCase()) {
    case "LLM": return "model";
    case "TOOL": return "tool";
    case "EVALUATOR": return "evaluation";
    case "AGENT":
    case "CHAIN": return "orchestration";
    default: return "other";
  }
}

function readStringAttribute(span: ObservedSpan, key: string): string | null {
  const value = span.attributes[key];
  return typeof value === "string" ? value : null;
}

function toInterval(span: ObservedSpan): Interval | null {
  if (!span.startTime || !span.endTime) {
    return null;
  }
  const start = Date.parse(span.startTime);
  const end = Date.parse(span.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? { start, end } : null;
}

function subtractIntervals(bases: Interval[], exclusions: Interval[]): Interval[] {
  let remaining = [...bases];
  for (const exclusion of mergeIntervals(exclusions)) {
    const next: Interval[] = [];
    for (const base of remaining) {
      if (exclusion.end <= base.start || exclusion.start >= base.end) {
        next.push(base);
        continue;
      }
      if (exclusion.start > base.start) {
        next.push({ start: base.start, end: Math.min(exclusion.start, base.end) });
      }
      if (exclusion.end < base.end) {
        next.push({ start: Math.max(exclusion.end, base.start), end: base.end });
      }
    }
    remaining = next.filter((interval) => interval.end >= interval.start);
  }
  return remaining;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const ordered = [...intervals].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Interval[] = [];
  for (const interval of ordered) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

function sumIntervals(intervals: Interval[]): number {
  return intervals.reduce((total, interval) => total + duration(interval), 0);
}

function duration(interval: Interval): number {
  return Math.max(0, Math.round(interval.end - interval.start));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? Math.round((ordered[middle - 1] + ordered[middle]) / 2) : ordered[middle];
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * quantile) - 1))] ?? null;
}

function detailForState(state: EvidenceState, coverage: number | null): string {
  if (state === "unavailable") return "Phoenix is unavailable; local review remains usable.";
  if (state === "not_instrumented" && coverage != null) return `${coverage}% of observed spans have complete timestamps.`;
  if (state === "not_instrumented") return "No measured spans were returned for this run.";
  return "Derived from span timestamps and parent-child intervals.";
}

function normalizeWindow(value: string | null): ExecutionWindow {
  return value === "1h" || value === "24h" || value === "7d" || value === "all" ? value : "24h";
}

function getWindowStart(window: ExecutionWindow): string | null {
  if (window === "all") return null;
  const durationMs = window === "1h" ? 60 * 60 * 1000 : window === "24h" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - durationMs).toISOString();
}
