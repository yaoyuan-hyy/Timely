# AGENTS.md

This file is the operating standard for agents working on Timely. Follow it before making product, design, architecture, or implementation changes.

## Product Standard

Timely is a mobile-first natural-language personal record app. Its current app is event-first, with independent local ledger records and a LangGraph query surface:

```text
Natural-language input
  -> LangGraph supervisor agent
  -> write agent or query agent
  -> optional AI parse for writes, with local fallback
  -> local query over TimelyState for personal-data questions
  -> write TimelyState or emit UI_POPUP query payload
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

Timely should feel calm, premium, soft, and quiet. Prefer a high-end mobile utility aesthetic over a generic SaaS dashboard.

Current visual direction:

- Vibe: soft structuralism with warm editorial calm.
- Backgrounds: milk white, oat, warm cream, muted sage, softened blue-green. Avoid pure black and pure white as dominant surfaces.
- Text: deep warm gray, not hard black.
- Contrast: gentle and readable, never harsh.
- Whitespace: generous. Calendar and timeline views must breathe.
- Surfaces: soft physical layers with subtle nested shells, inner highlights, and diffused shadows.
- Radius: rounded, squircle-like forms for panels, bubbles, controls, and date cells.
- Motion: spring-like and physically weighted. Prefer `cubic-bezier(0.32, 0.72, 0, 1)` or an established local motion token.

Avoid:

- Harsh black text on pure white panels.
- Generic gray borders or heavy dark shadows.
- Busy gradients, decorative orbs, bokeh blobs, or loud one-note palettes.
- Marketing-style hero sections inside the product shell.
- Dense controls that crowd the calendar or timeline.
- Default `linear` or `ease-in-out` transitions for important state changes.

Component expectations:

- Chat bubbles use rounded forms and soft shadows.
- The composer uses a double-layer soft shell.
- The microphone placeholder should look like a soft, pressable center even while disabled.
- Calendar date highlights should be rounded and full, not sharp or tiny.
- Timeline nodes should feel tactile and calm, with clear spacing between hours.
- The cancelled-records panel should open with spring-like motion and remain visually quiet.
- Restore and permanent-delete actions should be clear but understated.

Icons:

- The project currently uses `lucide-react`; keep stroke weights light where possible.
- Prefer existing icon patterns over adding a second icon library.

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
- `lib/ai/minimax-event-parser.ts`: MiniMax parsing adapter.
- `lib/time.ts`: Shanghai-time utilities.
- `lib/state.ts`: localStorage state normalizer/migration helper.
- `lib/stats.ts`: event filtering and sorting helpers.
- `lib/agent/app-workflow.ts`: LangGraph supervisor routing to query/write/chat agents.
- `lib/agent/record-workflow.ts`: LangGraph write workflow.
- `lib/agent/query-workflow.ts`: LangGraph local query workflow.
- `lib/ui-popup.ts`: UI_POPUP build/parse helpers.
- `lib/types.ts`: shared data model.

Architecture rules:

- Keep parsing and state transitions in pure library functions where possible.
- UI components should call domain helpers, not reimplement event matching or time parsing.
- Prefer small focused modules over growing `components/timely-app.tsx`.
- Keep edits scoped to the requested behavior.
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

- `/api/record-event` accepts `{ input: string, now?: string }`.
- Response shape remains `{ result }`.
- MiniMax failures or timeouts should let the frontend fall back to local parsing.
- AI only parses. It must not directly mutate state.

Query route:

- Query inputs are handled by the local query agent over `TimelyState`.
- Query responses must include a short friendly intro plus a valid ````json UI_POPUP` block.
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

- Keep `progress.md` current after meaningful product or architecture changes.
- Keep this `AGENTS.md` current when project standards change.
- Prefer concise, decision-oriented documentation over broad speculative plans.
- Mention whether a feature belongs to the current MVP or a later phase.

## Operational Notes

- The app is mobile-first. Do not create a landing page when asked to build product functionality.
- Do not introduce new dependencies unless they clearly reduce complexity or match an explicit request.
- Do not commit `.env.local` or secrets.
- Treat the working tree as shared with the user; never discard unrelated changes.
- Before finalizing work, report exactly what was changed and which checks were run.
