# Litmus web app

The Next.js front end for Litmus. Start with the [project README](../README.md).

```bash
pnpm install
cp .env.example .env.local
pnpm dev        # http://localhost:3000
```

| File | What it is |
|---|---|
| `app/landing.tsx` | Landing page (`/`) |
| `app/shell.tsx` | Sidebar, header and wallet button shared by the app screens |
| `app/courtroom.tsx` | `/app`: vault, active market (five states), stake controls, docket |
| `app/replay.tsx`, `app/how.tsx` | `/replay` and `/how` |
| `app/ui.tsx`, `app/globals.css` | Design system: tokens, buttons, panels, modal, icons, logo |
| `app/lib/adapter.ts` | The only file that knows contract method names, field names and raw units |
| `app/lib/store.ts` | Polling (2 s while a market is open, 10 s idle), reconnect handling, recorded-run player |
| `app/lib/wallet.ts` | Testnet wallet through near-connect, loaded on demand |
| `public/recorded-run.json` | Fallback scenario. Regenerate with `node scripts/make-recorded-run.mjs` |
| `public/replay.json` | Written by `node ../scripts/replay.mjs` |

`/app?speed=10` plays the recorded run ten times faster while developing.
