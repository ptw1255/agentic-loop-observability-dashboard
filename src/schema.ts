import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import domainEventSchema from "../schemas/domain-event.schema.json" with { type: "json" };
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

export function validateDomainEvent(event: DomainEvent): void {
  if (!validate(event)) {
    const details = ajv.errorsText(validate.errors, { separator: "\n" });
    throw new Error(`Invalid domain event:\n${details}`);
  }
}
