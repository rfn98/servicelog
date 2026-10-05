/**
 * Route-level loading UI for every screen in this segment (App Router special
 * file). It covers `/`, `/ask` and `/services/new`, and never the API routes.
 *
 * Shown only while the App Router waits for a route's server payload, so the
 * screens themselves never need their own pending state.
 *
 * A Server Component with no state, no effects, no imports and no client-side
 * JavaScript, so it cannot cause a hydration mismatch. The container class is
 * copied from the three pages and the colours come from the existing card
 * styles, which keeps the shape stable when the real content replaces it.
 *
 * `aria-hidden`: the skeleton carries no information. Next.js already renders a
 * live route announcer, so adding a live region here would only announce the
 * same thing twice.
 */
export default function Loading() {
  return (
    <main
      aria-hidden="true"
      className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6"
    >
      <div className="h-7 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-16 w-full animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-800" />
      <div className="h-14 w-full animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-800" />
      <div className="h-14 w-full animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-800" />
    </main>
  );
}