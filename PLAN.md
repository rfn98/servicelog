# ServiceLog — Implementation Plan

## 0. Project Context

Build a brand-new project from an empty directory for the Hacktoberfest Weekend Challenge 2026 — "Build for a Friend".

Product:

**ServiceLog — Your vehicle remembers what you forget.**

ServiceLog is a small AI-powered vehicle maintenance memory built for a real friend who frequently forgets when their motorcycle was serviced, what was done, and what maintenance information was recorded.

The project must be intentionally small and polished rather than feature-heavy.

The primary goal is a complete vertical slice:

> Add vehicle → record maintenance → ask ServiceLog → receive a grounded answer based only on recorded data.

The open-source AI must be a meaningful core part of the product.

Primary AI technology:

**Gemma**

Primary target partner category:

**Best Use of Gemma**

Do not add unnecessary infrastructure or features.

---

# 1. Critical Challenge Constraints

Treat these as hard requirements.

1. This is a brand-new project.
2. The working directory is completely empty.
3. Do not copy or reuse an existing hackathon project.
4. Do not import source code from previous projects.
5. Development must begin during the official challenge entry period.
6. Keep the implementation history clean and attributable to this project.
7. English must be used for the public submission because prize eligibility requires an English submission.
8. The application must solve a real problem for a real friend.
9. Open-source/open-weight AI must be at the core of the application.
10. Gemma must be meaningfully integrated, not merely mentioned.
11. The final submission must include:
    - working project
    - source repository
    - demo
    - explanation of the open-source AI
    - explanation of why open innovation matters
    - real-friend context and feedback where available.

Do not claim challenge eligibility in the application itself.

---

# 2. Product Definition

## Product Name

ServiceLog

## Tagline

Your vehicle remembers what you forget.

## One-sentence description

ServiceLog is an AI-powered maintenance memory that lets a vehicle owner record service history and ask natural-language questions about their vehicle.

## Target user

One real friend who owns a motorcycle and frequently forgets maintenance history.

## Core problem

The friend remembers owning and riding the motorcycle but does not reliably remember:

- when the last service happened
- what was serviced
- the odometer reading
- what parts or fluids were used
- what maintenance records exist

## Core solution

Store structured maintenance records and allow the user to ask natural-language questions.

Examples:

- "When did I last change the oil?"
- "What was done at my last service?"
- "What maintenance did I do around September?"
- "What service records do I have?"
- "Which service happened at 18,000 km?"

The AI must answer from application data.

---

# 3. Product Principles

Follow these principles throughout implementation.

## 3.1 Small

Do not turn this into a workshop management platform.

## 3.2 Personal

The product should feel like a memory for one person's vehicle.

## 3.3 Grounded

AI must not invent service history.

## 3.4 Transparent

If the data is missing, explicitly say so.

## 3.5 Open AI first

Gemma is part of the actual product workflow.

## 3.6 Demoable

Every core capability must be easy to demonstrate within 60–90 seconds.

## 3.7 Polished over complex

Prefer a beautiful, reliable five-feature product over a large unfinished application.

---

# 4. Explicit Non-Goals

Do NOT implement these unless the core MVP is already completely finished:

- authentication
- multi-user accounts
- workshop management
- mechanic accounts
- appointment booking
- GPS
- vehicle tracking
- IoT
- OBD integration
- predictive mechanical diagnosis
- marketplace
- payments
- notifications
- mobile native app
- autonomous multi-agent system
- MCP
- vector database
- OCR
- complicated RAG pipeline
- multi-vehicle management
- advanced analytics
- social features

Do not add these merely to make the project appear more technically complex.

---

# 5. Core User Flow

## Flow A — Initial setup

User opens ServiceLog.

Dashboard shows:

- vehicle
- current odometer
- recent maintenance
- next maintenance reminder if enough information exists

If no vehicle exists, show an empty state.

User creates:

```text
Vehicle:
Yamaha R15

Current odometer:
19,820 km
```

---

# 6. Flow B — Add Service Record

User clicks:

**Add Service**

Fields:

```text
Service type
Date
Odometer
Notes
Optional receipt/image
```

Service type options:

```text
Oil Change
Brake
Chain
Tire
Battery
General Service
Other
```

Save the record.

The record appears immediately in the service timeline.

---

# 7. Flow C — Ask ServiceLog

User opens:

**Ask ServiceLog**

Example:

> When did I last change my oil?

Backend:

```text
user question
        ↓
vehicle context
        ↓
service records
        ↓
prompt/context builder
        ↓
Gemma
        ↓
grounded answer
```

Example answer:

> Your last recorded oil change was September 12, 2026 at 18,420 km.

The response should mention the underlying record where useful.

---

