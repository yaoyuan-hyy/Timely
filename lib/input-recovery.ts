import { createLocalId } from "./local-id";
import type { InputRecovery } from "./write-contract";
import type { InputDecision, WriteContext } from "./write-contract";

export const RECOVERY_TTL_MS = 15 * 60 * 1000;

export function activeInputRecovery(recovery: InputRecovery | undefined, now: Date): InputRecovery | undefined {
  return recovery && now.getTime() < recovery.expiresAt ? recovery : undefined;
}

// Keep original user evidence only. Never promote a rejected model patch into a draft.
export function retainInputRecovery(previous: InputRecovery | undefined, input: string, now: Date, reason: InputRecovery["reason"], question: string): InputRecovery {
  const active = activeInputRecovery(previous, now);
  const turns = active?.turns ?? [];
  const duplicate = turns.at(-1)?.input === input && turns.at(-1)?.referenceNow === now.toISOString();
  const full = !duplicate && (turns.length >= 4 || turns.reduce((sum, turn) => sum + turn.input.length, 0) + input.length > 12000);
  return {
    id: active?.id ?? createLocalId("recovery"), revision: (active?.revision ?? 0) + 1,
    reason, question: full ? "这次补充较多，请取消后完整重述这条记录。" : question.slice(0, 240),
    expiresAt: now.getTime() + RECOVERY_TTL_MS,
    turns: duplicate || full ? structuredClone(turns) : [...structuredClone(turns), { id: createLocalId("turn"), input, referenceNow: now.toISOString() }]
  };
}

export function recoveryDecisionIssue(decision: InputDecision, context: WriteContext, input: string): string | null {
  if (decision.action === "cancel_draft") return null;
  const recovery = context.recovery;
  if (!recovery) return decision.recovery ? "恢复上下文不存在，请勿引用旧版本。" : null;
  if (!decision.recovery || decision.recovery.id !== recovery.id || decision.recovery.revision !== recovery.revision) return "必须使用 pending.recovery 的 id/revision，并明确 continue 或 replace。";
  if (decision.action !== "write" || decision.recovery.mode !== "continue") return null;
  const changes = Object.values(decision.patch);
  const superseded = decision.recovery.superseded ?? [];
  const seen = new Set<string>();
  for (const replacement of superseded) {
    if (seen.has(replacement.turnId) || !recovery.turns.some(turn => turn.id === replacement.turnId)) return "覆盖声明引用了重复或不存在的轮次。";
    seen.add(replacement.turnId);
    if (!input.includes(replacement.evidence)) return "覆盖声明必须逐字引用本轮的纠正或完整重述。";
    for (const name of replacement.fields) {
      const change = (decision.patch as Record<string, { evidence: string; turnId?: string }>)[name];
      if (!change || change.turnId || !input.includes(change.evidence) || !replacement.evidence.includes(change.evidence)) return "覆盖字段必须存在于本轮 patch，且有本轮原文依据。";
    }
  }
  const missing = recovery.turns.filter(turn => !seen.has(turn.id) && !changes.some(change => change && resolvePatchSource(change, input, "", recovery.turns)?.id === turn.id));
  return missing.length ? `尚未处理的原输入被遗漏：${missing.map(turn => turn.id).join("、")}。continue 需要提取仍有效的旧字段并引用 turnId；被本轮纠正或完整重述覆盖的轮次，用 recovery.superseded 声明 turnId、本轮 evidence 和覆盖字段 fields。不能遗漏仍有效的信息；无法确定则 clarify。` : null;
}

// One source rule shared by coverage validation and field application.
export function resolvePatchSource(change: { evidence: string; turnId?: string }, input: string, referenceNow: string, sources: Array<{ id: string; input: string; referenceNow: string }>): { id?: string; input: string; referenceNow: string } | undefined {
  if (change.turnId) return sources.find(turn => turn.id === change.turnId && turn.input.includes(change.evidence));
  if (input.includes(change.evidence)) return { input, referenceNow };
  const matches = sources.filter(turn => turn.input.includes(change.evidence));
  return matches.length === 1 ? matches[0] : undefined;
}
