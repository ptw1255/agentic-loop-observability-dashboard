import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type {
  CriticalPathRecord,
  DependencyRecord,
  DslConformanceSummary,
  LoopDefinitionEdge,
  LoopDefinitionNode,
  LoopDefinitionOutcome,
  ObservabilitySummary,
  ObservedExecutionEdge,
  ObservedSpan
} from "./types.js";

interface ParsedLoopDefinition {
  loopId: string;
  loopVersion: string;
  loopTitle: string;
  declaredNodes: LoopDefinitionNode[];
  declaredEdges: LoopDefinitionEdge[];
  outcomes: LoopDefinitionOutcome[];
}

export function parseLoopDefinition(rootDir: string): ParsedLoopDefinition {
  const filePath = path.join(rootDir, "dsl", "implement-change.v1.yaml");
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = YAML.parse(raw) as {
    metadata?: { id?: string; version?: string; title?: string };
    spec?: {
      nodes?: Array<{ id?: string; kind?: string; telemetry?: { required?: string[] } }>;
      edges?: Array<{ from?: string; to?: string; meaning?: string }>;
      outcomes?: Array<{ id?: string; measure?: string; target?: number | string | boolean | null }>;
    };
  };

  return {
    loopId: parsed.metadata?.id ?? "unknown-loop",
    loopVersion: parsed.metadata?.version ?? "unknown-version",
    loopTitle: parsed.metadata?.title ?? "Untitled loop",
    declaredNodes: (parsed.spec?.nodes ?? []).map((node) => ({
      id: node.id ?? "unknown-node",
      kind: node.kind ?? "unknown",
      title: node.id ?? "unknown-node",
      requiredTelemetry: node.telemetry?.required ?? []
    })),
    declaredEdges: (parsed.spec?.edges ?? []).map((edge) => ({
      from: edge.from ?? "unknown",
      to: edge.to ?? "unknown",
      meaning: edge.meaning ?? "sequence"
    })),
    outcomes: (parsed.spec?.outcomes ?? []).map((outcome) => ({
      id: outcome.id ?? "unknown-outcome",
      measure: outcome.measure ?? "unknown-measure",
      target: outcome.target ?? null
    }))
  };
}

export function buildDslConformance(
  definition: ParsedLoopDefinition,
  observability: ObservabilitySummary
): DslConformanceSummary {
  const declaredNodeIds = new Set(definition.declaredNodes.map((node) => node.id));
  const mappedSpansByNode = new Map<string, ObservedSpan[]>();

  for (const span of observability.spans) {
    const nodeId = typeof span.attributes["alo.dsl.node_id"] === "string"
      ? (span.attributes["alo.dsl.node_id"] as string)
      : null;
    if (!nodeId || !declaredNodeIds.has(nodeId)) {
      continue;
    }
    const spans = mappedSpansByNode.get(nodeId) ?? [];
    spans.push(span);
    mappedSpansByNode.set(nodeId, spans);
  }

  const nodeStates = definition.declaredNodes.map((node) => {
    const spans = mappedSpansByNode.get(node.id) ?? [];
    const observed = spans.length > 0;
    const latencyMs = spans.some((span) => span.latencyMs == null)
      ? null
      : spans.reduce((total, span) => total + (span.latencyMs ?? 0), 0);
    const status: "ok" | "error" | "missing" = !observed
      ? "missing"
      : spans.some((span) => span.statusCode !== "OK")
        ? "error"
        : "ok";

    return {
      nodeId: node.id,
      title: node.title,
      kind: node.kind,
      observed,
      spanIds: spans.map((span) => span.spanId),
      attemptCount: spans.length,
      status,
      latencyMs,
      missingTelemetry: node.requiredTelemetry.filter((signal) => !hasTelemetry(spans, signal))
    };
  });

  const observedEdges = buildObservedEdges(observability.spans);
  const unmappedSpans = observability.spans
    .filter((span) => {
      const nodeId = typeof span.attributes["alo.dsl.node_id"] === "string"
        ? (span.attributes["alo.dsl.node_id"] as string)
        : null;
      return !nodeId || !declaredNodeIds.has(nodeId);
    })
    .map((span) => ({
      spanId: span.spanId,
      name: span.name,
      reason: typeof span.attributes["alo.dsl.node_id"] === "string"
        ? `Declared node ${String(span.attributes["alo.dsl.node_id"])} does not exist in the current DSL.`
        : "No explicit alo.dsl.node_id attribute was emitted."
    }));

  const declaredNotObserved = nodeStates.filter((node) => !node.observed).map((node) => node.nodeId);
  const dependencyRecords = buildDependencyRecords(definition.declaredEdges);
  const criticalPath = computeCriticalPath(definition.declaredEdges, nodeStates, declaredNotObserved, unmappedSpans);

  return {
    available: true,
    message: observability.available
      ? "Declared and observed workflow comparison loaded."
      : "Declared workflow loaded. Observed telemetry is incomplete or unavailable.",
    loopId: definition.loopId,
    loopVersion: definition.loopVersion,
    loopTitle: definition.loopTitle,
    outcomes: definition.outcomes,
    declaredNodes: definition.declaredNodes,
    declaredEdges: definition.declaredEdges,
    observedEdges,
    nodeStates,
    declaredNotObserved,
    unmappedSpans,
    dependencyRecords,
    criticalPath: criticalPath.path,
    criticalPathReason: criticalPath.reason
  };
}

