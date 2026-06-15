# Timely Deployment Checklist

Timely is a Next.js app with server API routes, so deploy it to a host that supports Next.js server functions. Vercel is the default target for the current app.

## Preflight

- Rotate the local MiniMax/OpenAI API key before production use.
- Do not commit `.env.local`; the repository should only track `.env.example`.
- Run the full local checks before deploying:
  - `npm test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

## Vercel Environment Variables

Set these in the Vercel project for Production and Preview:

```text
OPENAI_BASE_URL=https://api.minimaxi.com/v1
OPENAI_API_KEY=<production-api-key>
OPENAI_MODEL=MiniMax-M3
```

`MINIMAX_API_URL`, `MINIMAX_API_KEY`, and `MINIMAX_MODEL` are also supported by the parser, but prefer the `OPENAI_*` names to match `.env.example`.

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
- Refresh and confirm local records remain in the browser.