# 8. Flow D — Missing Information

Example:

User asks:

> When did I replace my spark plug?

But there is no spark-plug record.

AI must respond with something like:

> I don't have a recorded spark-plug replacement in your ServiceLog history.

It must NOT invent:

- dates
- mileage
- service type
- parts
- maintenance events

This behavior is a core quality requirement.

---

# 9. Application Screens

Keep the UI to approximately three primary screens.

## Screen 1 — Dashboard

Contents:

```text
ServiceLog

Yamaha R15
19,820 km

Next maintenance
Oil change
~180 km

Recent service

Sep 12
Oil Change
18,420 km

Aug 03
Brake Check
17,900 km

Jun 15
Chain Service
16,800 km

[ Add Service ]

[ Ask ServiceLog ]
```

---

## Screen 2 — Service Record

Form:

```text
Add Service

Service type
[ Oil Change ]

Date
[ Sep 12, 2026 ]

Odometer
[ 18,420 ]

Notes
[ Motul 5100 10W-40 ]

Receipt
[ Optional upload ]

[ Save Service ]
```

---

## Screen 3 — AI Assistant

Conversation-style UI:

```text
Ask ServiceLog

"What did I do at my last service?"

ServiceLog:

Your latest recorded service was an oil change
on September 12, 2026 at 18,420 km.

The notes indicate:
Motul 5100 10W-40.

[ Ask another question... ]
```

Do not make this look like a generic ChatGPT clone.

It should feel like a specialized vehicle-memory interface.

---

# 10. Technical Stack

Use a simple modern TypeScript stack.

Recommended:

```text
Next.js
TypeScript
Tailwind CSS
Prisma
PostgreSQL on Neon
Gemma
```

The database provider is PostgreSQL on Neon, shared by local development and production, so there is one schema and one set of credentials rather than a local database plus a hosted one. Getting there was a provider switch only: the application architecture, the Prisma models, and the API contracts are unchanged.

Do not introduce additional infrastructure unless necessary.

---

# 11. Project Structure

Create approximately:

```text
servicelog/
├── app/
│   ├── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   ├── ask/
│   │   └── page.tsx
│   └── api/
│       ├── vehicles/
│       │   └── route.ts
│       ├── services/
│       │   └── route.ts
│       └── ask/
│           └── route.ts
│
├── components/
│   ├── dashboard/
│   ├── service-form/
│   ├── service-timeline/
│   ├── vehicle-card/
│   └── ai-assistant/
│
├── lib/
│   ├── db.ts
│   ├── gemma.ts
│   ├── ai-context.ts
│   ├── validation.ts
│   └── maintenance.ts
│
├── prisma/
│   └── schema.prisma
│
├── public/
│
├── tests/
│
├── README.md
├── .env.example
├── package.json
├── tsconfig.json
└── ...
```

Adjust the exact structure to the chosen Next.js version, but preserve the separation of UI, database, AI integration, and business logic.

---

# 12. Database Schema

Keep the schema intentionally small.

## Vehicle

Fields:

```text
id
name
brand
model
year
currentOdometer
createdAt
updatedAt
```

## ServiceRecord

Fields:

```text
id
vehicleId
type
date
odometer
notes
createdAt
updatedAt
```

Optional:

```text
receiptUrl
```

Relationship:

```text
Vehicle
  1
  |
  | many
  v
ServiceRecord
```

No authentication tables.

No unnecessary relational complexity.

---

# 13. API Contract

## GET /api/vehicles

Return the vehicle.

## POST /api/vehicles

Create/update the initial vehicle.

## GET /api/services

Return service records sorted newest first.

## POST /api/services

Create a service record.

Validate:

- service type
- date
- odometer
- notes length

Reject malformed requests.

## POST /api/ask

Request:

```json
{
  "question": "When did I last change my oil?"
}
```

Server:

1. Load vehicle.
2. Load relevant service history.
3. Build a compact context.
4. Call Gemma.
5. Return grounded response.
6. Never expose private model/API credentials to the browser.

Response:

```json
{
  "answer": "...",
  "sources": [
    {
      "serviceRecordId": "...",
      "type": "OIL_CHANGE",
      "date": "2026-09-12",
      "odometer": 18420
    }
  ]
}
```

The UI can display these records as supporting context.

---

# 14. AI Architecture

The AI layer must be deterministic in its input.

Do not dump the entire database blindly into the prompt.

Build a context object.

Example:

```text
Vehicle:
Yamaha R15
Current odometer: 19,820 km

Service history:

1.
Type: Oil Change
Date: 2026-09-12
Odometer: 18,420 km
Notes: Motul 5100 10W-40

2.
Type: Brake
Date: 2026-08-03
Odometer: 17,900 km
Notes: Front brake inspection
```

