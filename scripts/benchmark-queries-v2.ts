import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { benchmarkFixture } from "../evals/query-benchmark-fixture";
import { benchmarkV2Schema, gradeQueryV2, wilsonIntervalV2, executionEvidence, executionMatches } from "../lib/query-benchmark-v2";
import type { BenchmarkCaseV2, ObservationV2, ExecutionEvidence } from "../lib/query-benchmark-v2";
import { runQueryAgentWorkflow } from "../lib/agent/query-workflow";
import { createRecordRepository } from "../lib/repository/record-repository";
import { createQueryTools } from "../lib/tools/record-tools";
import { aggregateQueryRecords } from "../lib/query-executor";
import { parseDeepSeekQueryDecision } from "../server/ai/deepseek-query-planner";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const args = process.argv.slice(2);
function option(name: string, fallback: string) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
type Oracle = { correct: boolean; evidence: ExecutionEvidence | null; error: string | null };
type Row = { id: string; run: number; tags: string[]; expected: BenchmarkCaseV2["expected"]; actual: ObservationV2; executionOracle: Oracle | null } & ReturnType<typeof gradeQueryV2>;
const records = (state: ReturnType<typeof benchmarkFixture>) => JSON.stringify([state.events, state.ledgerEntries, state.reminders]);
function oracle(example: BenchmarkCaseV2): Oracle | null {
  if (!example.expected.plan) return null;
  const state = benchmarkFixture(), before = records(state);
  try {
    const found = createQueryTools(createRecordRepository(state)).queryRecords(example.expected.plan);
    if (!found.ok) throw new Error(found.message);
    const evidence = executionEvidence(aggregateQueryRecords(example.expected.plan, found.value));
    return { correct: executionMatches(evidence, example.expected.execution) && before === records(state), evidence, error: null };
  } catch (error) {
    return { correct: false, evidence: null, error: error instanceof Error ? error.message.slice(0, 120) : "executor_failed" };
  }
}

