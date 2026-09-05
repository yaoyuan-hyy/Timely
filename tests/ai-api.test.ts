import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/record-input/route.ts", "utf8");
assert.match(route, /export async function POST/);
assert.match(route, /parseDeepSeekRecordInput/);
assert.match(route, /normalizePendingClarification/);
assert.match(route, /NextResponse.json/);
const legacy = readFileSync("app/api/record-event/route.ts", "utf8");
assert.match(legacy, /export \{ POST \} from "..\/record-input\/route"/);
const example = readFileSync(".env.example", "utf8");
assert.match(example, /DEEPSEEK_MODEL=deepseek-v4-flash/);
assert.doesNotMatch(example, /MINIMAX|OPENAI/);
