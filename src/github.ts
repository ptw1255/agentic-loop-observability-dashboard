import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import type Database from "better-sqlite3";
import { readOutputDetail } from "./projections.js";
import type { EventStore } from "./store.js";
import type { PullRequestSnapshot, PullRequestSyncState, PullRequestSyncStatus } from "./types.js";

const execFileAsync = promisify(execFile);

type RunnerResult = {
  stdout: string;
  stderr: string;
};

type GhRunner = (args: string[]) => Promise<RunnerResult>;

interface RepoViewResponse {
  nameWithOwner: string;
}

interface PrViewResponse {
  number: number;
  state: string;
  isDraft: boolean;
  reviewDecision: string;
  statusCheckRollup: unknown[];
  commits: unknown[];
  changedFiles: number;
  updatedAt: string;
  url: string;
  mergedAt: string | null;
  closed: boolean;
  title: string;
}

export class GithubPullRequestAdapter {
  constructor(
    private readonly db: Database.Database,
    private readonly store: EventStore,
    private readonly runGh: GhRunner = defaultGhRunner
  ) {}

  async syncOutputPullRequest(outputId: string): Promise<PullRequestSyncStatus> {
    const detail = readOutputDetail(this.db, outputId);
    if (!detail?.summary.pullRequestRepo || !detail.summary.pullRequestNumber) {
      throw new Error("Selected output does not have a linked pull request.");
    }

    const linkedRepository = detail.summary.pullRequestRepo;
    const pullRequestNumber = detail.summary.pullRequestNumber;
    const attemptedAt = new Date().toISOString();

    try {
      const repoView = await this.fetchRepoView(linkedRepository);
      const canonicalRepository = repoView.nameWithOwner || linkedRepository;
      const prView = await this.fetchPullRequest(canonicalRepository, pullRequestNumber);
      const snapshot = createSnapshot(canonicalRepository, prView, attemptedAt);
      const syncState: PullRequestSyncState =
        canonicalRepository !== linkedRepository ? "repo_renamed" : "sync_ok";
      const syncMessage =
        canonicalRepository !== linkedRepository
          ? `Repository canonical name updated from ${linkedRepository} to ${canonicalRepository}.`
          : `GitHub pull request synced successfully at ${attemptedAt}.`;

      this.store.append({
        entityId: outputId,
        entityType: "output",
        eventType: "pull_request.snapshot_recorded",
        actor: { kind: "system", id: "github-cli-sync", display_name: "GitHub CLI Sync" },
        source: "github.cli",
        payload: {
          output_id: outputId,
          ...snapshot
        }
      });

      this.store.append({
        entityId: outputId,
        entityType: "output",
        eventType: "pull_request.sync_status_recorded",
        actor: { kind: "system", id: "github-cli-sync", display_name: "GitHub CLI Sync" },
        source: "github.cli",
        payload: {
          output_id: outputId,
          repository: linkedRepository,
          pull_request_number: pullRequestNumber,
          sync_state: syncState,
          sync_message: syncMessage,
          canonical_repository: canonicalRepository,
          last_attempted_at: attemptedAt,
          last_successful_at: attemptedAt,
          rate_limit_reset_at: null
        }
      });

      return {
        repository: linkedRepository,
        pullRequestNumber,
        syncState,
        syncMessage,
        canonicalRepository,
        lastAttemptedAt: attemptedAt,
        lastSuccessfulAt: attemptedAt,
        rateLimitResetAt: null
      };
    } catch (error) {
      const classified = classifyGithubSyncError(error);
      const previous = detail.pullRequestSyncStatus;

      const status: PullRequestSyncStatus = {
        repository: linkedRepository,
        pullRequestNumber,
        syncState: classified.state,
        syncMessage: classified.message,
        canonicalRepository: previous?.canonicalRepository ?? null,
        lastAttemptedAt: attemptedAt,
        lastSuccessfulAt: previous?.lastSuccessfulAt ?? null,
        rateLimitResetAt: classified.rateLimitResetAt
      };

      this.store.append({
        entityId: outputId,
        entityType: "output",
        eventType: "pull_request.sync_status_recorded",
        actor: { kind: "system", id: "github-cli-sync", display_name: "GitHub CLI Sync" },
        source: "github.cli",
        payload: {
          output_id: outputId,
          repository: linkedRepository,
          pull_request_number: pullRequestNumber,
          sync_state: status.syncState,
          sync_message: status.syncMessage,
          canonical_repository: status.canonicalRepository,
          last_attempted_at: status.lastAttemptedAt,
          last_successful_at: status.lastSuccessfulAt,
          rate_limit_reset_at: status.rateLimitResetAt
        }
      });

      return status;
    }
  }

