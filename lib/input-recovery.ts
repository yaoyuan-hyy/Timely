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
  const missing = recovery.turns.filter(turn => !changes.some(change => change && (change.turnId === turn.id || (!change.turnId && recovery.turns.filter(source => source.input.includes(change.evidence)).length === 1 && turn.input.includes(change.evidence)))));
  return missing.length ? `尚未处理的原输入被遗漏：${missing.map(turn => turn.id).join("、")}。continue 需要重新提取未决输入与本轮的完整字段，旧字段引用 turnId；不能只提取本轮。若用户明确覆盖旧意图用 replace；仍不能处理则 clarify。` : null;
}
