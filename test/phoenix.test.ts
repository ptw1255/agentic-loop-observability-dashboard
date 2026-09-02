import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../src/db.js";
import { getObservabilityForOutput } from "../src/phoenix.js";
import { seedDemoData } from "../src/seed.js";
import { EventStore } from "../src/store.js";

function createTempStore(): { store: EventStore; close: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alo-dashboard-phoenix-"));
  const dbPath = path.join(tempDir, "test.sqlite");
  const db = openDatabase(dbPath);
  const store = new EventStore(db);
  return {
    store,
    close: () => {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

test("observability falls back cleanly when Phoenix is unavailable", async () => {
  const { store, close } = createTempStore();
  const originalFetch = globalThis.fetch;

  try {
    seedDemoData(store);
    store.refreshProjection();

    globalThis.fetch = async () => ({ ok: false }) as Response;

    const summary = await getObservabilityForOutput(store.database, "output-demo-kiro-observability");
    assert.equal(summary.available, false);
    assert.equal(summary.runId, "run-2026-09-02-001");
    assert.equal(summary.projectName, "agentic-loop-observability-dashboard");
    assert.match(summary.message, /Phoenix is unavailable/i);
  } finally {
    globalThis.fetch = originalFetch;
    close();
  }
});
