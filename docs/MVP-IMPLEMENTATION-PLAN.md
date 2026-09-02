# Ordered MVP implementation plan

## Delivery strategy

Build a vertical slice around one loop and one output type before generalizing adapters. Each phase ends with inspectable user evidence, not only infrastructure completion.

## Phase 0 — Freeze contracts

Outcome: runtime, dashboard, GitHub, and Phoenix can exchange stable identities without hidden assumptions.

- Finalize the JSON schema and event vocabulary.
- Choose one pilot loop and define its versioned DSL.
- Inventory existing telemetry and mark every required signal as observed, derived, or missing.
- Establish privacy policy, payload allowlists, retention, and redaction tests.
- Define output review policy: who can decide and which rationale fields are required.

Exit evidence:

- one validated example capture;
- one DSL graph with node/edge meanings;
- one telemetry gap register with owners;
- no unresolved identity/join ambiguity.

## Phase 1 — Stateful output review

Outcome: the app is useful before trace integration.

- Scaffold local TypeScript service and semantic HTML application.
- Add SQLite migrations, append-only domain events, and current-state projections.
- Implement outputs, immutable artifact versions, action items, and decision ledger.
- Build output inbox and output detail with empty/error/stale states.
- Add local backup/export and deterministic restore tests.

Exit evidence:

- accept/decline survives restart and remains bound to the reviewed output version;
- concurrent/conflicting decisions preserve history;
- 1,000-output fixture meets the local load target.

## Phase 2 — GitHub pull-request adapter

Outcome: reviewers see implementation lifecycle beside product decisions.

- Link repository and PR number to an output.
- Poll GitHub from localhost and store timestamped snapshots.
- Display PR open/closed/merged, review/check summary, commits/files counts, and staleness.
- Keep human decision status independent from PR state.
- Add rate-limit, auth-loss, repository-rename, and offline behavior.

Exit evidence:

- one output shows current and historical PR snapshots;
- cached PR state remains usable offline;
- no automatic merge or GitHub Actions runner is introduced.

## Phase 3 — Phoenix and OpenInference integration

Outcome: every pilot output opens into its producing trace.

- Add pinned local Phoenix container and persistent volume.
- Instrument the pilot loop with OpenTelemetry/OpenInference.
- Add `alo.*` correlation attributes at root and node boundaries.
- Query linked spans, annotations, and evaluations through supported Phoenix APIs.
- Render a textual execution outline first, then a tree view.
- Deep-link every trace and span to Phoenix when possible.

Exit evidence:

- output → run → Phoenix trace round trip works after restart;
- successful and failed tool calls expose duration/status;
- Phoenix downtime does not block output review or decisions.

## Phase 4 — DSL conformance and DAG

Outcome: reviewers can compare intended orchestration with observed behavior.

- Parse versioned DSL nodes, edges, outcomes, and telemetry requirements.
- Map spans to nodes using explicit IDs.
- Render declared and observed layers with separate edge grammar.
- Surface declared-not-observed, observed-unmapped, retries, errors, and missing evidence.
- Add explicit dependency records for fan-in, fan-out, cross-run, or cross-output links.
- Calculate critical path only when graph/timing completeness gates pass.

Exit evidence:

- a deliberately divergent fixture produces the correct conformance findings;
- no temporal adjacency is presented as causation;
- graph has keyboard/text equivalent and export.

## Phase 5 — JSON evidence visualizations

Outcome: structured agent output becomes reviewable without losing exactness or provenance.

- Add schema validation and source/transformation metadata.
- Implement table, tree, raw, and task-specific compact views.
- Add saved paths/filters and stable deep links.
- Apply the Clean Data Presentation acceptance checklist in component tests and visual review.
- Verify missingness, precision, large payload, truncation, responsive, dark-mode, keyboard, and export states.

Exit evidence:

- every transformed mark or value traces to a JSON path or documented derivation;
- raw JSON and accessible equivalent are always available;
- all integrity gates pass.

## Phase 6 — Pilot hardening

Outcome: the product supports repeated daily review of a real loop.

- Run a 20-output pilot across accepted, declined, needs-change, stale, failed, and superseded states.
- Measure review completeness, trace linkage, DSL mapping coverage, and review lead time with denominators.
- Add migrations, backup/restore drill, structured logs, and diagnostics bundle.
- Threat-model credentials, prompt/tool payloads, local ports, file access, and GitHub tokens.
- Document one-command startup, shutdown, upgrade, recovery, and data purge.

Exit evidence:

- release acceptance scenario in the PRD passes end to end;
- no blocking visualization integrity failures;
- telemetry gaps are visible with repair owners, not buried in logs.

## Test strategy

| Layer | Tests |
| --- | --- |
| Contracts | JSON Schema fixtures, migration compatibility, event idempotency |
| Domain | State transition tables, immutable decisions, supersession, conflict resolution |
| GitHub adapter | Recorded API fixtures, pagination, auth/rate-limit/offline handling |
| Phoenix adapter | Span trees, delayed traces, annotations, errors, missing attributes |
| DSL mapping | exact mapping, unmapped spans, unobserved nodes, cycles rejected, typed edges |
| Metrics | denominator/window tests, missingness, overlap/critical-path fixtures |
| UI | keyboard, focus, screen-reader semantics, responsive states, error recovery |
| Visual integrity | source/freshness, common scales, direct labels, non-color cues, raw evidence access |
| End to end | output ingest → PR sync → trace view → decision → restart → audit |

## Initial backlog in build order

1. Contract validator and example fixture.
2. Event store and projections.
3. Output inbox/detail and decision ledger.
4. Artifact store and JSON raw view.
5. GitHub PR polling adapter.
6. Phoenix local deployment and trace adapter.
7. OpenInference instrumentation adapter for the pilot loop.
8. DSL parser and mapping report.
9. Observed/declared graph and textual equivalent.
10. JSON tables/trees and visualization review harness.
11. Metrics definitions and coverage register.
12. Backup, diagnostics, privacy hardening, and pilot documentation.

## Decisions to make before coding

- Select the first agent runtime/loop adapter.
- Confirm TypeScript or approve Python based on a short SDK spike.
- Choose the graph library only after accessible SVG and export proof.
- Define whether GitHub review/check details are needed in MVP or a summary is sufficient.
- Define retention for raw trace payloads and immutable artifacts.
- Decide whether decisions require local identity only or GitHub identity verification.

