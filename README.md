# ServiceLog

**Your vehicle remembers what you forget.**

ServiceLog is a vehicle service history tracker. You record the services you actually get done, and then you can ask questions about your own vehicle's history in plain language instead of digging through receipts you did not keep.

It is deliberately a small, honest application: it reports what you logged, it shows its sources, and it says "not recorded" when something was never recorded. It does not diagnose anything.

---

## 1. The Problem

Vehicle service history is scattered across paper receipts, a phone note, and a vague memory of "I changed the oil last year, somewhere around then". Two things follow from that:

- You cannot answer basic questions about your own vehicle: what was done, when, and at what mileage.
- You cannot tell what is coming up, because the record of what was done last is incomplete or unreadable.

ServiceLog keeps the record in one place and makes it queryable. The dashboard answers "what is due next" with plain arithmetic over what you logged, and the assistant answers "when did I last..." from the same records.

The non-goal matters as much as the goal: this is a record-keeping and recall tool, not a mechanical diagnosis tool.

---

## 2. What I Built

One complete vertical slice across three screens:

| Screen | Route | What it does |
| --- | --- | --- |
| Dashboard | `/` | Vehicle odometer, latest service, next upcoming maintenance, recent service timeline, empty state when there is no data |
| Add Service | `/services/new` | Form for service type, date, odometer, notes, with server-side validation and inline error messages |
| AI Assistant | `/ask` | Ask a question about your service history and get an answer with the source records attached |

Two endpoints back those screens:

- `POST /api/services` — validate and store one service record. Returns `201` with the created record.
- `POST /api/ask` — answer a question grounded in the stored records. Returns the answer, the cited sources, and metadata about the model call.

The app stores everything in PostgreSQL on Neon — the same database local development and production use.

---

## 3. Demo

**The demo uses seeded fixture data, not real usage data.** `npm run db:seed` writes one demo vehicle (Yamaha R15, 19,820 km) and three demo service records dated 2026-06-15, 2026-08-03, and 2026-09-12. The seed file marks itself as demo data, and none of it is presented as real user history or real user feedback.

The demo path, in order:

1. **Dashboard** — shows the vehicle, the latest oil change, and the next upcoming maintenance derived from that oil change.
2. **Ask about the latest oil change** — "When did I last change my oil?" returns the 2026-09-12 record with that record attached as the source.
3. **Ask for something that was never logged** — "When did I replace my spark plug?" returns "not recorded" with no sources, instead of a guess.
4. **Add Service** — record a new oil change through the form; the dashboard updates its latest service, its odometer, and its timeline.
5. **Ask again** — the same oil-change question now finds the record you just added, which demonstrates that the assistant reads from the database rather than from anything cached.

Roughly 60 to 90 seconds, ending on: the AI only tells you what is in the database.

---

## 4. Features

- Service history dashboard with odometer, latest service, next upcoming maintenance, and a reverse-chronological timeline.
- Service entry form with server-validated type, date, odometer, and notes.
- Natural-language questions answered only from stored records, with the cited records returned alongside the answer.
- Citation validation: an answer cannot cite a record that does not exist, and returned sources are re-read from the database.
- Deterministic empty states. With no records, the assistant answers without calling the model at all.
- Deterministic maintenance calculation, fully independent of the model.
- Explicit unavailability handling: provider errors, rate limits, and timeouts produce a clear message instead of a fabricated answer.
- No API key ever reaches the browser.

---

## 5. How It Works

### Adding a service

The form is a client component. It posts to `POST /api/services`, where the payload is validated on the server before anything is written:

- `type` must be one of the stored service types.
- `date` must be a real `YYYY-MM-DD` date, and must not be in the future.
- `odometer` must be an integer between 1 and 1,000,000.
- `notes` must be non-empty after trimming, and at most 1000 characters.

Only then is the row inserted into PostgreSQL. The dashboard reads the same database on the server, so a new record shows up on the next render.

### Asking a question

1. `lib/ai-context.ts` loads the vehicle's current odometer and the most recent service records, up to a fixed cap, ordered deterministically and numbered (`R1`, `R2`, ...).
2. If there are no records, the route returns a fixed "nothing recorded yet" answer with no sources, and the model is never called.
3. `lib/gemma.ts` sends that context to the model with an instruction to answer only from the provided records and to cite them as `[Rn]`. The call uses `temperature: 0.1`, `thinking_level: minimal`, and `store: false`.
4. `lib/ai-validate.ts` checks the reply: citations outside the set of known source IDs are stripped, the answer is length-capped, and the surviving source IDs are re-read from the database to build the `sources` array. The response is `{ answer, sources, meta: { model, grounded } }`.

Provider calls are made with a 15-second timeout and at most 3 attempts. Only `429` and `5xx` responses are retried; other `4xx` responses fail immediately rather than burning quota.

### Maintenance calculation

`lib/maintenance.ts` contains a fixed interval table per service type. For each type it finds the most recent record, subtracts that odometer from the vehicle's current odometer, and computes the remaining distance. Negative remainders are dropped, and the type with the smallest remaining distance is shown as next. With no records at all, the dashboard shows an explicit empty state.

