# AppsForGood

## Backend Routing API

The backend is a Node.js + Express service in `backend/` with a single routing endpoint:

- `GET /health` returns `{ "status": "ok" }`
- `POST /route` supports:
  - indoor-only routing (legacy behavior)
  - hybrid routing (outdoor via Mapbox + indoor via A*)

### Environment Variables

Set these in the repo-root `.env` (or your process environment):

- `PORT` (optional, defaults to `3001`)
- `MAPBOX_ACCESS_TOKEN` (required for hybrid/outdoor routing)
- `MAPBOX_DIRECTIONS_BASE_URL` (optional, defaults to `https://api.mapbox.com`)

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
