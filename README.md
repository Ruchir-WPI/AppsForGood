# AppsForGood

## Backend Routing API

The backend is a Node.js + Express service in `backend/`.

### Core Endpoints

- `GET /health` returns `{ "status": "ok" }`
- `GET /api/health` returns `{ "status": "ok" }`
- `POST /route` and `POST /api/route` support:
  - indoor-only routing (legacy behavior)
  - hybrid routing (outdoor via Mapbox + indoor via A*)

### Frontend Integration Endpoints

- `GET /api/campus/indoor-map`
  - Returns the indoor map payload used by the current React UI:
    - `buildings`
    - `floors`
    - `rooms`
    - `nodes`
    - `edges`
    - `entrances`
    - `outdoorPoints`
- `POST /api/route`
  - Used by the indoor map UI for graph-based indoor routing.
  - `start` and `destination` each accept either `{ "nodeId": "..." }` or `{ "roomId": "..." }`
  - Optional fields:
    - `buildingId`
    - `options` such as `{ "wheelchairRequired": true }`
  - Response:
    - indoor-only route payload for indoor requests
    - hybrid route payload when `start` includes `coordinates` or `parkingGarageId`
- `GET /api/geocode/suggestions?q=...&limit=5`
  - Returns backend-proxied address suggestions for outdoor search.
- `GET /api/geocode/resolve?q=...`
  - Resolves a typed Massachusetts place/address to a single coordinate result.
- `POST /api/route/outdoor`
  - Request: `{ "start": { "lng": number, "lat": number }, "destination": { "lng": number, "lat": number } }`
  - Response: normalized walking route geometry and turn steps.
- `GET /api/campus/buildings`
  - Returns lightweight building metadata from the indoor UI preview service.
  - Available in the backend, but not used by the current React app.
- `POST /api/route/indoor-ui`
  - Lightweight preview route service.
  - Available in the backend, but not used by the current React app.
  - Request: `{ "from": "building-id", "to": "building-id" }`
  - Response: `{ "steps": string[], "distanceFt": number, "walkMinutes": number, "waypoints": [{ "x": number, "y": number }] }`

### Environment Variables

Set these in the repo-root `.env` (or your process environment):

- `PORT` (optional, defaults to `3001`)
- `MAPBOX_ACCESS_TOKEN` (required for hybrid/outdoor routing and geocode suggestions)
- `VITE_MAPBOX_TOKEN` (required by the frontend `mapbox-gl` map)
- `MAPBOX_DIRECTIONS_BASE_URL` (optional, defaults to `https://api.mapbox.com`)

If you are using one Mapbox token for both frontend and backend, set both `MAPBOX_ACCESS_TOKEN` and `VITE_MAPBOX_TOKEN` to the same value.

Frontend dev server proxy routes `/api/*` to `http://localhost:3001`, so frontend components can call backend endpoints directly during local development. The Vite config reads env vars from the repo root.

### Hybrid Route Request Example

```json
{
  "start": {
    "parkingGarageId": "garage-main"
  },
  "destination": {
    "roomId": "room-202"
  },
  "options": {
    "wheelchairRequired": true
  }
}
```

`start.coordinates` can be provided directly (`{ "lng": ..., "lat": ... }`) to bypass any geocoding.

### Hybrid Route Response Shape

The response includes:

- `selectedEntrance`
- `legs[0]` outdoor Mapbox walking leg (`distanceMeters`, `durationSeconds`, `geometry`, `steps`)
- `legs[1]` indoor A* leg (`nodePath`, indoor steps, indoor distance)
- stitched `steps`
- `summary` and `metadata`

Outdoor routing uses Mapbox pedestrian walking directions. Indoor accessibility constraints are enforced through the internal graph and wheelchair-accessible entrance filtering.

### Running Checks

From `backend/`:

```bash
npm test
```

From `frontend/`:

```bash
npm test
npm run lint
npm run build
```

## Vercel Deployment (Monorepo Services)

This repo is configured with root-level `vercel.json` using `experimentalServices`:

- frontend service
  - entrypoint: `frontend`
  - framework: `vite`
  - route prefix: `/`
- backend service
  - entrypoint: `backend`
  - route prefix: `/_/backend`

### 1. Import The Repo In Vercel

1. Create a new Vercel project and import this repository.
2. Keep the repo root as the project root.
3. Vercel will read `vercel.json` and create the frontend/backend services routing.

### 2. Add Environment Variables In Vercel

Set these for Production (and Preview if desired):

- `MAPBOX_ACCESS_TOKEN`
- `VITE_MAPBOX_TOKEN`
- optional: `MAPBOX_DIRECTIONS_BASE_URL` (defaults to `https://api.mapbox.com`)
- optional override: `VITE_API_BASE`

`VITE_API_BASE` is optional because frontend defaults are:

- local dev: `/api`
- production build: `/_/backend/api`

### 3. Deploy

Deploy from Vercel UI or CLI:

```bash
npm i -g vercel
vercel
vercel --prod
```

### 4. Post-Deploy Checks

- Frontend loads at your Vercel domain.
- Backend health endpoint responds at:
  - `https://<your-domain>/_/backend/api/health`
- Outdoor routing and geocode work (requires valid Mapbox token).