The model is not involved in this calculation at any point. Maintenance intervals are application configuration, and the AI is never asked what is due next.

---

## 6. Why Gemma?

The assistant runs on `gemma-4-26b-a4b-it`, a mixture-of-experts model with roughly 4B active parameters, served through the Gemini API. `GEMMA_MODEL` overrides the model id without touching code.

It fits this problem for three reasons:

- **Open weights.** The model's weights are published, so the serving path is not the only possible path later.
- **Cheap enough for a demo.** A small active-parameter MoE model runs on shared free-tier capacity, which matters when the app must stay runnable without a paid account.
- **The task is recall, not reasoning.** The hard part is supplying the right records and validating the answer, both of which happen in TypeScript. The model only has to phrase a grounded answer.

The honest caveat: this submission depends on Google's Gemini API to serve the model. That is a deliberate, contained trade-off, and the entire provider integration lives in one file, `lib/gemma.ts`.

---

## 7. Why Open-Source AI Matters

Open-weight models make it possible to build the parts of an application that matter — data handling, validation, source grounding, error behaviour — without depending on a provider for everything. Here, the model is the smallest and least interesting component: it receives a small, numbered set of records and is constrained to answer from them. Swapping or self-hosting it would not change any of the logic that makes the app trustworthy.

It also keeps the demo honest. When the provider is unavailable, the application says so. It does not fall back to pretending.

---

## 8. Architecture

```
app/
  api/ask/route.ts          POST /api/ask — validation, context, model call, answer validation
  api/services/route.ts     POST /api/services — validation and record creation
  ask/page.tsx              AI Assistant screen (server component)
  services/new/page.tsx     Add Service screen (server component)
  globals.css               Tailwind entry, colour tokens
  layout.tsx                Root layout, fonts, metadata
  page.tsx                  Dashboard screen (server component)
components/
  ai-assistant.tsx          Assistant client component: question input, answer, sources, states
  service-form.tsx          Service entry client component: form fields, submit, inline errors
lib/
  ai-context.ts             Builds the numbered service-record context for the model
  ai-validate.ts            Citation allowlist, source re-hydration, answer caps
  db.ts                     Prisma client
  gemma.ts                  Provider call: model, temperature, timeout, retry, error mapping
  gemma-types.ts            Types for the provider response
  maintenance.ts            Deterministic interval table and next-maintenance calculation
  service-validation.ts     Shared validation for service record input
prisma/
  migrations/               Generated SQL migrations
  schema.prisma             Vehicle and ServiceRecord models
  seed.ts                   Demo/fixture seed (vehicle + three records)
tests/                      See "Testing"
.env.example                Documented environment variables
next.config.ts
package.json
prisma.config.ts            Prisma CLI configuration (migrations path, seed)
```

Responsibilities:

- **`app/`** — routing and server rendering. Pages are server components; each screen owns its route, and API routes contain the only request-handling logic.
- **`components/`** — the two interactive client components. They hold form and chat UI state and call the API routes. They contain no business rules.
- **`lib/`** — all business logic, shared by the server: validation, context building, answer validation, provider access, maintenance math, and the database client.
- **`prisma/`** — schema, migrations, and the demo seed. `generated/` is produced by `prisma generate` and is gitignored.
- **`tests/`** — `node:test` suites for the library logic and route handlers, plus one opt-in live smoke script.

Only `POST /api/services` and `POST /api/ask` exist. This submission does not include `GET /api/services` or any `/api/vehicles` route.

---

## 9. Running Locally

Requirements: Node.js 20.19+, 22.12+, or 24+ (the ranges declared by Prisma; Next.js requires 20.9+). No `engines` field is set in `package.json`.

```bash
git clone <repository-url>
cd servicelog
npm install
```

`npm install` runs `prisma generate` through `postinstall`, which produces the Prisma client in `generated/`.

Create your environment file:

```bash
cp .env.example .env     # PowerShell: Copy-Item .env.example .env
```

Then set `GEMINI_API_KEY` in `.env`. Get one from https://aistudio.google.com/apikey. Set `DATABASE_URL` to your Neon connection string (Neon console → Connection Details); `DIRECT_URL` is optional and only the Prisma CLI reads it. `GEMMA_MODEL` already defaults to `gemma-4-26b-a4b-it`.

Set up the database and start the app:

```bash
npm run db:generate      # regenerate the Prisma client
npm run db:deploy        # apply migrations to Neon
npm run db:seed          # demo vehicle + three demo service records
npm run dev              # http://localhost:3000
```

Skip `npm run db:seed` if you want to see the empty states.

