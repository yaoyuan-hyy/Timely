import { NextResponse } from "next/server";
import { z } from "zod";
import { writeContextSchema } from "@/lib/write-contract";
import { parseDeepSeekInputDecision } from "@/server/ai/deepseek-input-decision";

const requestSchema = z.object({ input: z.string().trim().min(1).max(4000), now: z.string().datetime({ offset: true }), pending: writeContextSchema }).strict();
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    const result = await parseDeepSeekInputDecision(parsed.data.input, { now: new Date(parsed.data.now), pending: parsed.data.pending, signal: request.signal });
    return NextResponse.json({ result });
  } catch (error) {
    const timeout = error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
    return NextResponse.json({ error: error instanceof z.ZodError || error instanceof SyntaxError ? "invalid_decision" : "provider_unavailable" }, { status: timeout ? 504 : 502 });
  }
}
