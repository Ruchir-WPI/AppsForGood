const test = require("node:test");
const assert = require("node:assert/strict");

// AI acknowledgement: These Mapbox service integration-shape tests were drafted with AI assistance and reviewed by the project author.
const MapboxService = require("../src/routing/services/MapboxService");

test("MapboxService parses walking route response", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    const fetchCalls = [];
    const fetchImpl = async (url) => {
        fetchCalls.push(url);
        return {
            ok: true,
            status: 200,
            async json() {
                return {
                    routes: [
                        {
                            distance: 180.4,
                            duration: 140.2,
                            geometry: {
                                type: "LineString",
                                coordinates: [
                                    [-71.76, 42.262],
                                    [-71.7598, 42.2621],
                                ],
                            },
                            legs: [
                                {
                                    steps: [
                                        {
                                            distance: 50.2,
                                            duration: 40.4,
                                            name: "Main St",
                                            maneuver: {
                                                instruction: "Head north on Main St",
                                                type: "depart",
                                                modifier: "left",
                                                location: [-71.76, 42.262],
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                };
            },
        };
    };

    const service = new MapboxService({ fetchImpl });
    const route = await service.getWalkingRoute({
        startLng: -71.761,
        startLat: 42.262,
        endLng: -71.760,
        endLat: 42.263,
    });

    assert.equal(route.provider, "mapbox");
    assert.equal(route.profile, "walking");
    assert.equal(route.distanceMeters, 180.4);
    assert.equal(route.durationSeconds, 140.2);
    assert.equal(route.steps[0].instruction, "Head north on Main St");
    assert.equal(fetchCalls.length, 1);
});

test("MapboxService no-route response throws ROUTE_NOT_FOUND", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    const service = new MapboxService({
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            async json() {
                return { routes: [] };
            },
        }),
    });

    await assert.rejects(
        service.getWalkingRoute({
            startLng: -71.761,
            startLat: 42.262,
            endLng: -71.760,
            endLat: 42.263,
        }),
        (error) => {
            assert.equal(error.code, "ROUTE_NOT_FOUND");
            assert.equal(error.statusCode, 404);
            return true;
        },
    );
});

test("MapboxService upstream error throws UPSTREAM_API_ERROR", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    const service = new MapboxService({
        fetchImpl: async () => ({
            ok: false,
            status: 503,
            async json() {
                return {
                    code: "ServiceUnavailable",
                    message: "Mapbox maintenance.",
                };
            },
        }),
    });

    await assert.rejects(
        service.getWalkingRoute({
            startLng: -71.761,
            startLat: 42.262,
            endLng: -71.760,
            endLat: 42.263,
        }),
        (error) => {
            assert.equal(error.code, "UPSTREAM_API_ERROR");
            assert.equal(error.statusCode, 503);
            return true;
        },
    );
});

test("MapboxService geocodeSuggestions returns normalized suggestion payload", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    const service = new MapboxService({
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            async json() {
                return {
                    features: [
                        {
                            id: "address.1",
                            text: "55 Lake Ave N",
                            place_name: "55 Lake Ave N, Worcester, Massachusetts, United States",
                            center: [-71.7654, 42.2776],
                        },
                    ],
                };
            },
        }),
    });

    const suggestions = await service.geocodeSuggestions({
        query: "55 Lake Ave",
        limit: 5,
    });

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].id, "address.1");
    assert.equal(suggestions[0].text, "55 Lake Ave N");
    assert.equal(suggestions[0].center[0], -71.7654);
});

test("MapboxService geocodeSuggestions validates integer limit", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    const service = new MapboxService({
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            async json() {
                return { features: [] };
            },
        }),
    });

    await assert.rejects(
        service.geocodeSuggestions({
            query: "Worcester",
            limit: 2.5,
        }),
        (error) => {
            assert.equal(error.code, "VALIDATION_ERROR");
            return true;
        },
    );
});