async function main() {
  const live = args.includes("--live"), split = option("--split", "test"), repeats = Number(option("--runs", "1"));
  if (!["all", "dev", "test"].includes(split) || !Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error("Use --split all|dev|test and --runs 1..10");
  const datasetText = readFileSync("evals/query-benchmark-v2.json", "utf8"), dataset = benchmarkV2Schema.parse(JSON.parse(datasetText));
  if (new Set(dataset.cases.map(c => c.id)).size !== dataset.cases.length) throw new Error("Duplicate benchmark IDs");
  const examples = dataset.cases.filter(c => split === "all" || c.split === split);
  if (!examples.length) throw new Error("Empty benchmark split");
  const fixtureHash = hash(JSON.stringify(benchmarkFixture()));
  const sourceFiles = ["lib/agent/query-workflow.ts", "lib/query-contract.ts", "lib/query-executor.ts", "lib/query-result.ts", "lib/query-planning.ts", "lib/query-baseline.ts", "lib/repository/record-repository.ts", "lib/tools/record-tools.ts", "lib/time.ts", "lib/record-validation.ts", "server/ai/deepseek-query-planner.ts"];
  const scorerHash = hash(readFileSync("lib/query-benchmark-v2.ts", "utf8") + readFileSync("scripts/benchmark-queries-v2.ts", "utf8"));
  if (live) loadEnvConfig(process.cwd());
  const metadata = { version: 2, generatedAt: new Date().toISOString(), mode: live ? "model" : "rules", model: live ? process.env.DEEPSEEK_MODEL || "deepseek-v4-flash" : null, temperature: live ? 0 : null, split, repeats, datasetHash: hash(datasetText), fixtureHash, scorerHash, sourceHash: hash(sourceFiles.map(f => readFileSync(f, "utf8")).join("\n")), gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) };
  const previous = args.includes("--compare") ? JSON.parse(readFileSync(option("--compare", ""), "utf8")) as { metadata: typeof metadata; rows: Row[] } : null;
  if (previous) {
    for (const key of ["version", "datasetHash", "fixtureHash", "scorerHash", "split", "repeats"] as const) if (previous.metadata[key] !== metadata[key]) throw new Error(`Reports are not comparable: ${key}`);
    const ids = previous.rows.filter(r => r.run === 1).map(r => r.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(examples.map(e => e.id).sort())) throw new Error("Reports contain different case IDs");
  }
  const rows: Row[] = [];
  for (const example of examples) {
    // Independent oracle always runs, even when the model fails. It has its own fresh fixture.
    const executionOracle = oracle(example);
    for (let run = 1; run <= repeats; run++) {
      const state = benchmarkFixture(), before = records(state), started = performance.now();
      let actual: ObservationV2;
      try {
        const result = await runQueryAgentWorkflow(state, example.input, { now: new Date(example.now), parseQueryDecision: live ? parseDeepSeekQueryDecision : undefined });
        actual = { decision: result.decision.decision, plan: result.plan, execution: result.execution ? executionEvidence(result.execution) : null, tools: result.toolCalls, source: result.source, fallbackReason: result.fallbackReason, unchanged: before === records(state) && before === records(result.state), latencyMs: Math.round(performance.now() - started), noExecution: !result.trace.includes("query_records") && !result.trace.includes("aggregate_records") && result.toolCalls.length === 0 };
      } catch (error) {
        actual = { decision: "error", plan: null, execution: null, tools: [], source: "error", fallbackReason: error instanceof Error ? error.message.slice(0, 120) : "runner_error", unchanged: before === records(state), latencyMs: Math.round(performance.now() - started), noExecution: false };
      }
      const score = gradeQueryV2(example, actual);
      rows.push({ id: example.id, run, tags: example.tags, expected: example.expected, actual, executionOracle, ...score });
      console.log(`${example.id} run=${run} ${score.passed ? "PASS" : "FAIL"} source=${actual.source}`);
    }
  }
  const first = rows.filter(r => r.run === 1), byTag: Record<string, { passed: number; total: number }> = {}, checks: Record<string, { passed: number; total: number }> = {};
  for (const row of first) {
    for (const tag of row.tags) { byTag[tag] ??= { passed: 0, total: 0 }; byTag[tag].total++; if (row.passed) byTag[tag].passed++; }
    for (const [key, value] of Object.entries(row.checks)) { if (value === null) continue; checks[key] ??= { passed: 0, total: 0 }; checks[key].total++; if (value) checks[key].passed++; }
  }
  const rate = (passed: number, total: number) => ({ passed, total, accuracy: total ? passed / total : null });
  const executeCases = first.filter(r => r.expected.decision === "execute");
  const latencies = rows.map(r => r.actual.latencyMs).sort((a, b) => a - b), percentile = (p: number) => latencies[Math.ceil(latencies.length * p) - 1];
  const passed = first.filter(r => r.passed).length;
  const summary = {
    cases: first.length, attempts: rows.length, passed, effectivePassed: first.filter(r => r.effectivePassed).length, accuracy: passed / first.length,
    decisionAccuracy: rate(checks.decision?.passed ?? 0, first.length),
    planAccuracy: rate(executeCases.filter(r => r.checks.plan).length, executeCases.length),
    executionAccuracy: rate(executeCases.filter(r => r.executionOracle?.correct).length, executeCases.length),
    pipelineExecutionAccuracy: rate(executeCases.filter(r => r.checks.execution).length, executeCases.length),
    stablePassed: first.filter(r => rows.filter(x => x.id === r.id).every(x => x.passed)).length,
    wilson95: wilsonIntervalV2(passed, first.length),
    fallbacks: rows.filter(r => r.actual.source === "rules_fallback").length, errors: rows.filter(r => r.actual.source === "error").length,
    p50Ms: percentile(.5), p95Ms: percentile(.95), byTag, checks
  };
  let comparison: { wins: string[]; regressions: string[]; delta: number } | null = null;
  if (previous) {
    const old = new Map(previous.rows.filter(r => r.run === 1).map(r => [r.id, r]));
    const wins = first.filter(r => r.passed && !old.get(r.id)!.passed).map(r => r.id);
    const regressions = first.filter(r => !r.passed && old.get(r.id)!.passed).map(r => r.id);
    comparison = { wins, regressions, delta: (wins.length - regressions.length) / first.length };
    if (regressions.length) process.exitCode = 1;
  }
  const output = resolve(option("--out", `.timely-test/benchmarks/v2-${metadata.mode}-${split}-${Date.now()}.json`));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ metadata, summary, comparison, rows }, null, 2));
  console.log(JSON.stringify({ metadata, summary, comparison, report: output }, null, 2));
  if (args.includes("--gate") && passed !== first.length) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Benchmark failed"); process.exitCode = 1; });
