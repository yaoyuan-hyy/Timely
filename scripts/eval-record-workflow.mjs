import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".timely-test", "eval-cjs");
const tscBin = resolve(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");

const compile = spawnSync(
  tscBin,
  [
    "scripts/eval-record-workflow.ts",
    "lib/agent/record-workflow.ts",
    "lib/event-recording.ts",
    "lib/record-input.ts",
    "lib/ledger-recording.ts",
    "lib/types.ts",
    "lib/time.ts",
    "lib/state.ts",
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--target",
    "ES2020",
    "--outDir",
    outDir,
    "--esModuleInterop",
    "--skipLibCheck",
    "--strict"
  ],
  {
    cwd: rootDir,
    stdio: "inherit"
  }
);

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const run = spawnSync(process.execPath, [resolve(outDir, "scripts/eval-record-workflow.js"), ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: "inherit"
});

process.exit(run.status ?? 1);
