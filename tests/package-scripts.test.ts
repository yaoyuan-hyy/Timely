import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const gitignore = readFileSync(".gitignore", "utf8");

assert.equal(packageJson.scripts?.test, "npm run test:static && npm run test:behavior && npm run test:agent");
assert.match(packageJson.scripts?.["test:static"] ?? "", /tests\/ui-shell\.test\.ts/);
assert.match(packageJson.scripts?.["test:behavior"] ?? "", /tests\/record-events\.test\.ts/);
assert.match(packageJson.scripts?.["test:behavior"] ?? "", /tests\/record-input\.test\.ts/);
assert.match(packageJson.scripts?.["test:behavior"] ?? "", /tests\/ledger-recording\.test\.ts/);
assert.match(packageJson.scripts?.["test:behavior"] ?? "", /tests\/ledger-stats\.test\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /tests\/record-workflow\.test\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /tests\/query-workflow\.test\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /tests\/app-workflow\.test\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /tests\/ui-popup\.test\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /tests\/eval-record-workflow\.test\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /lib\/agent\/record-workflow\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /lib\/agent\/query-workflow\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /lib\/agent\/app-workflow\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /lib\/ui-popup\.ts/);
assert.match(packageJson.scripts?.["test:agent"] ?? "", /\.timely-test\/agent-cjs/);
assert.equal(packageJson.scripts?.["eval:records"], "node scripts/eval-record-workflow.mjs evals/record-input-cases.jsonl");
assert.equal(packageJson.scripts?.typecheck, "tsc --noEmit");
assert.match(gitignore, /^tsconfig\.tsbuildinfo$/m);
assert.match(gitignore, /^\.timely-test$/m);
