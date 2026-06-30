# Timely

Timely is a mobile-first Web/PWA client for natural-language personal records.

The product is not a reminder app, planning app, task manager, focus timer, or productivity analytics tool. The current app is event-first, with an independent local ledger-record surface and local query feedback already present:

```text
Natural-language input
  -> LangGraph supervisor agent
  -> write agent or query agent
  -> optional AI unified parse for writes, with local fallback
  -> local query over TimelyState for personal-data questions
  -> write TimelyState
  -> persist in localStorage
  -> events appear in calendar/timeline views; ledger entries appear in the ledger view; query results open UI cards
```

## Stack

- Next.js 14
- React 18
- TypeScript
- LangGraph JS (`@langchain/langgraph`) for the supervisor/write/query workflows
- Zod for eval dataset validation
- Plain CSS in `app/globals.css`
- `lucide-react` icons
- Browser `localStorage` under `timely-event-record-state-v1`

## Run Locally

Install and run:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Current App

- Mobile-first Timely app shell.
- Four views: Chat, Records, Ledger, Settings.
- Natural-language event creation and deletion through `/api/record-input`, with local fallback.
- Natural-language schedule/ledger/task-like queries through a local query agent.
- Event records support past and future time points, one concise clarification, cancellation, restoration, and permanent deletion from cancelled records.
- Ledger entries are a separate record type; they do not reuse `CalendarEvent`.
- Query results are emitted as strict ````json UI_POPUP` blocks and rendered as in-app cards/windows.
- State is local-first and normalized on load so old or malformed local data does not crash the app.
- `public/app.js` is a static preview/compatibility surface, not the long-term business implementation.

## Multi-Agent Workflow

Timely now uses a LangGraph supervisor workflow in `lib/agent/app-workflow.ts`. It classifies each input and routes it to one of three agents:

```text
classify_intent
  -> query_agent
  -> write_agent
  -> chat_agent
```

- `query_agent`: handles personal-data queries such as schedule, spending, and task-like questions.
- `write_agent`: delegates to the existing record workflow for event and ledger creation/deletion.
- `chat_agent`: gives a lightweight fallback response for non-data conversation.

The write agent remains the thin orchestration layer in `lib/agent/record-workflow.ts`:

```text
normalize_input
  -> call_ai_parser
    -> apply_ai_result
    -> apply_local_fallback
  -> summarize_outcome
```

Node responsibilities:

- `normalize_input`: trims the user input and starts the trace.
- `call_ai_parser`: calls the injected parser, normally `/api/record-input`; failures are captured as `aiError` instead of crashing the UI.
- `apply_ai_result`: applies a structured AI result through `resolveRecordInputWithAi`, which still rejects inconsistent AI outputs and falls back internally where needed.
- `apply_local_fallback`: applies the deterministic local parser through `resolveRecordInput`.
- `summarize_outcome`: labels the run as `event_created`, `event_cancelled`, `ledger_created`, `clarification_requested`, `unsupported`, and so on.

The query agent in `lib/agent/query-workflow.ts` is local-first:

```text
normalize_query
  -> classify_query
  -> query_local_database
  -> format_popup_response
```

It queries `TimelyState.events` and `TimelyState.ledgerEntries`, including common Chinese time windows such as `明天下午`, `昨晚`, and `下周三`, then emits a response with a short intro plus a strict UI trigger block:

````text
我查到了，明天有 1 条安排。

```json UI_POPUP
{"type":"timely_query_result","query_kind":"schedule","query_status":"success",...}
```
````

If no records match, the query agent still emits `UI_POPUP` with `query_status: "empty"` so the frontend can show a structured empty state.

The chat submit hook (`hooks/use-record-submit.ts`) calls `runTimelyAgentWorkflow`, so the product path and the tested multi-agent path are the same path. The API route shape is unchanged:

```text
POST /api/record-input
{ input: string, now?: string } -> { result }
```

## Eval Dataset

The offline eval set lives in `evals/record-input-cases.jsonl`. It covers representative Chinese inputs for:

- event creation
- travel-like event creation
- missing event time clarification
- event deletion
- ledger expense and income creation
- missing ledger amount clarification
- quantity/date numbers that must not become amounts
- unsupported reminder requests
- query-popup parsing and local query results

Run the eval:

```bash
npm run eval:records
```

The runner (`scripts/eval-record-workflow.ts`) validates JSONL cases with Zod, invokes the LangGraph workflow with deterministic IDs, scores declared expectations, and prints a pass rate. It defaults to local fallback so it is stable in CI and can later be extended to send traces/results to LangSmith, LangFuse, or W&B Weave.

## Verification

Common checks:

```bash
node --test tests/ui-shell.test.ts
npm test
npm run test:agent
npm run eval:records
npm run typecheck
node --check public/app.js
npm run lint
git diff --check
npm run build
```

`npm run lint` and `npm run build` may show the existing local warning for `NODE_TLS_REJECT_UNAUTHORIZED=0`; treat that separately from actual lint/build failures.

## Product Docs

- `AGENTS.md`: operating standard for agents working on Timely
- `progress.md`: current progress, known issues, and suggested next steps
- `PRD.md`: product requirements
- `ARCHITECTURE.md`: architecture notes
