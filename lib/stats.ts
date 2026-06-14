import type { CalendarEvent } from "@/lib/types";

export function activeEvents(events: CalendarEvent[]) {
  return events.filter((event) => event.status === "active");
}

export function cancelledEvents(events: CalendarEvent[]) {
  return events.filter((event) => event.status === "cancelled");
}

export function sortEventsByTime(events: CalendarEvent[]) {
  return [...events].sort(
    (first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime()
  );
}
