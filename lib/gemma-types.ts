/**
 * Shared types and the typed error used by the Gemma adapter.
 *
 * Deliberately free of any import from lib/db.ts or lib/gemma.ts so that both
 * stay independently testable.
 */

/** Every failure mode the Gemma adapter can produce. */
export type GemmaErrorKind =
  | "CONFIG" // GEMINI_API_KEY missing
  | "HTTP" // provider answered with a non-2xx status
  | "NETWORK" // fetch rejected (DNS, connection reset, ...)
  | "TIMEOUT" // request exceeded the 15s budget
  | "NO_OUTPUT" // completed but carried no usable model_output text
  | "MALFORMED"; // response body was not valid JSON

/**
 * The only error type lib/gemma.ts throws.
 *
 * `message` is always safe to show to a user: it never embeds the API key, the
 * provider's response body, or a stack trace. Diagnostic provider detail is
 * written to the server log inside lib/gemma.ts and then discarded, so leaking
 * it to the browser is structurally impossible rather than merely avoided.
 */
export class GemmaError extends Error {
  readonly kind: GemmaErrorKind;
  readonly httpStatus: number | undefined;

  constructor(kind: GemmaErrorKind, message: string, httpStatus?: number) {
    super(message);
    this.name = "GemmaError";
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

/** Token accounting, when the provider reports it. */
export type GemmaUsage = {
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalThoughtTokens: number | null;
};

/** Successful result of one grounded question. */
export type GemmaAnswer = {
  /** Natural-language explanation produced by the model. */
  text: string;
  /** Model id actually used, echoed for transparency. */
  model: string;
  /**
   * Provider interaction id when present.
   *
   * Verified against the live Gemma endpoint: the v1beta Interactions response
   * exposes only status, usage, created, updated, service_tier, steps, object
   * and model — there is no `id`, so this stays null in practice. Kept so a
   * future provider revision can populate it without a signature change.
   */
  interactionId: string | null;
  usage: GemmaUsage;
};

/** Step type that carries the user-visible answer. */
export const MODEL_OUTPUT_STEP = "model_output";

/** Content block type that carries plain text. */
export const TEXT_BLOCK = "text";