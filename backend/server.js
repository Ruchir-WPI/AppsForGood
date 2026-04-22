const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config({
  path: process.env.ENV_FILE || path.resolve(__dirname, "..", ".env"),
});
const express = require("express");
const cors = require("cors");
const { createSampleRouteService, sampleCampus } = require("./src/indoor-routing");
const { IndoorUiRouteService } = require("./src/api");
const { MapboxService, HybridRouteService } = require("./src/routing");
const { AppError, ValidationError } = require("./src/indoor-routing/utils/errors");

const FRONTEND_DIST_PATH = path.resolve(__dirname, "..", "frontend", "dist");
const FRONTEND_INDEX_PATH = path.join(FRONTEND_DIST_PATH, "index.html");
const VERCEL_BACKEND_ROUTE_PREFIX = "/_/backend";

function parseCoordinatePoint(value, fieldName) {
  let lng;
  let lat;

  // Accept both frontend payload shapes: { lng, lat } and [lng, lat].
  if (Array.isArray(value)) {
    if (value.length < 2) {
      throw new ValidationError(`${fieldName} must contain [lng, lat].`);
    }
    [lng, lat] = value;
  } else if (value && typeof value === "object") {
    lng = value.lng ?? value.longitude;
    lat = value.lat ?? value.latitude;
  } else {
    throw new ValidationError(`${fieldName} must be an object with lng/lat or [lng, lat].`);
  }

  if (typeof lng !== "number" || !Number.isFinite(lng)) {
    throw new ValidationError(`${fieldName}.lng must be a finite number.`);
  }

  if (typeof lat !== "number" || !Number.isFinite(lat)) {
    throw new ValidationError(`${fieldName}.lat must be a finite number.`);
  }

  return { lng, lat };
}

// AI acknowledgement: This logic was drafted with AI assistance and reviewed by the project author.
function createIndoorMapPayload(campusData) {
  // Clone nested sample data so API consumers cannot mutate the in-memory seed.
  return {
    buildings: campusData.buildings.map((building) => ({ ...building })),
    floors: campusData.floors.map((floor) => ({ ...floor })),
    rooms: campusData.rooms.map((room) => ({
      ...room,
      nodeIds: Array.isArray(room.nodeIds) ? [...room.nodeIds] : [],
    })),
    nodes: campusData.nodes.map((node) => ({ ...node })),
    edges: campusData.edges.map((edge) => ({
      ...edge,
      accessibility: edge.accessibility ? { ...edge.accessibility } : undefined,
    })),
    entrances: campusData.entrances.map((entrance) => ({
      ...entrance,
      outdoor: entrance.outdoor ? { ...entrance.outdoor } : null,
    })),
    outdoorPoints: campusData.outdoorPoints.map((point) => ({
      ...point,
      location: point.location ? { ...point.location } : null,
    })),
  };
}

function registerFrontendStaticHosting(app) {
  if (!fs.existsSync(FRONTEND_INDEX_PATH)) {
    return;
  }

  app.use(express.static(FRONTEND_DIST_PATH));

  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(FRONTEND_INDEX_PATH);
  });
}

// AI acknowledgement: This backend app composition for Mapbox-powered outdoor routing and sample-campus hybrid routing was drafted with AI assistance and reviewed by the project author.
function createApp({ routeService = null, mapboxService = null, indoorUiRouteService = null } = {}) {
  const app = express();
  // Allow tests to inject fakes while production falls back to the sample services.
  const resolvedMapboxService = mapboxService || new MapboxService();
  const resolvedRouteService =
    routeService ||
    new HybridRouteService({
      indoorRouteService: createSampleRouteService(),
      mapboxService: resolvedMapboxService,
      campusData: sampleCampus,
    });
  const resolvedIndoorUiRouteService = indoorUiRouteService || new IndoorUiRouteService();

  app.use(cors());

  // Vercel services may forward requests with the backend route prefix still attached.
  // Strip that prefix so existing /api routes continue to work unchanged.
  app.use((req, _res, next) => {
    if (
      req.url === VERCEL_BACKEND_ROUTE_PREFIX
      || req.url.startsWith(`${VERCEL_BACKEND_ROUTE_PREFIX}/`)
    ) {
      req.url = req.url.slice(VERCEL_BACKEND_ROUTE_PREFIX.length) || "/";
    }

    next();
  });

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  async function computeRouteHandler(req, res, next) {
    try {
      const route = await resolvedRouteService.computeRoute(req.body);
      res.json(route);
    } catch (error) {
      next(error);
    }
  }

  // Keep the legacy and /api-prefixed route endpoints in sync.
  app.post("/route", computeRouteHandler);
  app.post("/api/route", computeRouteHandler);

  app.post("/api/route/indoor-ui", (req, res, next) => {
    try {
      const route = resolvedIndoorUiRouteService.computeRoute(req.body);
      res.json(route);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/route/outdoor", async (req, res, next) => {
    try {
      // Support both the current and older payload field names from the frontend.
      const startPoint = parseCoordinatePoint(req.body?.start ?? req.body?.origin, "start");
      const destinationPoint = parseCoordinatePoint(req.body?.destination ?? req.body?.end, "destination");
      const requestedMode = req.body?.mode ?? req.body?.profile ?? "walking";

      let route;
      if (typeof resolvedMapboxService.getRoute === "function") {
        route = await resolvedMapboxService.getRoute({
          startLng: startPoint.lng,
          startLat: startPoint.lat,
          endLng: destinationPoint.lng,
          endLat: destinationPoint.lat,
          profile: requestedMode,
        });
      } else {
        route = await resolvedMapboxService.getWalkingRoute({
          startLng: startPoint.lng,
          startLat: startPoint.lat,
          endLng: destinationPoint.lng,
          endLat: destinationPoint.lat,
        });
      }

      res.json({
        route: {
          provider: route.provider,
          profile: route.profile,
          geometry: route.geometry,
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
        },
        steps: route.steps,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/geocode/suggestions", async (req, res, next) => {
    try {
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!query) {
        throw new ValidationError('Query parameter "q" is required.');
      }

      const rawLimit = req.query.limit;
      const limit = rawLimit === undefined ? 5 : Number.parseInt(String(rawLimit), 10);
      if (!Number.isInteger(limit)) {
        throw new ValidationError('Query parameter "limit" must be an integer.');
      }

      const suggestions = await resolvedMapboxService.geocodeSuggestions({
        query,
        limit,
      });

      res.json({ suggestions });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/geocode/resolve", async (req, res, next) => {
    try {
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!query) {
        throw new ValidationError('Query parameter "q" is required.');
      }

      const place = await resolvedMapboxService.geocodePlace(query);
      res.json({ place });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/campus/buildings", (_req, res) => {
    res.json({
      buildings: resolvedIndoorUiRouteService.listBuildings(),
    });
  });

  app.get("/api/campus/indoor-map", (_req, res) => {
    res.json({
      map: createIndoorMapPayload(sampleCampus),
    });
  });

  registerFrontendStaticHosting(app);

  app.use((error, _req, res, _next) => {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        details: error.details || null,
      });
    }

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    });
  });

  return app;
}

function startServer() {
  const app = createApp();
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
};
