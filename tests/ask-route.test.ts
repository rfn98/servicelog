import "dotenv/config";

import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../app/api/ask/route";
import { prisma } from "../lib/db";

/**
 * Route-level contract for POST /api/ask, with the provider stubbed. A guard in
 * beforeEach makes any accidental real network call fail loudly, so these tests
 * can never spend the real key or touch the network.
 */

const REAL_FETCH = globalThis.fetch;
const TEST_KEY = "test-key-must-never-leak";
const AI_UNAVAILABLE =
  "ServiceLog couldn't reach its AI assistant right now. Your service records are still safe.";

after(async () => {
  restoreStubs();
  globalThis.fetch = REAL_FETCH;
  await prisma.$disconnect();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Shaped exactly like the verified live interaction payload. */
function interactionResponse(text: string, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({
    status: "completed",
    usage: { total_input_tokens: 100, total_output_tokens: 20, total_thought_tokens: 0 },
    steps: [
      { type: "thought", signature: "sig", summary: [{ type: "text", text: "SECRET REASONING" }] },
      { type: "model_output", content: [{ type: "text", text }] },
    ],
    model: "gemma-4-26b-a4b-it",
    ...extra,
  });
}

type FetchCall = { url: string; init: RequestInit | undefined };

function mockFetch(
  handler: (index: number) => Response | Promise<Response> | never,
): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return handler(calls.length - 1);
  }) as unknown as typeof fetch;
  return calls;
}

function ask(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

/** Expected-failure paths log to stderr by design; keep the output readable. */
function silenceLogs(): () => void {
  const original = console.error;
  console.error = () => {};
  return () => {
    console.error = original;
  };
}

const restorers: Array<() => void> = [];

/**
 * Prisma 7 hands out model delegates through a proxy whose property descriptors
 * report `value: undefined`, so `mock.method` refuses them. Plain assignment is
 * the only way to swap them out, hence the manual restore. Same approach as
 * tests/services-route.test.ts, kept local so that file stays untouched.
 */
function stubProperty(target: object, key: string, value: unknown): void {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = value;
  restorers.push(() => {
    record[key] = original;
  });
}

function restoreStubs(): void {
  while (restorers.length > 0) restorers.pop()?.();
}

beforeEach(() => {
  restoreStubs();
  process.env.GEMINI_API_KEY = TEST_KEY;
  delete process.env.GEMMA_MODEL;
  globalThis.fetch = (async () => {
    throw new Error("test bug: fetch was called without a stub");
  }) as unknown as typeof fetch;
});

/* ------------------------------ input validation ----------------------------- */

test("rejects a malformed JSON body with 400", async () => {
  const calls = mockFetch(() => interactionResponse("unused"));
  const res = await ask("{not json");

  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /valid JSON/);
  assert.equal(calls.length, 0, "validation must happen before any provider call");
});

test("rejects a non-object body with 400", async () => {
  assert.equal((await ask("[1,2,3]")).status, 400);
  assert.equal((await ask("\"just a string\"")).status, 400);
});

test("rejects a missing, non-string or blank question with 400", async () => {
  assert.equal((await ask({})).status, 400);
  assert.equal((await ask({ question: 42 })).status, 400);
  assert.equal((await ask({ question: null })).status, 400);
  assert.equal((await ask({ question: "   \n " })).status, 400);
});

test("rejects a question longer than 500 characters with 400", async () => {
  mockFetch(() => interactionResponse("Fine. [R1]"));
  assert.equal((await ask({ question: "a".repeat(500) })).status, 200);

  const calls = mockFetch(() => interactionResponse("unused"));
  assert.equal((await ask({ question: "a".repeat(501) })).status, 400);
  assert.equal(calls.length, 0, "an over-long question must not reach the provider");
});

/* --------------------------------- success ---------------------------------- */

test("returns a grounded 200 with database-hydrated sources", async () => {
  const calls = mockFetch(() =>
    interactionResponse("You last changed your oil on 2026-09-12 at 18420 km. [R1]"),
  );

  const res = await ask({ question: "When did I last change my oil?" });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.match(body.answer, /2026-09-12/);
  assert.match(body.answer, /18420 km/);
  assert.equal(body.meta.grounded, true);
  assert.equal(body.meta.model, "gemma-4-26b-a4b-it");

  assert.equal(body.sources.length, 1);
  assert.equal(body.sources[0].odometer, 18420);
  assert.equal(body.sources[0].date, "2026-09-12");
  assert.equal(body.sources[0].type, "OIL_CHANGE");
  assert.ok(body.sources[0].serviceRecordId, "source must carry the real record id");

  // The thought step must never surface anywhere in the response.
  assert.ok(!JSON.stringify(body).includes("SECRET REASONING"));
  assert.ok(!JSON.stringify(body).includes(TEST_KEY));
  assert.equal(calls.length, 1);
});

