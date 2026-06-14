const SHANGHAI_OFFSET_MINUTES = 8 * 60;
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function formatDayLabel(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date(iso));
}

export function formatShortDate(iso: string) {
  return formatShanghaiDate(iso);
}

export function formatShanghaiDate(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    month: "numeric",
    day: "numeric"
  }).format(new Date(iso));
}

export function formatTime(iso: string) {
  return formatShanghaiTime(iso);
}

export function formatShanghaiTime(iso: string) {
  const parts = getShanghaiParts(new Date(iso));
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");

  return `${hour}:${minute}`;
}

export function formatShanghaiFullDay(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

export function formatMessageTime(iso: string) {
  return formatShanghaiTime(iso);
}

export function dayKey(iso: string) {
  return toShanghaiDayKey(iso);
}

export function toShanghaiDayKey(value: string | Date) {
  const parts = getShanghaiParts(typeof value === "string" ? new Date(value) : value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function todayLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());
}

export function dateAtLocalHour(base: Date, hour: number, minute = 0) {
  const value = new Date(base);
  value.setHours(hour, minute, 0, 0);
  return toShanghaiIso(value);
}

export function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function toShanghaiIso(date: Date) {
  const parts = getShanghaiParts(date);
  return buildShanghaiIso(parts.year, parts.month, parts.day, parts.hour, parts.minute);
}

export function buildShanghaiIso(year: number, month: number, day: number, hour: number, minute: number) {
  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  const paddedHour = String(hour).padStart(2, "0");
  const paddedMinute = String(minute).padStart(2, "0");

  return `${year}-${paddedMonth}-${paddedDay}T${paddedHour}:${paddedMinute}:00+08:00`;
}

export function isValidShanghaiDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function getShanghaiParts(date: Date) {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MINUTES * 60 * 1000);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}
