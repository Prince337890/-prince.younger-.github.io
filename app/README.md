# Forward Motion — VIP Freight Dashboard (React + Vite)

A React/Vite build of the Forward Motion VIP Freight driver dashboard
(lane management, digital vault, financial routing, and VIP concierge views).

## Two ways to run this dashboard

| Path | What it is | When to use |
| --- | --- | --- |
| [`../dashboard.html`](../dashboard.html) | Standalone page that loads React, Tailwind, and lucide via CDN — **no build step** | Already live on GitHub Pages; open it directly |
| This `app/` folder | Full React + Vite + Tailwind project | Local development, adding features, real bundling |

## Local development

```bash
cd app
npm install
npm run dev      # start the dev server (http://localhost:5173)
```

## Production build

```bash
npm run build    # outputs to app/dist/
npm run preview  # preview the production build locally
```

`vite.config.js` uses `base: './'` so the built bundle works from any
sub-path (e.g. served at `/app/` on GitHub Pages) or straight off the
filesystem.

## Stack

- React 18
- Vite 6
- Tailwind CSS 3
- lucide-react (icons)

The UI is identical to `dashboard.html`; the component source lives in
[`src/App.jsx`](src/App.jsx).
