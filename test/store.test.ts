import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../src/db.js";
import { readDashboardData } from "../src/projections.js";
import { seedDemoData } from "../src/seed.js";
import { EventStore } from "../src/store.js";

function createTempStore(): { store: EventStore; close: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alo-dashboard-"));
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

test("seed data replays into a stable output projection", () => {
  const { store, close } = createTempStore();

  try {
    seedDemoData(store);
    store.refreshProjection();
    const dashboard = readDashboardData(store.database);
    assert.equal(dashboard.outputs.length, 1);
    assert.equal(dashboard.outputs[0]?.status, "awaiting_review");
    assert.equal(dashboard.selectedOutput?.artifacts.length, 2);
    assert.equal(dashboard.selectedOutput?.actions.length, 1);
  } finally {
    close();
  }
});

test("decline decisions require rationale and survive export or restore", () => {
  const { store, close } = createTempStore();

  try {
    seedDemoData(store);
    store.refreshProjection();

    assert.throws(() => {
      store.recordDecision("output-demo-kiro-observability", "declined", null, "ptw1255");
    });

    store.recordDecision("output-demo-kiro-observability", "accepted", "Ready for execution.", "ptw1255");
    const exported = store.exportState();

    const second = createTempStore();
    try {
      second.store.restoreState(exported);
      const events = second.store.listEvents();
      assert.equal(events.at(-1)?.event_type, "decision.recorded");
      const restoredExport = second.store.exportState();
      assert.equal(restoredExport.events.length, exported.events.length);
    } finally {
      second.close();
    }
  } finally {
    close();
  }
});