Then provide the user question.

---

# 15. Gemma System Instruction

Use a concise system instruction along these lines:

```text
You are ServiceLog, a vehicle maintenance memory assistant.

Answer questions using only the vehicle and maintenance
records provided in the context.

Never invent service records, dates, mileage, parts,
maintenance events, or other vehicle history.

If the requested information is not present, clearly say
that it is not recorded.

When answering, prefer specific dates and odometer readings
when available.

Do not claim to diagnose mechanical problems.

For safety-sensitive mechanical questions, distinguish
recorded history from general information and recommend
professional inspection when appropriate.
```

Do not make unsupported claims about actual maintenance intervals.

---

# 16. Gemma Integration

Before implementation, inspect the currently available Gemma inference/deployment option and choose the simplest reliable method that can be used within the challenge constraints.

Do not assume a specific provider or SDK without verifying it.

The implementation must isolate the model adapter in:

```text
lib/gemma.ts
```

The rest of the application should depend on an internal function such as:

```text
answerVehicleQuestion(context, question)
```

This allows the model/runtime to be changed without rewriting the application.

Environment variables must remain server-side.

Never expose model/API keys in client components.

---

# 17. Error Handling

Handle:

- AI unavailable
- malformed AI response
- empty question
- missing vehicle
- no service history
- database errors
- invalid service record
- timeout

If AI fails, show:

> ServiceLog couldn't reach its AI assistant right now. Your service records are still safe.

Do not silently fabricate an answer.

---

# 18. AI Response Validation

Do not blindly trust model output.

At minimum:

- ensure a non-empty answer
- reject obviously malformed responses
- preserve source record IDs separately from model output
- do not allow the model to create arbitrary source IDs
- construct supporting records from the database, not from model claims

The application should treat the database as the source of truth.

Gemma generates the natural-language explanation.

---

# 19. Maintenance Reminder

Implement only a simple deterministic reminder.

Example:

```text
last oil change:
18,420 km

current:
19,820 km

configured interval:
2,000 km
```

Then:

```text
next:
20,420 km
```

Important:

The AI does NOT determine the maintenance interval.

The application/business logic does.

AI explains recorded information.

This gives the project a strong architecture:

```text
Deterministic data
        ↓
Deterministic calculations
        ↓
Gemma
        ↓
Natural-language explanation
```

---

# 20. UI Direction

Visual direction:

**warm, practical, premium utility app.**

Avoid:

- black AI dashboard
- excessive gradients
- glowing neon
- robot illustrations
- generic "AI" visual language
- excessive cards
- dashboard overload

Suggested visual hierarchy:

```text
Vehicle
   ↓
Current state
   ↓
Recent history
   ↓
Ask
```

Use a restrained interface with strong typography and clear spacing.

The product should look like a real consumer utility, not a hackathon AI demo.

---

# 21. Seed Data

For development/demo, seed one vehicle and several records.

Example:

```text
Vehicle:
Yamaha R15

Current:
19,820 km

Records:

2026-09-12
Oil Change
18,420 km
Motul 5100 10W-40

2026-08-03
Brake
17,900 km
Front brake inspection

2026-06-15
Chain
16,800 km
Chain cleaned and adjusted
```

Important:

Clearly identify seed/demo data.

Do not present invented data as real friend feedback.

Actual friend feedback must be collected separately.

---

# 22. Test Cases

Create tests for the most important behavior.

## AI grounding

Question:

```text
When did I last change my oil?
```

Expected:

Returns the actual oil-change record.

## Missing data

Question:

```text
When did I replace my spark plug?
```

Expected:

States that there is no recorded spark-plug replacement.

## Multiple records

Question:

```text
What was my latest service?
```

Expected:

Returns newest record.

## Odometer

Question:

```text
What mileage was my last brake service?
```

Expected:

Returns the brake record's odometer.

## Empty history

Expected:

Clear response that no service history is recorded.

## API validation

Invalid service request must return a validation error.

---

# 23. Security

Minimum requirements:

- API/model credentials server-side only.
- Validate all API input.
- Do not expose environment variables.
- Do not log secrets.
- Do not send unnecessary information to the model.
- Do not claim the application provides professional mechanical diagnosis.

Since this is a challenge MVP, do not spend hours implementing enterprise authentication.

---

# 24. README Requirements

README must explain:

```text
# ServiceLog

Your vehicle remembers what you forget.

## The Problem

## What I Built

## Demo

## Features

## How It Works

## Why Gemma?

## Why Open-Source AI Matters

## Architecture

## Running Locally

## Environment Variables

## Testing

## Limitations

## Future Ideas
```

The README should not contain exaggerated claims.

---

