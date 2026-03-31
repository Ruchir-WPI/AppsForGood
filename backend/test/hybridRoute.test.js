const test = require("node:test");
const assert = require("node:assert/strict");

const { createSampleRouteService, sampleCampus } = require("../src/indoor-routing");
const { RouteNotFoundError, UpstreamApiError } = require("../src/indoor-routing/utils/errors");
const { HybridRouteService } = require("../src/routing/services/HybridRouteService");

function buildMapboxRoute(distanceMeters, durationSeconds = 120) {
    return {
        provider: "mapbox",
        profile: "walking",
        distanceMeters,
        durationSeconds,
        geometry: {
            type: "LineString",
            coordinates: [
                [-71.7601, 42.2621],
                [-71.7599, 42.2622],
            ],
        },
        steps: [
            {
                instruction: "Head toward the building.",
                distanceMeters,
                durationSeconds,
                maneuverType: "depart",
                maneuverModifier: null,
                location: { lng: -71.7601, lat: 42.2621 },
                source: "mapbox",
            },
        ],
    };
}

function createEntranceAwareMapboxService(distanceByEntranceId, calls = []) {
    return {
        async getWalkingRoute({ endLng, endLat }) {
            const entrance = sampleCampus.entrances.find(
                (item) => item.outdoor.lng === endLng && item.outdoor.lat === endLat,
            );

            if (!entrance) {
                throw new Error("Unexpected entrance lookup in test.");
            }

            calls.push(entrance.id);
            if (!Object.prototype.hasOwnProperty.call(distanceByEntranceId, entrance.id)) {
                throw new Error(`Missing mock distance for entrance "${entrance.id}".`);
            }

            return buildMapboxRoute(distanceByEntranceId[entrance.id], Math.round(distanceByEntranceId[entrance.id] / 1.2));
        },
    };
}

function createHybridService(mapboxService) {
    return new HybridRouteService({
        indoorRouteService: createSampleRouteService(),
        mapboxService,
        campusData: sampleCampus,
    });
}

test("indoor-only requests still return legacy response shape", async () => {
    const mapboxService = {
        async getWalkingRoute() {
            throw new Error("Mapbox should not be called for indoor-only requests.");
        },
    };
    const service = createHybridService(mapboxService);

    const response = await service.computeRoute({
        start: { roomId: "room-101" },
        destination: { roomId: "room-102" },
        buildingId: "building-main",
    });

    assert.equal(response.selectedStartNodeId, "node-f1-room-101");
    assert.equal(response.selectedDestinationNodeId, "node-f1-room-102");
    assert.ok(Array.isArray(response.nodePath));
    assert.equal(response.mode, undefined);
});

test("hybrid route from parking garage to room returns stitched outdoor and indoor legs", async () => {
    const service = createHybridService(
        createEntranceAwareMapboxService({
            "entrance-main": 220,
            "entrance-north": 150,
            "entrance-east": 180,
        }),
    );

    const response = await service.computeRoute({
        start: { parkingGarageId: "garage-east" },
        destination: { roomId: "room-202" },
        options: { wheelchairRequired: false },
    });

    assert.equal(response.mode, "hybrid");
    assert.ok(response.selectedEntrance?.id);
    assert.equal(response.legs.length, 2);
    assert.equal(response.legs[0].type, "outdoor");
    assert.equal(response.legs[1].type, "indoor");
    assert.ok(response.steps.length >= 3);
});

test("wheelchairRequired excludes inaccessible entrances", async () => {
    const calls = [];
    const service = createHybridService(
        createEntranceAwareMapboxService(
            {
                "entrance-main": 180,
                "entrance-north": 5,
                "entrance-east": 220,
            },
            calls,
        ),
    );

    const response = await service.computeRoute({
        start: { parkingGarageId: "garage-east" },
        destination: { roomId: "room-202" },
        options: { wheelchairRequired: true },
    });

    assert.notEqual(response.selectedEntrance.id, "entrance-north");
    assert.equal(calls.includes("entrance-north"), false);
});

test("destination.entranceId forces a specific entrance", async () => {
    const calls = [];
    const service = createHybridService(
        createEntranceAwareMapboxService(
            {
                "entrance-main": 400,
                "entrance-north": 1,
                "entrance-east": 1,
            },
            calls,
        ),
    );

    const response = await service.computeRoute({
        start: { parkingGarageId: "garage-east" },
        destination: {
            roomId: "room-202",
            entranceId: "entrance-main",
        },
    });

    assert.equal(response.selectedEntrance.id, "entrance-main");
    assert.deepEqual(calls, ["entrance-main"]);
});

test("invalid start coordinates return validation error", async () => {
    const service = createHybridService(
        createEntranceAwareMapboxService({
            "entrance-main": 200,
            "entrance-north": 200,
            "entrance-east": 200,
        }),
    );

    await assert.rejects(
        service.computeRoute({
            start: { coordinates: { lng: "bad", lat: 42.2621 } },
            destination: { roomId: "room-202" },
        }),
        (error) => {
            assert.equal(error.code, "VALIDATION_ERROR");
            return true;
        },
    );
});

test("Mapbox no-route surfaces as normalized ROUTE_NOT_FOUND", async () => {
    const service = createHybridService({
        async getWalkingRoute() {
            throw new RouteNotFoundError("No outdoor route.");
        },
    });

    await assert.rejects(
        service.computeRoute({
            start: { parkingGarageId: "garage-east" },
            destination: { roomId: "room-202" },
        }),
        (error) => {
            assert.equal(error.code, "ROUTE_NOT_FOUND");
            assert.equal(error.statusCode, 404);
            return true;
        },
    );
});

test("Mapbox upstream failures surface as normalized UPSTREAM_API_ERROR", async () => {
    const service = createHybridService({
        async getWalkingRoute() {
            throw new UpstreamApiError("Mapbox unavailable.", { provider: "mapbox" }, 503);
        },
    });

    await assert.rejects(
        service.computeRoute({
            start: { parkingGarageId: "garage-east" },
            destination: { roomId: "room-202" },
        }),
        (error) => {
            assert.equal(error.code, "UPSTREAM_API_ERROR");
            assert.equal(error.statusCode, 503);
            return true;
        },
    );
});
