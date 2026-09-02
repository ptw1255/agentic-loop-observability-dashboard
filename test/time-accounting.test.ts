import test from "node:test";
import assert from "node:assert/strict";
import { calculateTimeAccounting } from "../src/time-accounting.js";
import type { ObservedSpan } from "../src/types.js";

const span = (overrides: Partial<ObservedSpan>): ObservedSpan => ({
  spanId: "span",
  traceId: "trace",
  parentId: null,
  name: "span",
  spanKind: "AGENT",
  statusCode: "OK",
  startTime: "2026-09-02T00:00:00.000Z",
  endTime: "2026-09-02T00:00:01.000Z",
  latencyMs: 1000,
  attributes: {},
  ...overrides
});

test("time accounting removes nested child time from orchestration and preserves wall clock", () => {
  const result = calculateTimeAccounting([
    span({ spanId: "root", name: "run", startTime: at(0), endTime: at(100), latencyMs: 100, parentId: null }),
    span({ spanId: "model", name: "model", spanKind: "LLM", startTime: at(10), endTime: at(40), latencyMs: 30, parentId: "root" }),
    span({ spanId: "tool", name: "tool", spanKind: "TOOL", startTime: at(50), endTime: at(70), latencyMs: 20, parentId: "root" })
  ]);

  assert.equal(result.breakdown.wallClockMs, 100);
  assert.equal(result.breakdown.modelMs, 30);
  assert.equal(result.breakdown.toolMs, 20);
  assert.equal(result.breakdown.orchestrationMs, 50);
  assert.equal(result.breakdown.accountedMs, 100);
  assert.equal(result.breakdown.unaccountedMs, 0);
  assert.equal(result.breakdown.timingCoveragePercentage, 100);
});

test("time accounting unions overlapping parallel tools instead of summing overlap twice", () => {
  const result = calculateTimeAccounting([
    span({ spanId: "root", startTime: at(0), endTime: at(100), latencyMs: 100 }),
    span({ spanId: "tool-a", spanKind: "TOOL", startTime: at(10), endTime: at(60), latencyMs: 50, parentId: "root" }),
    span({ spanId: "tool-b", spanKind: "TOOL", startTime: at(40), endTime: at(80), latencyMs: 40, parentId: "root" })
  ]);

  assert.equal(result.breakdown.toolMs, 70);
  assert.equal(result.spans.find((item) => item.spanId === "tool-a")?.exclusiveDurationMs, 50);
  assert.equal(result.spans.find((item) => item.spanId === "tool-b")?.exclusiveDurationMs, 40);
  assert.equal(result.breakdown.accountedMs, 100);
});

test("incomplete timestamps stay visible and withhold union-based totals", () => {
  const result = calculateTimeAccounting([
    span({ spanId: "root", startTime: at(0), endTime: at(100), latencyMs: 100 }),
    span({ spanId: "tool", spanKind: "TOOL", startTime: null, endTime: null, latencyMs: 20, parentId: "root" })
  ]);

  assert.equal(result.breakdown.timingCoveragePercentage, 50);
  assert.equal(result.breakdown.state, "not_instrumented");
  assert.equal(result.breakdown.toolMs, null);
  assert.equal(result.breakdown.accountedMs, null);
  assert.equal(result.breakdown.unaccountedMs, null);
  assert.equal(result.spans.find((item) => item.spanId === "tool")?.inclusiveDurationMs, 20);
  assert.equal(result.spans.find((item) => item.spanId === "tool")?.exclusiveDurationMs, null);
});

test("explicit queue spans are separated from accounted execution time", () => {
  const result = calculateTimeAccounting([
    span({ spanId: "root", startTime: at(0), endTime: at(100), latencyMs: 100 }),
    span({ spanId: "wait", name: "queue", startTime: at(10), endTime: at(30), latencyMs: 20, parentId: "root", attributes: { "alo.time.category": "queue_wait" } }),
    span({ spanId: "model", spanKind: "LLM", startTime: at(40), endTime: at(60), latencyMs: 20, parentId: "root" })
  ]);

  assert.equal(result.breakdown.queueWaitMs, 20);
  assert.equal(result.breakdown.modelMs, 20);
  assert.equal(result.breakdown.accountedMs, 80);
  assert.equal(result.breakdown.unaccountedMs, 0);
});

function at(milliseconds: number): string {
  return new Date(Date.parse("2026-09-02T00:00:00.000Z") + milliseconds).toISOString();
}
