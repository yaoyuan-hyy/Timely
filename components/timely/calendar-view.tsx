"use client";

import { ChevronLeft, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { dayKey, formatShanghaiFullDay, formatShortDate, formatTime, getShanghaiParts, toShanghaiDayKey } from "@/lib/time";
import { sortEventsByTime } from "@/lib/stats";
import type { CalendarEvent } from "@/lib/types";

const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];
const dayMs = 24 * 60 * 60 * 1000;

export function CalendarView({
  events,
  cancelledEvents,
  onCancel,
  onRestore,
  onPermanentDelete
}: {
  events: CalendarEvent[];
  cancelledEvents: CalendarEvent[];
  onCancel: (eventId: string) => void;
  onRestore: (eventId: string) => void;
  onPermanentDelete: (eventId: string) => void;
}) {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const calendarDays = useMemo(() => buildMonthDays(monthDate, events), [events, monthDate]);
  const pickerYears = useMemo(() => buildPickerYears(monthDate.getFullYear()), [monthDate]);
  const selectedDate = selectedDayKey ? dateFromDayKey(selectedDayKey) : null;
  const selectedEvents = useMemo(
    () => (selectedDayKey ? sortEventsByTime(events.filter((event) => dayKey(event.startsAt) === selectedDayKey)) : []),
    [events, selectedDayKey]
  );
  const selectedWeekDays = useMemo(
    () => (selectedDate ? buildWeekDays(selectedDate, events) : []),
    [events, selectedDate]
  );

  function jumpToday() {
    const today = new Date();
    setMonthDate(startOfMonth(today));
    setSelectedDayKey(toShanghaiDayKey(today));
  }

  function chooseYear(year: number) {
    setMonthDate((current) => startOfMonth(new Date(year, current.getMonth(), 1)));
    setIsYearPickerOpen(false);
  }

  function chooseMonth(monthIndex: number) {
    setMonthDate((current) => startOfMonth(new Date(current.getFullYear(), monthIndex, 1)));
    setIsMonthPickerOpen(false);
  }

  function openDay(date: Date, key: string) {
    setMonthDate(startOfMonth(date));
    setSelectedDayKey(key);
  }

  return (
    <div className="view-stack calendar-view">
      {selectedDayKey && selectedDate ? (
        <section className="day-detail" aria-label="单日事件记录">
          <div className="calendar-toolbar">
            <button className="calendar-pill" type="button" onClick={() => setSelectedDayKey(null)}>
              <ChevronLeft size={22} />
              {monthDate.getMonth() + 1}月
            </button>
            <button className="calendar-pill compact" type="button" onClick={jumpToday}>
              今天
            </button>
          </div>

          <div className="week-strip" aria-label="选择本周日期">
            {selectedWeekDays.map((day) => (
              <button
                className={`week-day ${day.key === selectedDayKey ? "selected" : ""} ${day.events.length ? "has-events" : ""}`}
                type="button"
                key={day.key}
                onClick={() => setSelectedDayKey(day.key)}
              >
                <span>{weekLabels[day.date.getDay()]}</span>
                <strong>{day.date.getDate()}</strong>
              </button>
            ))}
          </div>

          <div className="day-title">
            <h2>{formatShanghaiFullDay(selectedDate)}</h2>
            <p>{selectedEvents.length ? `${selectedEvents.length} 条记录` : "这天暂无记录"}</p>
          </div>

          <div className="timeline-grid" aria-label="单日时间轴">
            {Array.from({ length: 24 }, (_, hour) => {
              const hourEvents = selectedEvents.filter((event) => getShanghaiParts(new Date(event.startsAt)).hour === hour);
              return (
                <section className="timeline-hour" key={hour}>
                  <time>{String(hour).padStart(2, "0")}:00</time>
                  <div className="timeline-lane">
                    {hourEvents.map((event) => (
                      <article className="timeline-event" key={event.id}>
                        <div>
                          <h3>{event.title}</h3>
                          <p>
                            {formatTime(event.startsAt)} - {formatTime(event.endsAt ?? addHoursIso(event.startsAt, 1))}
                          </p>
                        </div>
                        <button
                          className="icon-action danger"
                          type="button"
                          title="取消记录"
                          aria-label={`取消${event.title}`}
                          onClick={() => onCancel(event.id)}
                        >
                          <XCircle size={17} />
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="calendar-month" aria-label="月历记录概览">
          <div className="calendar-toolbar">
            <div className="calendar-picker-wrap">
              <button
                className="year-select"
                type="button"
                aria-expanded={isYearPickerOpen}
                onClick={() => {
                  setIsYearPickerOpen((value) => !value);
                  setIsMonthPickerOpen(false);
                }}
              >
                {monthDate.getFullYear()}年
              </button>
              {isYearPickerOpen && (
                <div className="calendar-picker year-picker">
                  {pickerYears.map((year) => (
                    <button
                      className={year === monthDate.getFullYear() ? "selected" : ""}
                      type="button"
                      key={year}
                      onClick={() => chooseYear(year)}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="calendar-pill compact" type="button" onClick={jumpToday}>
              今天
            </button>
          </div>

          <div className="month-heading">
            <div className="calendar-picker-wrap month-picker-wrap">
              <button
                className="month-select"
                type="button"
                aria-expanded={isMonthPickerOpen}
                onClick={() => {
                  setIsMonthPickerOpen((value) => !value);
                  setIsYearPickerOpen(false);
                }}
              >
                {monthDate.getMonth() + 1}月
              </button>
              {isMonthPickerOpen && (
                <div className="calendar-picker month-picker">
                  {Array.from({ length: 12 }, (_, index) => (
                    <button
                      className={index === monthDate.getMonth() ? "selected" : ""}
                      type="button"
                      key={index}
                      onClick={() => chooseMonth(index)}
                    >
                      {index + 1}月
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <section className="calendar-month-section" aria-label="当前月份日期">
            <h3>
              {monthDate.getFullYear()}年 {monthDate.getMonth() + 1}月
            </h3>
            <div className="weekday-row" aria-hidden="true">
              {weekLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="month-grid">
              {calendarDays.map((day, index) =>
                day ? (
                  <button
                    className={`month-day ${day.isToday ? "today" : ""} ${day.events.length ? "has-events" : ""}`}
                    type="button"
                    key={day.key}
                    onClick={() => openDay(day.date, day.key)}
                  >
                    <strong>{day.date.getDate()}</strong>
                    <span>{day.events.length ? `${day.events.length}条` : ""}</span>
                    {day.events.length > 0 && <i aria-hidden="true" />}
                  </button>
                ) : (
                  <span className="month-day placeholder" key={`empty-${index}`} aria-hidden="true" />
                )
              )}
            </div>
          </section>

          <CancelledRecords events={cancelledEvents} onRestore={onRestore} onPermanentDelete={onPermanentDelete} />
        </section>
      )}
    </div>
  );
}

function CancelledRecords({
  events,
  onRestore,
  onPermanentDelete
}: {
  events: CalendarEvent[];
  onRestore: (eventId: string) => void;
  onPermanentDelete: (eventId: string) => void;
}) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="cancelled-records" aria-label="已取消记录">
      <div className="cancelled-records-head">
        <h2>已取消记录</h2>
        <span>{events.length} 条</span>
      </div>
      <div className="cancelled-records-list">
        {events.slice(0, 4).map((event) => (
          <article className="cancelled-record" key={event.id}>
            <div>
              <h3>{event.title}</h3>
              <p>
                {formatShortDate(event.startsAt)} {formatTime(event.startsAt)}
              </p>
            </div>
            <div className="cancelled-record-actions">
              <button className="icon-action" type="button" title="恢复记录" aria-label={`恢复${event.title}`} onClick={() => onRestore(event.id)}>
                <RotateCcw size={16} />
              </button>
              <button
                className="icon-action danger"
                type="button"
                title="彻底删除"
                aria-label={`彻底删除${event.title}`}
                onClick={() => onPermanentDelete(event.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function buildMonthDays(monthDate: Date, events: CalendarEvent[]) {
  const monthStart = startOfMonth(monthDate);
  const todayKey = toShanghaiDayKey(new Date());
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const leadingEmptyDays = monthStart.getDay();

  return Array.from({ length: leadingEmptyDays + daysInMonth }, (_, index) => {
    if (index < leadingEmptyDays) {
      return null;
    }

    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), index - leadingEmptyDays + 1);
    const key = toLocalDayKey(date);
    return {
      date,
      key,
      isToday: key === todayKey,
      events: events.filter((event) => dayKey(event.startsAt) === key)
    };
  });
}

function buildWeekDays(selectedDate: Date, events: CalendarEvent[]) {
  const weekStart = new Date(selectedDate);
  weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getTime() + index * dayMs);
    const key = toLocalDayKey(date);
    return {
      date,
      key,
      events: events.filter((event) => dayKey(event.startsAt) === key)
    };
  });
}

function buildPickerYears(year: number) {
  return Array.from({ length: 11 }, (_, index) => year - 5 + index);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toLocalDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dateFromDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addHoursIso(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}
