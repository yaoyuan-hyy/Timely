# Timely Deployment Checklist

Timely is a Next.js app with server API routes, so deploy it to a host that supports Next.js server functions. Vercel is the default target for the current app.

## Preflight

- Do not commit `.env.local`; the repository should only track `.env.example`.
- Run the full local checks before deploying:
  - `npm test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

## Vercel Environment Variables

Set these in the Vercel project for Production and Preview:

```text
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=<production-api-key>
DEEPSEEK_MODEL=deepseek-v4-flash
```

Only the `DEEPSEEK_*` variables configure the parser. Tokens stay on the server; do not use a `NEXT_PUBLIC_` prefix.

## Deploy

1. Push the repository to GitHub.
2. Import `yaoyuan-hyy/Timely` into Vercel.
3. Keep the detected framework as Next.js.
4. Use the default build command: `npm run build`.
5. Add the environment variables above before the first production deploy.

## Smoke Test

After deployment:

- Open the app on the Vercel URL.
- Create an event: `明天下午六点去广州`.
- Create a ledger entry: `机票花了我600`.
- Verify both first appear as previews, and only appear in calendar/ledger after confirmation.
- Edit `上一笔改成580元`; verify the same record changes only after confirming.
- Submit the same event again and check the duplicate warning before choosing whether to save.
- Open a recent/search/query result and verify its calendar day or ledger month.
- Export a Settings backup, select it for import, inspect the counts, then confirm. Importing the same backup again must add no same-ID records.
- Refresh and confirm local records remain in the browser.

## Recovery and backup behavior

Provider requests explicitly use `cache: no-store`, with a 15-second server timeout and a 20-second client timeout. Provider errors, timeouts and invalid responses fall back locally with a visible retry action. Valid clarifications or unsupported results are preserved rather than silently creating records. Retry reuses the original input and clarification context; a preview is never a saved record.

Backups use `format: timely-records`, `version: 1`, strict record validation and a 10 MB limit. Imports merge after preview and confirmation, preserving current values on same-ID conflicts. They do not restore conversations, pending operations or credentials. Data is tied to the browser origin; changing domain or clearing browser storage does not transfer it automatically.
