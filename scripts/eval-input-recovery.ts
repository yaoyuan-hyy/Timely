import { loadEnvConfig } from "@next/env";
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInputSession, inputSessionContext } from "../lib/write-session";
import { confirmRecordDraft } from "../lib/record-draft";
import { parseDeepSeekInputDecision } from "../server/ai/deepseek-input-decision";
import type { TimelyState } from "../lib/types";

// Fault injection makes recovery testable on every run. Only the follow-up uses the live model.
const cases = [
  { id: "provider-loss", input: "昨天午饭", followup: "花35元", now: "2026-09-07T10:00:00+08:00", nextNow: "2026-09-07T10:01:00+08:00", reason: "provider", amount: 3500, date: "2026-09-06" },
  { id: "schema-loss", input: "前天打车", followup: "车费是42元", now: "2026-09-07T10:00:00+08:00", nextNow: "2026-09-07T10:01:00+08:00", reason: "invalid_decision", amount: 4200, date: "2026-09-05" },
  { id: "midnight", input: "昨天午饭", followup: "花35元", now: "2026-09-07T23:59:00+08:00", nextNow: "2026-09-08T00:01:00+08:00", reason: "provider", amount: 3500, date: "2026-09-06" },
  { id: "new-topic", input: "昨天午饭", followup: "换个话题，今天买咖啡花28元", now: "2026-09-07T10:00:00+08:00", nextNow: "2026-09-07T10:01:00+08:00", reason: "provider", amount: 2800, date: "2026-09-07" },
  { id: "clarify-intent", input: "昨天午饭", followup: "我要记账，花了35元", now: "2026-09-07T10:00:00+08:00", nextNow: "2026-09-07T10:01:00+08:00", reason: "clarify", amount: 3500, date: "2026-09-06" },
  { id: "failed-correction", input: "改成昨天", followup: "金额也改成45元", now: "2026-09-07T10:00:00+08:00", nextNow: "2026-09-07T10:01:00+08:00", reason: "provider", amount: 4500, date: "2026-09-06", draft: true }
];

async function main() {
  loadEnvConfig(process.cwd());
  const rows = [];
  for (const example of cases) {
    let initial: TimelyState = { events: [], ledgerEntries: [], reminders: [], messages: [], pendingClarification: null };
    if (example.draft) initial = (await runInputSession(initial, "午饭花35", { now: new Date(example.now), parse: async () => ({ action: "write", operation: "create", kind: "ledger", patch: { amount: { value: "35", evidence: "35" }, direction: { value: "expense", evidence: "花" } } }) })).state;
    const first = await runInputSession(initial, example.input, { now: new Date(example.now), parse: async () => {
      if (example.reason === "clarify") return { action: "clarify", reason: "ambiguous_intent", question: "是要记账还是查询？" };
      throw Error(example.reason === "invalid_decision" ? "invalid_decision" : "provider_unavailable");
    } });
    const before = JSON.stringify([first.state.events, first.state.ledgerEntries, first.state.reminders]);
    let decision: unknown = null;
    let error: string | null = null;
    let providerCalls = 0;
    const start = performance.now();
    const next = await runInputSession(first.state, example.followup, { now: new Date(example.nextNow), parse: async (input, context) => {
      try { decision = await parseDeepSeekInputDecision(input, { ...context, onAttempt: () => { providerCalls++; } }); return decision; }
      catch (cause) { error = cause instanceof Error ? cause.name : "provider_error"; throw cause; }
    } });
    const unchanged = before === JSON.stringify([next.state.events, next.state.ledgerEntries, next.state.reminders]);
    const saved = confirmRecordDraft(next.state);
    const entry = saved.ledgerEntries[0];
    const checks = {
      noEarlyWrite: unchanged, proposal: Boolean(next.state.pendingConfirmation),
      resolved: !next.state.writeSession?.recovery, liveModel: next.source === "model" && !error,
      count: saved.ledgerEntries.length === 1, amount: entry?.amountCents === example.amount,
      date: entry?.occurredAt.startsWith(example.date) ?? false,
      confirmOnce: confirmRecordDraft(saved).ledgerEntries.length === 1
    };
    const passed = Object.values(checks).every(Boolean);
    rows.push({ id: example.id, injectedReason: example.reason, input: example.input, followup: example.followup, context: inputSessionContext(first.state, new Date(example.nextNow)), passed, checks, source: next.source, error, decision, actual: entry ?? null, providerCalls, latencyMs: Math.round(performance.now() - start) });
    console.log(`${passed ? "PASS" : "FAIL"} ${example.id}`);
  }
  const files = ["lib/input-recovery.ts", "lib/write-session.ts", "lib/write-contract.ts", "lib/write-draft.ts", "server/ai/deepseek-input-decision.ts", "scripts/eval-input-recovery.ts"];
  const report = { generatedAt: new Date().toISOString(), model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash", method: "Injected initial failure or clarification, one live planner invocation per follow-up, at most one validation repair; conditional recovery test, not general accuracy", sourceHashes: Object.fromEntries(files.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")])), summary: { cases: rows.length, passed: rows.filter(row => row.passed).length, fallback: rows.filter(row => row.source === "local").length, providerCalls: rows.reduce((sum, row) => sum + row.providerCalls, 0) }, rows };
  writeFileSync("docs/evals/input-recovery-live-results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  if (report.summary.passed !== report.summary.cases) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.name : "eval_error"); process.exitCode = 1; });