test("sends the locked request contract to the provider", async () => {
  const calls = mockFetch(() => interactionResponse("Fine. [R1]"));
  await ask({ question: "When did I last change my oil?" });

  const { url, init } = calls[0];
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");

  const headers = init?.headers as Record<string, string>;
  assert.equal(headers["x-goog-api-key"], TEST_KEY);

  const sent = JSON.parse(String(init?.body));
  assert.equal(sent.model, "gemma-4-26b-a4b-it");
  assert.equal(sent.store, false, "history must not be retained by the provider");
  assert.equal(sent.generation_config.temperature, 0.1);
  assert.equal(sent.generation_config.thinking_level, "minimal");
  assert.match(sent.system_instruction, /Never invent service records/);
  assert.match(sent.input, /When did I last change my oil\?/);
  assert.match(sent.input, /SERVICE HISTORY/, "context must accompany the question");
});

test("honours GEMMA_MODEL when it is set", async () => {
  process.env.GEMMA_MODEL = "custom-gemma-model";
  const calls = mockFetch(() => interactionResponse("Fine. [R1]"));

  await ask({ question: "When did I last change my oil?" });

  const sent = JSON.parse(String(calls[0].init?.body));
  assert.equal(sent.model, "custom-gemma-model");
});

test("drops a citation the context never provided", async () => {
  mockFetch(() => interactionResponse("Oil changed 2026-09-12 at 18420 km. [R1] [R99] [R42]"));

  const res = await ask({ question: "When did I last change my oil?" });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(!body.answer.includes("R99"));
  assert.ok(!body.answer.includes("R42"));
  assert.equal(body.sources.length, 1, "only the allowlisted citation becomes a source");
});

test("returns an empty source list when the model cites nothing", async () => {
  mockFetch(() =>
    interactionResponse("There is no recorded spark plug replacement in your service history."),
  );

  const res = await ask({ question: "When did I replace my spark plug?" });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.match(body.answer, /no recorded spark plug replacement/i);
  assert.deepEqual(body.sources, []);
});

test("rejects model output longer than 2000 characters", async () => {
  const restore = silenceLogs();
  mockFetch(() => interactionResponse("a".repeat(2001)));

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, AI_UNAVAILABLE);
});

/* --------------------- deterministic empty-context answers -------------------- */

test("answers without calling the model when no vehicle exists", async () => {
  let vehicleLookups = 0;
  let recordLookups = 0;

  stubProperty(prisma.vehicle, "findFirst", async () => {
    vehicleLookups += 1;
    return null as never;
  });
  stubProperty(prisma.serviceRecord, "findMany", async () => {
    recordLookups += 1;
    return [] as never;
  });

  const calls = mockFetch(() => {
    throw new Error("the model must not be called when there is no vehicle");
  });

  const res = await ask({ question: "When was my last oil change?" });
  assert.equal(res.status, 200);

  const raw = await res.text();
  const body = JSON.parse(raw);
  assert.equal(
    body.answer,
    "No vehicle has been added to ServiceLog yet, so there is no maintenance history to answer from.",
  );
  assert.deepEqual(body.sources, []);
  assert.equal(body.meta.model, null);
  assert.equal(body.meta.grounded, true);
  assert.ok(!raw.includes(TEST_KEY), "API key must never reach the client");

  assert.equal(calls.length, 0, "an empty database must not reach the provider");
  assert.equal(vehicleLookups, 1);
  assert.equal(recordLookups, 0, "history must not be queried without a vehicle");
});

