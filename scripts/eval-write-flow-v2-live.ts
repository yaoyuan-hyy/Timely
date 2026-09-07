import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { TimelyState } from "../lib/types";
import { runInputSession } from "../lib/write-session";
import { confirmRecordDraft } from "../lib/record-draft";
import { parseDeepSeekInputDecision } from "../server/ai/deepseek-input-decision";
import { getShanghaiParts } from "../lib/time";

const turnSchema = z.object({
  input: z.string().min(1).optional(), confirm: z.boolean().optional(),
  expect: z.object({ records: z.number().int().nonnegative(), pending: z.boolean(), draft: z.boolean(), failure: z.string().optional(), draftFields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional() }).strict()
}).strict().refine(value => Boolean(value.input) !== Boolean(value.confirm), "turn must be input or confirm");
const caseSchema = z.object({ id: z.string().min(1), now: z.string(), turns: z.array(turnSchema).min(1), final: z.object({ kind: z.enum(["event", "ledger"]), title: z.string().optional(), amountCents: z.number().int().positive().optional(), direction: z.enum(["income", "expense"]).optional(), date: z.string().optional(), time: z.string().optional(), location: z.string().nullable().optional(), notes: z.string().nullable().optional(), category: z.string().optional() }).strict() }).strict();
type EvalCase = z.infer<typeof caseSchema>;
type Check = { name: string; expected: unknown; actual: unknown; passed: boolean };
type Row = { id: string; passed: boolean; systemPassed: boolean; checks: Check[]; sources: string[]; failures: string[]; providerErrors: string[]; decisions: unknown[]; latencyMs: number };

