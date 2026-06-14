import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const staticApp = readFileSync("public/app.js", "utf8");

assert.match(staticApp, /STATIC_PREVIEW_ONLY/);
assert.doesNotMatch(staticApp, /\/api\/record-event/);
assert.doesNotMatch(staticApp, /function parseDateTime/);
assert.doesNotMatch(staticApp, /function resolveLocalInput/);
