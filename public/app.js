const messages = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const input = document.querySelector("#userInput");
const eventList = document.querySelector("#eventList");
const reminderList = document.querySelector("#reminderList");
const resetButton = document.querySelector("#resetButton");
const todayText = document.querySelector("#todayText");
const navButtons = [...document.querySelectorAll("[data-view]")];
const panels = [...document.querySelectorAll("[data-view-panel]")];

const storageKey = "timely-static-state-v1";

const demoState = {
  events: [
    {
      id: "event-demo-1",
      title: "会议",
      startsAt: "2026-06-13T15:00:00+08:00"
    }
  ],
  reminders: [
    {
      id: "reminder-demo-1",
      title: "会议提醒",
      remindAt: "2026-06-13T14:30:00+08:00"
    }
  ]
};

const state = JSON.parse(localStorage.getItem(storageKey) ?? JSON.stringify(demoState));

todayText.textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long"
}).format(new Date());

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function addMessage(role, content) {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = content;
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
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

function render() {
  eventList.innerHTML = "";
  reminderList.innerHTML = "";

  state.events.forEach((event) => {
    const row = document.createElement("article");
    row.className = "record-row";
    row.innerHTML = `<span>${formatTime(event.startsAt)}</span><div><h3>${event.title}</h3><p>${formatDate(event.startsAt)}</p></div>`;
    eventList.append(row);
  });

  state.reminders.forEach((reminder) => {
    const row = document.createElement("article");
    row.className = "record-row";
    row.innerHTML = `<span>${formatTime(reminder.remindAt)}</span><div><h3>${reminder.title}</h3><p>${formatDate(reminder.remindAt)}</p></div>`;
    reminderList.append(row);
  });
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    return;
  }

  addMessage("user", text);

  if (/会议/.test(text) && /6月13/.test(text)) {
    const item = {
      id: crypto.randomUUID(),
      title: "会议",
      startsAt: `${new Date().getFullYear()}-06-13T15:00:00+08:00`
    };
    state.events.unshift(item);
    addMessage("assistant", "已记录。6月13日下午3点，会议。");
  } else if (/取快递/.test(text) && /提醒/.test(text)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 0, 0, 0);
    state.reminders.unshift({
      id: crypto.randomUUID(),
      title: "取快递",
      remindAt: tomorrow.toISOString()
    });
    addMessage("assistant", "已提醒。明天下午3点，取快递。");
  } else if (/记录.*会议/.test(text)) {
    addMessage("assistant", "什么时候？");
  } else {
    addMessage("assistant", "我可以帮你记录日程或提醒。");
  }

  input.value = "";
  save();
  render();
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    navButtons.forEach((item) => item.classList.toggle("active", item === button));
    panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
  });
});

resetButton.addEventListener("click", () => {
  state.events = [...demoState.events];
  state.reminders = [...demoState.reminders];
  save();
  render();
});

render();
