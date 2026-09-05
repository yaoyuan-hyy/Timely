# Trusted Recording Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Timely reliable enough for daily use by adding a visible record confirmation loop, natural-language correction, a unified recent-record surface, and recoverable AI errors.

**Architecture:** Keep Timely local-first and provider-agnostic. Extend the existing pure domain helpers and `TimelyState` with a short-lived record draft and explicit pending action; keep DeepSeek behind `app/api/record-input` and `server/ai`. The UI renders domain results and dispatches actions through the existing hooks rather than parsing natural language itself.

**Tech Stack:** Next.js 14, React 18, TypeScript, LangGraph JS, Zod, Plain CSS, `localStorage`.

**Spec:** `docs/product/PRD.md` and the current product assessment in this plan.

## Global Constraints

- Timely remains a natural-language personal record app, not a reminder app, task manager, focus timer, productivity analytics tool, or full finance app.
- Default timezone is `Asia/Shanghai`.
- AI only parses; domain code validates and mutates `TimelyState`.
- Keep API credentials server-only in `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL`.
- Preserve localStorage key `timely-event-record-state-v1` and normalize older state safely.
- Use one concise clarification at a time and keep cancelled events recoverable.
- Every behavior change follows failing test → minimal implementation → focused test → full verification.

### Task 1: Explicit record preview and confirmation

**Files:**
- Create: `lib/record-draft.ts`
- Modify: `lib/types.ts`, `lib/record-input.ts`, `lib/agent/record-workflow.ts`
- Modify: `components/timely/chat-view.tsx`, `hooks/use-record-submit.ts`, `components/timely-app.tsx`, `app/globals.css`
- Test: `tests/record-draft.test.ts`, `tests/record-input.test.ts`, `tests/ui-shell.test.ts`

**Interfaces:**
- `RecordDraft` contains `kind: "event" | "ledger"`, the parsed fields, original input, and missing fields.
- `buildRecordDraft(result, input, now): RecordDraft | null` validates the parser result without mutating state.
- `confirmRecordDraft(state, draft, options): TimelyState` applies one validated draft through existing event/ledger constructors.
- `discardRecordDraft(state, draftId, options): TimelyState` clears only that draft and appends a concise user-visible reply.

- [ ] Write a failing test proving a valid event and ledger parse produces a preview draft and does not add a record before confirmation.
- [ ] Run `npm run test:behavior`; confirm the new test fails because no draft contract exists.
- [ ] Implement the draft type, validation, and reducer using existing `isValidEventDateTime`, ledger amount checks, and Shanghai time helpers.
- [ ] Add compact preview controls to ChatView: confirm, edit/re-enter, and cancel. Keep buttons keyboard reachable and show the missing field when clarification is required.
- [ ] Run focused tests, then `npm test`, `npm run typecheck`, and `npm run lint`.
- [ ] Commit with `feat: add explicit record confirmation loop`.

### Task 2: Natural-language correction and relative references

**Files:**
- Create: `lib/record-editing.ts`
- Modify: `lib/record-input.ts`, `lib/event-recording.ts`, `lib/ledger-recording.ts`, `lib/agent/app-workflow.ts`
- Modify: `hooks/use-record-submit.ts`, `components/timely/chat-view.tsx`
- Test: `tests/record-editing.test.ts`, `tests/app-workflow.test.ts`, `tests/record-input.test.ts`

**Interfaces:**
- `resolveRecordEdit(state, input, options): TimelyState` handles “刚才那条”, “上一笔”, event time/title/location changes, ledger amount/category/direction changes, and explicit delete.
- `findRecentRecord(state, kind?, now?): CalendarEvent | LedgerEntry | null` returns the most recent active record using Shanghai timestamps.
- `RecordEditResult` reports `updated`, `cancelled`, `ambiguous`, or `needs_clarification` for concise UI responses.