function buildObservedEdges(spans: ObservedSpan[]): ObservedExecutionEdge[] {
  const bySpanId = new Map(spans.map((span) => [span.spanId, span]));
  return spans
    .filter((span) => span.parentId && bySpanId.has(span.parentId))
    .map((span) => {
      const parent = bySpanId.get(span.parentId as string);
      return {
        fromNodeId: parent ? readNodeId(parent) : null,
        toNodeId: readNodeId(span),
        fromSpanId: span.parentId as string,
        toSpanId: span.spanId,
        meaning: "observed_execution" as const
      };
    });
}

function buildDependencyRecords(edges: LoopDefinitionEdge[]): DependencyRecord[] {
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();

  for (const edge of edges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const records: DependencyRecord[] = [];
  for (const [nodeId, count] of outgoing.entries()) {
    if (count > 1) {
      records.push({ type: "fan_out", description: `${nodeId} fans out to ${count} declared downstream nodes.` });
    }
  }
  for (const [nodeId, count] of incoming.entries()) {
    if (count > 1) {
      records.push({ type: "fan_in", description: `${nodeId} fans in from ${count} declared upstream nodes.` });
    }
  }
  return records;
}

function computeCriticalPath(
  edges: LoopDefinitionEdge[],
  nodeStates: DslConformanceSummary["nodeStates"],
  declaredNotObserved: string[],
  unmappedSpans: DslConformanceSummary["unmappedSpans"]
): { path: CriticalPathRecord | null; reason: string | null } {
  if (declaredNotObserved.length > 0) {
    return { path: null, reason: "Critical path withheld because at least one declared node was not observed." };
  }
  if (unmappedSpans.length > 0) {
    return { path: null, reason: "Critical path withheld because at least one observed span is unmapped." };
  }
  if (nodeStates.some((node) => node.latencyMs == null)) {
    return { path: null, reason: "Critical path withheld because timing telemetry is incomplete." };
  }

  const nodeLatency = new Map(nodeStates.map((node) => [node.nodeId, node.latencyMs ?? 0]));
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();

  for (const node of nodeStates) {
    outgoing.set(node.nodeId, []);
    incomingCount.set(node.nodeId, 0);
  }

  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  const queue = [...nodeStates.filter((node) => (incomingCount.get(node.nodeId) ?? 0) === 0).map((node) => node.nodeId)];
  const distance = new Map<string, number>();
  const previous = new Map<string, string | null>();

  for (const node of nodeStates) {
    distance.set(node.nodeId, Number.NEGATIVE_INFINITY);
    previous.set(node.nodeId, null);
  }
  for (const nodeId of queue) {
    distance.set(nodeId, nodeLatency.get(nodeId) ?? 0);
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    ordered.push(current);
    for (const next of outgoing.get(current) ?? []) {
      const nextDistance = (distance.get(current) ?? 0) + (nodeLatency.get(next) ?? 0);
      if (nextDistance > (distance.get(next) ?? Number.NEGATIVE_INFINITY)) {
        distance.set(next, nextDistance);
        previous.set(next, current);
      }
      incomingCount.set(next, (incomingCount.get(next) ?? 1) - 1);
      if ((incomingCount.get(next) ?? 0) === 0) {
        queue.push(next);
      }
    }
  }

  if (ordered.length !== nodeStates.length) {
    return { path: null, reason: "Critical path withheld because the declared workflow graph is not acyclic." };
  }

  let terminalNodeId: string | null = null;
  let terminalDistance = Number.NEGATIVE_INFINITY;
  for (const [nodeId, value] of distance.entries()) {
    if (value > terminalDistance) {
      terminalNodeId = nodeId;
      terminalDistance = value;
    }
  }

  if (!terminalNodeId || !Number.isFinite(terminalDistance)) {
    return { path: null, reason: "Critical path withheld because no complete path could be computed." };
  }

  const path: string[] = [];
  let cursor: string | null = terminalNodeId;
  while (cursor) {
    path.unshift(cursor);
    cursor = previous.get(cursor) ?? null;
  }

  return {
    path: {
      nodeIds: path,
      totalLatencyMs: terminalDistance
    },
    reason: null
  };
}

function hasTelemetry(spans: ObservedSpan[], signal: string): boolean {
  if (spans.length === 0) {
    return false;
  }

  switch (signal) {
    case "duration":
      return spans.every((span) => span.latencyMs != null);
    case "status":
      return spans.every((span) => span.statusCode !== "UNSET");
    case "input_ref":
      return spans.some((span) => typeof span.attributes["alo.input_ref"] === "string");
    case "output_ref":
      return spans.some((span) => typeof span.attributes["alo.output_ref"] === "string");
    default:
      return spans.some((span) => Object.prototype.hasOwnProperty.call(span.attributes, signal));
  }
}

function readNodeId(span: ObservedSpan): string | null {
  return typeof span.attributes["alo.dsl.node_id"] === "string"
    ? (span.attributes["alo.dsl.node_id"] as string)
    : null;
}
