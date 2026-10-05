import test from "node:test";
import assert from "node:assert/strict";

import { extractModelOutputText } from "../lib/gemma";

/**
 * Structure that the live endpoint actually returns (verified against
 * gemma-4-26b-a4b-it): steps[0] is a `thought` carrying `signature` and
 * `summary` with no `content` array, steps[1] is the `model_output`.
 */

const THOUGHT_STEP = {
  type: "thought",
  signature: "sig-abc",
  summary: [{ type: "text", text: "SECRET REASONING MUST NOT LEAK" }],
};

function modelOutput(...texts: string[]) {
  return {
    type: "model_output",
    content: texts.map((text) => ({ type: "text", text })),
  };
}

test("extractor returns model_output text and ignores the thought step", () => {
  const text = extractModelOutputText([
    THOUGHT_STEP,
    modelOutput("You last changed your oil on 2026-09-12 at 18420 km. [R1]"),
  ]);

  assert.equal(text, "You last changed your oil on 2026-09-12 at 18420 km. [R1]");
  assert.ok(!text?.includes("SECRET REASONING"), "thought summary must never be returned");
});

test("extractor returns null when only a thought step is present", () => {
  assert.equal(extractModelOutputText([THOUGHT_STEP]), null);
});

test("extractor returns null when there is no model_output step", () => {
  assert.equal(extractModelOutputText([]), null);
  assert.equal(extractModelOutputText([{ type: "tool_call", content: [] }]), null);
});

test("extractor returns null when model_output content is not an array", () => {
  assert.equal(extractModelOutputText([{ type: "model_output", content: "oops" }]), null);
  assert.equal(extractModelOutputText([{ type: "model_output" }]), null);
});

test("extractor joins multiple text blocks with a blank line", () => {
  const text = extractModelOutputText([modelOutput("First part.", "Second part.")]);
  assert.equal(text, "First part.\n\nSecond part.");
});

test("extractor skips non-text content blocks and non-string text", () => {
  const text = extractModelOutputText([
    {
      type: "model_output",
      content: [
        { type: "image", data: "..." },
        { type: "text", text: 42 },
        { type: "text", text: "Kept." },
      ],
    },
  ]);

  assert.equal(text, "Kept.");
});

test("extractor ignores malformed entries and non-array steps", () => {
  assert.equal(extractModelOutputText([null, 7, "x"]), null);
  assert.equal(extractModelOutputText({ steps: [] }), null);
  assert.equal(extractModelOutputText(null), null);
});

test("extractor merges text across several model_output steps", () => {
  const text = extractModelOutputText([modelOutput("One."), modelOutput("Two.")]);
  assert.equal(text, "One.\n\nTwo.");
});

test("extractor returns null when the model_output text is only whitespace", () => {
  assert.equal(extractModelOutputText([modelOutput("   ", "\n")]), null);
});