- [ ] Write failing tests for editing the last event time, changing the last ledger amount, ambiguous references, and refusing to edit cancelled records without explicit restore.
- [ ] Run focused tests and verify failure.
- [ ] Implement deterministic reference resolution first; ask one clarification when multiple records match instead of guessing.
- [ ] Route edit language before fresh creation while preserving query routing and existing pending clarification behavior.
- [ ] Add inline “修改” action to the confirmation preview that reopens the composer with the original input.
- [ ] Run all record and workflow tests, then typecheck and lint.
- [ ] Commit with `feat: support natural-language record corrections`.

### Task 3: Unified recent records and retrieval

**Files:**
- Create: `lib/recent-records.ts`
- Modify: `components/timely-app.tsx`, `components/timely/chat-view.tsx`, `components/timely/calendar-view.tsx`, `components/timely/ledger-view.tsx`, `app/globals.css`
- Modify: `lib/agent/query-workflow.ts`, `lib/ui-popup.ts`
- Test: `tests/recent-records.test.ts`, `tests/query-workflow.test.ts`, `tests/ui-shell.test.ts`

**Interfaces:**
- `getRecentRecords(state, limit): RecentRecord[]` returns a stable mixed event/ledger projection sorted by Shanghai creation/occurrence time.
- `searchRecords(state, query): RecentRecord[]` matches event title/location/notes and ledger category/note/counterparty.
- Query popup payloads may include a `target` containing `{ view: "calendar" | "ledger", dayKey?: string, monthKey?: string, recordId?: string }`.

- [ ] Write failing tests for mixed recent ordering, cancelled-event exclusion, Chinese title/category search, and query target generation.
- [ ] Run focused tests and verify failure.
- [ ] Implement the projection without changing persisted event or ledger shapes.
- [ ] Render a quiet “最近记录” section on the chat home state and add search only where it reduces navigation cost.
- [ ] Make query cards link to the relevant calendar day or ledger month when a target is known.
- [ ] Verify mobile layout, focus states, empty state, and reduced-motion behavior.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Commit with `feat: add unified recent record retrieval`.

### Task 4: AI failure recovery, duplicate protection, and local data portability

**Files:**
- Create: `lib/record-dedup.ts`, `lib/data-export.ts`
- Modify: `server/ai/deepseek-record-parser.ts`, `app/api/record-input/route.ts`, `hooks/use-record-submit.ts`, `components/timely/settings-view.tsx`, `components/timely-app.tsx`
- Modify: `lib/state.ts`, `docs/deployment.md`, `docs/progress.md`, `README.md`
- Test: `tests/record-dedup.test.ts`, `tests/data-export.test.ts`, `tests/ai-parser.test.ts`, `tests/state.test.ts`

**Interfaces:**
- `findPossibleDuplicate(state, candidate): CalendarEvent | LedgerEntry | null` compares normalized title/category, Shanghai minute, and amount where applicable.
- `exportTimelyState(state): string` returns versioned, redacted JSON without credentials.
- `parseTimelyExport(text): TimelyState` validates and normalizes an export before import.

- [ ] Write failing tests for duplicate event/ledger submissions, AI timeout recovery, retry preserving the original input, export/import round trips, and malformed import rejection.
- [ ] Run focused tests and verify failure.
- [ ] Add duplicate confirmation before mutation; never silently discard a user submission.
- [ ] Make timeout, invalid JSON, and provider errors show a retryable UI state while local fallback remains available.
- [ ] Add export/import controls in Settings with clear local-only copy and no token exposure.
- [ ] Update deployment and progress docs with the current provider, recovery behavior, and test commands.
- [ ] Run `npm test`, `npm run test:ai`, `npm run typecheck`, `npm run lint`, `npm run build`, `node --check public/app.js`, and `git diff --check`.
- [ ] Commit with `feat: improve recovery and local data portability`.

## Review Checkpoints

- After Task 1: confirm that no record is written without an explicit user confirmation.
- After Task 2: test ambiguous “上一条/刚才那笔” cases manually before continuing.
- After Task 3: inspect mobile empty, populated, and query-target states.
- After Task 4: verify export files contain no API keys and that all provider failures are recoverable.
