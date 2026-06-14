# Timely

Timely is a mobile-first Web/PWA client for natural-language personal records.

The product is not a reminder, time-planning, task-priority, focus-timer, or productivity-insight app. The current MVP loop is:

```text
User types a natural-language event record
  -> local parser extracts the time point and title
  -> app saves a local CalendarEvent
  -> user checks it in the record list
```

## Stack

- Next.js 14
- React 18
- TypeScript
- Plain CSS
- lucide-react icons
- Browser localStorage for MVP persistence

## Run Locally

Install and run:

```powershell
npm.cmd install
npm.cmd run dev
```

Then open:

```text
http://localhost:3000
```

## Current MVP Step

The current MVP step focuses on event records:

- Mobile-first Timely app frame
- Bottom navigation: Chat, Records, Settings
- Local event demo data
- Local chat input backed by `lib/event-recording.ts`
- Past and future event time points
- One-turn clarification when the event time is missing
- localStorage persistence under `timely-event-record-state-v1`

## Product Docs

- `PRD.md`: product requirements
- `IMPLEMENTATION_PLAN.md`: phased implementation plan
- `ARCHITECTURE.md`: frontend/backend architecture decision

## Project Structure

```text
app/
  globals.css
  layout.tsx
  page.tsx
components/
  timely-app.tsx
hooks/
  use-local-storage-state.ts
lib/
  event-recording.ts
  seed-data.ts
  stats.ts
  time.ts
  types.ts
tests/
  record-events.test.ts
```
