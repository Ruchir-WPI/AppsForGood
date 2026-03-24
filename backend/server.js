const express = require("express");
const cors = require("cors");
const { createSampleRouteService } = require("./src/indoor-routing");
const { AppError } = require("./src/indoor-routing/utils/errors");

const app = express();
const port = process.env.PORT || 3001;
const routeService = createSampleRouteService();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/route", (req, res, next) => {
  try {
    const route = routeService.computeRoute(req.body);
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

app.listen(port, () => {
  // Keep startup logs concise for container/dev environments.
  console.log(`Backend listening on port ${port}`);
});