# 25. DEV Submission Narrative

The eventual article should center around the person, not the technology.

Suggested opening:

> My friend has a motorcycle and one recurring problem: he never remembers when he last serviced it.

Then:

> So instead of building another generic AI assistant, I built him a memory for his motorcycle.

Article structure:

```text
1. The problem
2. Who I built it for
3. What I built
4. The demo
5. How the AI works
6. Why Gemma
7. Why open-source AI matters
8. What happened when my friend used it
9. What I learned
10. What I'd build next
11. Source code
12. Demo
```

Do not invent friend feedback.

Only include feedback actually obtained.

---

# 26. Demo Video

Target:

60–90 seconds.

Sequence:

```text
0–8s
Problem/story

8–20s
Dashboard

20–35s
Ask:
"When did I last change my oil?"

35–48s
Ask:
"What was done at my last service?"

48–60s
Add service record

60–75s
Ask again and show updated result

75–90s
Show Gemma architecture + final product
```

Final line:

> I didn't build him another chatbot. I built him a memory for his motorcycle.

---

# 27. Submission Checklist

Before submission:

## Product

- [ ] Dashboard works
- [ ] Vehicle works
- [ ] Service records work
- [ ] AI question works
- [ ] Missing information handled
- [ ] Grounded answers work
- [ ] Responsive UI
- [ ] No obvious console errors

## AI

- [ ] Gemma genuinely integrated
- [ ] AI is core to the product
- [ ] Model credentials remain server-side
- [ ] Grounding behavior tested
- [ ] No fabricated service history

## Challenge

- [ ] New project
- [ ] Started within challenge window
- [ ] Repository available
- [ ] Demo available
- [ ] English submission
- [ ] Friend problem clearly explained
- [ ] Open-source AI explanation
- [ ] Why open innovation matters
- [ ] Correct challenge hashtag/category information
- [ ] Actual friend feedback included if obtained

## Quality

- [ ] README polished
- [ ] UI polished
- [ ] Demo polished
- [ ] No placeholder text
- [ ] No fake testimonials
- [ ] No fake usage statistics
- [ ] No unsupported AI claims

---

# 28. Implementation Order

Execute in this exact order.

### Phase 1 — Foundation

1. Initialize Next.js project.
2. Configure TypeScript.
3. Configure Tailwind.
4. Configure Prisma.
5. Create database schema.
6. Run migration.
7. Create seed data.
8. Verify application starts.

### Phase 2 — Core CRUD

1. Vehicle creation.
2. Vehicle dashboard.
3. Service record creation.
4. Service timeline.
5. Validation.
6. Empty states.

### Phase 3 — AI

1. Implement Gemma adapter.
2. Implement context builder.
3. Implement `/api/ask`.
4. Implement grounded system prompt.
5. Implement source-record handling.
6. Add loading/error states.
7. Test hallucination/missing-data behavior.

### Phase 4 — Product Polish

1. Dashboard refinement.
2. AI assistant refinement.
3. Responsive layout.
4. Loading states.
5. Empty states.
6. Error states.
7. Accessibility basics.

### Phase 5 — Validation

1. Run tests.
2. Run lint.
3. Run typecheck.
4. Run production build.
5. Manually test all flows.
6. Verify no secrets are committed.

### Phase 6 — Friend Test

1. Deploy.
2. Give application to real friend.
3. Observe usage.
4. Record feedback.
5. Fix only high-value issues.

### Phase 7 — Submission

1. Record demo.
2. Finalize README.
3. Write DEV article.
4. Verify repository.
5. Verify deployment.
6. Verify challenge requirements.
7. Submit before deadline.

---

# 29. Hard Scope Rule

If a feature is not required for:

```text
friend problem
+
vehicle memory
+
Gemma
+
working demo
```

do not implement it unless all core requirements are finished.

If time becomes limited, cut features in this order:

1. Receipt upload
2. Fancy animations
3. Advanced reminder configuration
4. Multiple vehicle support
5. Extra service categories

Never cut:

1. Service records
2. AI assistant
3. Grounding
4. Friend-specific problem
5. Gemma integration
6. Working demo

---

# 30. Final Technical Goal

The finished application should demonstrate this complete loop:

```text
REAL FRIEND
     │
     ▼
REAL MAINTENANCE PROBLEM
     │
     ▼
ServiceLog
     │
     ├── Structured service history
     │
     ▼
Grounded context
     │
     ▼
GEMMA
     │
     ▼
Natural-language answer
     │
     ▼
REAL FRIEND USES IT
     │
     ▼
REAL FEEDBACK
```

This is the core of the project.

Do not optimize for technical complexity.

Optimize for:

**specific problem → useful product → meaningful open-source AI → real person → compelling story.**