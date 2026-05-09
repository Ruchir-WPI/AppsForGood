// Legacy IndoorUiRouteService tests. They cover the coarse campus preview route
// contract that remains available beside the newer graph-based indoor API.
const test = require("node:test");
const assert = require("node:assert/strict");

const IndoorUiRouteService = require("../src/api/IndoorUiRouteService");

// AI acknowledgement: These indoor UI route service tests were drafted with AI assistance and reviewed by the project author.
test("IndoorUiRouteService lists campus buildings", () => {
    const service = new IndoorUiRouteService();
    const buildings = service.listBuildings();

    assert.ok(Array.isArray(buildings));
    assert.ok(buildings.length > 0);
    assert.equal(typeof buildings[0].id, "string");
});

test("IndoorUiRouteService computes indoor-ui route contract", () => {
    const service = new IndoorUiRouteService();
    const route = service.computeRoute({
        from: "main-garage",
        to: "main-hospital",
    });

    assert.equal(route.from, "main-garage");
    assert.equal(route.to, "main-hospital");
    assert.ok(Array.isArray(route.steps));
    assert.ok(Array.isArray(route.waypoints));
    assert.equal(typeof route.distanceFt, "number");
    assert.equal(typeof route.walkMinutes, "number");
});

test("IndoorUiRouteService rejects identical start and destination", () => {
    const service = new IndoorUiRouteService();

    assert.throws(
        () => service.computeRoute({ from: "main-garage", to: "main-garage" }),
        (error) => {
            assert.equal(error.code, "VALIDATION_ERROR");
            return true;
        },
    );
});
