import type { CalendarEvent, LedgerEntry, RecordTarget, TimelyState } from "./types";
import { parseEventDate, resolveEventTimeChange } from "./event-recording";
import { getShanghaiParts, toShanghaiIso } from "./time";
import { createLocalId } from "./local-id";
import { describeRecord } from "./record-draft";
import { eventSchema, ledgerSchema } from "./record-validation";

export function isRecordEdit(input: string) { return /改到|改成|改为|修改|更正|不是.+[，,]?是/.test(input); }
type Candidate = { kind: "event"; record: CalendarEvent } | { kind: "ledger"; record: LedgerEntry };

export function findRecentRecord(state: TimelyState, kind?: "event" | "ledger") {
  return candidates(state).filter(c => !kind || c.kind === kind).sort((a, b) => Date.parse(b.record.createdAt) - Date.parse(a.record.createdAt))[0] ?? null;
}

function candidates(state: TimelyState): Candidate[] {
  return [...state.events.filter(e => e.status === "active").map(record => ({ kind: "event" as const, record })), ...state.ledgerEntries.map(record => ({ kind: "ledger" as const, record }))];
}
function toTarget(c: Candidate): RecordTarget { return { view: c.kind === "event" ? "calendar" : "ledger", recordId: c.record.id }; }

export function resolveRecordEdit(state: TimelyState, input: string, options: { now?: Date } = {}): TimelyState | null {
  const now = options.now ?? new Date();
  const text = input.trim().replace(/\s+/g, "").replace(/[。！!？?]+$/, "");
  const pending = state.pendingEdit && now.getTime() - state.pendingEdit.createdAt < 5 * 60 * 1000 ? state.pendingEdit : null;
  if (!isRecordEdit(text) && !pending) return null;
  const createdAt = toShanghaiIso(now);
  const withUser = { ...state, pendingEdit: null, pendingClarification: null, messages: [...state.messages, { id: createLocalId("message"), role: "user" as const, content: input, createdAt }] };
  const reply = (next: TimelyState, content: string): TimelyState => ({ ...next, messages: [...next.messages, { id: createLocalId("message"), role: "assistant", content, createdAt }] });
  if (/^(算了|取消|不要了)$/.test(text)) return reply(withUser, "已取消修改。");
  const instruction = pending && !isRecordEdit(text) ? pending.input : text;
  let matches: Candidate[];
  if (pending && !isRecordEdit(text)) {
    const index = text.match(/^(?:第)?([1-9]\d*|一|二|两|三|四|五|六|七|八|九|十)(?:条|个|笔)?$/)?.[1];
    const n = index ? Number(index) || ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 } as Record<string, number>)[index] : 0;
    const available = candidates(state).filter(c => pending.candidates.some(t => t.recordId === c.record.id && t.view === toTarget(c).view));
    matches = n ? available.filter(c => c.record.id === pending.candidates[n - 1]?.recordId) : filterDate(available, text, now).filter(c => {
      if (!/点|时|[:：]/.test(text)) return true;
      const original = c.kind === "event" ? c.record.startsAt : c.record.occurredAt;
      const selected = resolveEventTimeChange(text, original, now);
      return selected !== null && Date.parse(selected) === Date.parse(original);
    });
  } else {
    const ledger = /笔|流水|账|金额|收入|支出|分类|元/.test(instruction);
    const event = /会议|日程|事件|地点|标题|名称|改到|点/.test(instruction);
    const kind = ledger ? "ledger" : event ? "event" : undefined;
    if (/刚才|上一|最近|不是|^(地点|标题|分类|金额)/.test(instruction)) {
      const recent = findRecentRecord(state, kind);
      matches = recent ? candidates(state).filter(c => (!kind || c.kind === kind) && Date.parse(c.record.createdAt) === Date.parse(recent.record.createdAt)) : [];
    } else {
      const prefix = instruction.split(/地点|标题|名称|分类|金额|改到|改成|改为|修改|更正/)[0].replace(/^(请|帮我|把|帮我把)+/, "").replace(/的/g, "");
      matches = candidates(state).filter(c => !kind || c.kind === kind);
      if (prefix && !/^(日程|事件|流水|账目)$/.test(prefix)) matches = matches.filter(c => c.kind === "event" ? prefix.includes(c.record.title) || c.record.title.includes(prefix.replace(/今天|明天|昨天/g, "")) : prefix.includes(c.record.category) || Boolean(c.record.note && prefix.includes(c.record.note)));
      matches = filterDate(matches, prefix, now);
    }
  }
  if (!matches.length) return reply(withUser, "没有找到可修改的记录，请说明事项或日期。");
  if (matches.length > 1) return reply({ ...withUser, pendingEdit: { input: instruction, candidates: matches.map(toTarget), createdAt: now.getTime() } }, `要修改哪一条？${matches.map((c, i) => `${i + 1}. ${describeRecord(c)}`).join("；")}`);
  const target = matches[0];
  const value = instruction.split(/改到|改成|改为/).at(-1)?.replace(/[。]+$/, "") ?? "";
  if (target.kind === "event") {
    const record = { ...target.record, updatedAt: createdAt };
    if (/地点/.test(instruction)) record.location = value || null;
    else if (/标题|名称/.test(instruction)) record.title = value;
    else {
      const startsAt = resolveEventTimeChange(value, record.startsAt, now);
      if (!startsAt) return reply(withUser, "请说明有效的新日期或时间。");
      const duration = record.endsAt ? Date.parse(record.endsAt) - Date.parse(record.startsAt) : null;
      record.startsAt = startsAt;
      if (duration !== null) record.endsAt = toShanghaiIso(new Date(Date.parse(startsAt) + duration));
    }
    if (!eventSchema.safeParse(record).success) return reply(withUser, "修改内容无效，请再说一次。");
    return reply({ ...withUser, events: state.events.map(e => e.id === record.id ? record : e) }, "请确认修改。");
  }
  const record = { ...target.record, updatedAt: createdAt };
  if (/是收入|改成收入|改为收入/.test(instruction)) record.direction = "income";
  else if (/是支出|改成支出|改为支出/.test(instruction)) record.direction = "expense";
  else if (/分类/.test(instruction)) record.category = value;
  else {
    const amount = value.match(/^(?:¥|￥)?(\d+)(?:\.(\d{1,2}))?(?:元|块)?$/);
    if (!amount) return reply(withUser, "金额是多少？请填写大于 0 的金额。");
    record.amountCents = Number(amount[1]) * 100 + Number((amount[2] ?? "").padEnd(2, "0"));
  }
  if (!ledgerSchema.safeParse(record).success) return reply(withUser, "金额或分类无效，请再说一次。");
  return reply({ ...withUser, ledgerEntries: state.ledgerEntries.map(e => e.id === record.id ? record : e) }, "请确认修改。");
}

function filterDate(records: Candidate[], text: string, now: Date) {
  const date = parseEventDate(text, now);
  if (!date) return records;
  return records.filter(c => {
    const parts = getShanghaiParts(new Date(c.kind === "event" ? c.record.startsAt : c.record.occurredAt));
    return parts.year === date.year && parts.month === date.month && parts.day === date.day;
  });
}
