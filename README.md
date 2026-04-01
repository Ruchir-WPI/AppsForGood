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

- `GET /api/campus/buildings`
  - Returns building metadata used by the indoor map UI.
- `POST /api/route/indoor-ui`
  - Request: `{ "from": "building-id", "to": "building-id" }`
  - Response: `{ "steps": string[], "distanceFt": number, "walkMinutes": number, "waypoints": [{ "x": number, "y": number }] }`
- `GET /api/geocode/suggestions?q=...&limit=5`
  - Returns backend-proxied address suggestions for outdoor search.
- `POST /api/route/outdoor`
  - Request: `{ "start": { "lng": number, "lat": number }, "destination": { "lng": number, "lat": number } }`
  - Response: normalized walking route geometry and turn steps.

### Environment Variables

Set these in the repo-root `.env` (or your process environment):

- `PORT` (optional, defaults to `3001`)
- `MAPBOX_ACCESS_TOKEN` (required for hybrid/outdoor routing and geocode suggestions)
- `MAPBOX_DIRECTIONS_BASE_URL` (optional, defaults to `https://api.mapbox.com`)

Frontend dev server proxy routes `/api/*` to `http://localhost:3001`, so frontend components can call backend endpoints directly during local development.

### Hybrid Route Request Example

```json
{
  "start": {
    "parkingGarageId": "garage-east"
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

### Running Tests

From `backend/`:

```bash
npm test
```

From `frontend/`:

```bash
npm run lint
npm run build
```
