# AGENTS.md

This file is the operating standard for agents working on Timely. Follow it before making product, design, architecture, or implementation changes.

## Product Standard

Timely is a mobile-first natural-language personal record app. Its current app is event-first, with independent local ledger records and a LangGraph query surface:

```text
Natural-language input
  -> unified InputDecision planner (/api/input-decision)
  -> validated field patches, clarification/recovery, or read-only Query Agent v2
  -> explicit preview and confirmation for writes, or UI_POPUP for executed queries
  -> single-record commit to TimelyState
  -> persist in localStorage
  -> view, cancel, restore, delete, or inspect structured query cards
```

Do not reposition Timely as a reminder app, planning app, task manager, focus timer, productivity analytics tool, or full finance app.

Current scope:

- Record `CalendarEvent` entries from natural language.
- Record independent `LedgerEntry` entries from natural language.
- Query existing local event and ledger records from natural language.
- Trigger structured query UI through ````json UI_POPUP` blocks.
- Support past and future time points.
- Ask one concise clarification when required.
- Show active events in calendar and timeline views.
- Show ledger entries in the ledger view.
- Treat cancelled events as recoverable history until the user permanently deletes them.
- Keep data local-first with `localStorage` under `timely-event-record-state-v1`.

Out of scope until explicitly requested:

- Notifications, reminders, task planning, priority scoring, focus timers, productivity analytics.
- Account system, database, cloud sync, system calendar sync.
- Full accounting, budgets, investment tracking, or analytics dashboards beyond the local ledger record surface.
- A true task system. Task-like queries should return a structured empty state unless a task model is explicitly added.
- Real voice input. The microphone button is currently a disabled placeholder.

## Visual Design Standard

Timely should feel mature, clear, and quiet. The 2026-09-07 redesign replaces the simulated phone shell with a responsive application workspace: persistent desktop sidebar and mobile bottom navigation.

Current visual direction:

- Vibe: restrained contemporary personal utility, with clear information hierarchy.
- Backgrounds: light neutral workspace, white panels, dark green accents.
- Text: dark ink with readable secondary gray. Do not fade essential content.
- Contrast: prioritize legibility and distinct active/focus states.
- Whitespace: generous. Calendar and timeline views must breathe.
- Surfaces: fine borders and minimal shadows; avoid nested decorative shells.
- Radius: consistent 12–18 px panels with smaller controls.
- Motion: spring-like and physically weighted. Prefer `cubic-bezier(0.32, 0.72, 0, 1)` or an established local motion token.

Avoid:

- Harsh black text on pure white panels.
- Heavy dark shadows and decorative gradients.
- Busy gradients, decorative orbs, bokeh blobs, or loud one-note palettes.
- Marketing-style hero sections inside the product shell.
- Dense controls that crowd the calendar or timeline.
- Default `linear` or `ease-in-out` transitions for important state changes.

Component expectations:

- Chat separates sender, content, and timestamp with readable text.
- The composer is a clear input surface with a prominent send action.
- The microphone placeholder stays visibly disabled and secondary.
- Calendar date highlights should be rounded and full, not sharp or tiny.
- Timeline uses clear time labels and consistent event alignment.
- The cancelled-records panel should open with spring-like motion and remain visually quiet.
- Restore and permanent-delete actions should be clear but understated.

Icons:

- The project currently uses `lucide-react`; keep stroke weights light where possible.
- Prefer existing icon patterns over adding a second icon library. Ledger categories use Lucide icons, not emoji.

CSS:

- The current app uses Plain CSS in `app/globals.css`, not Tailwind utility classes.
- If Tailwind is introduced later, preserve the same tokens, spacing, and motion principles instead of creating a parallel visual language.
- Use stable dimensions for fixed-format UI like calendar cells, icon buttons, toolbars, and timeline rows so hover states and text do not shift layout.

## Frontend Architecture

Framework stack:

- Next.js 14
- React 18
- TypeScript
- Plain CSS
- `lucide-react`

Primary entry:

- The Next app is the business implementation.
- `public/app.js` is a static preview/compatibility surface. Do not expand it into a second long-term business implementation unless explicitly requested.

Main files:

- `components/timely-app.tsx`: top-level app orchestration and view switching.
- `components/timely/chat-view.tsx`: chat input and conversation view.
- `components/timely/calendar-view.tsx`: month calendar, single-day timeline, cancelled-records panel.
- `components/timely/settings-view.tsx`: settings/status surface.
- `lib/event-recording.ts`: natural-language event create/delete resolution.
- `server/ai/deepseek-record-parser.ts`: DeepSeek event/ledger parsing adapter.
- `lib/record-result-schema.ts`: shared runtime validation for AI responses.
- `lib/state-commit.ts`: commits workflow changes while preserving concurrent manual edits.
- `lib/time.ts`: Shanghai-time utilities.
- `lib/state.ts`: localStorage state normalizer/migration helper.
- `lib/stats.ts`: event filtering and sorting helpers.
- `lib/agent/app-workflow.ts`: LangGraph supervisor routing to query/write/chat agents.
- `lib/agent/record-workflow.ts`: LangGraph write workflow.
- `lib/agent/query-workflow.ts`: LangGraph local query workflow.
- `lib/ui-popup.ts`: UI_POPUP build/parse helpers.
- `lib/types.ts`: shared data model.

Architecture rules:

- Ledger categories are defined only in `lib/ledger-categories.ts`. Active model writes and QueryPlanV2 use its canonical-name enum; specific activities belong in note/sourceText. Keep ID-based semantic matching in Repository and exact legacy aliases for read compatibility. Never turn a note substring into a v2 category match. See `docs/architecture/ledger-category-contract.md`.
- Keep reference images under `docs/design/references/`, scripts under `scripts/`, and generated logs/cache out of version control. `scripts/preview-server.mjs` is the legacy static preview only; `npm run dev` remains the combined Next frontend/API entry.

- Active UI uses `runInputSession` and `/api/input-decision`; v1 supervisor/write routes remain compatibility surfaces. `lib/input-recovery.ts` handles bounded unresolved raw input, distinct from validated drafts. See `docs/architecture/input-context-recovery.md`.
- Recovery requires matching id/revision and explicit continue/replace. Old field evidence uses turnId (or a unique exact-source match); resolve relative dates against that source turn's time. Never promote rejected model fields into trusted drafts.
- Unresolved recovery blocks UI and Tool confirmation. Successful resolution consumes it; cancel/reload clear it; expiration is checked on input after 15 minutes. Keep at most 4 turns / 12000 characters, max 4000 per input. Do not replace current records with captured retry state.
- Recovery parsing can make one bounded validation repair; both attempts share 15 seconds. Record provider attempts separately from logical input turns and local fallback in evaluations.

- Query plans must validate through `lib/query-contract.ts` before Tool/Repository execution. Keep `lib/query-baseline.ts` as the default and evaluation baseline. Use numeric timestamps for filtering, not ISO string comparisons.
- Query Agent receives only `createQueryTools` capabilities; never give it the UI-only `commitConfirmedRecord` tool. Model query parsing receives input/now, not personal records.
- Query Agent v2 must route `execute`, `clarify`, and `unsupported` conditionally. Clarify/unsupported call no query tool and emit no UI_POPUP. Execute uses validated filters through Repository and deterministic aggregation in `lib/query-executor.ts`; no model arithmetic.
- Keep `events`, `ledgerEntries` and `reminders` unchanged on query paths. Messages and the separate `pendingQueryClarification` may change; never use write clarification state for query follow-ups. Average is rounded half-up to cents with sum/count evidence; empty average/max/min is null and empty count/sum is zero.
- `npm run test:query-v2` tests decisions/execution/workflow/scoring; `npm run bench:queries:v2 -- --live` explicitly evaluates model v2. Preserve frozen v1 cases and historical reports. No benchmark-specific production branches.
- RecordRepository snapshots must not leak mutable references. Commits compare expectedBefore to reject stale edits. StateStorage is the localStorage boundary; a failed read must not auto-save fallback data.
- Run `npm run test:query-system` for layer changes; `npm run eval:queries` compares fixed expected plans/results. Live model evaluation is explicit (`--live`), and fallback must be counted separately from model success.
- Keep parsing and state transitions in pure library functions where possible.
- UI components should call domain helpers, not reimplement event matching or time parsing.
- Prefer small focused modules over growing `components/timely-app.tsx`.
- Keep edits scoped to the requested behavior.
- The UI submits through `lib/record-session.ts`; workflow results are proposals. Use `stageRecordResult` for preview and `confirmRecordDraft` for a single-record commit. Never replace current state with an old full-state snapshot on confirmation.
- Local corrections run before new writes. `pendingEdit` selects among existing active records; `pendingConfirmation` holds one validated create/update draft. Both are cleared on reload.
- Recent/search/query navigation derives Shanghai day/month from the record time. Backups use the versioned schemas in `lib/data-export.ts`, preview before merging, and preserve current records on same-ID conflicts.
- Do not rewrite unrelated files or visual systems just because they are nearby.
- Do not revert user changes or unrelated dirty worktree changes.

## State And Data Rules

`TimelyState` shape:

```ts
type TimelyState = {
  events: CalendarEvent[];
  reminders: Reminder[];
  ledgerEntries: LedgerEntry[];
  messages: ConversationMessage[];
  pendingClarification: PendingClarification | null;
};
```

Rules:

- `events`, `ledgerEntries`, `messages`, and `pendingClarification` are the active fields.
- Keep `reminders` for state compatibility, but do not build reminder UI without explicit scope change.
- Normalize old or malformed localStorage data through `normalizeTimelyState`.
- Bad JSON or incomplete state must not crash the app.
- Missing event `status` should normalize to `active`.

Event status:

- Cancelling from natural language or the day timeline sets `status: "cancelled"`.
- Active calendar views only show `active` events.
- Cancelled events can be restored.
- Permanent deletion removes the event from `events` entirely and should only be exposed from the cancelled-records surface.

## Time And Parsing Rules

Default timezone is always `Asia/Shanghai`.

Use `lib/time.ts` helpers instead of ad hoc `Date` formatting:

- `formatShanghaiTime`
- `formatShanghaiDate`
- `toShanghaiDayKey`
- `toShanghaiIso`
- `isValidShanghaiDateParts`

Parsing rules:

- Past and future dates are valid records.
- Missing time should ask `什么时候？`.
- Missing title should ask `记录什么？`.
- Invalid real dates, such as `6月31日`, must not create events.
- `下午六点` should match 18:00 in user-facing deletion language.
- If a delete request matches exactly one active event, cancel it directly.
- If a delete request matches multiple active events, ask for a concise date/time clarification.
- If a pending delete clarification has a target date and the user supplies only a time, combine them.

AI route:

- `/api/record-input` accepts `{ input: string, now?: string, pendingClarification?: PendingClarification }`.
- `/api/record-event` remains an alias for compatibility.
- Use `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), and `DEEPSEEK_MODEL` (default `deepseek-v4-flash`).
- Response shape remains `{ result }`.
- Provider failures, malformed responses, or timeouts let the frontend fall back to local parsing.
- Valid AI clarification and unsupported results must not be reinterpreted as fresh local writes.
- Preserve pending drafts across short answers; missing event titles retain the known start time.
- AI only parses. It must not directly mutate state.
- Provider failures must be visible alongside local fallback and offer retry with the original input and clarification context. Never treat an HTTP 200 alone as successful semantic recognition.
- Natural-language creation and correction require explicit preview confirmation. A possible duplicate must show an explicit “仍然保存” action; do not silently discard it.

