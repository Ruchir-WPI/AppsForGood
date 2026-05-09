// Routing-service barrel and sample-campus factory. Production callers can
// inject real services, while tests/local dev can use this default in-memory
// indoor graph plus Mapbox integration wiring.
const { createSampleRouteService, sampleCampus } = require("../indoor-routing");
const MapboxService = require("./services/MapboxService");
const { HybridRouteService } = require("./services/HybridRouteService");

// AI acknowledgement: This default Mapbox + sample-campus service wiring was drafted with AI assistance and reviewed by the project author.
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
