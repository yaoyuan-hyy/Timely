import { NextResponse } from "next/server";
import { parseMiniMaxRecordInput } from "@/lib/ai/minimax-record-parser";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  if (!isRecord(payload) || typeof payload.input !== "string" || !payload.input.trim()) {
    return NextResponse.json({ error: "请提供 input 字段。" }, { status: 400 });
  }

  const now = typeof payload.now === "string" ? parseRequestNow(payload.now) : undefined;

  try {
    const result = await parseMiniMaxRecordInput(payload.input.trim(), { now });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MiniMax API 调用失败。";
    const status = getErrorStatus(error, message);
    return NextResponse.json({ error: message }, { status });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRequestNow(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getErrorStatus(error: unknown, message: string) {
  if (message.includes("API_KEY")) {
    return 503;
  }

  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return 504;
  }

  return 502;
}
