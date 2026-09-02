import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../src/db.js";
import { GithubPullRequestAdapter } from "../src/github.js";
import { readOutputDetail } from "../src/projections.js";
import { seedDemoData } from "../src/seed.js";
import { EventStore } from "../src/store.js";

function createTempStore(): { store: EventStore; close: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alo-dashboard-gh-"));
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

test("GitHub adapter records a successful sync snapshot and sync status", async () => {
  const { store, close } = createTempStore();

  try {
    seedDemoData(store);
    store.refreshProjection();

    const adapter = new GithubPullRequestAdapter(store.database, store, async (args) => {
      if (args[0] === "repo") {
        return { stdout: JSON.stringify({ nameWithOwner: "ptw1255/factorio" }), stderr: "" };
      }

      return {
        stdout: JSON.stringify({
          number: 1,
          state: "OPEN",
          isDraft: false,
          reviewDecision: "REVIEW_REQUIRED",
          statusCheckRollup: [{ state: "PENDING" }, { conclusion: "SUCCESS" }],
          commits: [{ oid: "a" }, { oid: "b" }],
          changedFiles: 5,
          updatedAt: "2026-09-02T12:00:00.000Z",
          url: "https://github.com/ptw1255/factorio/pull/1",
          mergedAt: null,
          closed: false,
          title: "Observability stack"
        }),
        stderr: ""
      };
    });

    const status = await adapter.syncOutputPullRequest("output-demo-kiro-observability");
    assert.equal(status.syncState, "sync_ok");

    const detail = readOutputDetail(store.database, "output-demo-kiro-observability");
    assert.equal(detail?.pullRequestSyncStatus?.syncState, "sync_ok");
    assert.equal(detail?.pullRequestSnapshots[0]?.repository, "ptw1255/factorio");
    assert.equal(detail?.pullRequestSnapshots[0]?.fileCount, 5);
  } finally {
    close();
  }
});

test("GitHub adapter preserves cached state and records auth failure", async () => {
  const { store, close } = createTempStore();

  try {
    seedDemoData(store);
    store.refreshProjection();

    const adapter = new GithubPullRequestAdapter(store.database, store, async () => {
      throw new Error("authentication required; run gh auth login");
    });

    const status = await adapter.syncOutputPullRequest("output-demo-kiro-observability");
    assert.equal(status.syncState, "auth_expired");

    const detail = readOutputDetail(store.database, "output-demo-kiro-observability");
    assert.equal(detail?.pullRequestSyncStatus?.syncState, "auth_expired");
    assert.equal(detail?.pullRequestSnapshots.length, 1);
    assert.equal(detail?.pullRequestSnapshots[0]?.repository, "ptw1255/factorio");
  } finally {
    close();
  }
});

test("Relinking a PR clears prior sync state until the next sync", async () => {
  const { store, close } = createTempStore();

  try {
    seedDemoData(store);
    store.refreshProjection();

    const adapter = new GithubPullRequestAdapter(store.database, store, async () => {
      throw new Error("this runner should not be called");
    });

    await adapter.linkPullRequest("output-demo-kiro-observability", "ptw1255/OCE-SENTRY", 1);

    const detail = readOutputDetail(store.database, "output-demo-kiro-observability");
    assert.equal(detail?.summary.pullRequestRepo, "ptw1255/OCE-SENTRY");
    assert.equal(detail?.pullRequestSyncStatus, null);
    assert.equal(detail?.summary.staleReason, "Linked PR has not been synced yet.");
    assert.equal(detail?.pullRequestSnapshots.length, 0);
  } finally {
    close();
  }
});
