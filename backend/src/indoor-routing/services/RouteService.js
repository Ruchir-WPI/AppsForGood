const { aStar } = require("../algorithms/aStar");
const { dijkstra } = require("../algorithms/dijkstra");
const { ValidationError, RouteNotFoundError } = require("../utils/errors");

const ALGORITHMS = {
    a_star: {
        label: "A*",
        compute: ({ graph, startNodeId, goalNodeId, edgeFilter }) => aStar({
            graph,
            startNodeId,
            goalNodeId,
            edgeFilter,
        }),
    },
    dijkstra: {
        label: "Dijkstra",
        compute: ({ graph, startNodeId, goalNodeId, edgeFilter }) => dijkstra({
            graph,
            startNodeId,
            goalNodeId,
            edgeFilter,
        }),
    },
};

class RouteService {
    constructor({ graph = null, mapRepository = null } = {}) {
        if (!graph && !mapRepository) {
            throw new ValidationError("RouteService needs either graph or mapRepository.");
        }

        this.mapRepository = mapRepository;
        this.graph = graph || mapRepository.loadGraph();
    }

    refreshGraph() {
        if (!this.mapRepository) {
            throw new ValidationError("No mapRepository configured for refresh.");
        }

        this.graph = this.mapRepository.loadGraph();
        return this.graph;
    }

    computeRoute(request) {
        const normalized = this.#normalizeRequest(request);
        return this.computeIndoorRoute({
            start: normalized.start,
            destination: normalized.destination,
            buildingId: normalized.buildingId,
            options: normalized.options,
        });
    }

    computeIndoorRoute({ start, destination, buildingId = null, options = {} }) {
        this.#validateEndpoint(start, "start");
        this.#validateEndpoint(destination, "destination");

        const normalized = {
            start,
            destination,
            buildingId,
            options,
        };
        const startCandidates = this.#resolveEndpointNodes(normalized.start, normalized.buildingId, "start");
        const destinationCandidates = this.#resolveEndpointNodes(
            normalized.destination,
            normalized.buildingId,
            "destination",
        );
        const edgeFilter = this.#buildEdgeFilter(normalized.options);
        const algorithm = this.#resolveAlgorithm(normalized.options?.algorithm);

        let best = null;

        for (const startNodeId of startCandidates) {
            for (const destinationNodeId of destinationCandidates) {
                const pathResult = algorithm.compute({
                    graph: this.graph,
                    startNodeId,
                    goalNodeId: destinationNodeId,
                    edgeFilter,
                });

                if (!pathResult) {
                    continue;
                }

                if (!best || pathResult.totalDistance < best.totalDistance) {
                    best = {
                        ...pathResult,
                        startNodeId,
                        destinationNodeId,
                    };
                }
            }
        }

        if (!best) {
            throw new RouteNotFoundError("No route found for the provided start and destination.");
        }

        const steps = this.#buildRouteSteps(best.pathNodeIds);
        const buildingsInPath = new Set(best.pathNodeIds.map((nodeId) => this.graph.getNode(nodeId).buildingId));

