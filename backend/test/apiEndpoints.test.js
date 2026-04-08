const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../server");

// AI acknowledgement: These API endpoint tests covering Mapbox-backed and sample-campus backend flows were drafted with AI assistance and reviewed by the project author.
function createMockMapboxService() {
    return {
        async geocodeSuggestions() {
            return [
                {
                    id: "address.1",
                    text: "55 Lake Ave N",
                    place_name: "55 Lake Ave N, Worcester, Massachusetts, United States",
                    center: [-71.7654, 42.2776],
                },
            ];
        },
        async geocodePlace(query) {
            return {
                query,
                name: "Union Station, Worcester, Massachusetts, United States",
                location: {
                    lng: -71.7927,
                    lat: 42.2626,
                },
            };
        },
        async getWalkingRoute() {
            return {
                provider: "mapbox",
                profile: "walking",
                distanceMeters: 120,
                durationSeconds: 95,
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [-71.766, 42.276],
                        [-71.7654, 42.2776],
                    ],
                },
                steps: [
                    {
                        instruction: "Head north",
                        distanceMeters: 120,
                        durationSeconds: 95,
                        maneuverType: "depart",
                        maneuverModifier: null,
                        location: { lng: -71.766, lat: 42.276 },
                        source: "mapbox",
                    },
                ],
            };
        },
    };
}

async function withServer(app, callback) {
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        await callback(baseUrl);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
}

test("GET /api/campus/buildings returns backend building metadata", async () => {
    const app = createApp({ mapboxService: createMockMapboxService() });

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/campus/buildings`);
        assert.equal(response.status, 200);

        const payload = await response.json();
        assert.ok(Array.isArray(payload.buildings));
        assert.ok(payload.buildings.length > 0);
    });
});

test("GET /api/campus/indoor-map returns sample campus indoor graph payload", async () => {
    const app = createApp({ mapboxService: createMockMapboxService() });

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/campus/indoor-map`);
        assert.equal(response.status, 200);

        const payload = await response.json();
        assert.ok(payload.map);
        assert.ok(Array.isArray(payload.map.buildings));
        assert.ok(Array.isArray(payload.map.floors));
        assert.ok(Array.isArray(payload.map.rooms));
        assert.ok(Array.isArray(payload.map.nodes));
        assert.ok(Array.isArray(payload.map.edges));
        assert.ok(Array.isArray(payload.map.entrances));
        assert.ok(Array.isArray(payload.map.outdoorPoints));
        assert.ok(payload.map.entrances.length > 0);
    });
});

test("POST /api/route/indoor-ui returns UI contract", async () => {
    const app = createApp({ mapboxService: createMockMapboxService() });

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/route/indoor-ui`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: "west-garage", to: "north-pavilion" }),
        });
        assert.equal(response.status, 200);

        const payload = await response.json();
        assert.ok(Array.isArray(payload.steps));
        assert.ok(Array.isArray(payload.waypoints));
        assert.equal(typeof payload.distanceFt, "number");
        assert.equal(typeof payload.walkMinutes, "number");
    });
});

test("GET /api/geocode/suggestions returns backend geocoder suggestions", async () => {
    const app = createApp({ mapboxService: createMockMapboxService() });

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/geocode/suggestions?q=55%20Lake%20Ave`);
        assert.equal(response.status, 200);

        const payload = await response.json();
        assert.ok(Array.isArray(payload.suggestions));
        assert.equal(payload.suggestions[0].id, "address.1");
    });
});

test("GET /api/geocode/resolve converts popular place names to coordinates", async () => {
    const app = createApp({ mapboxService: createMockMapboxService() });

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/geocode/resolve?q=Union%20Station%20Worcester`);
        assert.equal(response.status, 200);

        const payload = await response.json();
        assert.equal(payload.place.name, "Union Station, Worcester, Massachusetts, United States");
        assert.equal(payload.place.location.lng, -71.7927);
        assert.equal(payload.place.location.lat, 42.2626);
    });
});

test("POST /api/route/outdoor returns normalized route payload", async () => {
    const app = createApp({ mapboxService: createMockMapboxService() });

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/route/outdoor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                start: { lng: -71.766, lat: 42.276 },
                destination: { lng: -71.7654, lat: 42.2776 },
            }),
        });

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.route.distanceMeters, 120);
        assert.equal(payload.steps.length, 1);
        assert.equal(payload.steps[0].instruction, "Head north");
    });
});
