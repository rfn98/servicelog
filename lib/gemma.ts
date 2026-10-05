import "server-only";

import {
  GemmaError,
  MODEL_OUTPUT_STEP,
  TEXT_BLOCK,
  type GemmaAnswer,
  type GemmaUsage,
} from "./gemma-types";

/**
 * The whole model adapter (PLAN.md §16). The rest of the app only ever calls
 * `answerVehicleQuestion(context, question)`, so the provider, the endpoint and
 * the response shape stay confined to this file.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

const DEFAULT_MODEL = "gemma-4-26b-a4b-it";

const REQUEST_TIMEOUT_MS = 15_000;

/** One initial attempt plus at most two retries. */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 2_000;

/** Provider bodies are logged, but only a short prefix, and never to the client. */
const MAX_PROVIDER_LOG_CHARS = 500;

/**
 * PLAN.md §15, with two additions that the live endpoint proved necessary:
 * an explicit citation rule (so `[Rn]` tags stay inside the context allowlist)
 * and a nudge toward a full sentence, without which Gemma answered the oil
 * question with a bare `2026-09-12`.
 */
export const SERVICE_LOG_SYSTEM_INSTRUCTION = [
  "You are ServiceLog, a vehicle maintenance memory assistant.",
  "",
  "Answer questions using only the vehicle and maintenance records provided in the context.",
  "",
  "Never invent service records, dates, mileage, parts, maintenance events, or other vehicle history.",
  "",
  "If the requested information is not present, clearly say that it is not recorded.",
  "",
  "When answering, prefer specific dates and odometer readings when available.",
  "",
  "Do not claim to diagnose mechanical problems.",
  "",
  "For safety-sensitive mechanical questions, distinguish recorded history from general information and recommend professional inspection when appropriate.",
  "",
  "Do not make unsupported claims about actual maintenance intervals.",
  "",
  "Cite the records you used with the bracketed tags from the context, for example [R1]. Use only tags that appear in the context, and never invent a tag.",
  "",
  "Answer in one short, complete sentence naming the recorded date and odometer when a record exists, and keep the whole answer under three sentences.",
].join("\n");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the user-visible answer out of an Interactions response.
 *
 * Selection is structural, never positional, because the live endpoint returns
 * `steps[0]` as a `thought` step that carries `signature` and `summary` and has
 * no `content` array at all, while `steps[1]` holds the answer. Reading
 * `steps[0]` or `steps[1]` blindly therefore breaks, and reading the thought
 * summary would leak internal reasoning into the UI. Only steps whose
 * `type` is exactly `model_output` and whose content blocks are `text` are
 * consumed; `thought` is discarded without being inspected.
 */
export function extractModelOutputText(steps: unknown): string | null {
  if (!Array.isArray(steps)) return null;

  const chunks: string[] = [];

  for (const step of steps) {
    if (!isRecord(step)) continue;
    if (step.type !== MODEL_OUTPUT_STEP) continue;

    const content = step.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (!isRecord(block)) continue;
      if (block.type !== TEXT_BLOCK) continue;
      if (typeof block.text !== "string") continue;
      chunks.push(block.text);
    }
  }

  const joined = chunks.join("\n\n").trim();
  return joined.length > 0 ? joined : null;
}

function readUsage(value: unknown): GemmaUsage {
  const empty: GemmaUsage = {
    totalInputTokens: null,
    totalOutputTokens: null,
    totalThoughtTokens: null,
  };
  if (!isRecord(value)) return empty;

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  return {
    totalInputTokens: num(value.total_input_tokens),
    totalOutputTokens: num(value.total_output_tokens),
    totalThoughtTokens: num(value.total_thought_tokens),
  };
}

/** Only 429 and 5xx are worth a second try. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function backoffDelayMs(attempt: number): number {
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return Math.round(exponential * (0.5 + Math.random() * 0.5));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function readBodySafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function logProviderFailure(status: number, attempt: number, providerBody: string): void {
  const detail = providerBody.replace(/\s+/g, " ").slice(0, MAX_PROVIDER_LOG_CHARS);
  console.error(
    `[gemma] provider error status=${status} attempt=${attempt}/${MAX_ATTEMPTS} detail=${detail}`,
  );
}

function buildRequestBody(model: string, context: string, question: string) {
  return {
    model,
    input: `${context}\n\nQuestion: ${question}`,
    system_instruction: SERVICE_LOG_SYSTEM_INSTRUCTION,
    // Nothing about the user's records is retained by the provider.
    store: false,
    generation_config: {
      temperature: 0.1,
      // Verified live against gemma-4-26b-a4b-it: accepted with HTTP 200, and
      // it drives total_thought_tokens to 0 (221 -> 0 when omitted), which cuts
      // latency and removes any chance of reasoning leaking into the answer.
      thinking_level: "minimal",
    },
  };
}

/**
 * Ask Gemma one grounded question about the supplied service history.
 *
 * Throws {@link GemmaError} for every failure. Never resolves to partial data.
 */
export async function answerVehicleQuestion(
  context: string,
  question: string,
): Promise<GemmaAnswer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GemmaError("CONFIG", "The AI assistant is not configured.");
  }

  const model = process.env.GEMMA_MODEL?.trim() || DEFAULT_MODEL;
  const body = JSON.stringify(buildRequestBody(model, context, question));

  let lastError: GemmaError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await sleep(backoffDelayMs(attempt - 1));
    }

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Outside the retry budget by design: only HTTP 429 and 5xx are retried.
      const timedOut = isTimeoutError(error);
      throw new GemmaError(
        timedOut ? "TIMEOUT" : "NETWORK",
        timedOut
          ? "The AI assistant took too long to respond."
          : "The AI assistant could not be reached.",
      );
    }

    if (!response.ok) {
      const providerBody = await readBodySafely(response);
      logProviderFailure(response.status, attempt, providerBody);

      if (!isRetryableStatus(response.status)) {
        throw new GemmaError("HTTP", "The AI assistant rejected the request.", response.status);
      }

      lastError = new GemmaError(
        "HTTP",
        "The AI assistant is temporarily unavailable.",
        response.status,
      );
      continue;
    }

    const rawBody = await readBodySafely(response);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new GemmaError("MALFORMED", "The AI assistant returned an unreadable response.");
    }

    if (!isRecord(parsed)) {
      throw new GemmaError("MALFORMED", "The AI assistant returned an unreadable response.");
    }

    if (typeof parsed.status === "string" && parsed.status !== "completed") {
      throw new GemmaError("NO_OUTPUT", "The AI assistant did not finish the answer.");
    }

    const text = extractModelOutputText(parsed.steps);
    if (text === null) {
      throw new GemmaError("NO_OUTPUT", "The AI assistant did not return an answer.");
    }

    return {
      text,
      model: typeof parsed.model === "string" && parsed.model.length > 0 ? parsed.model : model,
      // The live v1beta response carries no `id`; kept nullable so a future
      // provider revision can populate it without changing the signature.
      interactionId: typeof parsed.id === "string" ? parsed.id : null,
      usage: readUsage(parsed.usage),
    };
  }

  throw lastError ?? new GemmaError("HTTP", "The AI assistant is temporarily unavailable.");
}