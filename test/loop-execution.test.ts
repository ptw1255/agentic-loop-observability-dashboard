import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../src/db.js";
import { readLoopExecutionData } from "../src/loop-execution.js";
import { seedDemoData } from "../src/seed.js";
import { EventStore } from "../src/store.js";

test("loop execution command-center data aggregates runs and degrades when Phoenix is unavailable", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alo-loop-execution-"));
  const db = openDatabase(path.join(tempDir, "test.sqlite"));
  const store = new EventStore(db);
  const originalFetch = globalThis.fetch;

  try {
    seedDemoData(store);
    store.refreshProjection();
    globalThis.fetch = async () => ({ ok: false }) as Response;

    const data = await readLoopExecutionData(db, process.cwd(), "all", null);

    assert.equal(data.window, "all");
    assert.equal(data.summary.runsRecorded, 17);
    assert.equal(data.summary.runsWithObservedTrace, 0);
    assert.equal(data.summary.attentionRuns, 17);
    assert.equal(data.summary.traceCoveragePercentage, 0);
    assert.equal(data.runs.length, 17);
    assert.equal(data.selectedRun?.traceState, "degraded");
    assert.equal(data.selectedRun?.spans.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
