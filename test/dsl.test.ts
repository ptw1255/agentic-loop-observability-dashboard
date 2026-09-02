import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildDslConformance, parseLoopDefinition } from "../src/dsl.js";
import type { ObservabilitySummary } from "../src/types.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("DSL parser loads the versioned loop definition from disk", () => {
  const definition = parseLoopDefinition(repoRoot);
  assert.equal(definition.loopId, "implement-change");
  assert.equal(definition.loopVersion, "1.0.0");
  assert.equal(definition.declaredNodes.length, 5);
  assert.equal(definition.declaredEdges.length, 4);
});

test("DSL conformance separates declared graph from observed execution and withholds critical path when incomplete", () => {
  const definition = parseLoopDefinition(repoRoot);
  const observability: ObservabilitySummary = {
    available: true,
    message: "Phoenix trace loaded.",
    projectName: "agentic-loop-observability-dashboard",
    traceId: "trace-123",
    rootSpanId: "root-span",
    runId: "run-123",
    sessionId: "session-123",
    traceLink: "http://localhost:6006/redirects/traces/trace-123",
    spanLink: "http://localhost:6006/redirects/spans/root-span",
    spans: [
      {
        spanId: "plan-span",
        traceId: "trace-123",
        parentId: "root-span",
        name: "plan",
        spanKind: "AGENT",
        statusCode: "OK",
        startTime: "2026-09-02T17:00:00.000Z",
        endTime: "2026-09-02T17:00:00.040Z",
        latencyMs: 40,
        attributes: {
          "alo.dsl.node_id": "plan",
          "alo.input_ref": "request-1",
          "alo.output_ref": "plan-1"
        }
      },
      {
        spanId: "code-span",
        traceId: "trace-123",
        parentId: "plan-span",
        name: "code",
        spanKind: "AGENT",
        statusCode: "OK",
        startTime: "2026-09-02T17:00:00.041Z",
        endTime: "2026-09-02T17:00:00.090Z",
        latencyMs: 49,
        attributes: {
          "alo.dsl.node_id": "code",
          "alo.output_ref": "working-tree-1"
        }
      },
      {
        spanId: "orphan-span",
        traceId: "trace-123",
        parentId: "code-span",
        name: "unexpected-tool",
        spanKind: "TOOL",
        statusCode: "OK",
        startTime: "2026-09-02T17:00:00.091Z",
        endTime: "2026-09-02T17:00:00.100Z",
        latencyMs: 9,
        attributes: {}
      }
    ],
    outline: [],
    tree: [],
    annotations: []
  };

  const summary = buildDslConformance(definition, observability);
  assert.equal(summary.declaredNodes.length, 5);
  assert.equal(summary.observedEdges.length, 2);
  assert.deepEqual(summary.declaredNotObserved, ["test", "review", "output"]);
  assert.equal(summary.unmappedSpans.length, 1);
  assert.equal(summary.criticalPath, null);
  assert.match(summary.criticalPathReason ?? "", /withheld/i);
});
