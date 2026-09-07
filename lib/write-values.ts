import { getShanghaiParts, isValidShanghaiDateParts } from "./time";

const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const CHINESE_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9
};
const SMALL_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const LARGE_UNITS: Record<string, bigint> = { 万: BigInt(10000), 亿: BigInt(100000000) };

function moneyFromCents(cents: bigint): number | null {
  if (cents <= BigInt(0) || cents > MAX_SAFE_CENTS) return null;
  return Number(cents);
}

function parseChineseInteger(text: string): bigint | null {
  if (!text) return BigInt(0);
  if (/[十百千][十百千]/.test(text) || /[万亿][万亿]/.test(text)) return null;
  let total = BigInt(0);
  let section = BigInt(0);
  let digit: bigint | null = null;
  for (const char of text) {
    if (char in CHINESE_DIGITS) {
      const next = BigInt(CHINESE_DIGITS[char]);
      if (digit !== null && digit !== BigInt(0)) return null;
      digit = next;
    } else if (char in SMALL_UNITS) {
      const unit = BigInt(SMALL_UNITS[char]);
      section += (digit ?? BigInt(1)) * unit;
      digit = null;
    } else if (char in LARGE_UNITS) {
      section += digit ?? BigInt(0);
      if (section === BigInt(0)) return null;
      total += section * LARGE_UNITS[char];
      section = BigInt(0);
      digit = null;
    } else return null;
  }
  return total + section + (digit ?? BigInt(0));
}

function parseArabic(text: string): number | null {
  const match = /^(?:人民币|￥|¥)?([0-9]+)(?:\.([0-9]{1,2}))?(?:人民币)?(?:元|块钱?|块)?$/.exec(text);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return moneyFromCents(whole * BigInt(100) + BigInt(fraction || "0"));
}

function parseChinese(text: string): number | null {
  if (!/[零〇一二两三四五六七八九十百千万亿]/.test(text)) return null;
  let value = text;
  if (value.startsWith("人民币")) value = value.slice(3);
  let decimal = "";
  const point = value.indexOf("点");
  if (point >= 0) {
    if (value.indexOf("点", point + 1) >= 0) return null;
    decimal = value.slice(point + 1);
    decimal = decimal.replace(/(?:元|块钱|块)$/, "");
    value = value.slice(0, point);
    if (!/^[零〇一二两三四五六七八九]{1,2}$/.test(decimal)) return null;
  }
  let jiao: bigint | null = null;
  let fen: bigint | null = null;
  const suffix = /([零〇一二两三四五六七八九])?(角|毛|分)/g;
  let stripped = value;
  let match: RegExpExecArray | null;
  let lastFractionUnit = 0;
  while ((match = suffix.exec(value))) {
    const amount = BigInt(CHINESE_DIGITS[match[1] ?? "零"]);
    if (match[2] === "分") {
      if (fen !== null || lastFractionUnit > 2) return null;
      fen = amount;
      lastFractionUnit = 2;
    } else {
      if (jiao !== null || lastFractionUnit > 1) return null;
      jiao = amount;
      lastFractionUnit = 1;
    }
    stripped = stripped.replace(match[0], "");
  }
  if (/[角毛分]/.test(stripped)) return null;
  if (stripped.endsWith("元") || stripped.endsWith("块")) stripped = stripped.slice(0, -1);
  else if (stripped.endsWith("块钱")) stripped = stripped.slice(0, -2);
  const integer = parseChineseInteger(stripped);
  if (integer === null) return null;
  let cents = integer * BigInt(100);
  if (point >= 0) {
    if (jiao !== null || fen !== null) return null;
    cents += BigInt((decimal.length === 1 ? decimal : decimal).split("").map((c) => CHINESE_DIGITS[c]).join("")) * (decimal.length === 1 ? BigInt(10) : BigInt(1));
  } else cents += (jiao ?? BigInt(0)) * BigInt(10) + (fen ?? BigInt(0));
  return moneyFromCents(cents);
}

export function parseMoneyText(raw: string): number | null {
  const text = raw.trim();
  if (!text || /[和与至到]/.test(text)) return null;
  return parseArabic(text) ?? parseChinese(text);
}

export type DateExpression =
  | { type: "absolute"; year?: number; month: number; day: number }
  | { type: "relative_day"; offset: number }
  | { type: "relative_month"; offset: number; day: number }
  | { type: "weekday"; weekOffset: number; day: number };

function validOffset(value: number) {
  return Number.isSafeInteger(value);
}

function dateString(year: number, month: number, day: number): string | null {
  if (!isValidShanghaiDateParts(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function resolveCalendarDate(expression: DateExpression, referenceNow: string): string | null {
  const reference = new Date(referenceNow);
  if (Number.isNaN(reference.getTime())) return null;
  const parts = getShanghaiParts(reference);
  if (expression.type === "absolute") return dateString(expression.year ?? parts.year, expression.month, expression.day);
  if (expression.type === "relative_day") {
    if (!validOffset(expression.offset)) return null;
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + expression.offset));
    return dateString(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  if (expression.type === "relative_month") {
    if (!validOffset(expression.offset)) return null;
    const monthIndex = parts.year * 12 + parts.month - 1 + expression.offset;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12 + 1;
    return dateString(year, month, expression.day);
  }
  if (!validOffset(expression.weekOffset) || expression.day < 1 || expression.day > 7) return null;
  const current = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const mondayOffset = (current.getUTCDay() + 6) % 7;
  const target = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + expression.weekOffset * 7 - mondayOffset + expression.day - 1));
  return dateString(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
}
