const { createSampleRouteService } = require("../src/indoor-routing");

function printResult(title, result) {
    console.log(`\n=== ${title} ===`);
    console.log(`Path: ${result.nodePath.join(" -> ")}`);
    console.log(`Total distance: ${result.totalDistance}`);
    console.log("Steps:");
    result.steps.forEach((step) => {
        console.log(
            `  ${step.sequence}. ${step.instruction} (${step.fromNodeId} -> ${step.toNodeId}, ${step.distance})`,
        );
    });
}

function run() {
    const routeService = createSampleRouteService();

    const sameFloorRoute = routeService.computeRoute({
        start: { roomId: "room-101" },
        destination: { roomId: "room-102" },
        buildingId: "building-main",
    });
    printResult("Route 1: Same Floor (Room 101 -> Room 102)", sameFloorRoute);

    const crossFloorRoute = routeService.computeRoute({
        start: { roomId: "room-102" },
        destination: { roomId: "room-202" },
        buildingId: "building-main",
        options: { wheelchairRequired: true },
    });
    printResult(
        "Route 2: Cross Floor + Wheelchair Preference (Room 102 -> Room 202)",
        crossFloorRoute,
    );
}

run();
