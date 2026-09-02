# Review policy and local operations

Validated September 2, 2026.

## Pilot loop scope

`implement-change` version `1.0.0` is the only pilot loop in scope for `v1` runtime and UI work. Additional loops should not be added until the event schema, join keys, and review workflow are proven stable against this one.

## Review state policy

Allowed current states:

- `draft`
- `awaiting_review`
- `needs_changes`
- `accepted`
- `declined`
- `superseded`

Valid transitions:

- `draft` -> `awaiting_review`
- `awaiting_review` -> `needs_changes`
- `awaiting_review` -> `accepted`
- `awaiting_review` -> `declined`
- `needs_changes` -> `awaiting_review`
- `accepted` -> `superseded`
- `declined` -> `superseded`

Rules:

- `declined` requires a rationale.
- `superseded` requires a rationale and the replacement output version when one exists.
- `accepted` rationale is optional in `v1`, but the actor and timestamp are always required.
- Human decisions are product-owned events and remain separate from GitHub state, automated evaluations, or trace annotations.

## Join keys

Every output and run integration must preserve:

- `alo.loop_definition_id`
- `alo.dsl_version`
- `alo.run_id`
- `alo.output_id`
- `alo.output_version`
- `alo.dsl.node_id`

## Privacy and retention defaults

- Credentials and secrets are never captured.
- Tool inputs and outputs are metadata-only unless explicitly allowlisted.
- Redaction occurs before telemetry export, not just during rendering.
- Excluded or redacted fields must remain explicitly labeled as `redacted`, `not_instrumented`, `unavailable`, or `not_applicable`.
- Local event log retention is indefinite for `v1` unless the user manually purges the workspace.
- Artifact payload retention is local-first and content-addressed. Artifacts can be purged independently of event history.

## Export and restore

- Export format: versioned JSON document with metadata, event log, and export timestamp.
- Restore target: empty or disposable local state for deterministic replay.
- Restore must rebuild projections from the event log rather than importing mutable projection tables as source-of-truth.

## Telemetry gap register

| Signal | Status | Notes |
| --- | --- | --- |
| `alo.run_id` and trace linkage | observed | Required for output-to-run joins |
| `alo.output_id` and `alo.output_version` | observed | Must exist at output creation time |
| `alo.dsl.node_id` | missing | Required for conformance and node-level views |
| Span timing and status | observed | Available through OpenTelemetry instrumentation |
| Retry identity | missing | Must not be inferred from repeated names |
| Queue or wait time | missing | Requires explicit spans or events |
| Human decision rationale | observed | Product-owned event field |
| Pull request history | missing | Product adapter responsibility |
| Artifact provenance metadata | observed | Stored in output version payload |
