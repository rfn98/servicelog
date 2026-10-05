import "dotenv/config";

import test, { after } from "node:test";
import assert from "node:assert/strict";

import {
  AnswerValidationError,
  MAX_ANSWER_LENGTH,
  extractCitationTags,
  hydrateSources,
  selectAllowedCitations,
  stripDisallowedCitations,
  validateAnswerText,
  validateGroundedAnswer,
} from "../lib/ai-validate";
import { prisma } from "../lib/db";

after(async () => {
  await prisma.$disconnect();
});

/* ---------------------------------- text ---------------------------------- */

test("validateAnswerText accepts and trims a normal answer", () => {
  assert.equal(validateAnswerText("  Your last oil change was 2026-09-12.  "), "Your last oil change was 2026-09-12.");
});

test("validateAnswerText rejects a non-string", () => {
  assert.throws(() => validateAnswerText(undefined), AnswerValidationError);
  assert.throws(() => validateAnswerText(42), AnswerValidationError);
  assert.throws(() => validateAnswerText({ text: "hi" }), AnswerValidationError);
});

test("validateAnswerText rejects an empty or whitespace-only answer", () => {
  assert.throws(() => validateAnswerText(""), AnswerValidationError);
  assert.throws(() => validateAnswerText("   \n\t  "), AnswerValidationError);
});

test("validateAnswerText rejects an answer longer than 2000 characters", () => {
  assert.equal(MAX_ANSWER_LENGTH, 2000);
  assert.doesNotThrow(() => validateAnswerText("a".repeat(2000)));
  assert.throws(() => validateAnswerText("a".repeat(2001)), AnswerValidationError);
});

/* -------------------------------- citations ------------------------------- */

test("extractCitationTags finds, de-duplicates and preserves order", () => {
  assert.deepEqual(extractCitationTags("a [R3] b [R1] c [R3] d [R2]"), ["R3", "R1", "R2"]);
  assert.deepEqual(extractCitationTags("no tags here"), []);
  assert.deepEqual(extractCitationTags("spaced [ R5 ]"), ["R5"]);
});

test("extractCitationTags normalises case", () => {
  assert.deepEqual(extractCitationTags("lower [r2]"), ["R2"]);
});

test("stripDisallowedCitations removes a citation the context never provided", () => {
  const stripped = stripDisallowedCitations(
    "You last changed your oil on 2026-09-12. [R1] [R99]",
    ["R1", "R2", "R3"],
  );

  assert.equal(stripped, "You last changed your oil on 2026-09-12. [R1]");
  assert.ok(!stripped.includes("R99"));
});

test("stripDisallowedCitations repairs punctuation left by a removed tag", () => {
  assert.equal(stripDisallowedCitations("You have 3 services [R99].", ["R1"]), "You have 3 services.");
  assert.equal(stripDisallowedCitations("Done [R99] , then again", ["R1"]), "Done, then again");
});

test("stripDisallowedCitations strips every tag when the allowlist is empty", () => {
  assert.equal(stripDisallowedCitations("Answer [R1] only", []), "Answer only");
});

test("selectAllowedCitations keeps only allowlisted tags", () => {
  assert.deepEqual(selectAllowedCitations("x [R1] y [R99] z [r3]", ["R1", "R3"]), ["R1", "R3"]);
  assert.deepEqual(selectAllowedCitations("x [R7]", ["R1"]), []);
});

test("validateGroundedAnswer strips unknown citations and reports the kept ones", () => {
  const result = validateGroundedAnswer(
    "Oil changed 2026-09-12 at 18420 km. [R1] [R42]",
    ["R1", "R2", "R3"],
  );

  assert.equal(result.answer, "Oil changed 2026-09-12 at 18420 km. [R1]");
  assert.deepEqual(result.citedSourceIds, ["R1"]);
});

test("validateGroundedAnswer still rejects an empty model answer", () => {
  assert.throws(() => validateGroundedAnswer("   ", ["R1"]), AnswerValidationError);
});

/* -------------------------------- hydration -------------------------------- */

test("hydrateSources resolves a tag through the mapping and re-reads the row", async () => {
  const record = await prisma.serviceRecord.findFirst({ orderBy: { date: "desc" } });
  assert.ok(record, "expected the seeded database to contain a service record");

  const sources = await hydrateSources(["R1"], [
    { sourceId: "R1", serviceRecordId: record.id },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].serviceRecordId, record.id);
  assert.equal(sources[0].odometer, record.odometer);
  assert.equal(sources[0].type, record.type);
  assert.equal(sources[0].date, record.date.toISOString().slice(0, 10));
  // PLAN.md §13 shape: no extra fields leak from the model.
  assert.deepEqual(Object.keys(sources[0]).sort(), ["date", "odometer", "serviceRecordId", "type"]);
});

test("hydrateSources returns nothing for a tag outside the context allowlist", async () => {
  const sources = await hydrateSources(["R99"], [{ sourceId: "R1", serviceRecordId: "whatever" }]);
  assert.deepEqual(sources, []);
});

test("hydrateSources returns nothing when the mapped row no longer exists", async () => {
  const sources = await hydrateSources(["R1"], [
    { sourceId: "R1", serviceRecordId: "this-record-was-deleted" },
  ]);
  assert.deepEqual(sources, []);
});

test("hydrateSources preserves citation order rather than database order", async () => {
  const records = await prisma.serviceRecord.findMany({ orderBy: { date: "desc" }, take: 2 });
  assert.equal(records.length, 2);

  const sources = await hydrateSources(["R1", "R2"], [
    { sourceId: "R1", serviceRecordId: records[1].id },
    { sourceId: "R2", serviceRecordId: records[0].id },
  ]);

  assert.deepEqual(
    sources.map((s) => s.serviceRecordId),
    [records[1].id, records[0].id],
  );
});