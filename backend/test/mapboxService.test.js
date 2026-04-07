const test = require("node:test");
const assert = require("node:assert/strict");

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
    const fetchCalls = [];
    const service = new MapboxService({
        fetchImpl: async (url) => {
            fetchCalls.push(url);
            return {
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
            };
        },
    });

    const suggestions = await service.geocodeSuggestions({
        query: "55 Lake Ave",
        limit: 5,
    });

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].id, "address.1");
    assert.equal(suggestions[0].text, "55 Lake Ave N");
    assert.equal(suggestions[0].center[0], -71.7654);

    const requestUrl = new URL(fetchCalls[0]);
    assert.equal(requestUrl.searchParams.get("bbox"), "-73.50814,41.18706,-69.85886,42.88679");
    assert.equal(requestUrl.searchParams.get("proximity"), "-71.7654,42.2776");
});

test("MapboxService geocodeSuggestions excludes results outside Massachusetts", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    const service = new MapboxService({
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            async json() {
                return {
                    features: [
                        {
                            id: "address.ma",
                            text: "55 Lake Ave N",
                            place_name: "55 Lake Ave N, Worcester, Massachusetts, United States",
                            center: [-71.7654, 42.2776],
                        },
                        {
                            id: "address.mi",
                            text: "55 Lake Ave",
                            place_name: "55 Lake Ave, Traverse City, Michigan, United States",
                            center: [-85.6190, 44.7631],
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
    assert.equal(suggestions[0].id, "address.ma");
});

test("MapboxService geocodePlace resolves Massachusetts match even when first upstream result is out-of-state", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    const fetchCalls = [];
    const service = new MapboxService({
        fetchImpl: async (url) => {
            fetchCalls.push(url);
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        features: [
                            {
                                id: "poi.mi",
                                text: "Union Station",
                                place_name: "Union Station, Lansing, Michigan, United States",
                                center: [-84.5555, 42.7339],
                            },
                            {
                                id: "poi.ma",
                                text: "Union Station",
                                place_name: "Union Station, Worcester, Massachusetts, United States",
                                center: [-71.7927, 42.2626],
                            },
                        ],
                    };
                },
            };
        },
    });

    const place = await service.geocodePlace("Union Station Worcester");

    assert.equal(place.name, "Union Station, Worcester, Massachusetts, United States");
    assert.equal(place.location.lng, -71.7927);
    assert.equal(place.location.lat, 42.2626);

    const requestUrl = new URL(fetchCalls[0]);
    assert.equal(requestUrl.searchParams.get("limit"), "10");
});

test("MapboxService geocodeSuggestions retries with Massachusetts hint when initial query has no MA matches", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
    const fetchCalls = [];
    const service = new MapboxService({
        fetchImpl: async (url) => {
            fetchCalls.push(url);
            const requestUrl = new URL(url);
            const queryPath = decodeURIComponent(requestUrl.pathname);
            const isHinted = queryPath.includes("Union Station, Massachusetts.json");

            return {
                ok: true,
                status: 200,
                async json() {
                    if (!isHinted) {
                        return {
                            features: [
                                {
                                    id: "poi.mi",
                                    text: "Union Station",
                                    place_name: "Union Station, Lansing, Michigan, United States",
                                    center: [-84.5555, 42.7339],
                                },
                            ],
                        };
                    }

                    return {
                        features: [
                            {
                                id: "poi.ma",
                                text: "Union Station",
                                place_name: "Union Station, Worcester, Massachusetts, United States",
                                center: [-71.7927, 42.2626],
                            },
                        ],
                    };
                },
            };
        },
    });

    const suggestions = await service.geocodeSuggestions({
        query: "Union Station",
        limit: 5,
    });

    assert.equal(fetchCalls.length, 2);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].id, "poi.ma");
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
