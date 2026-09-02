import test from "node:test";
import assert from "node:assert/strict";
import { getArtifactValidation } from "../src/schema.js";

test("artifact validation reports valid, invalid, and unavailable states explicitly", () => {
  const validPrd = getArtifactValidation("prd.summary/v1", {
    objective: "Ship a reviewable PRD",
    outcomes: ["Trace outputs to runs"],
    next_actions: ["Wire the dashboard"]
  });
  assert.equal(validPrd.validationStatus, "valid");

  const invalidPrd = getArtifactValidation("prd.summary/v1", {
    objective: "",
    outcomes: [],
    next_actions: []
  });
  assert.equal(invalidPrd.validationStatus, "invalid");
  assert.match(invalidPrd.validationDetails ?? "", /must NOT|must NOT have fewer than/i);

  const unavailable = getArtifactValidation("unknown.schema/v1", { any: "value" });
  assert.equal(unavailable.validationStatus, "unavailable");
  assert.match(unavailable.validationDetails ?? "", /not available locally/i);
});
