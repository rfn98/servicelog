import type { Metadata } from "next";

import { AiAssistant } from "@/components/ai-assistant";

export const metadata: Metadata = {
  title: "Ask ServiceLog",
  description:
    "Ask natural-language questions about your vehicle's recorded service history.",
};

export default function AskPage() {
  return (
    <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ask ServiceLog</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ask about your vehicle&apos;s maintenance history. Every answer comes from the services you
          have recorded.
        </p>
      </header>

      <AiAssistant />
    </main>
  );
}