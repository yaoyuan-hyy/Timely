import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { benchmarkSchema, gradeQuery, wilsonInterval } from "../lib/query-benchmark";
import type { BenchmarkCase, Observation } from "../lib/query-benchmark";
import { benchmarkFixture } from "../evals/query-benchmark-fixture";
import { runQueryAgentWorkflow } from "../lib/agent/query-workflow";
import { parseDeepSeekQueryPlan } from "../server/ai/deepseek-query-planner";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const args = process.argv.slice(2);
function option(name: string, fallback: string) { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }

async function main() {
  const live = args.includes("--live"), split = option("--split", "test"), repeats = Number(option("--runs", "1"));
  if (!["all", "test", "dev"].includes(split) || !Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error("Use --split all|dev|test and --runs 1..10");
  const datasetText = readFileSync("evals/query-benchmark-v1.json", "utf8");
  const dataset = benchmarkSchema.parse(JSON.parse(datasetText));
  if (new Set(dataset.cases.map(c => c.id)).size !== dataset.cases.length) throw new Error("Duplicate benchmark IDs");
  const examples = dataset.cases.filter(c => split === "all" || c.split === split);
  const fixtureHash = hash(JSON.stringify(benchmarkFixture()));
  const sourceFiles = ["lib/agent/query-workflow.ts", "lib/query-contract.ts", "lib/query-baseline.ts", "lib/query-planning.ts", "lib/query-result.ts", "lib/repository/record-repository.ts", "lib/tools/record-tools.ts", "lib/time.ts", "server/ai/deepseek-query-planner.ts"];
  const scorerHash = hash(readFileSync("lib/query-benchmark.ts", "utf8") + readFileSync("scripts/benchmark-queries.ts", "utf8"));
  if (live) loadEnvConfig(process.cwd());
  const rows: Array<{ id: string; run: number; tags: BenchmarkCase["tags"]; expected: BenchmarkCase["expected"]; actual: Observation } & ReturnType<typeof gradeQuery>> = [];
  for (const example of examples) for (let run = 1; run <= repeats; run++) {
    const state = benchmarkFixture();
    const before = JSON.stringify([state.events, state.ledgerEntries]);
    const started = performance.now();
    let actual: Observation;
    try {
      const result = await runQueryAgentWorkflow(state, example.input, { now: new Date(example.now), parseQueryPlan: live ? parseDeepSeekQueryPlan : undefined });
      const payload = result.queryResult;
      actual = {
        decision: String(result.outcome) === "query_clarification" ? "clarify" : "answer", plan: result.plan,
        eventIds: payload.events.map(e => e.id), ledgerIds: payload.ledger.entries.map(e => e.id),
        aggregates: { expenseCents: payload.ledger.totalExpenseCents, incomeCents: payload.ledger.totalIncomeCents, netCents: payload.ledger.netCents, count: payload.events.length + payload.ledger.entries.length },
        status: payload.query_status, tools: result.toolCalls, source: result.source,
        unchanged: before === JSON.stringify([state.events, state.ledgerEntries]) && before === JSON.stringify([result.state.events, result.state.ledgerEntries]),
        latencyMs: Math.round(performance.now() - started)
      };
    } catch {
      actual = { decision: "error", plan: null, eventIds: [], ledgerIds: [], aggregates: {}, status: null, tools: [], source: "error", unchanged: before === JSON.stringify([state.events, state.ledgerEntries]), latencyMs: Math.round(performance.now() - started) };
    }
    const score = gradeQuery(example, actual);
    rows.push({ id: example.id, run, tags: example.tags, expected: example.expected, actual, ...score });
    console.log(`${example.id} run=${run} ${score.passed ? "PASS" : "FAIL"} source=${actual.source}`);
  }
  // Official pass@1 denominator is unique scenarios. Repetitions measure stability, not sample size.
  const first = rows.filter(r => r.run === 1), passed = first.filter(r => r.passed).length;
  const byTag: Record<string, { passed: number; total: number }> = {};
  const checks: Record<string, { passed: number; total: number }> = {};
  for (const row of first) {
    for (const tag of row.tags) { byTag[tag] ??= { passed: 0, total: 0 }; byTag[tag].total++; if (row.passed) byTag[tag].passed++; }
    for (const [key, value] of Object.entries(row.checks)) if (value !== null) { checks[key] ??= { passed: 0, total: 0 }; checks[key].total++; if (value) checks[key].passed++; }
  }
  const times = rows.map(r => r.actual.latencyMs).sort((a, b) => a - b);
  const summary = {
    cases: first.length, attempts: rows.length, passed, accuracy: passed / first.length,
    effectivePassed: first.filter(r => r.effectivePassed).length,
    stablePassed: first.filter(r => rows.filter(x => x.id === r.id).every(x => x.passed)).length,
    wilson95: wilsonInterval(passed, first.length),
    fallbacks: rows.filter(r => r.actual.source === "rules_fallback").length, errors: rows.filter(r => r.actual.source === "error").length,
    p50Ms: times[Math.ceil(times.length * 0.5) - 1], p95Ms: times[Math.ceil(times.length * 0.95) - 1], byTag, checks
  };
  const metadata = { version: 1, generatedAt: new Date().toISOString(), mode: live ? "model" : "rules", model: live ? process.env.DEEPSEEK_MODEL || "deepseek-v4-flash" : null, temperature: live ? 0 : null, split, repeats, datasetHash: hash(datasetText), fixtureHash, scorerHash, sourceHash: hash(sourceFiles.map(file => readFileSync(file, "utf8")).join("\n")), gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) };
  const report = { metadata, summary, rows };
  if (args.includes("--compare")) {
    const previous = JSON.parse(readFileSync(option("--compare", ""), "utf8")) as typeof report;
    for (const key of ["datasetHash", "fixtureHash", "scorerHash", "split", "repeats"] as const) if (previous.metadata[key] !== metadata[key]) throw new Error(`Reports are not comparable: ${key}`);
    const previousRows = previous.rows.filter(r => r.run === 1);
    if (JSON.stringify(previousRows.map(r => r.id).sort()) !== JSON.stringify(first.map(r => r.id).sort())) throw new Error("Reports contain different cases");
    const wins = first.filter(row => row.passed && !previousRows.find(old => old.id === row.id)!.passed).map(r => r.id);
    const regressions = first.filter(row => !row.passed && previousRows.find(old => old.id === row.id)!.passed).map(r => r.id);
    console.log(JSON.stringify({ comparison: { wins, regressions, delta: (wins.length - regressions.length) / first.length } }, null, 2));
    if (regressions.length) process.exitCode = 1;
  }
  const output = resolve(option("--out", `.timely-test/benchmarks/${metadata.mode}-${split}-${Date.now()}.json`));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ metadata, summary, report: output }, null, 2));
  if (args.includes("--gate") && passed !== first.length) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Benchmark failed"); process.exitCode = 1; });
