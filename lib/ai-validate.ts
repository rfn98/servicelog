import { prisma } from "@/lib/db";

/**
 * Post-processing for whatever the model returned (PLAN.md §12).
 *
 * The model is treated as an untrusted narrator: its prose is checked for
 * emptiness and size, its citations are checked against the allowlist the
 * context builder produced, and every source the API returns is re-read from
 * the database rather than believed. Unknown citations are removed outright so
 * a hallucinated tag can never reach the UI.
 */

/** PLAN.md §12 caps the answer length. */
export const MAX_ANSWER_LENGTH = 2000;

export class AnswerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnswerValidationError";
  }
}

/** A service record as returned to the client. Field list matches PLAN.md §13. */
export type AskSource = {
  serviceRecordId: string;
  type: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  odometer: number;
};

export type ValidatedAnswer = {
  answer: string;
  /** Citation tags that survived the allowlist check, in order of appearance. */
  citedSourceIds: string[];
};

/** Minimal structural shape so this module does not depend on lib/ai-context.ts. */
export type SourceIdMapping = {
  sourceId: string;
  serviceRecordId: string;
};

const CITATION_PATTERN = /\[\s*(R\d+)\s*\]/gi;

function normalizeTag(tag: string): string {
  return tag.toUpperCase();
}

/**
 * Reject an answer that is not a usable string: wrong type, blank after
 * trimming, or longer than {@link MAX_ANSWER_LENGTH}.
 */
export function validateAnswerText(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new AnswerValidationError("The AI assistant did not return a text answer.");
  }

  const text = raw.trim();

  if (text.length === 0) {
    throw new AnswerValidationError("The AI assistant returned an empty answer.");
  }

  if (text.length > MAX_ANSWER_LENGTH) {
    throw new AnswerValidationError(
      `The AI assistant returned an answer longer than ${MAX_ANSWER_LENGTH} characters.`,
    );
  }

  return text;
}

/** Every `[Rn]` tag in the answer, upper-cased, de-duplicated, order preserved. */
export function extractCitationTags(answer: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const match of answer.matchAll(CITATION_PATTERN)) {
    const tag = normalizeTag(match[1]);
    if (!seen.has(tag)) {
      seen.add(tag);
      ordered.push(tag);
    }
  }

  return ordered;
}

/**
 * Delete citation tags that are not in the allowlist, then repair the
 * punctuation and spacing the removal left behind.
 */
export function stripDisallowedCitations(
  answer: string,
  allowedSourceIds: string[],
): string {
  const allowed = new Set(allowedSourceIds.map(normalizeTag));

  const stripped = answer.replace(CITATION_PATTERN, (match, rawTag: string) =>
    allowed.has(normalizeTag(rawTag)) ? match : "",
  );

  return stripped
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Keep only the cited tags that exist in the context allowlist. */
export function selectAllowedCitations(
  answer: string,
  allowedSourceIds: string[],
): string[] {
  const allowed = new Set(allowedSourceIds.map(normalizeTag));
  return extractCitationTags(answer).filter((tag) => allowed.has(tag));
}

/**
 * Run every text-level check in one pass.
 *
 * `allowedSourceIds` comes from the context builder, never from the model.
 */
export function validateGroundedAnswer(
  raw: unknown,
  allowedSourceIds: string[],
): ValidatedAnswer {
  const text = validateAnswerText(raw);
  return {
    answer: stripDisallowedCitations(text, allowedSourceIds),
    citedSourceIds: selectAllowedCitations(text, allowedSourceIds),
  };
}

/**
 * Resolve the tags the model actually cited back to database rows.
 *
 * Tags are translated through the context mapping first, so the model can only
 * ever name records that were genuinely retrieved. The rows are then re-read
 * from the database, which means a deleted record simply disappears instead of
 * being echoed back from the model's prose.
 */
export async function hydrateSources(
  citedSourceIds: string[],
  mappings: SourceIdMapping[],
): Promise<AskSource[]> {
  const byTag = new Map(
    mappings.map((mapping) => [normalizeTag(mapping.sourceId), mapping.serviceRecordId]),
  );

  const wantedIds = citedSourceIds
    .map((tag) => byTag.get(normalizeTag(tag)))
    .filter((id): id is string => typeof id === "string");

  if (wantedIds.length === 0) return [];

  const rows = await prisma.serviceRecord.findMany({ where: { id: { in: wantedIds } } });

  // Preserve citation order regardless of how the database returns rows.
  const rank = new Map(wantedIds.map((id, index) => [id, index]));
  rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

  return rows.map((row) => ({
    serviceRecordId: row.id,
    type: row.type,
    date: row.date.toISOString().slice(0, 10),
    odometer: row.odometer,
  }));
}