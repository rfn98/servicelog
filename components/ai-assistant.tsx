"use client";

import { useState, type FormEvent } from "react";

/**
 * Screen 3 — AI Assistant (PLAN.md §9).
 *
 * This component talks to the relative `/api/ask` route and nothing else. The
 * Gemini key, the Prisma client and every other server-side module stay on the
 * server, so nothing here imports from `lib/gemma`, `lib/db`,
 * `lib/ai-context` or `lib/ai-validate` — several of those are server-only or
 * pull native modules into the browser bundle.
 */

/* --------------------------- API contract (read-only) --------------------------- */

type AskSource = {
  serviceRecordId: string;
  type: string;
  date: string;
  odometer: number;
};

type AskMeta = {
  model: string | null;
  grounded: boolean;
};

type AskPayload = {
  answer?: string;
  sources?: AskSource[];
  meta?: AskMeta;
  error?: string;
};

type Status = "idle" | "loading" | "success" | "error";

/* --------------------------------- constants ---------------------------------- */

/** Mirrors the API limit so the browser can stop you before the server does. */
const MAX_QUESTION_LENGTH = 500;

const GENERIC_ERROR = "ServiceLog could not answer that question. Please try again.";
const NETWORK_ERROR = "Could not reach ServiceLog. Check your connection and try again.";

/** Three questions that demo grounding, the full answer, and honest "not recorded". */
const EXAMPLE_QUESTIONS = [
  "When did I last change my oil?",
  "What was done at my last service?",
  "When did I replace my spark plug?",
];

/**
 * Kept local on purpose. `formatServiceType` also exists in lib/ai-context.ts,
 * but that module imports the Prisma client, so importing it here would drag
 * native database code into the client bundle.
 */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  OIL_CHANGE: "Oil Change",
  BRAKE: "Brake",
  CHAIN: "Chain",
  TIRE: "Tire",
  BATTERY: "Battery",
  GENERAL_SERVICE: "General Service",
  OTHER: "Other",
};

function formatServiceType(type: string): string {
  return SERVICE_TYPE_LABELS[type] ?? type;
}

/** Locale and time zone are pinned so server and browser always agree. */
function formatDate(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(parsed);
}

function formatOdometer(odometer: number): string {
  return `${new Intl.NumberFormat("en-US").format(odometer)} km`;
}

/* ------------------------------ answer segmentation ---------------------------- */

const CITATION_SPLIT = /(\[\s*R\d+\s*\])/g;
const CITATION_ONLY = /^\[\s*R\d+\s*\]$/;

type AnswerSegment = { kind: "text"; value: string } | { kind: "citation"; value: string };

/**
 * Split an answer into plain-text and citation segments so `[R1]` can be shown
 * as a small chip.
 *
 * Every part is rendered as a normal React text node, so no HTML from the model
 * is ever interpreted — no `dangerouslySetInnerHTML` and no markdown parsing.
 * The route already discards citations outside the context allowlist, so any
 * `[Rn]` still present is safe to show.
 */
function segmentAnswer(answer: string): AnswerSegment[] {
  return answer
    .split(CITATION_SPLIT)
    .filter((part) => part.length > 0)
    .map((part) =>
      CITATION_ONLY.test(part)
        ? { kind: "citation" as const, value: part.replace(/[[\]\s]/g, "").toUpperCase() }
        : { kind: "text" as const, value: part },
    );
}

/* --------------------------------- component ---------------------------------- */

export function AiAssistant() {
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<AskSource[]>([]);
  const [meta, setMeta] = useState<AskMeta | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = status === "loading";

  /**
   * The single request path. Both the form submit and the suggestion chips call
   * this, so there is exactly one place that talks to `/api/ask`.
   */
  async function askQuestion(nextQuestion: string): Promise<void> {
    setAskedQuestion(nextQuestion);
    setStatus("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: nextQuestion }),
      });

      const payload = (await response.json().catch(() => null)) as AskPayload | null;

      if (!response.ok) {
        setErrorMessage(
          typeof payload?.error === "string" && payload.error.length > 0 ? payload.error : GENERIC_ERROR,
        );
        setStatus("error");
        return;
      }

      if (typeof payload?.answer !== "string") {
        setErrorMessage(GENERIC_ERROR);
        setStatus("error");
        return;
      }

      setAnswer(payload.answer);
      setSources(Array.isArray(payload.sources) ? payload.sources : []);
      setMeta(payload.meta ?? null);
      setStatus("success");
    } catch {
      setErrorMessage(NETWORK_ERROR);
      setStatus("error");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isLoading) return;

    const trimmed = question.trim();
    if (trimmed.length === 0) return;

    void askQuestion(trimmed);
  }

  function handleExample(example: string): void {
    if (isLoading) return;
    setQuestion(example);
    void askQuestion(example);
  }

  const segments = answer === null ? [] : segmentAnswer(answer);

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label
          htmlFor="ask-question"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Ask about your service history
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="ask-question"
            name="question"
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={MAX_QUESTION_LENGTH}
            required
            placeholder="When did I last change my oil?"
            aria-busy={isLoading}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-100 dark:focus-visible:ring-offset-zinc-900"
          />
          <button
            type="submit"
            disabled={isLoading || question.trim().length === 0}
            className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:focus-visible:ring-offset-zinc-950"
          >
            {isLoading ? "Asking…" : "Ask"}
          </button>
        </div>
      </form>

      {status === "idle" ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Nothing asked yet. ServiceLog answers only from the services you have recorded — if something is
          not in your history, it will say so.
        </p>
      ) : null}

      {askedQuestion !== null ? (
        <section className="flex flex-col gap-4" aria-live="polite">
          <p className="border-l-2 border-zinc-300 pl-3 text-sm italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            “{askedQuestion}”
          </p>

          {isLoading ? (
            <div role="status" className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span aria-hidden="true" className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]" />
              </span>
              Checking your service records…
            </div>
          ) : null}

          {status === "error" ? (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
              {errorMessage}
            </div>
          ) : null}

          {status === "success" && answer !== null ? (
            <>
              <div>
                <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                  ServiceLog
                </p>
                <p className="mt-1 text-zinc-900 dark:text-zinc-100">
                  {segments.map((segment, index) =>
                    segment.kind === "citation" ? (
                      <span
                        key={`${segment.kind}-${index}`}
                        className="mx-0.5 rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.7em] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {segment.value}
                      </span>
                    ) : (
                      <span key={`${segment.kind}-${index}`} className="whitespace-pre-wrap">
                        {segment.value}
                      </span>
                    ),
                  )}
                </p>
              </div>

              {meta?.grounded ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Grounded in your service history{meta.model ? ` · ${meta.model}` : ""}
                </p>
              ) : null}

              {sources.length > 0 ? (
                <div>
                  <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                    Sources
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {sources.map((source) => (
                      <li
                        key={source.serviceRecordId}
                        className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                      >
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {formatServiceType(source.type)}
                        </p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {formatDate(source.date)} · {formatOdometer(source.odometer)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {!isLoading ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            {status === "idle" ? "Try asking" : "Ask another question"}
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExample(example)}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100 dark:focus-visible:ring-offset-zinc-900"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}