# Threat model

Validated September 2, 2026.

## Scope

This MVP is a local-first browser application that stores product state in SQLite, renders structured JSON artifacts, links to GitHub pull requests through the local `gh` CLI, and optionally queries a local Arize Phoenix runtime for execution traces.

## Assets

- append-only event log
- structured output artifacts
- review decisions and rationales
- local GitHub pull-request snapshots
- Phoenix trace identifiers and annotations
- local diagnostics bundle

## Trust boundaries

- Browser UI to local Express service
- Local Express service to SQLite
- Local Express service to local `gh` CLI
- Local Express service to local Phoenix endpoint on `http://localhost:6006`
- Local filesystem for exports, logs, and diagnostics

## Threat areas and controls

### Secrets and credentials

- Credentials and secrets are not persisted in the event model.
- Structured request logs exclude request bodies and authorization material.
- Diagnostics bundles report tool reachability and health, not tokens.
- Restore accepts only the product-owned export schema and replays the event log.

### Prompts

- Prompts are treated as sensitive tool payloads unless explicitly reduced to metadata.
- Prompt text should not be written into structured logs by default.
- Prompt capture belongs in allowlisted artifacts, not generic transport logs.

### Tool payloads

- Tool inputs and outputs are metadata-only by default.
- JSON evidence keeps provenance, validation state, and missingness labels so reviewers can tell when data is partial or derived.
- High-volume or high-sensitivity payloads should remain outside general diagnostics unless explicitly attached as artifacts.

### Local ports

- The app is local by default and binds to `localhost`.
- Phoenix is expected on `http://localhost:6006` and should not be exposed publicly for the MVP.
- Any non-local binding is out of scope and should be treated as a separate threat review.

### File access

- Durable state lives in the local `data/` directory.
- Export and diagnostics flows produce explicit files rather than mutating arbitrary workspace paths.
- Purge remains a manual operator action because local deletions are hard to recover.

### GitHub tokens and identity

- GitHub access relies on the local `gh` CLI session.
- The app records sync outcomes and canonical repository names, not token material.
- Auth expiration is surfaced as degraded product state instead of triggering blind retries or token inspection.

## Residual risks

- A local machine compromise exposes local SQLite state, exports, and diagnostics.
- Misconfigured hosted or public exposure would bypass the MVP’s local trust assumptions.
- Overly broad future logging could reintroduce prompt or tool payload leakage.

## Required operator checks

- Confirm the app is only bound locally.
- Keep Docker, GitHub CLI auth, and Phoenix local to the workstation.
- Review diagnostics bundles before sharing them externally.
