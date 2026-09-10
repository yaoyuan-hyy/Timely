import { inputDecisionSchema } from "./write-contract";
import type { WriteDecision, WriteDraft, WriteFields } from "./write-contract";
import { parseMoneyText, resolveCalendarDate } from "./write-values";
import { getShanghaiParts, toShanghaiDayKey } from "./time";
import { canonicalCategory, categoryMatchesDirection } from "./ledger-categories";

type PatchResult = { ok: true; draft: WriteDraft } | { ok: false; code: "invalid" | "stale" | "evidence"; message: string };
export function applyWritePatch(previous: WriteDraft | null, inputDecision: unknown, input: string, now: string, id: string, sources: Array<{ id: string; input: string; referenceNow: string }> = []): PatchResult {
  const parsed = inputDecisionSchema.safeParse(inputDecision);
  if (!parsed.success || parsed.data.action !== "write" || !Number.isFinite(Date.parse(now))) return { ok: false, code: "invalid", message: "输入结果无效，请重新说明。" };
  const decision: WriteDecision = parsed.data;
  if (decision.operation === "revise" && (!previous || previous.id !== decision.base?.id || previous.revision !== decision.base.revision || previous.kind !== decision.kind)) {
    return { ok: false, code: "stale", message: "草稿已变化，请根据当前草稿重新修改。" };
  }
  const parts = getShanghaiParts(new Date(now));
  const draft: WriteDraft = decision.operation === "revise" && previous ? structuredClone(previous) : {
    id, revision: 0, kind: decision.kind, operation: decision.operation === "revise" ? "create" : decision.operation,
    referenceNow: now, sourceText: input, fields: { date: toShanghaiDayKey(new Date(now)), ...(decision.kind === "ledger" ? { time: { hour: parts.hour, minute: parts.minute }, category: "未分类" } : {}) }, evidence: {}, uncertain: []
  };
  const fields: WriteFields = { ...draft.fields };
  for (const [name, change] of Object.entries(decision.patch)) {
    const matches = change && !change.turnId && !input.includes(change.evidence) ? sources.filter(turn => turn.input.includes(change.evidence)) : [];
    const source = change?.turnId ? sources.find(turn => turn.id === change.turnId) : matches.length === 1 ? matches[0] : { input, referenceNow: now };
    if (!change || !source || !source.input.includes(change.evidence)) return { ok: false, code: "evidence", message: "有字段无法对应到输入来源，请重新说明。" };
    let value: unknown = change.value;
    if (["title", "location", "notes", "counterparty", "note"].includes(name) && typeof value === "string" && !change.evidence.includes(value)) {
      return { ok: false, code: "evidence", message: "事项或备注无法对应到原文，请重新说明。" };
    }
    if (name === "amount") {
      if (typeof value !== "string" || !change.evidence.includes(value)) return { ok: false, code: "evidence", message: "金额必须对应到原文，请明确金额。" };
      value = parseMoneyText(value);
      if (value === null) return { ok: false, code: "invalid", message: "请提供一个明确、有效的人民币金额。" };
    }
    if ((name === "date" || name === "endDate") && value !== null) {
      value = resolveCalendarDate(change.value as Parameters<typeof resolveCalendarDate>[0], source.referenceNow);
      if (!value) return { ok: false, code: "invalid", message: "日期无效，请重新说明日期。" };
    }
    Object.assign(fields, { [name === "amount" ? "amountCents" : name]: value });
    draft.evidence[name] = { quote: change.evidence, input: source.input, referenceNow: source.referenceNow };
  }
  draft.fields = fields;
  if (decision.kind === "event" && decision.patch.endTime?.value === null) draft.fields.endDate = null;
  draft.uncertain = [...new Set([...draft.uncertain.filter(name => !(name in decision.patch)), ...(decision.uncertain ?? [])])];
  if (draft.kind === "ledger" && fields.direction && fields.category && canonicalCategory(fields.category) && !categoryMatchesDirection(canonicalCategory(fields.category)!, fields.direction)) draft.uncertain = [...new Set([...draft.uncertain, "category"])];
  draft.revision += 1;
  if (previous && decision.operation === "revise") draft.sourceText = `${previous.sourceText}\n${input}`.slice(-8000);
  return { ok: true, draft };
}

export function missingWriteFields(draft: WriteDraft): string[] {
  if (draft.operation === "cancel") return [...draft.uncertain];
  const required = draft.kind === "event" ? ["title", "date", "time"] : ["amountCents", "direction", "date", "time"];
  const absent = required.filter(key => draft.fields[key as keyof WriteFields] === undefined).map(key => key === "amountCents" ? "amount" : key);
  if (draft.fields.endDate && !draft.fields.endTime) absent.push("endTime");
  return [...new Set([...absent, ...draft.uncertain])];
}
export function writeFieldQuestion(fields: string[]): string {
  const questions: Record<string, string> = { title: "记录什么？", date: "是哪一天？", time: "什么时候？", endDate: "结束日期是哪天？", endTime: "几点结束？", amount: "金额是多少？", direction: "这是收入还是支出？", category: "记在哪个分类？", target: "你指的是哪一条记录？" };
  return questions[fields[0]] ?? "请补充这条记录的信息。";
}
