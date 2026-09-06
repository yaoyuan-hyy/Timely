import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { queryFixture, queryNow } from "../evals/query-fixture";
import { evaluateQueries, queryCasesSchema } from "../lib/query-evaluation";
import { parseDeepSeekQueryPlan } from "../server/ai/deepseek-query-planner";

async function main() {
  const cases = queryCasesSchema.parse(JSON.parse(readFileSync("evals/query-cases.json", "utf8")));
  const baseline = await evaluateQueries(cases, queryFixture(), queryNow);
  console.log(JSON.stringify({ mode: "rules", ...baseline }, null, 2));
  if (baseline.planCorrect !== baseline.total || baseline.resultCorrect !== baseline.total) process.exitCode = 1;
  if (process.argv.includes("--live")) {
    loadEnvConfig(process.cwd());
    const model = await evaluateQueries(cases, queryFixture(), queryNow, parseDeepSeekQueryPlan);
    console.log(JSON.stringify({ mode: "model", ...model }, null, 2));
    if (model.planCorrect !== model.total || model.resultCorrect !== model.total) process.exitCode = 1;
  }
}
main().catch(() => { console.error("Query eval failed. Check fixture format and environment configuration."); process.exitCode = 1; });
