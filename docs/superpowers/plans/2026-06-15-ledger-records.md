# Ledger Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-first ledger records that can be created from the existing natural-language input and displayed in a new Timely ledger view.

**Architecture:** Ledger entries are a separate Timely record type, not `CalendarEvent`. A new unified record resolver routes AI/local parse results to event or ledger handlers, stores entries in `TimelyState.ledgerEntries`, and reuses the existing localStorage state hook. UI adds a quiet mobile ledger view with summary and date-grouped rows.

**Tech Stack:** Next.js 14, React 18, TypeScript, plain CSS, lucide-react, Node test runner.

---

### Task 1: State Model And Migration

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/state.ts`
- Modify: `lib/seed-data.ts`
- Modify: `tests/state.test.ts`

- [ ] Add `LedgerEntry` and ledger-related pending clarification types.
- [ ] Extend `TimelyState` with `ledgerEntries: LedgerEntry[]`.
- [ ] Normalize old localStorage states without `ledgerEntries` to an empty array.
- [ ] Filter malformed ledger entries and preserve valid ones.
- [ ] Add tests for migration and malformed ledger data.

### Task 2: Ledger Parsing And State Transitions

**Files:**
- Create: `lib/ledger-recording.ts`
- Create: `tests/ledger-recording.test.ts`
- Modify: `package.json`

- [ ] Write failing tests for `今天午饭花了38`, `昨天打车26.5`, and `收到工资12000`.
- [ ] Implement local ledger parsing for amount, direction, rough category, and occurred date.
- [ ] Default missing ledger date/time to current Shanghai time.
- [ ] Ask `金额是多少？` when a likely ledger phrase lacks an amount.
- [ ] Ask `这是收入还是支出？` when direction cannot be inferred.
- [ ] Return short confirmations such as `已记录。支出 38.00 元，餐饮。`.

### Task 3: Unified Record Resolver

**Files:**
- Create: `lib/record-input.ts`
- Modify: `components/timely-app.tsx`
- Modify: `tests/record-events.test.ts`
- Modify: `tests/ledger-recording.test.ts`

- [ ] Route pending ledger clarifications before event parsing.
- [ ] Route likely ledger phrases to ledger parsing.
- [ ] Preserve all existing event create/delete behavior.
- [ ] Update app submit handler to call the unified resolver.

### Task 4: AI Route And MiniMax Adapter

**Files:**
- Create: `app/api/record-input/route.ts`
- Create: `lib/ai/minimax-record-parser.ts`
- Modify: `components/timely-app.tsx`
- Modify: `tests/minimax-api.test.ts`

- [ ] Add `AiRecordParseResult` union with `create_ledger`.
- [ ] Keep `/api/record-event` intact for compatibility.
- [ ] Add `/api/record-input` for unified event and ledger parsing.
- [ ] Make frontend prefer `/api/record-input`, falling back to local parsing on error.
- [ ] Validate AI ledger results before writing state.

### Task 5: Ledger Stats And UI

**Files:**
- Create: `lib/ledger-stats.ts`
- Create: `tests/ledger-stats.test.ts`
- Create: `components/timely/ledger-view.tsx`
- Modify: `components/timely-app.tsx`
- Modify: `components/timely/settings-view.tsx`
- Modify: `app/globals.css`
- Modify: `tests/ui-shell.test.ts`

- [ ] Add `ledger` to `AppView` and the drawer navigation.
- [ ] Add a quiet ledger page with monthly income, expense, net amount, and grouped rows.
- [ ] Keep the header action meaningful: calendar toggles cancelled records; chat clears chat; ledger/settings disable the destructive action.
- [ ] Add settings count for local ledger records.
- [ ] Style ledger components using existing soft shells, spacing, radius, and lucide icons.

### Task 6: Documentation And Verification

**Files:**
- Modify: `progress.md`

- [ ] Document ledger records as an independent record type in the current implementation.
- [ ] Run focused tests after each task.
- [ ] Run final verification: `npm test`, `npm run typecheck`, `node --check public/app.js`, `npm run lint`, `git diff --check`, `npm run build`.