Query route:

- Query inputs are handled by the local query agent over `TimelyState`.
- Executed query responses must include a short friendly intro plus a valid ````json UI_POPUP` block; clarify and unsupported return concise text without a popup.
- If no records match, still emit `UI_POPUP` with `query_status: "empty"`.
- The frontend parses `UI_POPUP` and renders a quiet card/window; do not rely on plain text only for query results.

## Interaction Rules

Chat:

- Keep confirmations short: `已记录。6月13日 15:00，会议。`
- Keep delete confirmations short: `已删除。6月13日 15:00，会议。`
- Keep query intros short, then attach the `UI_POPUP` payload.
- Use one focused clarification question at a time.
- Keep general chat lightweight and avoid proactive advice.

Calendar:

- Month view shows only the selected month, not an infinite multi-month scroll.
- Year and month selectors are direct controls.
- Day selection opens a single-day timeline.
- The top-right calendar button toggles cancelled records.
- Cancelled records are hidden by default.
- Leaving the calendar view should not leave a surprising expanded cancelled panel.

Settings:

- Settings can summarize counts and local state.
- Do not add account/cloud concepts until the product scope changes.

## Testing Standard

Use tests proportional to risk.

Run focused tests while developing, then full verification before claiming completion.

Common commands:

```bash
node --test tests/ui-shell.test.ts
npm test
npm run typecheck
node --check public/app.js
npm run lint
git diff --check
npm run build
```

Notes:

- `npm test` runs static structure tests and behavior tests.
- Behavior tests compile selected TypeScript files to `/tmp/timely-cjs`.
- `npm run lint` and `npm run build` may show the existing environment warning for `NODE_TLS_REJECT_UNAUTHORIZED=0`; report it separately from actual failures.

When changing parsing or state behavior:

- Add or update `tests/record-events.test.ts`, `tests/time.test.ts`, or `tests/state.test.ts`.
- Cover the exact user phrase when fixing a natural-language bug.
- Watch the new test fail before implementing the fix.

When changing UI structure:

- Update `tests/ui-shell.test.ts` when new structural guarantees matter.
- Verify text does not overlap and fixed-format controls keep stable dimensions.

## Documentation Standard

- Keep `docs/progress.md` current after meaningful product or architecture changes.
- Keep this `AGENTS.md` current when project standards change.
- Prefer concise, decision-oriented documentation over broad speculative plans.
- Mention whether a feature belongs to the current MVP or a later phase.

## Operational Notes

- The app is mobile-first. Do not create a landing page when asked to build product functionality.
- Do not introduce new dependencies unless they clearly reduce complexity or match an explicit request.
- Do not commit `.env.local` or secrets.
- Treat the working tree as shared with the user; never discard unrelated changes.
- Before finalizing work, report exactly what was changed and which checks were run.
