import crypto from "node:crypto";
import { createClient } from "@arizeai/phoenix-client";
import { addSpanAnnotation, getSpanAnnotations, getSpans } from "@arizeai/phoenix-client/spans";
import { context, register, setAttributes, setMetadata, setSession, trace, traceAgent, traceChain, traceEvaluator, traceTool } from "@arizeai/phoenix-otel";
import type { EventStore } from "./store.js";
import { readOutputDetail } from "./projections.js";
import type {
  ObservabilitySummary,
  ObservedAnnotation,
  ObservedSpan,
  ObservedSpanTreeNode
} from "./types.js";
import type Database from "better-sqlite3";

const DEFAULT_PHOENIX_URL = process.env.PHOENIX_ENDPOINT ?? "http://localhost:6006";
const DEFAULT_PROJECT_NAME = "agentic-loop-observability-dashboard";

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function isPhoenixAvailable(url = DEFAULT_PHOENIX_URL): Promise<boolean> {
  try {
    const response = await fetch(`${url}/arize_phoenix_version`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function emitDemoTrace(params: {
  outputId: string;
  runId: string;
  sessionId: string;
  projectName?: string;
  url?: string;
}): Promise<{ traceId: string; rootSpanId: string; reviewSpanId: string | null; annotationError: string | null }> {
  const projectName = params.projectName ?? DEFAULT_PROJECT_NAME;
  const url = params.url ?? DEFAULT_PHOENIX_URL;
  const provider = register({ projectName, url, batch: false });

  let traceId = "";
  let rootSpanId = "";
  let reviewSpanId: string | null = null;
  let annotationError: string | null = null;

  const fetchContextTool = traceTool(
    async (request: string) => {
      await sleep(20);
      return {
        request,
        context: ["requirements", "existing state", "review policy"]
      };
    },
    {
      name: "fetch-context",
      attributes: { "alo.dsl.node_id": "plan" }
    }
  );

  const planStep = traceAgent(
    async (request: string) => {
      const span = trace.getActiveSpan();
      if (span) {
        const spanContext = span.spanContext();
        traceId = spanContext.traceId;
      }
      const contextData = await fetchContextTool(request);
      await sleep(25);
      return {
        plan: "Implement local-first observability dashboard slice",
        context: contextData.context
      };
    },
    {
      name: "plan",
      attributes: { "alo.dsl.node_id": "plan" }
    }
  );

  const writeCodeStep = traceAgent(
    async (plan: { plan: string; context: string[] }) => {
      await sleep(30);
      return {
        workingTree: ["src/server.ts", "src/projections.ts", "src/phoenix.ts"],
        summary: `${plan.plan} using ${plan.context.length} evidence inputs`
      };
    },
    {
      name: "code",
      attributes: { "alo.dsl.node_id": "code" }
    }
  );

  const successfulTool = traceTool(
    async () => {
      await sleep(18);
      return { status: "ok", check: "lint" };
    },
    {
      name: "lint",
      attributes: { "alo.dsl.node_id": "test" }
    }
  );

  const failingTool = traceTool(
    async () => {
      await sleep(14);
      throw new Error("Simulated flaky unit test failure");
    },
    {
      name: "unit-test-flaky",
      attributes: { "alo.dsl.node_id": "test" }
    }
  );

  const testStep = traceTool(
    async () => {
      const checks = [await successfulTool()];
      try {
        await failingTool();
      } catch (error) {
        checks.push({ status: "error", check: error instanceof Error ? error.message : "unknown test error" });
      }
      return checks;
    },
    {
      name: "test",
      attributes: { "alo.dsl.node_id": "test" }
    }
  );

  const reviewStep = traceEvaluator(
    async (checks: Array<{ status: string; check: string }>) => {
      const span = trace.getActiveSpan();
      if (span) {
        reviewSpanId = span.spanContext().spanId;
      }
      await sleep(22);
      const failedChecks = checks.filter((check) => check.status !== "ok");
      return {
        verdict: failedChecks.length === 0 ? "ready" : "needs_changes",
        notes: failedChecks.length === 0 ? ["All checks passed"] : failedChecks.map((check) => check.check)
      };
    },
    {
      name: "review",
      attributes: { "alo.dsl.node_id": "review" }
    }
  );

  const outputStep = traceChain(
    async (review: { verdict: string; notes: string[] }) => {
      await sleep(16);
      return {
        outputId: params.outputId,
        review,
        artifact: "observability-summary"
      };
    },
    {
      name: "output",
      attributes: { "alo.dsl.node_id": "output" }
    }
  );

  const rootRun = traceAgent(
    async (request: string) => {
      const rootSpan = trace.getActiveSpan();
      if (rootSpan) {
        const spanContext = rootSpan.spanContext();
        traceId = spanContext.traceId;
        rootSpanId = spanContext.spanId;
      }
      const plan = await planStep(request);
      const workingTree = await writeCodeStep(plan);
      const checks = await testStep();
      const review = await reviewStep(checks);
      return outputStep({
        verdict: review.verdict,
        notes: [...review.notes, workingTree.summary]
      });
    },
    {
      name: "implement-change-run",
      attributes: {
        "alo.dsl.node_id": "root",
        "alo.loop_definition_id": "implement-change",
        "alo.dsl_version": "1.0.0"
      }
    }
  );

  let ctx = context.active();
  ctx = setSession(ctx, { sessionId: params.sessionId });
  ctx = setMetadata(ctx, { app: "agentic-loop-observability-dashboard", source: "demo-run" });
  ctx = setAttributes(ctx, {
    "alo.run_id": params.runId,
    "alo.output_id": params.outputId,
    "alo.output_version": 1,
    "alo.loop_definition_id": "implement-change",
    "alo.dsl_version": "1.0.0"
  });

  try {
    await context.with(ctx, async () => {
      await rootRun("Create one reviewable output with observable evidence.");
    });
  } finally {
    await provider.shutdown();
  }

  if (reviewSpanId) {
    try {
      const client = createClient({ options: { baseUrl: url } });
      await addSpanAnnotation({
        client,
        sync: true,
        spanAnnotation: {
          spanId: reviewSpanId,
          name: "review_verdict",
          label: "needs_changes",
          score: 0.42,
          annotatorKind: "CODE",
          explanation: "Simulated flaky tool failure kept the run reviewable but not acceptable."
        }
      });
    } catch (error) {
      annotationError = error instanceof Error ? error.message : "Phoenix annotation write failed.";
      console.warn("phoenix.annotation_write_degraded", annotationError);
    }
  }

  return { traceId, rootSpanId, reviewSpanId, annotationError };
}

export async function runAndLinkDemoTrace(db: Database.Database, store: EventStore, outputId: string): Promise<void> {
  const runId = `run-${crypto.randomUUID()}`;
  const sessionId = runId;

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "run.linked",
    actor: { kind: "system", id: "phoenix-demo", display_name: "Phoenix Demo Runner" },
    source: "phoenix.demo",
    payload: {
      output_id: outputId,
      run_id: runId,
      alo_loop_definition_id: "implement-change",
      alo_dsl_version: "1.0.0",
      phoenix_project: DEFAULT_PROJECT_NAME,
      session_id: sessionId
    }
  });

  const trace = await emitDemoTrace({ outputId, runId, sessionId });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "run.linked",
    actor: { kind: "system", id: "phoenix-demo", display_name: "Phoenix Demo Runner" },
    source: "phoenix.demo",
    payload: {
      output_id: outputId,
      run_id: runId,
      alo_loop_definition_id: "implement-change",
      alo_dsl_version: "1.0.0",
      phoenix_project: DEFAULT_PROJECT_NAME,
      trace_id: trace.traceId,
      root_span_id: trace.rootSpanId,
      session_id: sessionId
    }
  });

  store.append({
    entityId: outputId,
    entityType: "output",
    eventType: "telemetry.coverage_assessed",
    actor: { kind: "system", id: "phoenix-demo", display_name: "Phoenix Demo Runner" },
    source: "phoenix.demo",
    payload: {
      output_id: outputId,
      signal: "alo.dsl.node_id",
      status: "observed",
      source: "phoenix.demo",
      details: "Demo trace emitted explicit DSL node IDs for root, plan, code, test, review, and output spans."
    }
  });

  if (trace.annotationError) {
    store.append({
      entityId: outputId,
      entityType: "output",
      eventType: "telemetry.coverage_assessed",
      actor: { kind: "system", id: "phoenix-demo", display_name: "Phoenix Demo Runner" },
      source: "phoenix.demo",
      payload: {
        output_id: outputId,
        signal: "phoenix.span_annotations",
        status: "degraded",
        source: "phoenix.demo",
        details: "Trace spans were captured, but Phoenix did not accept the optional review annotation write."
      }
    });
  }
}