Available scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Full `node:test` suite |
| `npm run smoke` | Live AI smoke test, needs a real key and spends quota |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:deploy` | Apply pending migrations to Neon (`prisma migrate deploy`) |
| `npm run db:migrate` | Author a new migration while developing; needs a shadow database, which Neon does not provide by default |
| `npm run db:seed` | Load demo/fixture data |
| `npm run db:studio` | Prisma Studio |

---

## 10. Environment Variables

Copy `.env.example` to `.env` and fill in real values. `.env` is gitignored and must never be committed. All four variables are read on the server only.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | none | Server-side provider key. Read exclusively in `lib/gemma.ts`. Never prefix it with `NEXT_PUBLIC_`, which would expose it to the browser. |
| `GEMMA_MODEL` | No | `gemma-4-26b-a4b-it` | Model id override, for trying a different Gemma variant without code changes. |
| `DATABASE_URL` | Yes | none | Neon's pooled PostgreSQL connection string, read by both the Prisma CLI (`prisma.config.ts`, as its fallback) and the runtime (`lib/db.ts`). Used exactly as provided. |
| `DIRECT_URL` | No | none | Neon's direct (non-pooled) connection string. The Prisma CLI prefers it for `prisma migrate`; when empty, the CLI uses `DATABASE_URL`. Never set it in Vercel. |

No real values are committed to this repository.

`next.config.ts` disables Turbopack's filesystem cache for both `next build` and `next dev`. That cache serializes values from the build process's environment, so with a real key in `.env` it would write `GEMINI_API_KEY` verbatim into `.next/cache/turbopack`. The key never reaches a bundle or a response either way, but there is no reason to keep a second copy of a secret on disk. The cost is a slightly slower rebuild; `next build` takes a few seconds on this project.

---

## 11. Testing

```bash
npm test          # 113 tests, no network access, no API key needed
npm run lint
npm run build
```

`npm test` runs seven `node:test` files over `node --conditions=react-server --import tsx`: unit tests for context building, answer validation, maintenance calculation, service validation, and the provider call, plus route-level tests for `POST /api/services` and `POST /api/ask`. Provider calls are stubbed, and a guard fails loudly if a test ever reaches the real network, so the suite cannot spend the real key.

`npm run smoke` is separate and opt-in. It runs `tests/smoke-live.ts` in-process against the real provider, so it requires a valid `GEMINI_API_KEY`, spends real quota, and needs the database to be migrated and seeded. It is read-only — it only asks questions. It asserts that an oil-change question names the real seeded date and odometer, that a question about an unrecorded service returns no sources and invents no date or odometer, that "latest service" resolves to the newest record, that a brake question returns the brake record, and that the API key never appears in any response body.

```bash
npm run smoke
```

---

## 12. Limitations

Stated plainly, because they are scope decisions and not bugs.

**Data**

- The database is PostgreSQL on Neon, shared by local development and production. No deployment configuration is committed to this repository.
- **All seeded records are demo/fixture data.** One demo vehicle and three demo service records, written by `prisma/seed.ts`, which labels itself as demo data. This is not real user history, and no real user data is included.
- **No testimonial or friend feedback is claimed anywhere.** The demo uses the seed fixture; any real feedback would have to be collected separately and honestly attributed.

**Scope decisions for this submission**

- **The MVP runs on a single vehicle, provided by the database seed.** The dashboard, the service form, and the assistant all read the oldest vehicle in the database.
- **Vehicle creation UI and API are not part of this submission.** There is no `/api/vehicles` route and no setup screen. This is a deliberate scope decision: a vehicle setup step would add setup time and failure surface to a demo that is about recall, not onboarding. The application handles an empty database with explicit empty states on both the dashboard and the service form.
- **Multi-vehicle is not supported.** No vehicle switching, no vehicle picker, and no per-vehicle scoping of records.
- **No authentication.** Anyone who can reach the app can read and write the service history. Fine for a local demo, not for the public internet.
- **No edit or delete for service records.** Records are append-only; a mistake means adding a correcting entry.
- **No receipt or image upload.** Records are typed text only.

**AI**

- **The assistant is not a mechanical diagnosis.** It reports what is in the database. It does not assess condition, recommend parts, or estimate failure.
- **Maintenance intervals are deterministic application configuration**, hardcoded per service type in `lib/maintenance.ts`. They are not recommended by the model and not derived from manufacturer data.
- **Answers depend on what was recorded.** If a service was never logged, the assistant correctly answers that it is not recorded.
- Provider availability is outside this application's control. When the model is unreachable, the app reports that instead of answering.

---

## 13. Future Ideas

From the project plan, and not implemented in this submission:

- A vehicle setup screen so a user can add their own vehicle, which would also make multi-vehicle support possible.
- Editing and deleting service records, with the trade-off of a less trustworthy append-only history considered explicitly.
- Receipt photo upload with server-side storage.
- A read endpoint for service records, which the dashboard currently reads directly on the server.
- Notifications for upcoming maintenance.
- OCR over uploaded receipts to prefill a service record, and richer retrieval over a longer history than the current fixed context cap.
- Authentication and per-user data, which every other feature above depends on before it is safe to expose.

---

## 14. Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript 5 |
| Database | PostgreSQL on Neon via Prisma 7 and `@prisma/adapter-pg` (`pg`) |
| Model | Gemma 4 26B-A4B IT (`gemma-4-26b-a4b-it`) through the Gemini API |
| Tests | `node:test` with `tsx`, no test framework dependency |
| Lint | ESLint 9 with `eslint-config-next` |

No dependencies were added beyond the initial scaffold and the data, styling, and provider needs described above.