# Timely

Timely is a mobile-first Web/PWA client for natural-language calendar recording and reminders.

The product is not a time-planning, task-priority, focus-timer, or productivity-insight app. Its MVP loop is:

```text
User types a natural-language note
  -> local Agent / AI Agent parses it
  -> app saves an internal calendar event or reminder
  -> user checks it in the mobile client
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

The first MVP step resets the old planner direction and creates the mobile client shell:

- Mobile-first Timely app frame
- Bottom navigation: Chat, Calendar, Reminders, Settings
- Internal calendar demo data
- Reminder demo data
- Local chat input with a small rule-based parser for PRD examples
- localStorage persistence under `timely-mobile-state-v1`

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
  seed-data.ts
  stats.ts
  time.ts
  types.ts
```
