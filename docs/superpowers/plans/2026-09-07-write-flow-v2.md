# Write Flow v2 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with independent numeric/date work delegated and reviewed. User approved direct execution of the design in this conversation.

**Goal:** One semantic decision per input, complete incremental drafts, explicit write proposals, deterministic validation and confirmation-only commits.

**Architecture:** The active UI calls a v2 input decision adapter. A strict contract separates create, revise_draft, update_record, cancel_record, query, clarify, chat and cancel_draft. A pure reducer applies evidenced field patches to a complete draft; values are normalized locally. Repository resolves target selectors and commits only after user confirmation. Existing v1 entry points remain compatibility surfaces, not a second decision pass in v2.

**Tech Stack:** Existing TypeScript, Zod, Next, LangGraph and Node tests; no new dependencies.

**Spec:** Approved conversational design: complete draft → explicit proposal → unified semantic entry → deterministic money/time validation and visible fallback.

## 2026-09-07 follow-up: context recovery

- [x] Separate unresolved raw user turns from validated drafts; add bounded lifetime, per-turn reference time and optimistic context revision.
- [x] Require explicit continue/replace, validate provenance and block old confirmation while recovery is pending.
- [x] Let application state own create/revise identity; permit one schema/context repair within the same deadline.
- [x] Verify failed input, midnight, replacement, expiry, bounds, stale staging, complete restatement and confirmation Tool behavior.
- [x] Run full tests, typecheck, lint, build and live recovery evaluation. Results and remaining classification mismatch: `docs/evals/input-recovery.md`.

These checkboxes record the completed recovery follow-up; the original checklist below is the implementation plan snapshot, not a fresh verification claim for every historical acceptance item.

## Constraints

- Never enumerate benchmark titles or add conversation-specific production branches.
- Model gets input, reference time and minimal pending context, never the user's record collection; model cannot confirm or commit.
- Patch omission preserves; explicit null clears only optional fields; every changed field carries an exact quote from the current turn.
- Date expressions resolved once against that turn's captured Shanghai reference time; retry retains the original time.
- One operation per input; ambiguous/multiple operations ask, never silently keep the first.
- Record arrays stay unchanged until confirmation. Updates preserve ID and compare expectedBefore.
- Old persisted records and v1 API remain readable. New unfinished write sessions clear on reload, like existing confirmation drafts.
- Model errors, invalid decisions and semantic ambiguity are distinct; failed interpretation cannot mutate records or discard the pending draft.

### 1. Draft contract, values and merge

Create `lib/write-contract.ts`, `lib/write-values.ts`, `lib/write-draft.ts`; test `tests/write-values.test.ts`, `tests/write-draft.test.ts`.

- [ ] Write failing assertions for omitted field preservation, simultaneous amount/date correction, explicit clear, missing required slots, source mismatch, invalid dates/money and kind switching.
- [ ] Implement strict discriminated decisions and typed field patches; normalize `amount` to integer cents and date expressions to absolute Shanghai days. Return draft or actionable issue, never partial invalid application.
- [ ] Run focused compile/Node tests; review source isolation and immutable merge.

### 2. Explicit proposals and confirmation

Create `lib/write-session.ts`; extend `lib/types.ts`, `lib/record-draft.ts`, `lib/state-commit.ts`; test `tests/write-session.test.ts`.

- [ ] Assert no mutation before confirmation, exactly one mutation after confirmation, stale draft rejection and preservation of concurrent manual records.
- [ ] Convert validated complete drafts directly to PendingConfirmation; consume it via existing Repository expectedBefore checks. Resolve existing record targets locally with zero/one/many handling.
- [ ] Keep v1 state-diff staging isolated for existing callers; v2 explicitly stages its own session/proposal.

### 3. Unified model and UI entry

Create `server/ai/deepseek-input-decision.ts` and `app/api/input-decision/route.ts`; update `lib/record-session.ts`, `hooks/use-record-submit.ts`, `components/timely/chat-view.tsx`.

- [ ] Test provider payload contains only approved context, rejects malformed decisions, and never includes records or few-shot dialogues.
- [ ] Call one semantic planner. Write decisions go straight to reducer; query decisions execute validated QueryDecision through the existing read-only workflow without another model call.
- [ ] Permit natural-language correction while a draft awaits confirmation; disable confirm while parsing; keep explicit confirm/cancel buttons authoritative.
- [ ] On provider failure retain draft and original retry input/time, show failure visibly; conservative offline continuation only when one known slot has an unambiguous scalar value.

### 4. Regression, documentation and review

- [ ] Run the existing full test suite, focused v2 tests, typecheck, lint, diff check and production build.
- [ ] Evaluate multi-turn invariants: equivalent wording, independent patch order, correction precedence, repeated confirmation, input failure isolation, ambiguous record targets, multiple amounts and multiple operations.
- [ ] Review code independently; fix findings and rerun affected checks. Live model tests explicitly use synthetic inputs, record fallback separately and do not tune prompts to frozen cases.
- [ ] Update `AGENTS.md`, `docs/progress.md`, architecture and new contract/evaluation documentation with exact results and limitations.
