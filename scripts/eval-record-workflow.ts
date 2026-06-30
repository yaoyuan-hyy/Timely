import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  findWorkflowEvent,
  findWorkflowLedgerEntry,
  runRecordAgentWorkflow
} from "../lib/agent/record-workflow";
import type { RecordWorkflowOutcome, RecordWorkflowRoute } from "../lib/agent/record-workflow";
import type { RecordStatus, TimelyState } from "../lib/types";

const eventExpectationSchema = z
  .object({
    title: z.string().optional(),
    startsAt: z.string().optional(),
    status: z.enum(["active", "cancelled"]).optional()
  })
  .strict();

const ledgerExpectationSchema = z
  .object({
    direction: z.enum(["expense", "income"]).optional(),
    amountCents: z.number().int().positive().optional(),
    category: z.string().optional(),
    occurredAt: z.string().optional(),
    note: z.string().nullable().optional()
  })
  .strict();

const recordEvalCaseSchema = z
  .object({
    id: z.string().min(1),
    input: z.string().min(1),
    now: z.string().optional(),
    initialState: z.custom<TimelyState>().optional(),
    expected: z
      .object({
        route: z.enum(["ai_result", "local_fallback"]).optional(),
        outcome: z.enum([
          "event_created",
          "event_cancelled",
          "ledger_created",
          "clarification_requested",
          "pending_cancelled",
          "unsupported",
          "assistant_reply",
          "no_change"
        ]),
        pendingKind: z.string().nullable().optional(),
        assistant: z.string().optional(),
        event: eventExpectationSchema.optional(),
        ledger: ledgerExpectationSchema.optional()
      })
      .strict()
  })
  .strict();

export type RecordEvalCase = z.infer<typeof recordEvalCaseSchema>;

export type RecordEvalCheck = {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
};

export type RecordEvalResult = {
  id: string;
  input: string;
  passed: boolean;
  checks: RecordEvalCheck[];
};

export function loadRecordEvalCasesFromText(text: string): RecordEvalCase[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let value: unknown;

      try {
        value = JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${errorMessage(error)}`);
      }

      const parsed = recordEvalCaseSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error(`Invalid eval case at line ${index + 1}: ${z.prettifyError(parsed.error)}`);
      }

      return parsed.data;
    });
}

export async function scoreRecordEvalCase(recordCase: RecordEvalCase): Promise<RecordEvalResult> {
  const now = parseEvalNow(recordCase.now);
  const initialState = recordCase.initialState ?? emptyState();
  const result = await runRecordAgentWorkflow(initialState, recordCase.input, {
    now,
    createId: deterministicIds(recordCase.id)
  });
  const checks: RecordEvalCheck[] = [];

  pushCheck(checks, "outcome", recordCase.expected.outcome, result.outcome);

  if (recordCase.expected.route) {
    pushCheck(checks, "route", recordCase.expected.route, result.route);
  }

  if ("pendingKind" in recordCase.expected) {
    pushCheck(checks, "pendingKind", recordCase.expected.pendingKind ?? null, result.state.pendingClarification?.kind ?? null);
  }

  if (recordCase.expected.assistant) {
    pushCheck(checks, "assistant", recordCase.expected.assistant, lastAssistantReply(result.state));
  }

  if (recordCase.expected.event) {
    const event = findWorkflowEvent(result.state, recordCase.expected.event as {
      title?: string;
      startsAt?: string;
      status?: RecordStatus;
    });

    pushCheck(checks, "event", recordCase.expected.event, event ? pickEventFields(event, recordCase.expected.event) : null);
  }

  if (recordCase.expected.ledger) {
    const ledger = findWorkflowLedgerEntry(result.state, recordCase.expected.ledger);
    pushCheck(checks, "ledger", recordCase.expected.ledger, ledger ? pickLedgerFields(ledger, recordCase.expected.ledger) : null);
  }

  return {
    id: recordCase.id,
    input: recordCase.input,
    passed: checks.every((check) => check.passed),
    checks
  };
}

export function summarizeRecordEvalResults(results: RecordEvalResult[]) {
  const passed = results.filter((result) => result.passed).length;
  const total = results.length;

  return {
    total,
    passed,
    failed: total - passed,
    passRate: total === 0 ? 0 : passed / total
  };
}

export async function runRecordEvalCli(args: string[]) {
  const datasetPath = args[0] ?? "evals/record-input-cases.jsonl";
  const text = readFileSync(resolve(process.cwd(), datasetPath), "utf8");
  const cases = loadRecordEvalCasesFromText(text);
  const results: RecordEvalResult[] = [];

  for (const recordCase of cases) {
    results.push(await scoreRecordEvalCase(recordCase));
  }

  const summary = summarizeRecordEvalResults(results);
  console.log(`Timely record workflow eval: ${summary.passed}/${summary.total} passed (${formatRate(summary.passRate)})`);

  for (const result of results) {
    console.log(`${result.passed ? "[pass]" : "[fail]"} ${result.id}: ${result.input}`);
    if (!result.passed) {
      for (const check of result.checks.filter((item) => !item.passed)) {
        console.log(`  - ${check.name}: expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`);
      }
    }
  }

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

function emptyState(): TimelyState {
  return {
    events: [],
    reminders: [],
    ledgerEntries: [],
    messages: [],
    pendingClarification: null
  };
}

function deterministicIds(seed: string) {
  let next = 0;
  const normalizedSeed = seed.replace(/[^a-zA-Z0-9_-]/g, "-");

  return (prefix: string) => `${prefix}-${normalizedSeed}-${++next}`;
}

function parseEvalNow(value: string | undefined) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid eval now value: ${value}`);
  }

  return date;
}

function pushCheck(checks: RecordEvalCheck[], name: string, expected: unknown, actual: unknown) {
  checks.push({
    name,
    expected,
    actual,
    passed: deepEqual(expected, actual)
  });
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function lastAssistantReply(state: TimelyState) {
  return [...state.messages].reverse().find((message) => message.role === "assistant")?.content ?? null;
}

function pickEventFields(
  event: { title: string; startsAt: string; status: RecordStatus },
  expected: { title?: string; startsAt?: string; status?: RecordStatus }
) {
  const picked: { title?: string; startsAt?: string; status?: RecordStatus } = {};

  if ("title" in expected) {
    picked.title = event.title;
  }
  if ("startsAt" in expected) {
    picked.startsAt = event.startsAt;
  }
  if ("status" in expected) {
    picked.status = event.status;
  }

  return picked;
}

function pickLedgerFields(entry: {
  direction: "expense" | "income";
  amountCents: number;
  category: string;
  occurredAt: string;
  note: string | null;
}, expected: {
  direction?: "expense" | "income";
  amountCents?: number;
  category?: string;
  occurredAt?: string;
  note?: string | null;
}) {
  const picked: {
    direction?: "expense" | "income";
    amountCents?: number;
    category?: string;
    occurredAt?: string;
    note?: string | null;
  } = {};

  if ("direction" in expected) {
    picked.direction = entry.direction;
  }
  if ("amountCents" in expected) {
    picked.amountCents = entry.amountCents;
  }
  if ("category" in expected) {
    picked.category = entry.category;
  }
  if ("occurredAt" in expected) {
    picked.occurredAt = entry.occurredAt;
  }
  if ("note" in expected) {
    picked.note = entry.note;
  }

  return picked;
}

function formatRate(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

if (typeof require !== "undefined" && require.main === module) {
  runRecordEvalCli(process.argv.slice(2)).catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
