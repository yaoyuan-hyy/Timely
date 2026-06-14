const messages = document.querySelector("#messages");
const homePrompt = document.querySelector("#homePrompt");
const composer = document.querySelector("#composer");
const input = document.querySelector("#userInput");
const calendarView = document.querySelector("#calendarView");
const resetButton = document.querySelector("#resetButton");
const todayText = document.querySelector("#todayText");
const clearChatButton = document.querySelector("#clearChatButton");
const menuButton = document.querySelector("#menuButton");
const drawer = document.querySelector("#drawer");
const drawerBackdrop = document.querySelector("#drawerBackdrop");
const drawerClose = document.querySelector("#drawerClose");
const voiceButton = document.querySelector("#voiceButton");
const navButtons = [...document.querySelectorAll("[data-view]")];
const panels = [...document.querySelectorAll("[data-view-panel]")];

const storageKey = "timely-static-event-record-state-v1";
const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];
const dayMs = 24 * 60 * 60 * 1000;

const demoState = {
  events: [
    {
      id: "event-demo-1",
      title: "会议",
      startsAt: "2026-06-13T15:00:00+08:00",
      sourceText: "帮我记录一下6月13号下午3点有一个会议"
    },
    {
      id: "event-demo-2",
      title: "复盘",
      startsAt: "2026-06-09T16:00:00+08:00",
      sourceText: "帮我记录6月9日下午4点复盘"
    }
  ],
  pendingClarification: null,
  hasConversation: false
};

const state = JSON.parse(localStorage.getItem(storageKey) ?? JSON.stringify(demoState));
let calendarMonth = startOfMonth(new Date());
let selectedDayKey = null;
let yearPickerOpen = false;
let monthPickerOpen = false;
let isSubmitting = false;

todayText.textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long"
}).format(new Date());

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function openDrawer() {
  drawer.classList.add("open");
  drawerBackdrop.classList.add("open");
  menuButton.setAttribute("aria-expanded", "true");
}

function closeDrawer() {
  drawer.classList.remove("open");
  drawerBackdrop.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
}

function updateClearChatButton() {
  clearChatButton.disabled = !state.hasConversation && !state.pendingClarification;
}

function clearChatHistory() {
  state.pendingClarification = null;
  state.hasConversation = false;
  messages.innerHTML = "";
  voiceButton.setAttribute("aria-pressed", "false");
  input.placeholder = "记录某个时间点发生的事...";
  save();
  render();
}

function addMessage(role, content) {
  state.hasConversation = true;
  homePrompt.classList.add("hidden");
  messages.classList.remove("hidden");

  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = content;
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  updateClearChatButton();
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric"
  }).format(new Date(iso));
}

function dayKeyFromIso(iso) {
  const date = new Date(iso);
  return toDayKey(date);
}

function toDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function eventsForDay(key) {
  return [...state.events]
    .filter((event) => event.status !== "cancelled" && dayKeyFromIso(event.startsAt) === key)
    .sort((first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime());
}

function parseDateTime(text) {
  const now = new Date();
  const date = parseDate(text, now);
  const time = parseTime(text);

  if (!date || !time) {
    return null;
  }

  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}T${String(
    time.hour
  ).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:00+08:00`;
}

function parseDate(text, now) {
  const year = now.getFullYear();
  const explicitYear = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})[日号]?/);
  if (explicitYear) {
    return { year: Number(explicitYear[1]), month: Number(explicitYear[2]), day: Number(explicitYear[3]) };
  }

  const monthDay = text.match(/(\d{1,2})月\s*(\d{1,2})[日号]?/);
  if (monthDay) {
    return { year, month: Number(monthDay[1]), day: Number(monthDay[2]) };
  }

  if (/今天|明天|昨天/.test(text)) {
    const value = new Date(now);
    if (/明天/.test(text)) value.setDate(value.getDate() + 1);
    if (/昨天/.test(text)) value.setDate(value.getDate() - 1);
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }

  const weekday = text.match(/(上|下|这|本)?(?:周|星期|礼拜)([日天一二三四五六])/);
  if (weekday) {
    const indexByText = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
    const targetDay = indexByText[weekday[2]] ?? 0;
    const value = new Date(now);
    let delta = targetDay - value.getDay();
    if (weekday[1] === "下") delta += 7;
    if (weekday[1] === "上") delta -= 7;
    if (!weekday[1] && delta < 0) delta += 7;
    value.setDate(value.getDate() + delta);
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }

  const dayOnly = text.match(/(\d{1,2})[日号]/);
  if (dayOnly) {
    return { year, month: now.getMonth() + 1, day: Number(dayOnly[1]) };
  }

  return null;
}

function parseTime(text) {
  const colonTime = text.match(/([01]?\d|2[0-3])[:：]([0-5]\d)/);
  if (colonTime) {
    return normalizeHour(text, Number(colonTime[1]), Number(colonTime[2]));
  }

  const hourTime = text.match(/(\d{1,2})点(?:(半)|(\d{1,2})分?)?/);
  if (!hourTime) {
    const chineseHourTime = text.match(/([零〇一二两三四五六七八九十]{1,3})点(?:(半)|([零〇一二两三四五六七八九十]{1,3})分?)?/);
    if (!chineseHourTime) {
      return null;
    }

    const hour = parseChineseNumber(chineseHourTime[1]);
    const minute = chineseHourTime[2] ? 30 : parseChineseNumber(chineseHourTime[3] ?? "零");
    if (hour === null || minute === null) {
      return null;
    }

    return normalizeHour(text, hour, minute);
  }

  return normalizeHour(text, Number(hourTime[1]), hourTime[2] ? 30 : Number(hourTime[3] ?? 0));
}

function parseChineseNumber(text) {
  const digits = { 零: 0, "〇": 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (text === "十") return 10;
  if (text.startsWith("十")) return 10 + (digits[text[1]] ?? 0);
  if (text.includes("十")) {
    const [tens, ones = ""] = text.split("十");
    return (digits[tens] ?? 0) * 10 + (ones ? digits[ones] ?? 0 : 0);
  }
  return digits[text] ?? null;
}

function normalizeHour(text, hour, minute) {
  let value = hour;
  if (/(下午|晚上|傍晚)/.test(text) && value < 12) value += 12;
  if (/中午/.test(text) && value > 0 && value < 11) value += 12;
  return { hour: value, minute };
}

function extractTitle(text) {
  return text
    .replace(/\d{4}年\s*\d{1,2}月\s*\d{1,2}[日号]?/g, "")
    .replace(/\d{1,2}月\s*\d{1,2}[日号]?/g, "")
    .replace(/(上|下|这|本)?(?:周|星期|礼拜)[日天一二三四五六]/g, "")
    .replace(/今天|明天|昨天/g, "")
    .replace(/(?:上午|早上|下午|晚上|傍晚|中午)?\d{1,2}[:：][0-5]\d/g, "")
    .replace(/(?:上午|早上|下午|晚上|傍晚|中午)?\d{1,2}点(?:半|\d{1,2}分?)?/g, "")
    .replace(/(?:上午|早上|下午|晚上|傍晚|中午)?[零〇一二两三四五六七八九十]{1,3}点(?:半|[零〇一二两三四五六七八九十]{1,3}分?)?/g, "")
    .replace(/^(请|麻烦)?(帮我|给我)?(记录一下|记录|记一下|记一笔|记|新增|添加|加一个|加个|加)(一下)?/g, "")
    .replace(/^(有一个|有个|一个|一场|一次|有)/g, "")
    .replace(/[，。,.、；;：:\s]/g, "")
    .replace(/^(有一个|有个|一个|一场|一次|有)/g, "")
    .replace(/^的/g, "")
    .trim();
}

function extractDeleteTitle(text) {
  return extractTitle(text)
    .replace(/(上|下|这|本)?(?:周|星期|礼拜)[日天一二三四五六]/g, "")
    .replace(/(\d{1,2})[日号]/g, "")
    .replace(/(?:到|至|-|—)\s*(?:上午|早上|下午|晚上|傍晚|中午)?\d{1,2}点(?:半|\d{1,2}分?)?/g, "")
    .replace(/^(请|麻烦)?(帮我|给我)?把?/g, "")
    .replace(/(帮我|给我|把)/g, "")
    .replace(/(删除|删掉|删了|清除|取消|移除|去掉)(一下|了)?/g, "")
    .replace(/(这个|那个|这条|那条|的|记录|事件|日程)/g, "")
    .replace(/[，。,.、；;：:\s]/g, "")
    .trim();
}

function setSubmitting(value) {
  isSubmitting = value;
  input.disabled = value;
  voiceButton.disabled = value;
  input.placeholder = value ? "正在记录..." : "记录某个时间点发生的事...";
}

function isAiEventParseResult(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ["create_event", "delete_event", "needs_clarification", "unsupported"].includes(value.intent)
  );
}

async function requestAiEventParse(text) {
  const response = await fetch("/api/record-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ input: text })
  });

  if (!response.ok) {
    throw new Error("AI event parsing failed");
  }

  const data = await response.json();
  if (!isAiEventParseResult(data.result)) {
    throw new Error("AI event parsing returned invalid result");
  }

  return data.result;
}

function recordEvent(title, startsAt, sourceText, details = {}) {
  const now = new Date().toISOString();

  state.events.unshift({
    id: crypto.randomUUID(),
    title,
    startsAt,
    endsAt: details.endsAt ?? null,
    location: details.location ?? null,
    notes: details.notes ?? null,
    status: "active",
    sourceText,
    createdAt: now,
    updatedAt: now
  });
  addMessage("assistant", `已记录。${formatDate(startsAt)} ${formatTime(startsAt)}，${title}。`);
}

function deleteEvent(title, targetDate, startsAt) {
  const normalizedTitle = title.replace(/[，。,.、；;：:\s]/g, "");
  const matches = state.events.filter((event) => {
    if (event.status === "cancelled") return false;
    if (targetDate && dayKeyFromIso(event.startsAt) !== targetDate) return false;
    if (startsAt && formatTime(event.startsAt) !== formatTime(startsAt)) return false;
    const eventTitle = event.title.replace(/[，。,.、；;：:\s]/g, "");
    return eventTitle.includes(normalizedTitle) || normalizedTitle.includes(eventTitle) || (/会议|开会/.test(eventTitle) && /会议|开会/.test(normalizedTitle));
  });

  if (matches.length === 0) {
    addMessage("assistant", "没找到这条记录。");
    return;
  }

  if (matches.length > 1 && !startsAt) {
    state.pendingClarification = { title, targetDate, sourceText: title, kind: "event_delete" };
    addMessage("assistant", `这天有多条${title}记录，请再告诉我是几点的。`);
    return;
  }

  const event = matches[0];
  event.status = "cancelled";
  event.updatedAt = new Date().toISOString();
  state.pendingClarification = null;
  addMessage("assistant", `已删除。${formatDate(event.startsAt)} ${formatTime(event.startsAt)}，${event.title}。`);
}

function resolveDeleteInput(text) {
  const date = parseDate(text, new Date());
  const time = parseTime(text);
  const targetDate = date
    ? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`
    : state.pendingClarification?.targetDate ?? null;
  const startsAt =
    date && time
      ? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}T${String(
          time.hour
        ).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:00+08:00`
      : null;
  const title = extractDeleteTitle(text) || state.pendingClarification?.title;

  if (!title) {
    addMessage("assistant", "删除什么？");
    return;
  }

  if (!targetDate && !startsAt) {
    state.pendingClarification = { title, targetDate: null, sourceText: text, kind: "event_delete" };
    addMessage("assistant", "什么时候？");
    return;
  }

  deleteEvent(title, targetDate, startsAt);
}

function resolveLocalInput(text) {
  if (/(删除|删掉|删了|清除|取消|移除|去掉)/.test(text) || state.pendingClarification?.kind === "event_delete") {
    resolveDeleteInput(text);
  } else if (/提醒/.test(text)) {
    addMessage("assistant", "我可以帮你记录事件。");
  } else if (state.pendingClarification) {
    const startsAt = parseDateTime(`${state.pendingClarification.sourceText} ${text}`) ?? parseDateTime(text);
    if (startsAt) {
      recordEvent(state.pendingClarification.title, startsAt, `${state.pendingClarification.sourceText} ${text}`);
      state.pendingClarification = null;
    } else {
      addMessage("assistant", "什么时候？");
    }
  } else {
    const startsAt = parseDateTime(text);
    const title = extractTitle(text);

    if (startsAt && title) {
      recordEvent(title, startsAt, text);
    } else if (startsAt && !title) {
      addMessage("assistant", "记录什么？");
    } else if (title && /(记录|记一下|记一笔|会议|有个|有一个)/.test(text)) {
      state.pendingClarification = { title, sourceText: text };
      addMessage("assistant", "什么时候？");
    } else {
      addMessage("assistant", "我可以帮你记录事件。");
    }
  }
}

function render() {
  homePrompt.classList.toggle("hidden", state.hasConversation);
  messages.classList.toggle("hidden", !state.hasConversation);
  updateClearChatButton();
  renderCalendar();
}

function renderCalendar() {
  if (selectedDayKey) {
    const selectedDate = dateFromDayKey(selectedDayKey);
    const selectedEvents = eventsForDay(selectedDayKey);
    const weekStart = new Date(selectedDate);
    weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
    const weekDays = Array.from({ length: 7 }, (_, index) => new Date(weekStart.getTime() + index * dayMs));

    calendarView.innerHTML = `
      <section class="day-detail">
        <div class="calendar-toolbar">
          <button class="calendar-pill" id="backToMonth" type="button">‹ ${calendarMonth.getMonth() + 1}月</button>
          <button class="calendar-pill compact" id="todayButton" type="button">今天</button>
        </div>
        <div class="week-strip">
          ${weekDays
            .map((date) => {
              const key = toDayKey(date);
              const hasEvents = eventsForDay(key).length > 0;
              return `<button class="week-day ${key === selectedDayKey ? "selected" : ""} ${hasEvents ? "has-events" : ""}" data-day="${key}" type="button"><span>${weekLabels[date.getDay()]}</span><strong>${date.getDate()}</strong></button>`;
            })
            .join("")}
        </div>
        <div class="day-title">
          <h2>${new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(
            selectedDate
          )}</h2>
          <p>${selectedEvents.length ? `${selectedEvents.length} 条记录` : "这天暂无记录"}</p>
        </div>
        <div class="timeline-grid">
          ${Array.from({ length: 24 }, (_, hour) => {
            const hourEvents = selectedEvents.filter((event) => new Date(event.startsAt).getHours() === hour);
            return `<section class="timeline-hour"><time>${String(hour).padStart(2, "0")}:00</time><div class="timeline-lane">${hourEvents
              .map(
                (event) =>
                  `<article class="timeline-event"><div><h3>${event.title}</h3><p>${formatTime(event.startsAt)} - ${String(
                    (hour + 1) % 24
                  ).padStart(2, "0")}:00</p></div></article>`
              )
              .join("")}</div></section>`;
          }).join("")}
        </div>
      </section>`;

    calendarView.querySelector("#backToMonth").addEventListener("click", () => {
      selectedDayKey = null;
      renderCalendar();
    });
    calendarView.querySelector("#todayButton").addEventListener("click", () => {
      const today = new Date();
      calendarMonth = startOfMonth(today);
      selectedDayKey = toDayKey(today);
      renderCalendar();
    });
    calendarView.querySelectorAll("[data-day]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedDayKey = button.dataset.day;
        renderCalendar();
      });
    });
    return;
  }

  const monthStart = startOfMonth(calendarMonth);
  const todayKey = toDayKey(new Date());
  const months = Array.from({ length: 13 }, (_, index) => addMonths(monthStart, index - 6));
  const pickerYears = Array.from({ length: 11 }, (_, index) => calendarMonth.getFullYear() - 5 + index);

  calendarView.innerHTML = `
    <section class="calendar-month">
      <div class="calendar-toolbar">
        <div class="calendar-picker-wrap">
          <button class="year-select" id="yearSelect" type="button" aria-expanded="${yearPickerOpen}">${calendarMonth.getFullYear()}年</button>
          ${
            yearPickerOpen
              ? `<div class="calendar-picker year-picker">${pickerYears
                  .map(
                    (year) =>
                      `<button class="${year === calendarMonth.getFullYear() ? "selected" : ""}" data-year="${year}" type="button">${year}</button>`
                  )
                  .join("")}</div>`
              : ""
          }
        </div>
        <button class="calendar-pill compact" id="todayMonthButton" type="button">今天</button>
      </div>
      <div class="month-heading">
        <div class="calendar-picker-wrap month-picker-wrap">
          <button class="month-select" id="monthSelect" type="button" aria-expanded="${monthPickerOpen}">${calendarMonth.getMonth() + 1}月</button>
          ${
            monthPickerOpen
              ? `<div class="calendar-picker month-picker">${Array.from({ length: 12 }, (_, index) =>
                  `<button class="${index === calendarMonth.getMonth() ? "selected" : ""}" data-month="${index}" type="button">${index + 1}月</button>`
                ).join("")}</div>`
              : ""
          }
        </div>
      </div>
      <div class="calendar-scroll">
        ${months
          .map((month) => {
            const gridStart = new Date(month);
            gridStart.setDate(month.getDate() - month.getDay());
            const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getTime() + index * dayMs));
            const isCurrent = month.getTime() === monthStart.getTime();
            return `<section class="calendar-month-section" ${isCurrent ? 'data-current-month="true"' : ""}>
              <h3>${month.getFullYear()}年 ${month.getMonth() + 1}月</h3>
              <div class="weekday-row">${weekLabels.map((label) => `<span>${label}</span>`).join("")}</div>
              <div class="month-grid">
                ${days
                  .map((date) => {
                    const key = toDayKey(date);
                    const count = eventsForDay(key).length;
                    return `<button class="month-day ${date.getMonth() === month.getMonth() ? "" : "muted"} ${
                      key === todayKey ? "today" : ""
                    } ${count ? "has-events" : ""}" data-day="${key}" type="button"><strong>${date.getDate()}</strong><span>${
                      count ? `${count}条` : ""
                    }</span>${count ? "<i></i>" : ""}</button>`;
                  })
                  .join("")}
              </div>
            </section>`;
          })
          .join("")}
      </div>
    </section>`;

  calendarView.querySelector("#yearSelect").addEventListener("click", () => {
    yearPickerOpen = !yearPickerOpen;
    monthPickerOpen = false;
    renderCalendar();
  });
  calendarView.querySelector("#monthSelect").addEventListener("click", () => {
    monthPickerOpen = !monthPickerOpen;
    yearPickerOpen = false;
    renderCalendar();
  });
  calendarView.querySelectorAll("[data-year]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarMonth = startOfMonth(new Date(Number(button.dataset.year), calendarMonth.getMonth(), 1));
      yearPickerOpen = false;
      renderCalendar();
    });
  });
  calendarView.querySelectorAll("[data-month]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarMonth = startOfMonth(new Date(calendarMonth.getFullYear(), Number(button.dataset.month), 1));
      monthPickerOpen = false;
      renderCalendar();
    });
  });
  calendarView.querySelector("#todayMonthButton").addEventListener("click", () => {
    const today = new Date();
    calendarMonth = startOfMonth(today);
    selectedDayKey = toDayKey(today);
    renderCalendar();
  });
  calendarView.querySelectorAll("[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDayKey = button.dataset.day;
      calendarMonth = startOfMonth(dateFromDayKey(selectedDayKey));
      renderCalendar();
    });
  });
  calendarView.querySelector("[data-current-month]")?.scrollIntoView({ block: "start" });
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text || isSubmitting) {
    return;
  }

  input.value = "";
  voiceButton.setAttribute("aria-pressed", "false");
  addMessage("user", text);
  setSubmitting(true);

  try {
    const result = await requestAiEventParse(text);
    if (result.intent === "create_event" && result.title && result.startsAt) {
      state.pendingClarification = null;
      recordEvent(result.title, result.startsAt, text, {
        endsAt: result.endsAt,
        location: result.location,
        notes: result.notes
      });
    } else if (result.intent === "delete_event" && result.title && (result.targetDate || result.startsAt)) {
      deleteEvent(result.title, result.targetDate ?? result.startsAt.slice(0, 10), result.startsAt);
    } else {
      resolveLocalInput(text);
    }
  } catch {
    resolveLocalInput(text);
  } finally {
    setSubmitting(false);
    save();
    render();
  }
});

menuButton.addEventListener("click", openDrawer);
clearChatButton.addEventListener("click", clearChatHistory);
drawerBackdrop.addEventListener("click", closeDrawer);
drawerClose.addEventListener("click", closeDrawer);

voiceButton.addEventListener("click", () => {
  const nextValue = voiceButton.getAttribute("aria-pressed") !== "true";
  voiceButton.setAttribute("aria-pressed", String(nextValue));
  input.placeholder = nextValue ? "正在听..." : "记录某个时间点发生的事...";
  input.focus();
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    navButtons.forEach((item) => item.classList.toggle("active", item === button));
    panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
    closeDrawer();
  });
});

resetButton.addEventListener("click", () => {
  state.events = [...demoState.events];
  state.pendingClarification = null;
  state.hasConversation = false;
  messages.innerHTML = "";
  save();
  render();
});

render();
