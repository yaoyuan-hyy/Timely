"use client";

import { Plus, ReceiptText, Trash2, X } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import {
  formatLedgerAmount,
  groupLedgerEntriesByDay,
  ledgerEntriesForMonth,
  ledgerEntriesForYear,
  summarizeLedgerEntries,
  summarizeLedgerEntriesByMonth
} from "@/lib/ledger-stats";
import { formatShortDate, getShanghaiParts } from "@/lib/time";
import type { LedgerDirection, LedgerEntry } from "@/lib/types";

type LedgerMode = "month" | "year";

type LedgerEntryDraftUpdate = {
  amountCents: number;
  category: string;
};

type LedgerEntryManualCreate = {
  direction: LedgerDirection;
  amountCents: number;
  category: string;
  note: string | null;
};

const categoryEmojis: Record<string, string> = {
  餐饮: "🍔",
  交通: "🚕",
  家居: "🏠",
  日用: "🧴",
  医疗: "💊",
  娱乐: "🎬",
  工资: "💼",
  报销: "🧾",
  奖金: "🎁",
  退款: "↩️",
  兼职: "🪙",
  购物: "🛍️",
  未分类: "✨"
};

const expenseCategories = ["餐饮", "购物", "交通", "家居", "日用", "医疗", "娱乐", "未分类"];
const incomeCategories = ["工资", "报销", "奖金", "退款", "兼职", "未分类"];

