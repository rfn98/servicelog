import { NextResponse } from "next/server";

import { buildAskContext } from "@/lib/ai-context";
import { answerVehicleQuestion } from "@/lib/gemma";
import {
  AnswerValidationError,
  hydrateSources,
  validateGroundedAnswer,
} from "@/lib/ai-validate";

/**
 * POST /api/ask — grounded question answering over the service history
 * (PLAN.md §13, §14, §17, §18).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_QUESTION_LENGTH = 500;

/** Exact wording required by PLAN.md §17. */
const AI_UNAVAILABLE_MESSAGE =
  "ServiceLog couldn't reach its AI assistant right now. Your service records are still safe.";

type ParsedQuestion = { ok: true; question: string } | { ok: false; message: string };

function parseQuestion(body: unknown): ParsedQuestion {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object with a `question` field." };
  }

  const value = (body as Record<string, unknown>).question;

  if (typeof value !== "string") {
    return { ok: false, message: "`question` must be a string." };
  }

  const question = value.trim();

  if (question.length === 0) {
    return { ok: false, message: "`question` must not be empty." };
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return { ok: false, message: `\`question\` must be at most ${MAX_QUESTION_LENGTH} characters.` };
  }

  return { ok: true, question };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseQuestion(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }

  try {
    const context = await buildAskContext();

    // With no vehicle or no history there is nothing to ground an answer on, so
    // the reply is produced deterministically instead of asking the model to
    // reason about an empty context (PLAN.md §17, §22 "Empty history").
    if (!context.vehicle || context.sources.length === 0) {
      return NextResponse.json({
        answer: context.vehicle
          ? "No service records have been recorded for this vehicle yet, so there is nothing to answer from."
          : "No vehicle has been added to ServiceLog yet, so there is no maintenance history to answer from.",
        sources: [],
        meta: { model: null, grounded: true },
      });
    }

    const answer = await answerVehicleQuestion(context.text, parsed.question);
    const validated = validateGroundedAnswer(answer.text, context.allowedSourceIds);
    const sources = await hydrateSources(validated.citedSourceIds, context.sources);

    return NextResponse.json({
      answer: validated.answer,
      sources,
      meta: { model: answer.model, grounded: true },
    });
  } catch (error) {
    // Logged as a class name only. The provider's body, the API key and the
    // stack trace never leave the server (PLAN.md §17, §23).
    if (error instanceof AnswerValidationError) {
      console.error(`[ask] rejected model output: ${error.message}`);
    } else {
      const kind = error instanceof Error ? error.name : "unknown";
      console.error(`[ask] request failed: ${kind}`);
    }

    return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
}