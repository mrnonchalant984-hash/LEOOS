import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDeveloperAgentInput } from "../lib/developer-agent-input.ts";

const validInput = {
  name: "Project Analyst",
  description: "Reviews the user's current project status.",
  instructions: "Summarize project status, identify blockers, and cite the data returned by approved tools.",
  allowed_tools: ["list_projects", "list_projects"],
};

test("custom agent input is normalized and duplicate tools are removed", () => {
  assert.deepEqual(parseDeveloperAgentInput(validInput), {
    ...validInput,
    name: "Project Analyst",
    description: "Reviews the user's current project status.",
    instructions: "Summarize project status, identify blockers, and cite the data returned by approved tools.",
    allowed_tools: ["list_projects"],
  });
});

test("custom agent input rejects invalid fields and too many tools", () => {
  assert.equal(parseDeveloperAgentInput({ ...validInput, name: "ab" }), null);
  assert.equal(parseDeveloperAgentInput({ ...validInput, instructions: "too short" }), null);
  assert.equal(parseDeveloperAgentInput({ ...validInput, allowed_tools: ["bad tool"] }), null);
  assert.equal(parseDeveloperAgentInput({ ...validInput, allowed_tools: Array.from({ length: 9 }, (_, i) => `tool_${i}`) }), null);
  assert.equal(parseDeveloperAgentInput(null), null);
});
