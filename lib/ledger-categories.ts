export const LEDGER_CATEGORY_NAMES = ["餐饮", "购物", "交通", "家居", "日用", "医疗", "娱乐", "工资", "报销", "奖金", "退款", "兼职", "未分类"] as const;
export type LedgerCategory = typeof LEDGER_CATEGORY_NAMES[number];
export function isLedgerCategory(value: string): value is LedgerCategory {
  return LEDGER_CATEGORY_NAMES.some(name => name === value);
}
type Direction = "expense" | "income";

export const LEDGER_CATEGORIES: Record<LedgerCategory, { id: string; direction: Direction | "both"; description: string }> = {
  餐饮: { id: "food", direction: "expense", description: "用餐、食品和饮料支出" },
  购物: { id: "shopping", direction: "expense", description: "服饰、数码等个人商品购买；家庭用品优先归家居或日用" },
  交通: { id: "transport", direction: "expense", description: "出行、公共交通、车辆运行与停车支出" },
  家居: { id: "home", direction: "expense", description: "家具、家电、装修等家庭耐用品和改善支出" },
  日用: { id: "daily", direction: "expense", description: "清洁、洗护等日常消耗品支出" },
  医疗: { id: "health", direction: "expense", description: "诊疗、药品与医疗服务支出" },
  娱乐: { id: "entertainment", direction: "expense", description: "休闲娱乐与文娱活动支出" },
  工资: { id: "salary", direction: "income", description: "固定薪酬收入，不含另行发放的奖金" },
  报销: { id: "reimbursement", direction: "income", description: "已垫付费用的报销款收入" },
  奖金: { id: "bonus", direction: "income", description: "奖金、奖励金收入" },
  退款: { id: "refund", direction: "income", description: "购买取消、退货等返还的款项" },
  兼职: { id: "side_income", direction: "income", description: "兼职和临时劳务收入" },
  未分类: { id: "uncategorized", direction: "both", description: "信息不足或不属于现有分类；保留具体事项，不猜测其他分类" }
};

export function categoriesForDirection(direction: Direction): LedgerCategory[] {
  return LEDGER_CATEGORY_NAMES.filter(name => LEDGER_CATEGORIES[name].direction === direction || LEDGER_CATEGORIES[name].direction === "both");
}

export function categoryMatchesDirection(category: string, direction: Direction): boolean {
  return isLedgerCategory(category) && (LEDGER_CATEGORIES[category].direction === direction || LEDGER_CATEGORIES[category].direction === "both");
}

// Exact historical labels only. This is a compatibility dictionary, not an input parser.
const legacyLabels: Record<string, LedgerCategory> = {
  午饭: "餐饮", 晚饭: "餐饮", 早饭: "餐饮", 早餐: "餐饮", 午餐: "餐饮", 晚餐: "餐饮", 外卖: "餐饮", 咖啡: "餐饮", 奶茶: "餐饮",
  打车: "交通", 地铁: "交通", 公交: "交通", 车费: "交通", 薪水: "工资", 薪资: "工资"
};
export function canonicalCategory(value: string): LedgerCategory | null {
  const name = value.trim();
  return isLedgerCategory(name) ? name : Object.prototype.hasOwnProperty.call(legacyLabels, name) ? legacyLabels[name] : LEDGER_CATEGORY_NAMES.find(label => LEDGER_CATEGORIES[label].id === name) ?? null;
}

export function sameLedgerCategory(stored: string, requested: string): boolean {
  const left = canonicalCategory(stored), right = canonicalCategory(requested);
  return left && right ? LEDGER_CATEGORIES[left].id === LEDGER_CATEGORIES[right].id : stored === requested;
}

export const LEDGER_CATEGORY_CONTRACT = `流水分类契约 v1：category 只能使用以下标准名称；按含义选择，具体事项写入 note（原文摘取），分类未知用未分类，不生成新的分类名称。查询 filters.category 使用同一标准名称，未限定分类用 null，不能扩大或改写用户范围。\n${JSON.stringify(LEDGER_CATEGORIES)}`;
