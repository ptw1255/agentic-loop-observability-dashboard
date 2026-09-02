# Agentic Loop Observability Dashboard

> A local control plane for reviewing what agents produced, deciding what ships, and tracing every output back through the loop that created it.

## The product outcome

Agent work should not disappear into chat history, terminal output, or disconnected pull requests. This product creates one durable review surface where a person can answer:

1. What did the agent produce?
2. Which pull request and action items belong to it?
3. Was the output accepted or declined, by whom, and why?
4. Which agent, model, function, and tool path produced it?
5. Where did the loop spend time, fail, retry, or deviate from its declared DSL?
6. Is the evidence complete enough to trust the view?

The MVP is a browser-based local web app. Product state is stored locally. Agent traces and evaluations are supplied by Arize Phoenix through OpenTelemetry and OpenInference.

## The experience in one view

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Agentic Loop Observatory     12 awaiting review   67% accepted   Updated │
├──────────────────────┬───────────────────────────────────────────────────┤
│ OUTPUTS              │ Selected output: Add retry policy                 │
│ ○ Awaiting review 12 │ PR #184 · open · 3 files · Agent run 9e41         │
│ ✓ Accepted        31 │ [Accept] [Decline] [Request change]               │
│ × Declined         4 ├───────────────────────────────────────────────────┤
│                      │ ACTIONS     2 open / 5 total                       │
│ PR #184  Awaiting    │ □ Validate backoff  □ Add timeout evidence        │
│ PR #179  Accepted    ├───────────────────────────────────────────────────┤
│ PR #173  Declined    │ EXECUTION — declared DSL vs observed trace         │
│                      │ plan → code → test → review → output               │
│                      │  42ms   8.4s   2.1s    1.3s                        │
│                      ├───────────────────────────────────────────────────┤
│                      │ Evidence: 94% captured · 2 telemetry gaps          │
└──────────────────────┴───────────────────────────────────────────────────┘
```

## Product model

```mermaid
flowchart LR
    L[Agentic loop] --> R[Run]
    R --> O[Output]
    O --> P[Pull request]
    O --> A[Action items]
    O --> D{Human decision}
    D -->|Accept| AC[Accepted]
    D -->|Decline + reason| DE[Declined]
    R --> T[Phoenix trace]
    T --> S[Spans and evaluations]
    R --> X[DSL version]
    X --> G[Declared graph]
    S --> G2[Observed execution graph]
    G --> C[Conformance comparison]
    G2 --> C
```

## MVP surfaces

| Surface | Decision it supports |
| --- | --- |
| Output inbox | What needs review now? |
| Output detail | What changed, what evidence exists, and what remains open? |
| PR tracker | Where is the implementation in the GitHub lifecycle? |
| Accept/decline ledger | What decision was made, by whom, when, and with what rationale? |
| Loop observability | Which tools/functions ran, in what order, for how long, and with what result? |
| DSL conformance | Did the observed run match the declared workflow? |
| JSON evidence views | Can a reviewer inspect structured output without losing source, scope, or exact values? |
| Telemetry coverage | Which claims are observed, derived, or unavailable? |

## Recommended MVP architecture

```text
Agent runtimes ──OTLP/OpenInference──> Arize Phoenix (local)
      │                                      │
      │ output/action events                 │ spans, annotations, evals
      v                                      v
Local web service ─────────────────────> Adapter/query layer
      │                                      │
      ├── SQLite: state + decisions           ├── Phoenix client/REST API
      ├── Artifact directory: JSON/files      └── GitHub API polling
      └── Browser: HTML/CSS/TypeScript
```

The proposed implementation is local-first:

- browser UI served from `localhost`;
- a small TypeScript service for APIs, ingestion, GitHub sync, and Phoenix queries;
- SQLite for outputs, actions, decisions, PR snapshots, DSL versions, and trace links;
- Phoenix in a pinned local container for traces, spans, annotations, and evaluations;
- no GitHub Actions or hosted runner dependency for the MVP.

## State model

`Accepted` and `Declined` are human decisions, not aliases for GitHub merge state or automated evaluation results.

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> AwaitingReview: submit
    AwaitingReview --> NeedsChanges: request change
    NeedsChanges --> AwaitingReview: resubmit
    AwaitingReview --> Accepted: human decision
    AwaitingReview --> Declined: human decision + reason
    Accepted --> Superseded: newer output replaces it
    Declined --> AwaitingReview: explicit reopen
```

## What is already specified

- [Outcome-led PRD](docs/PRD.md)
- [Architecture and ownership boundaries](docs/ARCHITECTURE.md)
- [Telemetry, Phoenix, and DSL contract](docs/TELEMETRY-CONTRACT.md)
- [Dashboard and loop-detail wireframes](docs/WIREFRAMES.md)
- [JSON visualization acceptance criteria](docs/VISUALIZATION-ACCEPTANCE-CRITERIA.md)
- [Ordered MVP implementation plan](docs/MVP-IMPLEMENTATION-PLAN.md)
- [Machine-readable schema](schemas/agentic-loop-observability.schema.json)
- [Example stateful capture](examples/loop-run.example.json)

## MVP definition of done

The MVP is complete when a reviewer can open one local URL, select an output, inspect its PR and action items, see the declared and observed loop paths, review duration/error/evaluation evidence, inspect the underlying JSON, and record an auditable accept or decline decision that survives restart.

The first release intentionally excludes remote multi-user hosting, autonomous merge, generalized workflow authoring, and an attempt to replace the full Phoenix trace UI.

## Related work

- [`ptw1255/agent-task-dashboard`](https://github.com/ptw1255/agent-task-dashboard) demonstrates the lightweight local dashboard pattern and Apple-inspired interaction direction.
- [`ptw1255/Kiro-Observability`](https://github.com/ptw1255/Kiro-Observability) is a candidate agent-loop adapter and already exposes local telemetry concepts that can be mapped into the contract.
- [`ptw1255/Skill-Clean-Data-Presentation`](https://github.com/ptw1255/Skill-Clean-Data-Presentation) is the required evidence-presentation standard for every chart, graph, table, and JSON view.

## Run it locally

```bash
npm install
npm run build
npm run start
```

Open `http://localhost:4173`.

The current MVP slice includes:

- a local TypeScript service and semantic HTML/CSS/TypeScript browser UI;
- SQLite-backed append-only events and deterministic current-state projections;
- seeded demo data for one pilot loop and one output review flow;
- append-only accept, decline, and needs-changes decisions;
- export and restore of local state;
- JSON evidence views with compact, table, tree, and raw modes.

## Current execution status

Implemented now:

- `#4` Freeze v1 contracts
- `#1` Append-only event store and projections
- `#2` MVP browser UI vertical slice
- `#3` Review policy, privacy defaults, and backup or restore path

Still pending:

- live GitHub PR sync and adapter hardening
- Phoenix and OpenInference trace integration
- declared-versus-observed DSL conformance and DAG rendering
- pilot hardening and diagnostics bundle