export function LedgerView({
  entries,
  onDeleteEntry,
  onUpdateEntry,
  onAddEntry
}: {
  entries: LedgerEntry[];
  onDeleteEntry: (entryId: string) => void;
  onUpdateEntry: (entryId: string, update: LedgerEntryDraftUpdate) => void;
  onAddEntry: (entry: LedgerEntryManualCreate) => void;
}) {
  const [ledgerMode, setLedgerMode] = useState<LedgerMode>("month");
  const [selectedMonthDate, setSelectedMonthDate] = useState(() => getCurrentShanghaiMonthDate());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [manualDirection, setManualDirection] = useState<LedgerDirection>("expense");
  const [manualCategory, setManualCategory] = useState(expenseCategories[0]);
  const [manualAmountDraft, setManualAmountDraft] = useState("");
  const [manualNoteDraft, setManualNoteDraft] = useState("");

  const monthEntries = useMemo(() => ledgerEntriesForMonth(entries, selectedMonthDate), [entries, selectedMonthDate]);
  const yearEntries = useMemo(() => ledgerEntriesForYear(entries, selectedMonthDate), [entries, selectedMonthDate]);
  const visibleEntries = ledgerMode === "year" ? yearEntries : monthEntries;
  const summary = useMemo(() => summarizeLedgerEntries(visibleEntries), [visibleEntries]);
  const groups = useMemo(() => groupLedgerEntriesByDay(monthEntries), [monthEntries]);
  const monthSummaries = useMemo(
    () => summarizeLedgerEntriesByMonth(entries, selectedMonthDate),
    [entries, selectedMonthDate]
  );
  const hasEntries = groups.length > 0;
  const monthButtonLabel = getMonthButtonLabel(selectedMonthDate);
  const parsedAmountCents = parseLedgerAmountDraft(amountDraft);
  const parsedManualAmountCents = parseLedgerAmountDraft(manualAmountDraft);
  const manualCategories = manualDirection === "income" ? incomeCategories : expenseCategories;

  function chooseLedgerMonth(monthIndex: number) {
    setSelectedMonthDate(new Date(selectedMonthDate.getFullYear(), monthIndex, 1));
    setLedgerMode("month");
    setIsMonthPickerOpen(false);
  }

  function showMonthPicker() {
    setLedgerMode("month");
    setIsMonthPickerOpen((current) => !current);
  }

  function showYearSummary() {
    setLedgerMode("year");
    setIsMonthPickerOpen(false);
  }

  function openLedgerEditor(entry: LedgerEntry) {
    closeManualEntryDrawer();
    setSelectedLedgerEntry(entry);
    setAmountDraft(formatLedgerAmount(entry.amountCents));
    setCategoryDraft(entry.category);
  }

  function closeLedgerEditor() {
    setSelectedLedgerEntry(null);
    setAmountDraft("");
    setCategoryDraft("");
  }

  function openManualEntryDrawer() {
    setSelectedLedgerEntry(null);
    setManualDirection("expense");
    setManualCategory(expenseCategories[0]);
    setManualAmountDraft("");
    setManualNoteDraft("");
    setIsManualEntryOpen(true);
  }

  function closeManualEntryDrawer() {
    setIsManualEntryOpen(false);
  }

  function chooseManualDirection(nextDirection: LedgerDirection) {
    setManualDirection(nextDirection);
    setManualCategory(nextDirection === "income" ? incomeCategories[0] : expenseCategories[0]);
  }

  function handleDeleteEntry(entryId: string) {
    onDeleteEntry(entryId);

    if (selectedLedgerEntry?.id === entryId) {
      closeLedgerEditor();
    }
  }

  function saveLedgerEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedLedgerEntry || parsedAmountCents === null) {
      return;
    }

    onUpdateEntry(selectedLedgerEntry.id, {
      amountCents: parsedAmountCents,
      category: categoryDraft
    });
    closeLedgerEditor();
  }

  function saveManualEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (parsedManualAmountCents === null) {
      return;
    }

    onAddEntry({
      direction: manualDirection,
      amountCents: parsedManualAmountCents,
      category: manualCategory,
      note: manualNoteDraft.trim() || null
    });
    closeManualEntryDrawer();
  }

  return (
    <div className="view-stack ledger-view">
      <div className="section-head">
        <div>
          <p className="eyebrow">Ledger</p>
          <h2>流水</h2>
        </div>
        <button
          className="ledger-add-trigger"
          type="button"
          title="手动添加流水"
          aria-label="手动添加流水"
          onClick={openManualEntryDrawer}
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="ledger-overview">
        <div className="ledger-period-selector" aria-label="选择流水统计周期">
          <button
            className={`ledger-period-pill ${ledgerMode === "month" ? "active" : ""}`}
            type="button"
            aria-expanded={isMonthPickerOpen}
            aria-pressed={ledgerMode === "month"}
            onClick={showMonthPicker}
          >
            {monthButtonLabel}
          </button>
          <button
            className={`ledger-period-pill ${ledgerMode === "year" ? "active" : ""}`}
            type="button"
            aria-pressed={ledgerMode === "year"}
            onClick={showYearSummary}
          >
            本年
          </button>

          {isMonthPickerOpen && (
            <div className="ledger-month-picker" role="menu" aria-label="选择月份">
              {monthSummaries.map((month) => (
                <button
                  className={month.monthIndex === selectedMonthDate.getMonth() ? "selected" : ""}
                  type="button"
                  role="menuitem"
                  key={month.monthIndex}
                  onClick={() => chooseLedgerMonth(month.monthIndex)}
                >
                  <span>{month.label}</span>
                  <small>{formatExpenseAmount(month.summary.expenseCents)}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <section className="ledger-summary" aria-label={ledgerMode === "year" ? "本年流水概览" : "本月流水概览"}>
          <LedgerStat label="支出" hint="花出" amountCents={summary.expenseCents} tone="expense" />
          <LedgerStat label="收入" hint="收进" amountCents={summary.incomeCents} tone="income" />
          <LedgerStat label="净额" hint="结余" amountCents={summary.netCents} tone="net" />
        </section>
      </div>

      {ledgerMode === "year" ? (
        <div className="ledger-year-list" aria-label={`${selectedMonthDate.getFullYear()}年每月支出`}>
          {monthSummaries.map((month) => (
            <button
              className={`ledger-month-item ${month.monthIndex === selectedMonthDate.getMonth() ? "active" : ""}`}
              type="button"
              key={month.monthIndex}
              onClick={() => chooseLedgerMonth(month.monthIndex)}
            >
              <span className="ledger-month-name">{month.label}</span>
              <span className="ledger-month-meta">{month.entryCount > 0 ? `${month.entryCount} 条流水` : "暂无流水"}</span>
              <strong className="ledger-month-expense">{formatExpenseAmount(month.summary.expenseCents)}</strong>
            </button>
          ))}
        </div>
      ) : hasEntries ? (
        <div className="ledger-entry-list" aria-label="流水列表">
          {groups.map((group) => (
            <section className="ledger-day-shell" key={group.dayKey}>
              <div className="ledger-day-head">
                <h3>{formatShortDate(`${group.dayKey}T00:00:00+08:00`)}</h3>
                <span>{group.entries.length} 条</span>
              </div>
              <div className="ledger-day-entries">
                {group.entries.map((entry) => (
                  <LedgerEntryRow
                    entry={entry}
                    key={entry.id}
                    onDelete={handleDeleteEntry}
                    onOpen={openLedgerEditor}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="empty-state" aria-label="暂无流水">
          <ReceiptText size={28} />
          <p>{monthButtonLabel}还没有流水</p>
        </section>
      )}

      {selectedLedgerEntry && (
        <>
          <button
            className="ledger-editor-backdrop"
            type="button"
            aria-label="关闭流水编辑"
            onClick={closeLedgerEditor}
          />
          <section className="ledger-editor-drawer" role="dialog" aria-modal="true" aria-label="编辑流水">
            <span className="ledger-editor-handle" aria-hidden="true" />
            <div className="ledger-editor-head">
              <div>
                <p className="eyebrow">Edit</p>
                <h3>{selectedLedgerEntry.direction === "income" ? "收入流水" : "支出流水"}</h3>
              </div>
              <button className="ledger-editor-close" type="button" aria-label="关闭流水编辑" onClick={closeLedgerEditor}>
                <X size={18} />
              </button>
            </div>

            <form className="ledger-editor-form" onSubmit={saveLedgerEdit}>
              <label className="ledger-editor-field">
                <span>金额</span>
                <input
                  inputMode="decimal"
                  value={amountDraft}
                  aria-label="流水金额"
                  aria-invalid={amountDraft.trim() ? parsedAmountCents === null : undefined}
                  onChange={(event) => setAmountDraft(event.target.value)}
                />
              </label>
              <label className="ledger-editor-field">
                <span>分类</span>
                <input
                  value={categoryDraft}
                  aria-label="流水分类"
                  onChange={(event) => setCategoryDraft(event.target.value)}
                />
              </label>
              <div className="ledger-editor-actions">
                <button className="ledger-editor-cancel" type="button" onClick={closeLedgerEditor}>
                  取消
                </button>
                <button className="ledger-editor-save" type="submit" disabled={parsedAmountCents === null}>
                  保存
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      {isManualEntryOpen && (
        <>
          <button
            className="ledger-editor-backdrop"
            type="button"
            aria-label="关闭手动添加流水"
            onClick={closeManualEntryDrawer}
          />
          <section className="ledger-editor-drawer ledger-manual-drawer" role="dialog" aria-modal="true" aria-label="手动添加流水">
            <span className="ledger-editor-handle" aria-hidden="true" />
            <div className="ledger-editor-head">
              <div>
                <p className="eyebrow">Manual</p>
                <h3>添加流水</h3>
              </div>
              <button className="ledger-editor-close" type="button" aria-label="关闭手动添加流水" onClick={closeManualEntryDrawer}>
                <X size={18} />
              </button>
            </div>

            <form className="ledger-manual-form" onSubmit={saveManualEntry}>
              <div className="ledger-direction-segment" aria-label="选择收支方向">
                <button
                  className={manualDirection === "expense" ? "active" : ""}
                  type="button"
                  aria-pressed={manualDirection === "expense"}
                  onClick={() => chooseManualDirection("expense")}
                >
                  支出
                </button>
                <button
                  className={manualDirection === "income" ? "active" : ""}
                  type="button"
                  aria-pressed={manualDirection === "income"}
                  onClick={() => chooseManualDirection("income")}
                >
                  收入
                </button>
              </div>

              <div className="ledger-category-grid" aria-label="选择流水分类">
                {manualCategories.map((category) => (
                  <button
                    className={manualCategory === category ? "active" : ""}
                    type="button"
                    key={category}
                    aria-pressed={manualCategory === category}
                    onClick={() => setManualCategory(category)}
                  >
                    <span>{getLedgerCategoryEmoji(category)}</span>
                    <small>{category}</small>
                  </button>
                ))}
              </div>

              <label className="ledger-editor-field">
                <span>备注</span>
                <input
                  value={manualNoteDraft}
                  aria-label="流水备注"
                  placeholder="添加备注说明"
                  onChange={(event) => setManualNoteDraft(event.target.value)}
                />
              </label>

              <label className="ledger-editor-field ledger-amount-field">
                <span>金额</span>
                <input
                  inputMode="decimal"
                  value={manualAmountDraft}
                  aria-label="手动流水金额"
                  aria-invalid={manualAmountDraft.trim() ? parsedManualAmountCents === null : undefined}
                  placeholder="0.00"
                  onChange={(event) => setManualAmountDraft(event.target.value)}
                />
              </label>

              <button className="ledger-editor-save ledger-manual-save" type="submit" disabled={parsedManualAmountCents === null}>
                保存
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

function LedgerStat({
  label,
  hint,
  amountCents,
  tone
}: {
  label: string;
  hint: string;
  amountCents: number;
  tone: "expense" | "income" | "net";
}) {
  return (
    <article className={`ledger-stat ${tone}`}>
      <span className="ledger-stat-label">{label}</span>
      <strong>{formatSignedAmount(amountCents, tone)}</strong>
      <span className="ledger-stat-hint">{hint}</span>
    </article>
  );
}

function LedgerEntryRow({
  entry,
  onDelete,
  onOpen
}: {
  entry: LedgerEntry;
  onDelete: (entryId: string) => void;
  onOpen: (entry: LedgerEntry) => void;
}) {
  const isIncome = entry.direction === "income";

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(entry);
    }
  }

  return (
    <article
      className={`ledger-entry-row ${entry.direction}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry)}
      onKeyDown={handleKeyDown}
    >
      <span className="ledger-category-emoji" aria-label={`${entry.category}分类`}>
        {getLedgerCategoryEmoji(entry.category)}
      </span>
      <div className="ledger-entry-main">
        <h4>{entry.category}</h4>
        {entry.note && <p>{entry.note}</p>}
      </div>
      <strong className="ledger-entry-amount">{`${isIncome ? "+" : "-"}${formatLedgerAmount(entry.amountCents)}`}</strong>
      <button
        className="ledger-entry-delete"
        type="button"
        aria-label={`删除${entry.category}流水`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(entry.id);
        }}
      >
        <Trash2 size={14} />
      </button>
    </article>
  );
}

function formatSignedAmount(amountCents: number, tone: "expense" | "income" | "net") {
  const prefix = tone === "income" || (tone === "net" && amountCents > 0) ? "+" : tone === "expense" || amountCents < 0 ? "-" : "";
  return `${prefix}${formatLedgerAmount(Math.abs(amountCents))}`;
}

function formatExpenseAmount(amountCents: number) {
  return amountCents > 0 ? `-${formatLedgerAmount(amountCents)}` : formatLedgerAmount(0);
}

function getLedgerCategoryEmoji(category: string) {
  return categoryEmojis[category] ?? categoryEmojis.未分类;
}

function getCurrentShanghaiMonthDate() {
  const parts = getShanghaiParts(new Date());
  return new Date(parts.year, parts.month - 1, 1);
}

function getMonthButtonLabel(monthDate: Date) {
  const current = getCurrentShanghaiMonthDate();

  if (monthDate.getFullYear() === current.getFullYear() && monthDate.getMonth() === current.getMonth()) {
    return "本月";
  }

  return `${monthDate.getMonth() + 1}月`;
}

function parseLedgerAmountDraft(value: string) {
  const normalized = value.trim().replace(/,/g, "");

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}
