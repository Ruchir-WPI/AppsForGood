const PriorityQueue = require("./PriorityQueue");
const { ValidationError } = require("../utils/errors");

function reconstructPath(cameFrom, currentNodeId) {
    const path = [currentNodeId];
    let cursor = currentNodeId;

    while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor);
        path.push(cursor);
    }

    return path.reverse();
}

function dijkstra({
    graph,
    startNodeId,
    goalNodeId,
    edgeFilter = null,
}) {
    if (!graph) {
        throw new ValidationError("graph is required for dijkstra.");
    }

    graph.getNode(startNodeId);
    graph.getNode(goalNodeId);

    if (startNodeId === goalNodeId) {
        return {
            pathNodeIds: [startNodeId],
            totalDistance: 0,
            visitedNodeCount: 1,
        };
    }

    const openSet = new PriorityQueue();
    const cameFrom = new Map();
    const distances = new Map([[startNodeId, 0]]);

    openSet.push(startNodeId, 0);
    let visitedNodeCount = 0;

    while (openSet.size > 0) {
        const currentEntry = openSet.pop();
        if (!currentEntry) {
            break;
        }

        const currentNodeId = currentEntry.value;
        const currentDistance = distances.get(currentNodeId) ?? Infinity;
        visitedNodeCount += 1;

        if (currentEntry.priority > currentDistance) {
            continue;
        }

        if (currentNodeId === goalNodeId) {
            return {
                pathNodeIds: reconstructPath(cameFrom, goalNodeId),
                totalDistance: currentDistance,
                visitedNodeCount,
            };
        }

        const neighbors = graph.getNeighbors(currentNodeId, { edgeFilter });

        for (const neighbor of neighbors) {
            const tentativeDistance = currentDistance + neighbor.distance;
            const bestKnown = distances.get(neighbor.toNodeId);

            if (bestKnown !== undefined && tentativeDistance >= bestKnown) {
                continue;
            }

            cameFrom.set(neighbor.toNodeId, currentNodeId);
            distances.set(neighbor.toNodeId, tentativeDistance);
            openSet.push(neighbor.toNodeId, tentativeDistance);
        }
    }

    return null;
}

module.exports = {
    dijkstra,
};
