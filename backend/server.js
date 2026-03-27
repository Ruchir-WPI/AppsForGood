const path = require("node:path");
require("dotenv").config({
  path: process.env.ENV_FILE || path.resolve(__dirname, "..", ".env"),
});
const express = require("express");
const cors = require("cors");
const { createSampleRouteService, sampleCampus } = require("./src/indoor-routing");
const { MapboxService, HybridRouteService } = require("./src/routing");
const { AppError } = require("./src/indoor-routing/utils/errors");

function createApp({ routeService = null } = {}) {
  const app = express();
  const resolvedRouteService =
    routeService ||
    new HybridRouteService({
      indoorRouteService: createSampleRouteService(),
      mapboxService: new MapboxService(),
      campusData: sampleCampus,
    });

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/route", async (req, res, next) => {
    try {
      const route = await resolvedRouteService.computeRoute(req.body);
      res.json(route);
    } catch (error) {
      next(error);
    }
  });

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
    // Keep startup logs concise for container/dev environments.
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
