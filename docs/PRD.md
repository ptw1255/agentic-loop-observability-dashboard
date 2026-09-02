# Product requirements document

## Product statement

Agentic Loop Observability Dashboard is a local, stateful browser application that joins agent outputs, action items, pull requests, human acceptance decisions, workflow definitions, and execution telemetry into one review surface.

## Problem

Agent orchestration systems can show activity without establishing accountability. Outputs land in files or pull requests, follow-up work is split across comments and task systems, traces live in observability tools, and final decisions are often implicit. This creates four product failures:

1. The artifact is separated from the run that produced it.
2. “Done” is confused with “accepted.”
3. A trace can show activity without showing conformance to the intended workflow.
4. Metrics can look authoritative even when the required telemetry was never captured.

## Primary user

An individual builder or product/engineering lead operating one or more agent loops locally and reviewing their outputs through GitHub.

## Job to be done

When an agent produces a consequential output, help me understand the artifact, its outstanding actions, its implementation status, and the execution evidence behind it so I can make and preserve a defensible accept-or-decline decision.

## User outcomes

| Outcome | Evidence of success |
| --- | --- |
| Review readiness is obvious | Every submitted output has artifact, owner, PR state, open actions, trace link, and telemetry coverage |
| Decisions are explicit | Accepted/declined is stored as an append-only decision event with actor, time, rationale, and supersession history |
| Execution is explainable | Each output links to a trace and an observed tool/function flow |
| Intent and execution can be compared | The run stores the DSL version and maps observed spans to declared node IDs |
| Missing evidence cannot masquerade as zero | Unavailable, not instrumented, redacted, and not applicable are distinct states |
| The app remains lightweight | A local install starts the dashboard and persistent stores with one command |

## Product principles

- Outputs are first-class objects. A PR, file, message, report, or structured payload can all be an output.
- Decisions are first-class events. GitHub merge state and automated evaluation do not substitute for human acceptance.
- Telemetry is evidence, not decoration. Every displayed metric must identify its source and freshness.
- Declared intent and observed execution are separate layers. A missing span is not proof that a step did not occur.
- Raw evidence remains inspectable. Every transformed JSON view links back to exact source data and transformation metadata.
- Local-first is a privacy and usability requirement, not merely a deployment option.

## Core use cases

### 1. Review an output

The user opens the output inbox, filters to `Awaiting review`, selects an output, examines its artifact summary, PR state, action items, evaluations, and telemetry coverage, then records `Accepted`, `Declined`, or `Needs changes`.

### 2. Explain how an output was produced

From output detail, the user opens Loop Observability and sees the declared DSL graph aligned with the observed OpenInference trace. Nodes expose timing, status, inputs/outputs subject to privacy policy, retries, errors, and links to Phoenix.

### 3. Find operational friction

The user compares duration across repeated runs, locates the critical path, identifies slow tools or repeated failures, and distinguishes queue time, model time, tool time, and review time when those signals exist.

### 4. Inspect structured evidence

The user opens a JSON artifact as an accessible table, tree, graph, or compact comparison chosen by schema and task. The original JSON, schema version, source, transformations, and export action remain available.

### 5. Audit a decision

The user can reconstruct what evidence was visible at decision time, which output version was reviewed, who decided, and whether the output was later superseded.

## Functional requirements

### Output and action management

- Create or ingest an output with stable ID, type, title, summary, artifact references, creator, run ID, and timestamps.
- Associate zero or more action items with owner, state, priority, provenance, due date, and completion evidence.
- Associate zero or more GitHub pull requests and retain periodic snapshots of state, review status, checks summary, merge state, and URL.
- Preserve output versions; never silently replace the evidence reviewed in an earlier decision.

### Decision ledger

- Support `draft`, `awaiting_review`, `needs_changes`, `accepted`, `declined`, and `superseded` states.
- Require a rationale for decline and supersession; allow policy to require rationale for acceptance.
- Store decisions as immutable events. Corrections append a new event.
- Distinguish decision state from PR state and automated evaluation result.

### Observability

- Link each run to Phoenix project, trace ID, root span, and optional session ID.
- Render parent/child execution paths from spans.
- Map observed spans to DSL nodes using explicit attributes; display unmapped and unobserved nodes.
- Show duration, error status, retry count, token usage, and evaluation labels only when supported by captured fields.
- Calculate critical path only from measured timestamps and documented graph rules.
- Link to Phoenix for full trace inspection.

### JSON evidence

- Validate JSON artifacts against a named schema when available.
- Choose a view based on evidence task: exact lookup, comparison, sequence, distribution, or graph.
- Always provide raw JSON and an accessible tabular/text equivalent.
- Display source, retrieval time, schema version, transformations, missingness, and truncation status.

### Local operation

- Start the application, database, and Phoenix dependency through one documented local command.
- Persist application state and Phoenix data across restart.
- Keep secrets in environment variables or OS-backed secret storage; never write them into captured artifacts.
- Permit offline review of previously synchronized state.

## Non-functional requirements

- Accessible keyboard navigation, visible focus, semantic headings/tables, non-color status cues, and reduced-motion support.
- Default dashboard load under two seconds for 1,000 outputs on a developer laptop, excluding first-time external synchronization.
- Output detail interaction under 200 ms for locally cached state; long Phoenix queries show progress and retain known-good evidence.
- Append-only audit events and deterministic projection into current state.
- Redaction before telemetry export, with explicit indication that redaction occurred.
- Stable deep links for output, run, trace, and saved-view states.

## Success measures

| Measure | MVP target | Definition |
| --- | ---: | --- |
| Review completeness | 95% | Submitted outputs with artifact, run, PR/action context, and coverage status |
| Decision auditability | 100% | Terminal decisions with actor, time, output version, and rationale policy satisfied |
| Trace linkage | 90% | Agent-created outputs linked to a Phoenix trace |
| DSL mapping coverage | 85% | Observed spans with a declared node mapping, excluding vendor-internal spans |
| Median review lead time | Baseline first | Time from `awaiting_review` to terminal human decision |
| Evidence integrity blockers | 0 at release | Failures against the visualization integrity gates |

These targets must display numerator, denominator, time window, and freshness in the product. They are not meaningful as isolated KPI cards.

## Explicit non-goals for MVP

- Replacing Phoenix’s full trace, evaluation, dataset, or experiment interfaces.
- Hosting a multi-tenant SaaS control plane.
- Automatically accepting, declining, merging, or closing pull requests.
- Editing arbitrary agent workflow DSLs in a visual builder.
- Claiming causal relationships from temporal trace links.
- Capturing prompts, credentials, or private tool payloads without an explicit policy.

## Release acceptance

The MVP passes when one instrumented agent loop can produce an output linked to a GitHub PR, persist action items, export an OpenInference trace to local Phoenix, render declared-versus-observed execution, show honest JSON evidence, survive restart, and preserve a human accept/decline decision with a complete audit trail.