  async linkPullRequest(outputId: string, repository: string, pullRequestNumber: number): Promise<void> {
    this.store.append({
      entityId: outputId,
      entityType: "output",
      eventType: "pull_request.linked",
      actor: { kind: "human", id: "ptw1255", display_name: "ptw1255" },
      source: "dashboard.ui",
      payload: {
        output_id: outputId,
        repository,
        pull_request_number: pullRequestNumber
      }
    });
  }

  private async fetchRepoView(repository: string): Promise<RepoViewResponse> {
    const { stdout } = await this.runGh(["repo", "view", repository, "--json", "nameWithOwner"]);
    return JSON.parse(stdout) as RepoViewResponse;
  }

  private async fetchPullRequest(repository: string, pullRequestNumber: number): Promise<PrViewResponse> {
    const fields = [
      "number",
      "state",
      "isDraft",
      "reviewDecision",
      "statusCheckRollup",
      "commits",
      "changedFiles",
      "updatedAt",
      "url",
      "mergedAt",
      "closed",
      "title"
    ];
    const { stdout } = await this.runGh([
      "pr",
      "view",
      String(pullRequestNumber),
      "-R",
      repository,
      "--json",
      fields.join(",")
    ]);
    return JSON.parse(stdout) as PrViewResponse;
  }
}

function createSnapshot(repository: string, response: PrViewResponse, capturedAt: string): PullRequestSnapshot {
  return {
    snapshotId: crypto.randomUUID(),
    repository,
    pullRequestNumber: response.number,
    state: normalizePullRequestState(response),
    reviewSummary: response.reviewDecision || "No review decision",
    checksSummary: summarizeChecks(response.statusCheckRollup),
    commitCount: response.commits.length,
    fileCount: response.changedFiles,
    capturedAt
  };
}

function normalizePullRequestState(response: PrViewResponse): string {
  if (response.state === "MERGED" || response.mergedAt) {
    return "merged";
  }
  if (response.closed || response.state === "CLOSED") {
    return "closed";
  }
  if (response.isDraft) {
    return "draft";
  }
  return "open";
}

function summarizeChecks(statusCheckRollup: unknown[]): string {
  if (!Array.isArray(statusCheckRollup) || statusCheckRollup.length === 0) {
    return "No checks reported";
  }

  const counts = new Map<string, number>();
  for (const item of statusCheckRollup as Array<Record<string, unknown>>) {
    const key = typeof item.conclusion === "string"
      ? item.conclusion.toLowerCase()
      : typeof item.state === "string"
        ? item.state.toLowerCase()
        : "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => `${count} ${key}`)
    .join(", ");
}

function classifyGithubSyncError(error: unknown): {
  state: PullRequestSyncState;
  message: string;
  rateLimitResetAt: string | null;
} {
  const stderr = extractErrorText(error).toLowerCase();

  if (stderr.includes("rate limit")) {
    return {
      state: "rate_limited",
      message: "GitHub rate limit reached. Cached pull request state remains available.",
      rateLimitResetAt: null
    };
  }

  if (
    stderr.includes("authentication required") ||
    stderr.includes("not logged into any hosts") ||
    stderr.includes("gh auth login") ||
    stderr.includes("token")
  ) {
    return {
      state: "auth_expired",
      message: "GitHub authentication is unavailable or expired. Cached pull request state remains available.",
      rateLimitResetAt: null
    };
  }

  if (
    stderr.includes("could not resolve host") ||
    stderr.includes("network is unreachable") ||
    stderr.includes("connection refused") ||
    stderr.includes("timed out")
  ) {
    return {
      state: "offline",
      message: "GitHub is unreachable from this machine right now. Cached pull request state remains available.",
      rateLimitResetAt: null
    };
  }

  if (
    stderr.includes("could not resolve to a repository") ||
    stderr.includes("no pull requests found") ||
    stderr.includes("not found")
  ) {
    return {
      state: "not_found",
      message: "The linked repository or pull request could not be found. Revalidate the link.",
      rateLimitResetAt: null
    };
  }

  return {
    state: "sync_error",
    message: "GitHub sync failed unexpectedly. Cached pull request state remains available.",
    rateLimitResetAt: null
  };
}

function extractErrorText(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const candidate = error as { stderr?: string; message?: string };
  return candidate.stderr || candidate.message || String(error);
}

async function defaultGhRunner(args: string[]): Promise<RunnerResult> {
  const { stdout, stderr } = await execFileAsync("gh", args, { encoding: "utf8" });
  return { stdout, stderr };
}
