const test = require("node:test");
const assert = require("node:assert/strict");

const { createSampleRouteService } = require("../src/indoor-routing");

function buildIndoorRoomRouteRequest(options = {}) {
    return {
        start: { roomId: "room-101" },
        destination: { roomId: "room-202" },
        buildingId: "building-main",
        options,
    };
}

test("RouteService uses A* by default", () => {
    const service = createSampleRouteService();

    const route = service.computeRoute(buildIndoorRoomRouteRequest());

    assert.equal(route.meta.algorithm, "A*");
    assert.ok(Array.isArray(route.nodePath));
    assert.ok(route.nodePath.length > 1);
    assert.equal(typeof route.totalDistance, "number");
});

test("RouteService can compute the same route with Dijkstra", () => {
    const service = createSampleRouteService();

    const aStarRoute = service.computeRoute(buildIndoorRoomRouteRequest());
    const dijkstraRoute = service.computeRoute(
        buildIndoorRoomRouteRequest({ algorithm: "dijkstra" }),
    );

    assert.equal(dijkstraRoute.meta.algorithm, "Dijkstra");
    assert.deepEqual(dijkstraRoute.nodePath, aStarRoute.nodePath);
    assert.equal(dijkstraRoute.totalDistance, aStarRoute.totalDistance);
});

test("RouteService rejects unknown indoor algorithms", () => {
    const service = createSampleRouteService();

    assert.throws(
        () => service.computeRoute(buildIndoorRoomRouteRequest({ algorithm: "bellman-ford" })),
        (error) => {
            assert.equal(error.code, "VALIDATION_ERROR");
            assert.match(error.message, /options\.algorithm/);
            return true;
        },
    );
});
