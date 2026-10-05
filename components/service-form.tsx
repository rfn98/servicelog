"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { MAX_NOTES_LENGTH } from "@/lib/service-validation";

/**
 * Screen 2 — Add Service form (PLAN.md §9).
 *
 * The only things this component owns are the field values, the saving state and
 * the error message. Every rule that matters is enforced again on the server by
 * lib/service-validation.ts, so native `required`/`min`/`max` here are UX hints
 * rather than the boundary.
 *
 * The vehicle is not sent. The route resolves it, so there is no vehicleId in
 * this payload to tamper with, and no vehicle picker to maintain.
 */

export type ServiceTypeOption = {
  value: string;
  label: string;
};

/**
 * One class string for every field, so the keyboard focus ring is defined once
 * and cannot drift between the select, the inputs and the textarea.
 *
 * `focus:outline-none` stays unconditional on purpose: it removes the user-agent
 * outline for pointer focus too, and the `focus-visible:ring-*` utilities below
 * put the indicator back for keyboard focus only. Replacing it with
 * `focus-visible:outline-none` would make the UA outline reappear on mouse click.
 * The ring is a box-shadow, so it adds no layout and no size.
 */
const fieldClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-100 dark:focus-visible:ring-offset-zinc-900";

const labelClass = "text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400";

export function ServiceForm({ options }: { options: ServiceTypeOption[] }) {
  const router = useRouter();

  const [type, setType] = useState(options[0]?.value ?? "");
  const [date, setDate] = useState("");
  const [odometer, setOdometer] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Empty odometer becomes 0 and an unparsable one becomes NaN, which
        // serialises to null. The server rejects both, so nothing slips past by
        // accident.
        body: JSON.stringify({ type, date, odometer: Number(odometer), notes }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "ServiceLog couldn't save this record. Please try again.",
        );
        setIsSaving(false);
        return;
      }

      // Success: back to the dashboard, which re-reads the database and shows
      // the new record with the recalculated reminder.
      router.push("/");
    } catch {
      setError("ServiceLog couldn't reach the server, so nothing was saved. Please try again.");
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" aria-busy={isSaving}>
      <div className="flex flex-col gap-2">
        <label htmlFor="service-type" className={labelClass}>
          Service type
        </label>
        <select
          id="service-type"
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          disabled={isSaving}
          required
          className={fieldClass}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="service-date" className={labelClass}>
          Date
        </label>
        <input
          id="service-date"
          name="date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          disabled={isSaving}
          required
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="service-odometer" className={labelClass}>
          Odometer
        </label>
        <input
          id="service-odometer"
          name="odometer"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          placeholder="18,420"
          value={odometer}
          onChange={(event) => setOdometer(event.target.value)}
          disabled={isSaving}
          required
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="service-notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="service-notes"
          name="notes"
          rows={3}
          placeholder="Motul 5100 10W-40"
          maxLength={MAX_NOTES_LENGTH}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={isSaving}
          required
          className={`${fieldClass} resize-y`}
        />
      </div>

      {error !== null ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:focus-visible:ring-offset-zinc-950"
        >
          {isSaving ? "Saving…" : "Save Service"}
        </button>
      </div>
    </form>
  );
}