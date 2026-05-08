// A* pathfinding for indoor graphs. The default heuristic only uses same-floor
// Euclidean distance and deliberately falls back to Dijkstra behavior across floors/buildings.
const PriorityQueue = require("./PriorityQueue");
const { ValidationError } = require("../utils/errors");

function defaultHeuristic(currentNode, goalNode) {
    // Cross-floor/building coordinates are not directly comparable, so fall back to Dijkstra there.
    if (
        currentNode.buildingId !== goalNode.buildingId ||
        currentNode.floorId !== goalNode.floorId
    ) {
        return 0;
    }

    const dx = currentNode.x - goalNode.x;
    const dy = currentNode.y - goalNode.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function reconstructPath(cameFrom, currentNodeId) {
    // Follow parent links backward from the goal, then flip into travel order.
    const path = [currentNodeId];
    let cursor = currentNodeId;

    while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor);
        path.push(cursor);
    }

    return path.reverse();
}

function aStar({
                   graph,
                   startNodeId,
                   goalNodeId,
                   heuristic = defaultHeuristic,
                   edgeFilter = null,
               }) {
    if (!graph) {
        throw new ValidationError("graph is required for aStar.");
    }

    const startNode = graph.getNode(startNodeId);
    const goalNode = graph.getNode(goalNodeId);

    if (startNodeId === goalNodeId) {
        return {
            pathNodeIds: [startNodeId],
            totalDistance: 0,
            visitedNodeCount: 1,
        };
    }

    const openSet = new PriorityQueue();
    const cameFrom = new Map();
    const gScore = new Map([[startNodeId, 0]]);
    const fScore = new Map([[startNodeId, heuristic(startNode, goalNode, graph)]]);

    openSet.push(startNodeId, fScore.get(startNodeId));
    let visitedNodeCount = 0;

    while (openSet.size > 0) {
        const currentEntry = openSet.pop();
        if (!currentEntry) {
            break;
        }

        const currentNodeId = currentEntry.value;
        visitedNodeCount += 1;

        // Ignore stale queue entries left behind after a better path was discovered.
        if ((fScore.get(currentNodeId) ?? Infinity) < currentEntry.priority) {
            continue;
        }

        if (currentNodeId === goalNodeId) {
            return {
                pathNodeIds: reconstructPath(cameFrom, goalNodeId),
                totalDistance: gScore.get(goalNodeId),
                visitedNodeCount,
            };
        }

        const currentCost = gScore.get(currentNodeId);
        const neighbors = graph.getNeighbors(currentNodeId, { edgeFilter });

        for (const neighbor of neighbors) {
            const tentativeGScore = currentCost + neighbor.distance;
            const bestKnown = gScore.get(neighbor.toNodeId);

            if (bestKnown !== undefined && tentativeGScore >= bestKnown) {
                continue;
            }

            cameFrom.set(neighbor.toNodeId, currentNodeId);
            gScore.set(neighbor.toNodeId, tentativeGScore);

            const estimatedTotal =
                tentativeGScore + heuristic(graph.getNode(neighbor.toNodeId), goalNode, graph);
            fScore.set(neighbor.toNodeId, estimatedTotal);
            openSet.push(neighbor.toNodeId, estimatedTotal);
        }
    }

    return null;
}

module.exports = {
    aStar,
    defaultHeuristic,
};
