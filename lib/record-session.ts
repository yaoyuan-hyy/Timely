import { resolveRecordEdit } from "./record-editing";
import { runTimelyAgentWorkflow } from "./agent/app-workflow";
import { appendRecordReply } from "./record-draft";
import type { TimelyState } from "./types";

type Options = NonNullable<Parameters<typeof runTimelyAgentWorkflow>[2]>;

// Returns a proposal. The UI must stageRecordResult against its current state.
export async function proposeRecordInput(state: TimelyState, input: string, options: Options = {}) {
  if (state.pendingConfirmation) return { state: appendRecordReply(state, "请先确认或取消当前记录。"), usedFallback: false };
  const edit = resolveRecordEdit(state, input, { now: options.now });
  if (edit) return { state: edit, usedFallback: false };
  let usedFallback = false;
  const parse = options.parseRecordInput;
  const result = await runTimelyAgentWorkflow(state, input, {
    ...options,
    parseRecordInput: parse ? async (...args) => {
      try { return await parse(...args); }
      catch (error) { usedFallback = true; throw error; }
    } : undefined
  });
  return { state: result.state, usedFallback };
}
