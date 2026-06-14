import { NextResponse } from "next/server";
import { parseMiniMaxEventInput } from "@/lib/ai/minimax-event-parser";

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

  try {
    const result = await parseMiniMaxEventInput(payload.input);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MiniMax API 调用失败。";
    const status = message.includes("MINIMAX_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
