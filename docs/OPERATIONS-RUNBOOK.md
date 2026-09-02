# Operations runbook

Validated September 2, 2026.

## Startup

1. Install dependencies with `npm install`.
2. Optionally start Phoenix with `npm run phoenix:up`.
3. Build the app with `npm run build`.
4. Start the local service with `npm run start`.
5. Open `http://localhost:4173`.

## Shutdown

1. Stop the local Node process.
2. If Phoenix was started, stop it with `npm run phoenix:down`.
3. Preserve `data/` if you want durable state, logs, and exports.

## Upgrade

1. Pull the latest repo state.
2. Run `npm install`.
3. Run `npm run typecheck`, `npm test`, and `npm run build`.
4. Start the app once so versioned schema migrations apply.
5. Download a diagnostics bundle and confirm migration verification passes.

## Recovery

1. Download or locate the latest export JSON.
2. Start the app on a clean or disposable local database.
3. Use the restore flow in the UI or `POST /api/restore`.
4. Confirm the diagnostics bundle reports a passing backup or restore drill.

## Backup and restore drill

- Export local state from the toolbar.
- Trigger diagnostics download.
- Confirm the bundle reports:
  - `backupRestoreDrill.passed: true`
  - matching event counts before and after replay
  - `migrationVerification.passed: true`

## Purge

Purge is manual in `v0`:

1. Stop the app.
2. Delete the local `data/` directory only if you intend to remove state, logs, and cached snapshots.
3. Restart the app to regenerate an empty local database and seeded pilot state.

## Expected degraded states

- If Phoenix is unavailable, review, decisions, PR sync state, and diagnostics continue to work.
- If GitHub auth expires, cached PR state remains visible and sync failure is explicit.
- If restore input is invalid, the existing local state remains intact.
