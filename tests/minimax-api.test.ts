import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const parserPath = "lib/ai/minimax-event-parser.ts";
const routePath = "app/api/record-event/route.ts";

assert.equal(existsSync(parserPath), true);
assert.equal(existsSync(routePath), true);

const parser = readFileSync(parserPath, "utf8");
const route = readFileSync(routePath, "utf8");

assert.match(parser, /MINIMAX_API_KEY/);
assert.match(parser, /OPENAI_API_KEY/);
assert.match(parser, /OPENAI_BASE_URL/);
assert.match(parser, /MINIMAX_MODEL/);
assert.match(parser, /MiniMax-M3/);
assert.match(parser, /response_format/);
assert.match(parser, /json_object/);
assert.match(parser, /parseMiniMaxEventInput/);
assert.match(parser, /timeoutMs/);
assert.match(parser, /AbortSignal\.timeout/);
assert.match(parser, /extractMiniMaxJsonContent/);
assert.match(parser, /JSON\.parse\(extractMiniMaxJsonContent\(content\)\)/);
assert.match(parser, /```json/);
assert.match(parser, /endsAt 可以是 null/);
assert.match(parser, /create_event 必须有 title 和 startsAt/);
assert.match(parser, /delete_event/);
assert.match(parser, /targetDate/);
assert.match(parser, /title 必须是用户真正要记录或删除的事项名/);
assert.match(parser, /我要健身/);
assert.match(parser, /title=健身/);
assert.match(parser, /帮我把周六下午四点的会议删掉/);
assert.match(parser, /startsAt=2026-06-20T16:00:00\+08:00/);
assert.match(parser, /events/);
assert.match(parser, /event/);
assert.match(parser, /normalizeMiniMaxDateTime/);

assert.match(route, /export async function POST/);
assert.match(route, /parseMiniMaxEventInput/);
assert.match(route, /payload\.now/);
assert.match(route, /NextResponse\.json/);
