import type { CalendarEvent, Reminder } from "@/lib/types";

export function activeEvents(events: CalendarEvent[]) {
  return events.filter((event) => event.status === "active");
}

export function activeReminders(reminders: Reminder[]) {
  return reminders.filter((reminder) => reminder.status === "active");
}

export function cancelledEvents(events: CalendarEvent[]) {
  return events.filter((event) => event.status === "cancelled");
}

export function doneReminders(reminders: Reminder[]) {
  return reminders.filter((reminder) => reminder.status === "done");
}

export function sortEventsByTime(events: CalendarEvent[]) {
  return [...events].sort(
    (first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime()
  );
}

export function sortRemindersByTime(reminders: Reminder[]) {
  return [...reminders].sort(
    (first, second) => new Date(first.remindAt).getTime() - new Date(second.remindAt).getTime()
  );
}
