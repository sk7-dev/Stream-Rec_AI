# Movie Recommendations Frontend

React + TypeScript + Vite + Tailwind UI for the recommendation API in `../app`.

## Setup

```bash
npm install
cp .env.example .env   # adjust VITE_API_BASE_URL if the API isn't on localhost:8000
npm run dev
```

Opens on http://localhost:5173. The API must be running (see the repo root
README) and its `CORS_ORIGINS` must include this dev server's origin.

## What it does

- Search for a user by ID, name, or email (`GET /users`)
- Fetch and display their top recommendations (`GET /recommendations/{user_id}`)
- Show whether recommendations come from live Redis data or the offline
  fallback model, and a header badge for overall API/Redis health

## Scripts

- `npm run dev` — dev server with HMR
- `npm run build` — type-check (`tsc -b`) then production build to `dist/`
- `npm run preview` — serve the production build locally
