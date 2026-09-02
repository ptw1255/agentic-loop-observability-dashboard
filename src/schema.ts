import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import agenticLoopObservabilitySchema from "../schemas/agentic-loop-observability.schema.json" with { type: "json" };
import domainEventSchema from "../schemas/domain-event.schema.json" with { type: "json" };
import prdSummarySchema from "../schemas/prd.summary.schema.json" with { type: "json" };
import telemetryCoverageSchema from "../schemas/telemetry.coverage.schema.json" with { type: "json" };
import type { DomainEvent } from "./types.js";

type ValidatorHost = {
  compile: <T>(schema: unknown) => {
    (value: unknown): value is T;
    errors?: unknown;
  };
  errorsText: (errors?: unknown, options?: { separator?: string }) => string;
};

const AjvConstructor = Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => ValidatorHost;
const ajv = new AjvConstructor({ allErrors: true, strict: true });

(addFormats as unknown as (instance: ValidatorHost) => void)(ajv);

const validate = ajv.compile<DomainEvent>(domainEventSchema);
const artifactValidators = new Map<string, ReturnType<ValidatorHost["compile"]>>([
  ["prd.summary/v1", ajv.compile(prdSummarySchema)],
  ["telemetry.coverage/v1", ajv.compile(telemetryCoverageSchema)],
  ["agentic-loop-observability/v1", ajv.compile(agenticLoopObservabilitySchema)]
]);

export function validateDomainEvent(event: DomainEvent): void {
  if (!validate(event)) {
    const details = ajv.errorsText(validate.errors, { separator: "\n" });
    throw new Error(`Invalid domain event:\n${details}`);
  }
}

export function getArtifactValidation(
  schemaId: string | null,
  artifactJson: unknown
): { validationStatus: "valid" | "invalid" | "unavailable"; validationDetails: string | null } {
  if (!schemaId) {
    return { validationStatus: "unavailable", validationDetails: "No schema attached." };
  }

  const validator = artifactValidators.get(schemaId);
  if (!validator) {
    return { validationStatus: "unavailable", validationDetails: `Schema ${schemaId} is not available locally.` };
  }

  if (validator(artifactJson)) {
    return { validationStatus: "valid", validationDetails: `Validated against ${schemaId}.` };
  }

  return {
    validationStatus: "invalid",
    validationDetails: ajv.errorsText(validator.errors, { separator: "\n" })
  };
}