function emptyState(): TimelyState { return { events: [], reminders: [], ledgerEntries: [], messages: [], pendingClarification: null }; }
function recordCount(state: TimelyState) { return state.events.length + state.ledgerEntries.length; }
function addCheck(checks: Check[], name: string, expected: unknown, actual: unknown) { checks.push({ name, expected, actual, passed: JSON.stringify(expected) === JSON.stringify(actual) }); }
function draftField(state: TimelyState, name: string): unknown {
  const fields = state.writeSession?.draft?.fields;
  if (!fields) return null;
  const value = fields[name as keyof typeof fields];
  if (name === "time" && value && typeof value === "object" && "hour" in value) return `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
  return value ?? null;
}
function finalChecks(state: TimelyState, expected: EvalCase["final"]): Check[] {
  const checks: Check[] = [];
  const record = expected.kind === "event" ? state.events.at(-1) : state.ledgerEntries.at(-1);
  addCheck(checks, "final.kind", expected.kind, record ? ("startsAt" in record ? "event" : "ledger") : null);
  if (!record) return checks;
  if (expected.title !== undefined) addCheck(checks, "final.title", expected.title, "title" in record ? record.title : null);
  if (expected.amountCents !== undefined) addCheck(checks, "final.amountCents", expected.amountCents, "amountCents" in record ? record.amountCents : null);
  if (expected.direction !== undefined) addCheck(checks, "final.direction", expected.direction, "direction" in record ? record.direction : null);
  if (expected.category !== undefined) addCheck(checks, "final.category", expected.category, "category" in record ? record.category : null);
  if (expected.location !== undefined) addCheck(checks, "final.location", expected.location, "location" in record ? record.location : null);
  if (expected.notes !== undefined) addCheck(checks, "final.notes", expected.notes, "notes" in record ? record.notes : null);
  if (expected.date !== undefined || expected.time !== undefined) {
    const iso = "startsAt" in record ? record.startsAt : record.occurredAt;
    const parts = getShanghaiParts(new Date(iso));
    if (expected.date !== undefined) addCheck(checks, "final.date", expected.date, `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`);
    if (expected.time !== undefined) addCheck(checks, "final.time", expected.time, `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`);
  }
  return checks;
}

async function main() {
  const args = process.argv.slice(2); const datasetPath = args[0] && !args[0].startsWith("--") ? args[0] : "evals/write-flow-v2-live.json";
  loadEnvConfig(process.cwd());
  const dataset = z.array(caseSchema).parse(JSON.parse(readFileSync(resolve(datasetPath), "utf8")));
  const rows: Row[] = [];
  for (const example of dataset) {
    let state = emptyState(); const checks: Check[] = []; const sources: string[] = []; const failures: string[] = []; const providerErrors: string[] = []; const decisions: unknown[] = []; const started = performance.now();
    for (const turn of example.turns) {
      if (turn.confirm) {
        state = confirmRecordDraft(state);
        addCheck(checks, `${example.id}.confirm.records`, turn.expect.records, recordCount(state));
        addCheck(checks, `${example.id}.confirm.pending`, turn.expect.pending, Boolean(state.pendingConfirmation));
        addCheck(checks, `${example.id}.confirm.draft`, turn.expect.draft, Boolean(state.writeSession?.draft));
      } else {
        const before = JSON.stringify([state.events, state.ledgerEntries, state.reminders]);
        const result = await runInputSession(state, turn.input!, { now: new Date(example.now), parse: async (input, context) => { try { const decision = await parseDeepSeekInputDecision(input, context); decisions.push({ input, decision }); return decision; } catch (error) { providerErrors.push(error instanceof Error ? error.message.slice(0, 160) : "provider_error"); throw error; } } });
        state = result.state; sources.push(result.source); if (result.failure) failures.push(result.failure);
        addCheck(checks, `${example.id}.${turn.input}.records`, turn.expect.records, recordCount(state));
        addCheck(checks, `${example.id}.${turn.input}.pending`, turn.expect.pending, Boolean(state.pendingConfirmation));
        addCheck(checks, `${example.id}.${turn.input}.draft`, turn.expect.draft, Boolean(state.writeSession?.draft));
        if (turn.expect.failure) addCheck(checks, `${example.id}.${turn.input}.failure`, turn.expect.failure, result.failure);
        for (const [name, expected] of Object.entries(turn.expect.draftFields ?? {})) addCheck(checks, `${example.id}.${turn.input}.draft.${name}`, expected, draftField(state, name));
        addCheck(checks, `${example.id}.${turn.input}.no-commit`, before, JSON.stringify([state.events, state.ledgerEntries, state.reminders]));
      }
    }
    checks.push(...finalChecks(state, example.final));
    const systemPassed = checks.every(item => item.passed);
    const passed = systemPassed && sources.every(source => source !== "local") && providerErrors.length === 0;
    rows.push({ id: example.id, passed, systemPassed, checks, sources, failures, providerErrors, decisions, latencyMs: Math.round(performance.now() - started) });
    console.log(`${passed ? "PASS" : "FAIL"} ${example.id} source=${sources.join(",") || "confirm"}`);
  }
  const fallbackTurns = rows.reduce((sum, row) => sum + row.sources.filter(source => source === "local").length, 0);
  const failedTurns = rows.reduce((sum, row) => sum + row.sources.filter(source => source === "failed").length, 0);
  const modelTurns = rows.reduce((sum, row) => sum + row.sources.filter(source => source === "model").length, 0);
  const summary = { cases: rows.length, passed: rows.filter(row => row.passed).length, strictCasePassRate: rows.filter(row => row.passed).length / rows.length, systemPassed: rows.filter(row => row.systemPassed).length, modelTurns, fallbackTurns, failedTurns, providerErrorTurns: rows.reduce((sum, row) => sum + row.providerErrors.length, 0), latencyMs: rows.map(row => row.latencyMs) };
  const outIndex = args.indexOf("--out"); const output = resolve(outIndex >= 0 ? args[outIndex + 1] : `.timely-test/write-evals/live-${Date.now()}.json`); mkdirSync(dirname(output), { recursive: true });
  const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const sourceFiles = ["lib/write-contract.ts", "lib/write-draft.ts", "lib/write-session.ts", "lib/write-values.ts", "server/ai/deepseek-input-decision.ts", "scripts/eval-write-flow-v2-live.ts"];
  const report = { metadata: { version: 2, generatedAt: new Date().toISOString(), model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash", datasetPath, datasetSha256: hash(datasetPath), sourceHashes: Object.fromEntries(sourceFiles.map(path => [path, hash(path)])), gitDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()), gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() }, summary, rows };
  writeFileSync(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ summary, report: output }, null, 2));
  if (rows.some(row => !row.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Write eval failed"); process.exitCode = 1; });
