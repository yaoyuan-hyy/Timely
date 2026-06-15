import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const gitignore = readFileSync(".gitignore", "utf8");

assert.equal(packageJson.scripts?.test, "npm run test:static && npm run test:behavior");
assert.match(packageJson.scripts?.["test:static"] ?? "", /tests\/ui-shell\.test\.ts/);
assert.match(packageJson.scripts?.["test:behavior"] ?? "", /tests\/record-events\.test\.ts/);
assert.match(packageJson.scripts?.["test:behavior"] ?? "", /tests\/record-input\.test\.ts/);
assert.match(packageJson.scripts?.["test:behavior"] ?? "", /tests\/ledger-recording\.test\.ts/);
assert.match(packageJson.scripts?.["test:behavior"] ?? "", /tests\/ledger-stats\.test\.ts/);
assert.equal(packageJson.scripts?.typecheck, "tsc --noEmit");
assert.match(gitignore, /^tsconfig\.tsbuildinfo$/m);
