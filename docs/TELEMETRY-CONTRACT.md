# Telemetry, Phoenix, and DSL contract

## Why two contracts are needed

OpenInference describes observed AI execution. The Agentic Loop DSL describes intended orchestration and product outcomes. The dashboard joins both, but it must not rewrite one as the other.

## OpenInference baseline

The integration should preserve standard OpenInference span kinds such as `AGENT`, `CHAIN`, `LLM`, `TOOL`, `RETRIEVER`, `RERANKER`, `EMBEDDING`, `GUARDRAIL`, `EVALUATOR`, and `PROMPT`. Standard attributes remain the source for operation timing, status, inputs/outputs, model identity, token usage, and tool data when captured.

Phoenix supplies trace storage, trace/span inspection, annotations, evaluations, projects, and query APIs. The dashboard should deep-link to Phoenix rather than duplicate every debugging feature.

## DSL draft

```yaml
apiVersion: alo/v0alpha1
kind: AgenticLoop
metadata:
  id: implement-change
  version: 0.1.0
  title: Implement and review a product change
spec:
  inputs:
    - id: request
      schema: schemas/request.schema.json
  nodes:
    - id: plan
      kind: agent
      produces: [implementation_plan]
      telemetry:
        required: [duration, status, input_ref, output_ref]
    - id: code
      kind: agent
      consumes: [implementation_plan]
      produces: [working_tree]
    - id: test
      kind: tool
      consumes: [working_tree]
      produces: [test_evidence]
    - id: review
      kind: evaluator
      consumes: [working_tree, test_evidence]
      produces: [review_findings]
    - id: output
      kind: output
      consumes: [working_tree, test_evidence, review_findings]
      produces: [pull_request]
  edges:
    - { from: plan, to: code, meaning: sequence }
    - { from: code, to: test, meaning: dependency }
    - { from: test, to: review, meaning: dependency }
    - { from: review, to: output, meaning: gate }
  outcomes:
    - id: reviewable_change
      measure: output.review_completeness
      target: 1
  privacy:
    defaultCapture: metadata_only
    allow: [operation_name, duration, status, token_count]
    deny: [credentials, secrets]
```

## Span mapping

Each instrumented DSL node should create or map to at least one span. Add custom attributes only for concepts not already represented by OpenInference.

| Dashboard concept | Source field |
| --- | --- |
| Run | `alo.run_id` plus OpenTelemetry trace ID |
| Declared node | `alo.dsl.node_id` |
| DSL version | `alo.dsl_version` |
| Output | `alo.output_id`, `alo.output_version` |
| Operation type | `openinference.span.kind` |
| Parent/child flow | OpenTelemetry span parent relationship |
| Duration | Span start/end timestamps |
| Success/error | Span status and error attributes |
| Model/tool detail | OpenInference semantic attributes |
| Human/automated quality | Phoenix annotations/evaluations with annotator kind |

## Evidence status vocabulary

Every metric or node claim has one of these statuses:

```text
observed          directly present in source telemetry
derived           calculated from named observed fields
declared          present only in the DSL
redacted          captured but intentionally concealed
not_instrumented  the runtime does not emit the required field
unavailable       expected, but the source cannot currently be reached
not_applicable    the signal does not apply to this node or output
```

Zero is a value. It is never used for any of these states.

## Metric definitions

| Metric | Definition | Required evidence |
| --- | --- | --- |
| Run duration | Root span end minus start | Complete root timestamps |
| Node duration | Span end minus start | Complete span timestamps |
| Critical path | Longest measured dependency path under documented overlap rules | Complete timestamps plus graph edges |
| Tool error rate | Error tool spans / completed tool spans | Span kind and status; named window |
| Retry count | Explicit retry events for the same logical node invocation | Retry ID/attempt attributes; never inferred only from repeated names |
| Mapping coverage | Mapped eligible spans / eligible observed spans | Span inventory and node IDs |
| Declared-node coverage | Observed declared nodes / eligible declared nodes | Versioned DSL and mapped spans |
| Acceptance rate | Accepted terminal decisions / accepted + declined terminal decisions | Decision ledger; named cohort/window |
| Review lead time | Terminal decision time minus submitted-for-review time | Output event history |
| Action completion | Completed actions / all actions in defined output cohort | Action state history |

## Telemetry gap register

The MVP must expose this register in product UI and documentation.

| Signal | Expected source | Baseline | Required work if absent |
| --- | --- | --- | --- |
| Trace/span IDs and hierarchy | OpenTelemetry/Phoenix | Available | Instrument root context propagation |
| Agent, tool, LLM, retrieval kinds | OpenInference | Available when instrumented | Add/manual instrumentation for custom orchestration |
| Span duration and status | OpenTelemetry | Available | Ensure all spans close on success and error |
| Inputs/outputs | OpenInference | Conditional and privacy-sensitive | Define allowlist, redaction, size limits |
| Model/token fields | OpenInference provider instrumentation | Conditional | Show `not_instrumented`; do not estimate silently |
| DSL node identity | Custom `alo.*` attributes | Not standard | Add runtime adapter at node boundaries |
| DSL transition identity | Custom attribute/event | Usually absent | Emit transition event only where edge measurement matters |
| Queue/wait time | Custom spans/events | Usually absent | Separate waiting from execution timestamps |
| Retry identity | Custom attributes | Usually absent | Emit logical invocation ID and attempt number |
| Output/action lineage | Product event API | Not in Phoenix by default | Emit output/action IDs and immutable artifact refs |
| PR state/history | GitHub adapter | Available after link | Poll and snapshot; identify staleness |
| Human accept/decline | Decision ledger | Product-owned | Store actor, rationale, output version, timestamp |
| True cross-run DAG links | DSL/product edge records | Not represented by span tree | Add explicit typed, evidence-linked edges |

## Minimum instrumentation acceptance

One pilot loop passes when:

- the root trace carries run, loop, DSL version, and output IDs;
- every material DSL node is mapped or explicitly reported as not instrumented;
- tool, LLM, and evaluator calls preserve OpenInference kinds;
- duration/status can be computed for all completed observed nodes;
- retries have explicit attempt identity;
- output and action events reference immutable artifacts;
- private payload fields are redacted before export;
- Phoenix unavailability does not prevent local decisions.

## Arize/Phoenix implementation notes

- Use a pinned Phoenix version in the eventual local container definition.
- Export traces through OTLP and query spans/annotations through the supported Phoenix client or REST APIs.
- Use Phoenix projects to separate applications or environments.
- Use Phoenix annotations/evaluations as quality evidence; preserve whether the annotator is human, code, or an LLM.
- Treat the dashboard’s custom DAG and DSL-conformance views as derived views. Phoenix remains the drill-down destination for raw trace inspection.

## Primary references

Validated September 2, 2026:

- [OpenInference specification](https://arize-ai.github.io/openinference/spec/)
- [OpenInference semantic conventions](https://arize-ai.github.io/openinference/spec/semantic_conventions.html)
- [Phoenix tracing and evaluation overview](https://arize.com/docs/phoenix)
- [Phoenix local Docker deployment](https://arize.com/docs/phoenix/self-hosting/deployment-options/docker)
- [Phoenix custom span attributes and metadata](https://arize.com/docs/phoenix/tracing/how-to-tracing/add-metadata/customize-spans)
- [Phoenix span export and query guidance](https://arize.com/docs/phoenix/tracing/how-to-tracing/importing-and-exporting-traces/extract-data-from-spans)
- [Phoenix annotations API guidance](https://arize.com/docs/phoenix/tracing/how-to-tracing/feedback-and-annotations/capture-feedback)