test("answers without calling the model when the vehicle has no history", async () => {
  let vehicleLookups = 0;
  let recordLookups = 0;

  stubProperty(prisma.vehicle, "findFirst", async () => {
    vehicleLookups += 1;
    return {
      id: "vehicle-under-test",
      name: "Yamaha R15",
      brand: "Yamaha",
      model: "R15",
      year: 2022,
      currentOdometer: 19820,
    } as never;
  });
  stubProperty(prisma.serviceRecord, "findMany", async () => {
    recordLookups += 1;
    return [] as never;
  });

  const calls = mockFetch(() => {
    throw new Error("the model must not be called when there is no service history");
  });

  const res = await ask({ question: "When was my last oil change?" });
  assert.equal(res.status, 200);

  const raw = await res.text();
  const body = JSON.parse(raw);
  assert.equal(
    body.answer,
    "No service records have been recorded for this vehicle yet, so there is nothing to answer from.",
  );
  assert.deepEqual(body.sources, []);
  assert.equal(body.meta.model, null);
  assert.equal(body.meta.grounded, true);
  assert.ok(!raw.includes(TEST_KEY), "API key must never reach the client");

  assert.equal(calls.length, 0, "an empty history must not reach the provider");
  assert.equal(vehicleLookups, 1);
  assert.equal(recordLookups, 1, "history must be queried before answering");
});

/* ------------------------------ failure handling ----------------------------- */

test("returns 503 with the PLAN.md §17 wording when the key is missing", async () => {
  const restore = silenceLogs();
  delete process.env.GEMINI_API_KEY;
  const calls = mockFetch(() => interactionResponse("unused"));

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, AI_UNAVAILABLE);
  assert.equal(calls.length, 0, "a missing key must not reach the network");
});

test("does not retry a 400 from the provider", async () => {
  const restore = silenceLogs();
  const calls = mockFetch(() => jsonResponse({ error: "bad request" }, 400));

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, AI_UNAVAILABLE);
  assert.equal(calls.length, 1, "4xx must not be retried");
});

test("retries a 500 up to two times, then returns 503", async () => {
  const restore = silenceLogs();
  const calls = mockFetch(() => jsonResponse({ error: "server error" }, 500));

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, AI_UNAVAILABLE);
  assert.equal(calls.length, 3, "one attempt plus exactly two retries");
});

test("recovers when a retried request succeeds", async () => {
  const calls = mockFetch((index) =>
    index < 2 ? jsonResponse({ error: "overloaded" }, 503) : interactionResponse("Recovered. [R1]"),
  );

  const res = await ask({ question: "When did I last change my oil?" });

  assert.equal(res.status, 200);
  assert.match((await res.json()).answer, /Recovered/);
  assert.equal(calls.length, 3);
});

test("retries a 429 and then succeeds", async () => {
  const calls = mockFetch((index) =>
    index === 0 ? jsonResponse({ error: "rate limited" }, 429) : interactionResponse("Fine. [R1]"),
  );

  const res = await ask({ question: "When did I last change my oil?" });

  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

test("returns 503 for a malformed provider body without retrying", async () => {
  const restore = silenceLogs();
  const calls = mockFetch(() => jsonResponse("<<not json>>"));

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, AI_UNAVAILABLE);
  assert.equal(calls.length, 1);
});

test("returns 503 when the interaction carries no model_output", async () => {
  const restore = silenceLogs();
  const calls = mockFetch(() =>
    jsonResponse({
      status: "completed",
      steps: [{ type: "thought", signature: "sig", summary: [{ type: "text", text: "only thinking" }] }],
      model: "gemma-4-26b-a4b-it",
    }),
  );

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, AI_UNAVAILABLE);
  assert.equal(calls.length, 1, "no usable answer must not be retried");
});

test("returns 503 when the interaction did not complete", async () => {
  const restore = silenceLogs();
  mockFetch(() => interactionResponse("never mind", { status: "incomplete" }));

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  assert.equal(res.status, 503);
});

test("returns 503 on a network error without retrying", async () => {
  const restore = silenceLogs();
  const calls = mockFetch(() => {
    throw new TypeError("fetch failed");
  });

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  assert.equal(res.status, 503);
  assert.equal(calls.length, 1);
});

test("returns 503 on a timeout without retrying", async () => {
  const restore = silenceLogs();
  const calls = mockFetch(() => {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  });

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  assert.equal(res.status, 503);
  assert.equal(calls.length, 1);
});

/* ---------------------------------- secrecy ---------------------------------- */

test("never leaks the API key or the provider body to the client", async () => {
  const restore = silenceLogs();
  const secretish = `PROVIDER_SECRET_${TEST_KEY}`;
  mockFetch(() => jsonResponse({ error: { message: `key ${TEST_KEY} rejected`, detail: secretish } }, 400));

  const res = await ask({ question: "When did I last change my oil?" });
  restore();

  const raw = await res.text();
  assert.equal(res.status, 503);
  assert.ok(!raw.includes(TEST_KEY), "API key must never reach the client");
  assert.ok(!raw.includes(secretish), "provider body must never reach the client");
  assert.ok(!raw.includes("PROVIDER_SECRET"));
});