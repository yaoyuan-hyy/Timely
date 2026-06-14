const STATIC_PREVIEW_ONLY = true;

const homePrompt = document.querySelector("#homePrompt");
const messages = document.querySelector("#messages");
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

const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];
const dayMs = 24 * 60 * 60 * 1000;
const demoEvents = [
  {
    id: "event-demo-1",
    title: "会议",
    startsAt: "2026-06-13T15:00:00+08:00"
  },
  {
    id: "event-demo-2",
    title: "复盘",
    startsAt: "2026-06-09T16:00:00+08:00"
  }
];

let calendarMonth = startOfMonth(new Date());
let selectedDayKey = null;
let yearPickerOpen = false;
let monthPickerOpen = false;

todayText.textContent = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "long"
}).format(new Date());

input.disabled = STATIC_PREVIEW_ONLY;
input.placeholder = "静态预览：请使用 Next.js 应用记录事件";
voiceButton.disabled = STATIC_PREVIEW_ONLY;
voiceButton.title = "静态预览不包含语音输入";
voiceButton.setAttribute("aria-label", "静态预览不包含语音输入");
clearChatButton.disabled = true;

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

function switchView(view) {
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === view);
  });
  closeDrawer();
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

function dayKeyFromIso(iso) {
  return iso.slice(0, 10);
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
  return demoEvents
    .filter((event) => dayKeyFromIso(event.startsAt) === key)
    .sort((first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime());
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
          <h2>${new Intl.DateTimeFormat("zh-CN", {
            timeZone: "Asia/Shanghai",
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long"
          }).format(selectedDate)}</h2>
          <p>${selectedEvents.length ? `${selectedEvents.length} 条示例记录` : "这天暂无示例记录"}</p>
        </div>
        <div class="timeline-grid">
          ${Array.from({ length: 24 }, (_, hour) => {
            const hourEvents = selectedEvents.filter((event) => Number(event.startsAt.slice(11, 13)) === hour);
            return `<section class="timeline-hour"><time>${String(hour).padStart(2, "0")}:00</time><div class="timeline-lane">${hourEvents
              .map(
                (event) =>
                  `<article class="timeline-event"><div><h3>${event.title}</h3><p>${formatTime(event.startsAt)}</p></div></article>`
              )
              .join("")}</div></section>`;
          }).join("")}
        </div>
      </section>`;

    calendarView.querySelector("#backToMonth").addEventListener("click", () => {
      selectedDayKey = null;
      renderCalendar();
    });
    calendarView.querySelector("#todayButton").addEventListener("click", jumpToday);
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
  calendarView.querySelector("#todayMonthButton").addEventListener("click", jumpToday);
  calendarView.querySelectorAll("[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDayKey = button.dataset.day;
      calendarMonth = startOfMonth(dateFromDayKey(selectedDayKey));
      renderCalendar();
    });
  });
  calendarView.querySelector("[data-current-month]")?.scrollIntoView({ block: "start" });
}

function jumpToday() {
  const today = new Date();
  calendarMonth = startOfMonth(today);
  selectedDayKey = toDayKey(today);
  renderCalendar();
}

function resetPreview() {
  calendarMonth = startOfMonth(new Date());
  selectedDayKey = null;
  yearPickerOpen = false;
  monthPickerOpen = false;
  homePrompt.classList.remove("hidden");
  messages.classList.add("hidden");
  messages.innerHTML = "";
  renderCalendar();
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
});
menuButton.addEventListener("click", openDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);
drawerClose.addEventListener("click", closeDrawer);
clearChatButton.addEventListener("click", resetPreview);
resetButton.addEventListener("click", resetPreview);
navButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

renderCalendar();