export async function getObservabilityForOutput(db: Database.Database, outputId: string): Promise<ObservabilitySummary> {
  const detail = readOutputDetail(db, outputId);
  const runLink = detail?.runLink;
  const projectName = runLink?.phoenixProject ?? DEFAULT_PROJECT_NAME;

  if (!runLink?.runId) {
    return {
      available: false,
      message: "No linked run found for this output yet.",
      projectName,
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
  }

  const available = await isPhoenixAvailable();
  if (!available) {
    return {
      available: false,
      message: "Phoenix is unavailable. Cached output review remains usable.",
      projectName,
      traceId: runLink.traceId,
      rootSpanId: runLink.rootSpanId,
      runId: runLink.runId,
      sessionId: runLink.sessionId,
      traceLink: runLink.traceId ? buildTraceLink(runLink.traceId) : null,
      spanLink: runLink.rootSpanId ? buildSpanLink(runLink.rootSpanId) : null,
      spans: [],
      outline: [],
      tree: [],
      annotations: []
    };
  }

  try {
    const client = createClient({ options: { baseUrl: DEFAULT_PHOENIX_URL } });
    const spanResult = await getSpans({
      client,
      project: { projectName },
      limit: 200,
      attributes: {
        "alo.run_id": runLink.runId,
        "alo.output_id": outputId
      }
    });

    const spans = spanResult.spans.map(normalizeSpan);
    const annotationResult = spans.length > 0
      ? await collectAnnotations(client, projectName, spans.map((span) => span.spanId))
      : { annotations: [], degraded: false };
    const traceId = spans[0]?.traceId ?? runLink.traceId;
    const rootSpanId = spans.find((span) => span.parentId === null)?.spanId ?? runLink.rootSpanId;

    return {
      available: true,
      message: spans.length === 0
        ? "Phoenix is reachable but no spans matched this run yet."
        : annotationResult.degraded
          ? "Phoenix trace loaded; annotation query is degraded."
          : "Phoenix trace loaded.",
      projectName,
      traceId,
      rootSpanId,
      runId: runLink.runId,
      sessionId: runLink.sessionId,
      traceLink: traceId ? buildTraceLink(traceId) : null,
      spanLink: rootSpanId ? buildSpanLink(rootSpanId) : null,
      spans,
      outline: buildOutline(spans),
      tree: buildTree(spans),
      annotations: annotationResult.annotations
    };
  } catch (error) {
    return {
      available: false,
      message: error instanceof Error ? error.message : "Phoenix query failed.",
      projectName,
      traceId: runLink.traceId,
      rootSpanId: runLink.rootSpanId,
      runId: runLink.runId,
      sessionId: runLink.sessionId,
      traceLink: runLink.traceId ? buildTraceLink(runLink.traceId) : null,
      spanLink: runLink.rootSpanId ? buildSpanLink(runLink.rootSpanId) : null,
      spans: [],
      outline: [],
      tree: [],
      annotations: []
    };
  }
}

function normalizeSpan(span: Record<string, unknown>): ObservedSpan {
  const contextRecord = asRecord(span.context);
  const attributes = asRecord(span.attributes);
  const spanId = readString(contextRecord, "span_id") ?? readString(span, "span_id") ?? "";
  const traceId = readString(contextRecord, "trace_id") ?? readString(span, "trace_id") ?? "";
  const parentId = readString(span, "parent_id");
  const startTime = readString(span, "start_time");
  const endTime = readString(span, "end_time");

  return {
    spanId,
    traceId,
    parentId,
    name: readString(span, "name") ?? "unknown",
    spanKind: readString(attributes, "openinference.span.kind") ?? readString(span, "span_kind") ?? "UNKNOWN",
    statusCode: readString(span, "status_code") ?? "UNSET",
    startTime,
    endTime,
    latencyMs: readNumber(span, "latency_ms") ?? deriveLatencyMs(startTime, endTime),
    attributes
  };
}

async function collectAnnotations(
  client: ReturnType<typeof createClient>,
  projectName: string,
  spanIds: string[]
): Promise<{ annotations: ObservedAnnotation[]; degraded: boolean }> {
  try {
    const result = await getSpanAnnotations({
      client,
      project: { projectName },
      spanIds,
      limit: 100
    });

    return {
      annotations: result.annotations.map((annotation) => {
        const resultRecord = asRecord(annotation.result);
        return {
          spanId: readString(annotation, "span_id") ?? "",
          name: readString(annotation, "name") ?? "annotation",
          annotatorKind: readString(annotation, "annotator_kind"),
          label: readString(resultRecord, "label"),
          score: readNumber(resultRecord, "score"),
          explanation: readString(resultRecord, "explanation")
        };
      }),
      degraded: false
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Phoenix annotation query failed.";
    console.warn("phoenix.annotation_query_degraded", message);
    return { annotations: [], degraded: true };
  }
}

export function buildOutline(spans: ObservedSpan[]): string[] {
  const ordered = [...spans].sort((left, right) => {
    const leftValue = left.startTime ?? "";
    const rightValue = right.startTime ?? "";
    return leftValue.localeCompare(rightValue);
  });

  return ordered.map((span) => {
    const nodeId = typeof span.attributes["alo.dsl.node_id"] === "string" ? span.attributes["alo.dsl.node_id"] : "unmapped";
    const latency = span.latencyMs == null ? "n/a" : `${span.latencyMs}ms`;
    return `${nodeId} · ${span.name} · ${span.spanKind} · ${span.statusCode} · ${latency}`;
  });
}

export function buildTree(spans: ObservedSpan[]): ObservedSpanTreeNode[] {
  const nodes = new Map<string, ObservedSpanTreeNode>();
  const roots: ObservedSpanTreeNode[] = [];

  for (const span of spans) {
    nodes.set(span.spanId, {
      spanId: span.spanId,
      label: typeof span.attributes["alo.dsl.node_id"] === "string"
        ? `${span.attributes["alo.dsl.node_id"]} · ${span.name}`
        : span.name,
      spanKind: span.spanKind,
      statusCode: span.statusCode,
      latencyMs: span.latencyMs,
      children: []
    });
  }

  for (const span of spans) {
    const node = nodes.get(span.spanId);
    if (!node) {
      continue;
    }
    if (span.parentId && nodes.has(span.parentId)) {
      nodes.get(span.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function buildTraceLink(traceId: string): string {
  return `${DEFAULT_PHOENIX_URL}/redirects/traces/${encodeURIComponent(traceId)}`;
}

export function buildSpanLink(spanId: string): string {
  return `${DEFAULT_PHOENIX_URL}/redirects/spans/${encodeURIComponent(spanId)}`;
}

function deriveLatencyMs(startTime: string | null, endTime: string | null): number | null {
  if (!startTime || !endTime) {
    return null;
  }
  return Math.max(0, Math.round(new Date(endTime).getTime() - new Date(startTime).getTime()));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" ? value : null;
}