        return {
            start: normalized.start,
            destination: normalized.destination,
            selectedStartNodeId: best.startNodeId,
            selectedDestinationNodeId: best.destinationNodeId,
            buildingId: buildingsInPath.size === 1 ? [...buildingsInPath][0] : null,
            nodePath: best.pathNodeIds,
            totalDistance: this.#round(best.totalDistance),
            steps,
            meta: {
                algorithm: algorithm.label,
                visitedNodeCount: best.visitedNodeCount,
            },
        };
    }

    #normalizeRequest(request) {
        if (!request || typeof request !== "object") {
            throw new ValidationError("Route request must be an object.");
        }

        const start =
            request.start ||
            this.#endpointFromLegacyFields({
                nodeId: request.startNodeId,
                roomId: request.startRoomId,
            });
        const destination =
            request.destination ||
            this.#endpointFromLegacyFields({
                nodeId: request.destinationNodeId,
                roomId: request.destinationRoomId,
            });

        if (!start || !destination) {
            throw new ValidationError("Request must include start and destination.");
        }

        this.#validateEndpoint(start, "start");
        this.#validateEndpoint(destination, "destination");

        return {
            start,
            destination,
            buildingId: request.buildingId || null,
            options: request.options || {},
        };
    }

    #endpointFromLegacyFields({ nodeId, roomId }) {
        if (!nodeId && !roomId) {
            return null;
        }

        return {
            ...(nodeId ? { nodeId } : {}),
            ...(roomId ? { roomId } : {}),
        };
    }

    #validateEndpoint(endpoint, fieldName) {
        if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
            throw new ValidationError(`${fieldName} must be an object.`);
        }

        const hasNodeId = Boolean(endpoint.nodeId);
        const hasRoomId = Boolean(endpoint.roomId);

        if (hasNodeId === hasRoomId) {
            throw new ValidationError(
                `${fieldName} must include exactly one of nodeId or roomId.`,
            );
        }
    }

    #resolveEndpointNodes(endpoint, buildingId, endpointName) {
        let nodeIds = [];

        if (endpoint.nodeId) {
            nodeIds = [this.graph.getNode(endpoint.nodeId).id];
        } else {
            const room = this.graph.getRoom(endpoint.roomId);
            if (room.nodeIds.length === 0) {
                throw new ValidationError(`Room "${room.id}" has no linked nodes.`);
            }
            nodeIds = room.nodeIds.map((id) => this.graph.getNode(id).id);
        }

        if (!buildingId) {
            return nodeIds;
        }

        const filtered = nodeIds.filter((nodeId) => this.graph.getNode(nodeId).buildingId === buildingId);
        if (filtered.length === 0) {
            throw new ValidationError(
                `No ${endpointName} nodes are in building "${buildingId}".`,
            );
        }

        return filtered;
    }

    #buildEdgeFilter(options) {
        const wheelchairRequired = Boolean(options?.wheelchairRequired);

        if (!wheelchairRequired) {
            return null;
        }

        return (edge, fromNode, toNode) => {
            if (edge.accessibility?.stairsOnly) {
                return false;
            }

            if (fromNode.type === "stairs" || toNode.type === "stairs") {
                return false;
            }

            return edge.accessibility?.wheelchair !== false;
        };
    }

    #resolveAlgorithm(algorithmValue) {
        if (algorithmValue === undefined || algorithmValue === null || algorithmValue === "") {
            return ALGORITHMS.a_star;
        }

        if (typeof algorithmValue !== "string") {
            throw new ValidationError("options.algorithm must be a string.");
        }

        const normalized = algorithmValue.trim().toLowerCase();
        const aliases = {
            "a*": "a_star",
            "a-star": "a_star",
            astar: "a_star",
            a_star: "a_star",
            dijkstra: "dijkstra",
        };
        const resolvedKey = aliases[normalized];

        if (!resolvedKey) {
            throw new ValidationError('options.algorithm must be "a_star" or "dijkstra".');
        }

        return ALGORITHMS[resolvedKey];
    }

    #buildRouteSteps(pathNodeIds) {
        if (pathNodeIds.length < 2) {
            return [];
        }

        const steps = [];

        for (let i = 0; i < pathNodeIds.length - 1; i += 1) {
            const fromNodeId = pathNodeIds[i];
            const toNodeId = pathNodeIds[i + 1];
            const connection = this.graph.getConnection(fromNodeId, toNodeId);

            if (!connection) {
                throw new RouteNotFoundError(`Missing edge between ${fromNodeId} and ${toNodeId}.`);
            }

            const fromNode = this.graph.getNode(fromNodeId);
            const toNode = this.graph.getNode(toNodeId);

            steps.push({
                sequence: i + 1,
                edgeId: connection.edgeId,
                fromNodeId,
                toNodeId,
                fromFloorId: fromNode.floorId,
                toFloorId: toNode.floorId,
                distance: this.#round(connection.distance),
                instruction: this.#buildInstruction(fromNode, toNode),
            });
        }

        return steps;
    }

    #buildInstruction(fromNode, toNode) {
        if (fromNode.floorId !== toNode.floorId) {
            const targetFloor = this.#formatFloorLabel(toNode.floorId);

            if (fromNode.type === "stairs" || toNode.type === "stairs") {
                return `Take stairs to ${targetFloor}.`;
            }

            if (fromNode.type === "elevator" || toNode.type === "elevator") {
                return `Take elevator to ${targetFloor}.`;
            }

            return `Transition to ${targetFloor}.`;
        }

        if (toNode.type === "room_entrance" && toNode.roomId) {
            const room = this.graph.getRoom(toNode.roomId);
            return `Proceed to ${room.name}.`;
        }

        if (toNode.label) {
            return `Proceed to ${toNode.label}.`;
        }

        return "Continue to the next navigation node.";
    }

    #round(value) {
        return Math.round(value * 100) / 100;
    }

    #formatFloorLabel(floorId) {
        const floor = this.graph.getFloor(floorId);
        return floor.name || `floor ${floor.level}`;
    }
}

module.exports = RouteService;
