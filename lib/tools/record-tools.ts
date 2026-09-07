import type { RecordRepository } from "../repository/record-repository";
import { createRecordRepository } from "../repository/record-repository";
import type { RecordSnapshot } from "../repository/record-repository";
import { queryPlanSchema, queryPlanV2Schema } from "../query-contract";
import type { OperationResult } from "../query-contract";
import type { TimelyState } from "../types";

// This is the complete capability set given to a query agent: no mutation tools.
export type QueryToolCall = { name: "queryRecords"; kind: "schedule" | "ledger" | "task" };
export function createQueryTools(repository: Pick<RecordRepository, "query">, onCall?: (call: QueryToolCall) => void) {
  return {
    queryRecords(input: unknown): OperationResult<RecordSnapshot> {
      const parsed = queryPlanV2Schema.or(queryPlanSchema).safeParse(input);
      if (!parsed.success) return { ok: false, code: "invalid", message: "查询条件无效。" };
      onCall?.({ name: "queryRecords", kind: parsed.data.kind });
      return { ok: true, value: repository.query(parsed.data) };
    }
  };
}

// UI-only capability. It consumes the actual pending draft, not a model's confirmation flag.
export function commitConfirmedRecord(current: TimelyState): OperationResult<RecordSnapshot> {
  if (current.writeSession?.recovery) return { ok: false, code: "invalid", message: "还有未处理的补充，请先继续说明或取消这次记录。" };
  const draft = current.pendingConfirmation;
  if (!draft) return { ok: false, code: "invalid", message: "没有待确认记录。" };
  return createRecordRepository(current).commit(draft, draft.before);
}
