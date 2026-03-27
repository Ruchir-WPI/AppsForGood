const { createSampleRouteService, sampleCampus } = require("../indoor-routing");
const MapboxService = require("./services/MapboxService");
const { HybridRouteService } = require("./services/HybridRouteService");

function createSampleHybridRouteService({
  indoorRouteService = createSampleRouteService(),
  mapboxService = new MapboxService(),
  campusData = sampleCampus,
} = {}) {
  return new HybridRouteService({
    indoorRouteService,
    mapboxService,
    campusData,
  });
}

module.exports = {
  MapboxService,
  HybridRouteService,
  createSampleHybridRouteService,
};
