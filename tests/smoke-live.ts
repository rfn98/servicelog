/**
 * Temporary live smoke test. Calls the real route with the real provider.
 * Run: node --conditions=react-server --import tsx tests/smoke-live.ts
 */
import "dotenv/config";

import assert from "node:assert/strict";

import { POST } from "../app/api/ask/route";
import { prisma } from "../lib/db";

const SEED_DATES = ["2026-09-12", "2026-08-03", "2026-06-15"];
const SEED_ODOMETERS = ["18420", "17900", "16800"];

async function ask(question: string) {
  const res = await POST(
    new Request("http://localhost/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    }),
  );
  return { status: res.status, raw: await res.text() };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing from .env");
  delete process.env.GEMMA_MODEL;

  /* ------------------------- 1. oil change grounding ------------------------ */
  const oil = await ask("When did I last change my oil?");
  console.log("\n===== Q1: When did I last change my oil? =====");
  console.log(`status=${oil.status}`);
  console.log(oil.raw);

  assert.equal(oil.status, 200, "Q1 should succeed");
  const oilBody = JSON.parse(oil.raw);
  assert.match(oilBody.answer, /2026-09-12/, "must name the real oil-change date");
  assert.match(oilBody.answer, /18[,.]?420/, "must name the real oil-change odometer");
  assert.equal(oilBody.meta.grounded, true);
  assert.equal(oilBody.sources.length, 1, "must cite exactly the oil record");
  assert.equal(oilBody.sources[0].type, "OIL_CHANGE");
  assert.equal(oilBody.sources[0].odometer, 18420);
  assert.equal(oilBody.sources[0].date, "2026-09-12");
  assert.ok(!oil.raw.includes(process.env.GEMINI_API_KEY), "key must not leak");
  console.log("Q1 PASS");

  /* --------------------- 2. missing data, no invention --------------------- */
  const plug = await ask("When did I replace my spark plug?");
  console.log("\n===== Q2: When did I replace my spark plug? =====");
  console.log(`status=${plug.status}`);
  console.log(plug.raw);

  assert.equal(plug.status, 200, "Q2 should succeed");
  const plugBody = JSON.parse(plug.raw);
  assert.match(
    plugBody.answer,
    /not (be )?record|no recorded|does not (record|include)|isn't recorded|not tracked/i,
    "must state the service is not recorded",
  );
  for (const date of SEED_DATES) {
    assert.ok(!plugBody.answer.includes(date), `must not invent a date (${date})`);
  }
  for (const odo of SEED_ODOMETERS) {
    assert.ok(!plugBody.answer.includes(odo), `must not invent an odometer reading (${odo})`);
  }
  assert.deepEqual(plugBody.sources, [], "no record means no sources");
  assert.ok(!plug.raw.includes(process.env.GEMINI_API_KEY), "key must not leak");
  console.log("Q2 PASS");

  /* --------------------- 3. extra: latest service + brake -------------------- */
  const latest = await ask("What was my latest service?");
  console.log("\n===== Q3: What was my latest service? =====");
  console.log(`status=${latest.status}`);
  console.log(latest.raw);
  assert.equal(latest.status, 200);
  assert.match(JSON.parse(latest.raw).answer, /2026-09-12/, "latest must be the newest record");
  console.log("Q3 PASS");

  const brake = await ask("What mileage was my last brake service?");
  console.log("\n===== Q4: What mileage was my last brake service? =====");
  console.log(`status=${brake.status}`);
  console.log(brake.raw);
  assert.equal(brake.status, 200);
  const brakeBody = JSON.parse(brake.raw);
  assert.match(brakeBody.answer, /17[,.]?900/, "must return the brake record odometer");
  assert.equal(brakeBody.sources[0]?.type, "BRAKE");
  console.log("Q4 PASS");

  console.log("\nALL LIVE SMOKE TESTS PASSED");
}

main()
  .catch((error) => {
    console.error("\nLIVE SMOKE FAILED:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });