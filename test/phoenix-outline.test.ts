import test from "node:test";
import assert from "node:assert/strict";
import { buildOutline, buildSpanLink, buildTraceLink, buildTree } from "../src/phoenix.js";
import type { ObservedSpan } from "../src/types.js";

test("Phoenix observability helpers build outline, tree, and deep-links from observed spans", () => {
  const spans: ObservedSpan[] = [
    {
      spanId: "root-span",
      traceId: "trace-123",
      parentId: null,
      name: "implement-change-run",
      spanKind: "AGENT",
      statusCode: "OK",
      startTime: "2026-09-02T17:00:00.000Z",
      endTime: "2026-09-02T17:00:00.120Z",
      latencyMs: 120,
      attributes: { "alo.dsl.node_id": "root" }
    },
    {
      spanId: "plan-span",
      traceId: "trace-123",
      parentId: "root-span",
      name: "plan",
      spanKind: "AGENT",
      statusCode: "OK",
      startTime: "2026-09-02T17:00:00.010Z",
      endTime: "2026-09-02T17:00:00.040Z",
      latencyMs: 30,
      attributes: { "alo.dsl.node_id": "plan" }
    },
    {
      spanId: "tool-span",
      traceId: "trace-123",
      parentId: "plan-span",
      name: "fetch-context",
      spanKind: "TOOL",
      statusCode: "OK",
      startTime: "2026-09-02T17:00:00.015Z",
      endTime: "2026-09-02T17:00:00.022Z",
      latencyMs: 7,
      attributes: { "alo.dsl.node_id": "plan" }
    }
  ];

  const outline = buildOutline(spans);
  assert.deepEqual(outline, [
    "root · implement-change-run · AGENT · OK · 120ms",
    "plan · plan · AGENT · OK · 30ms",
    "plan · fetch-context · TOOL · OK · 7ms"
  ]);

  const tree = buildTree(spans);
  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.label, "root · implement-change-run");
  assert.equal(tree[0]?.children[0]?.label, "plan · plan");
  assert.equal(tree[0]?.children[0]?.children[0]?.label, "plan · fetch-context");

  assert.match(buildTraceLink("trace-123"), /redirects\/traces\/trace-123$/);
  assert.match(buildSpanLink("root-span"), /redirects\/spans\/root-span$/);
});
