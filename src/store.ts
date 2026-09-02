import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { buildProjection, writeProjection } from "./projections.js";
import { validateDomainEvent } from "./schema.js";
import type { Actor, DecisionState, DomainEvent } from "./types.js";

interface NewEventInput<TPayload extends Record<string, unknown>> {
  entityId: string;
  entityType: DomainEvent["entity_type"];
  eventType: DomainEvent["event_type"];
  actor: Actor;
  source: string;
  payload: TPayload;
  occurredAt?: string;
  idempotencyKey?: string | null;
}

export interface ExportPayload {
  schemaVersion: "alo.export/v1";
  exportedAt: string;
  metadata: {
    pilotLoopId: string;
    pilotLoopVersion: string;
  };
  events: DomainEvent[];
}

export class EventStore {
  constructor(private readonly db: Database.Database) {}

  get database(): Database.Database {
    return this.db;
  }

  append<TPayload extends Record<string, unknown>>(input: NewEventInput<TPayload>): DomainEvent<TPayload> {
    const now = new Date().toISOString();
    const event: DomainEvent<TPayload> = {
      event_id: crypto.randomUUID(),
      entity_id: input.entityId,
      entity_type: input.entityType,
      event_type: input.eventType,
      idempotency_key: input.idempotencyKey ?? null,
      occurred_at: input.occurredAt ?? now,
      recorded_at: now,
      actor: input.actor,
      source: input.source,
      schema_version: "alo.events/v1",
      payload: input.payload
    };

    validateDomainEvent(event as DomainEvent);

    this.db
      .prepare(`
        INSERT INTO events (
          event_id, entity_id, entity_type, event_type, idempotency_key, occurred_at, recorded_at,
          actor_kind, actor_id, actor_display_name, source, schema_version, payload_json
        ) VALUES (
          @event_id, @entity_id, @entity_type, @event_type, @idempotency_key, @occurred_at, @recorded_at,
          @actor_kind, @actor_id, @actor_display_name, @source, @schema_version, @payload_json
        )
      `)
      .run({
        ...event,
        actor_kind: event.actor.kind,
        actor_id: event.actor.id,
        actor_display_name: event.actor.display_name ?? null,
        payload_json: JSON.stringify(event.payload)
      });

    this.refreshProjection();
    return event;
  }

  listEvents(): DomainEvent[] {
    const rows = this.db
      .prepare(`
        SELECT
          event_id,
          entity_id,
          entity_type,
          event_type,
          idempotency_key,
          occurred_at,
          recorded_at,
          actor_kind,
          actor_id,
          actor_display_name,
          source,
          schema_version,
          payload_json
        FROM events
        ORDER BY occurred_at ASC, recorded_at ASC, event_id ASC
      `)
      .all() as Array<{
        event_id: string;
        entity_id: DomainEvent["entity_id"];
        entity_type: DomainEvent["entity_type"];
        event_type: DomainEvent["event_type"];
        idempotency_key: string | null;
        occurred_at: string;
        recorded_at: string;
        actor_kind: Actor["kind"];
        actor_id: string;
        actor_display_name: string | null;
        source: string;
        schema_version: DomainEvent["schema_version"];
        payload_json: string;
      }>;

    return rows.map((row) => ({
        event_id: row.event_id,
        entity_id: row.entity_id,
        entity_type: row.entity_type,
        event_type: row.event_type,
        idempotency_key: row.idempotency_key,
        occurred_at: row.occurred_at,
        recorded_at: row.recorded_at,
        actor: {
          kind: row.actor_kind,
          id: row.actor_id,
          display_name: row.actor_display_name
        },
        source: row.source,
        schema_version: row.schema_version,
        payload: JSON.parse(row.payload_json)
      })) as DomainEvent[];
  }

  refreshProjection(): void {
    const projection = buildProjection(this.listEvents());
    writeProjection(this.db, projection);
  }

  exportState(): ExportPayload {
    return {
      schemaVersion: "alo.export/v1",
      exportedAt: new Date().toISOString(),
      metadata: {
        pilotLoopId: "implement-change",
        pilotLoopVersion: "1.0.0"
      },
      events: this.listEvents()
    };
  }

  restoreState(payload: ExportPayload): void {
    if (payload.schemaVersion !== "alo.export/v1") {
      throw new Error(`Unsupported export schema version: ${payload.schemaVersion}`);
    }

    const transaction = this.db.transaction(() => {
      this.db.exec(`
        DELETE FROM events;
        DELETE FROM output_projection;
        DELETE FROM artifact_projection;
        DELETE FROM action_projection;
        DELETE FROM decision_projection;
        DELETE FROM telemetry_projection;
        DELETE FROM run_projection;
        DELETE FROM pull_request_projection;
        DELETE FROM pull_request_sync_projection;
      `);

      const insert = this.db.prepare(`
        INSERT INTO events (
          event_id, entity_id, entity_type, event_type, idempotency_key, occurred_at, recorded_at,
          actor_kind, actor_id, actor_display_name, source, schema_version, payload_json
        ) VALUES (
          @event_id, @entity_id, @entity_type, @event_type, @idempotency_key, @occurred_at, @recorded_at,
          @actor_kind, @actor_id, @actor_display_name, @source, @schema_version, @payload_json
        )
      `);

      for (const event of payload.events) {
        validateDomainEvent(event);
        insert.run({
          ...event,
          actor_kind: event.actor.kind,
          actor_id: event.actor.id,
          actor_display_name: event.actor.display_name ?? null,
          payload_json: JSON.stringify(event.payload)
        });
      }
    });

    transaction();
    this.refreshProjection();
  }

  recordDecision(outputId: string, state: DecisionState, rationale: string | null, actorName: string): DomainEvent {
    const currentVersion = this.db
      .prepare("SELECT current_version FROM output_projection WHERE output_id = ?")
      .get(outputId) as { current_version: number } | undefined;

    if (!currentVersion) {
      throw new Error(`Unknown output: ${outputId}`);
    }

    if ((state === "declined" || state === "superseded") && !rationale?.trim()) {
      throw new Error(`${state} decisions require a rationale.`);
    }

    return this.append({
      entityId: outputId,
      entityType: "output",
      eventType: "decision.recorded",
      actor: { kind: "human", id: actorName.toLowerCase().replace(/\s+/g, "-"), display_name: actorName },
      source: "dashboard.ui",
      payload: {
        state,
        rationale,
        output_version: currentVersion.current_version
      }
    });
  }
}
