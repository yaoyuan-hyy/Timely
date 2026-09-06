# Timely

Timely is a mobile-first Web/PWA client for natural-language personal records.

The product is not a reminder app, planning app, task manager, focus timer, or productivity analytics tool. The current app is event-first, with an independent local ledger-record surface and local query feedback already present:

```text
Natural-language input
  -> local correction / relative-reference resolution
  -> LangGraph supervisor agent
  -> write agent or query agent
  -> optional AI unified parse for writes, with local fallback
  -> local query over TimelyState for personal-data questions
  -> preview a single event/ledger draft
  -> confirm to commit that record into TimelyState
  -> persist in localStorage
  -> events appear in calendar/timeline views; ledger entries appear in the ledger view; query results open UI cards
```

## Stack

- Next.js 14
- React 18
- TypeScript
- LangGraph JS (`@langchain/langgraph`) for the supervisor/write/query workflows
- Zod for AI result and eval dataset validation
- Plain CSS in `app/globals.css`
- `lucide-react` icons
- Browser `localStorage` under `timely-event-record-state-v1`

## Run Locally

Install and run:

```bash
npm ci
cp .env.example .env.local
# Fill DEEPSEEK_API_KEY in .env.local, then:
npm run dev
```

Then open:

```text
http://localhost:3000
```

The server uses `deepseek-v4-flash` at `https://api.deepseek.com/chat/completions`.
Set `DEEPSEEK_API_KEY` in `.env.local`; `DEEPSEEK_BASE_URL` and `DEEPSEEK_MODEL` are optional overrides. Restart the dev server after changing environment variables. Existing `OPENAI_*` / `MINIMAX_*` variables no longer configure this app.

With the server running, `npm run test:ai` checks real event, ledger, and clarification parsing (four API requests). This is separate from `npm test`, which uses mocked HTTP and requires no token. These checks parse sample inputs without writing browser records.

## Current App

- Creation and correction show a preview before saving; confirm, edit/re-enter, or cancel. Event cancellations retain their existing recoverable behavior.
- Local corrections support `刚才那条改到下午四点`, `上一笔改成58元`, `会议地点改成公司`, and `不是支出，是收入`. Ambiguous matches ask for a numbered selection or a date/time.
- Chat includes mixed recent records and search. Search and query cards open the relevant Shanghai calendar day or ledger month.
- Possible duplicate records show a warning with an explicit “仍然保存” action. AI failures show local fallback and allow retry with the original input/context.
- Settings exports versioned JSON backups and previews imports before merging. Same-ID conflicts preserve current records. Backups include events (including cancelled events) and ledger entries, excluding chat and unconfirmed work.
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

For capability-level evaluation, run `npm run bench:queries` (18 frozen regression cases) or add `-- --live` for DeepSeek. The benchmark contains 28 total cases across seven dimensions and supports `--runs`, `--compare`, and `--gate`. See [benchmark methodology and measured results](docs/evals/query-benchmark-v1.md); the earlier six-case eval remains a smoke suite, not an accuracy estimate.

Query execution now has explicit layers: `QueryPlan v1 → query tools → RecordRepository → local UI_POPUP formatting`. The default planner remains rule-based; `parseQueryPlan` can be injected for model comparison. The query model receives only synthetic/user query text and the current time, never the record collection. Confirmed drafts use a separate UI-only commit capability with conflict checks. Browser persistence uses an injected StateStorage adapter.

Run `npm run eval:queries` for the fixed offline baseline. Run `npm run eval:queries -- --live` to compare DeepSeek on the same six synthetic cases using server environment configuration. Reports separate plan accuracy, result accuracy and fallback counts; a fallback never earns model credit. The app does not switch to model query parsing automatically.

The UI first calls `lib/record-session.ts` for local edit resolution and fallback metadata. Existing workflows return proposals; `lib/record-draft.ts` stages a single record without saving it. Confirmation validates and commits only that record, preserving concurrent manual edits. Pending confirmations and edit selections are session-only and are cleared on reload; existing missing-field clarification remains compatible.

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
- `docs/progress.md`: current progress, known issues, and suggested next steps
- `docs/product/PRD.md`: product requirements
- `docs/architecture/ARCHITECTURE.md`: architecture notes
- `docs/plans/IMPLEMENTATION_PLAN.md`: historical implementation plan

## Project Layout

- `app/`, `components/`, `hooks/`: browser UI and client interactions
- `lib/`: shared domain, state, time, and validation logic
- `server/`: server-only AI provider adapters; these modules read API credentials
- `app/api/`: thin Next.js HTTP boundaries that call server adapters
- `docs/`: product, architecture, plan, deployment, and progress documentation
- `tests/`, `scripts/`, `evals/`: verification and evaluation tooling

The browser never receives `DEEPSEEK_API_KEY`. AI calls stay behind the Next.js API routes; shared domain code remains provider-agnostic so local fallback and tests do not depend on a network request.
