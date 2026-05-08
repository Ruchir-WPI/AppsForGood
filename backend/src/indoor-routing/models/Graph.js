// In-memory indoor graph aggregate. Owns entity construction, reference
// validation, adjacency lists, and lookup helpers consumed by routing algorithms.
const Building = require("./Building");
const Floor = require("./Floor");
const Room = require("./Room");
const { Node } = require("./Node");
const Edge = require("./Edge");
const { NotFoundError, ValidationError } = require("../utils/errors");

class Graph {
    constructor() {
        this.buildings = new Map();
        this.floors = new Map();
        this.rooms = new Map();
        this.nodes = new Map();
        this.edges = new Map();
        this.adjacency = new Map();
    }

    static fromData(data) {
        const graph = new Graph();

        // Build parents first so child entities can validate references as they are added.
        (data.buildings || []).forEach((item) => graph.addBuilding(item));
        (data.floors || []).forEach((item) => graph.addFloor(item));
        (data.rooms || []).forEach((item) => graph.addRoom(item));
        (data.nodes || []).forEach((item) => graph.addNode(item));
        (data.edges || []).forEach((item) => graph.addEdge(item));

        graph.validateReferences();
        return graph;
    }

    addBuilding(buildingData) {
        const building = buildingData instanceof Building ? buildingData : new Building(buildingData);
        this.#assertUniqueId(this.buildings, building.id, "Building");
        this.buildings.set(building.id, building);
        return building;
    }

    addFloor(floorData) {
        const floor = floorData instanceof Floor ? floorData : new Floor(floorData);
        this.#assertUniqueId(this.floors, floor.id, "Floor");
        this.#assertExists(this.buildings, floor.buildingId, "Building", "Floor.buildingId");
        this.floors.set(floor.id, floor);
        return floor;
    }

    addRoom(roomData) {
        const room = roomData instanceof Room ? roomData : new Room(roomData);
        this.#assertUniqueId(this.rooms, room.id, "Room");
        this.#assertExists(this.buildings, room.buildingId, "Building", "Room.buildingId");
        const floor = this.#assertExists(this.floors, room.floorId, "Floor", "Room.floorId");

        if (floor.buildingId !== room.buildingId) {
            throw new ValidationError(`Room ${room.id} has floor/building mismatch.`);
        }

        this.rooms.set(room.id, room);
        return room;
    }

    addNode(nodeData) {
        const node = nodeData instanceof Node ? nodeData : new Node(nodeData);
        this.#assertUniqueId(this.nodes, node.id, "Node");
        this.#assertExists(this.buildings, node.buildingId, "Building", "Node.buildingId");
        const floor = this.#assertExists(this.floors, node.floorId, "Floor", "Node.floorId");

        if (floor.buildingId !== node.buildingId) {
            throw new ValidationError(`Node ${node.id} has floor/building mismatch.`);
        }

        this.nodes.set(node.id, node);
        this.adjacency.set(node.id, []);
        return node;
    }

    addEdge(edgeData) {
        const edge = edgeData instanceof Edge ? edgeData : new Edge(edgeData);
        this.#assertUniqueId(this.edges, edge.id, "Edge");
        this.#assertExists(this.nodes, edge.fromNodeId, "Node", "Edge.fromNodeId");
        this.#assertExists(this.nodes, edge.toNodeId, "Node", "Edge.toNodeId");

        this.edges.set(edge.id, edge);
        this.#connectNodes(edge.fromNodeId, edge.toNodeId, edge, "forward");

        if (edge.bidirectional) {
            this.#connectNodes(edge.toNodeId, edge.fromNodeId, edge, "reverse");
        }

        return edge;
    }

    validateReferences() {
        // Validate both sides of room/node links to catch partial seed data mistakes early.
        this.rooms.forEach((room) => {
            room.nodeIds.forEach((nodeId) => {
                const node = this.#assertExists(this.nodes, nodeId, "Node", `Room ${room.id}.nodeIds`);
                if (node.buildingId !== room.buildingId || node.floorId !== room.floorId) {
                    throw new ValidationError(
                        `Room ${room.id} links to node ${node.id} in a different building/floor.`,
                    );
                }
            });
        });

        this.nodes.forEach((node) => {
            if (!node.roomId) {
                return;
            }

            const room = this.#assertExists(this.rooms, node.roomId, "Room", `Node ${node.id}.roomId`);
            if (room.buildingId !== node.buildingId || room.floorId !== node.floorId) {
                throw new ValidationError(`Node ${node.id} room reference does not match building/floor.`);
            }

            if (!room.nodeIds.includes(node.id)) {
                throw new ValidationError(`Room ${room.id} does not include node ${node.id} in nodeIds.`);
            }
        });
    }

    getBuilding(buildingId) {
        return this.#assertExists(this.buildings, buildingId, "Building");
    }

    getFloor(floorId) {
        return this.#assertExists(this.floors, floorId, "Floor");
    }

    getRoom(roomId) {
        return this.#assertExists(this.rooms, roomId, "Room");
    }

    getNode(nodeId) {
        return this.#assertExists(this.nodes, nodeId, "Node");
    }

    getEdge(edgeId) {
        return this.#assertExists(this.edges, edgeId, "Edge");
    }

    getRoomNodes(roomId) {
        const room = this.getRoom(roomId);
        return room.nodeIds.map((nodeId) => this.getNode(nodeId));
    }

    getNeighbors(nodeId, { edgeFilter = null } = {}) {
        this.getNode(nodeId);
        const neighbors = this.adjacency.get(nodeId) || [];

        // Store adjacency lightly, then attach the richer edge/node records only when needed.
        return neighbors
            .map((neighbor) => ({
                ...neighbor,
                edge: this.getEdge(neighbor.edgeId),
                toNode: this.getNode(neighbor.toNodeId),
                fromNode: this.getNode(nodeId),
            }))
            .filter((neighbor) => {
                if (!edgeFilter) {
                    return true;
                }

                return edgeFilter(neighbor.edge, neighbor.fromNode, neighbor.toNode);
            });
    }

    getConnection(fromNodeId, toNodeId) {
        this.getNode(fromNodeId);
        this.getNode(toNodeId);
        const edges = this.adjacency.get(fromNodeId) || [];
        const connection = edges.find((item) => item.toNodeId === toNodeId);

        if (!connection) {
            return null;
        }

        return {
            ...connection,
            edge: this.getEdge(connection.edgeId),
        };
    }

    getNodesByBuilding(buildingId) {
        this.getBuilding(buildingId);
        return Array.from(this.nodes.values()).filter((node) => node.buildingId === buildingId);
    }

    #connectNodes(fromNodeId, toNodeId, edge, direction) {
        const list = this.adjacency.get(fromNodeId);

        if (!list) {
            throw new NotFoundError(`Adjacency list missing for node ${fromNodeId}.`);
        }

        list.push({
            edgeId: edge.id,
            fromNodeId,
            toNodeId,
            distance: edge.distance,
            direction,
        });
    }

    #assertUniqueId(map, id, entityName) {
        if (map.has(id)) {
            throw new ValidationError(`${entityName} with id "${id}" already exists.`);
        }
    }

    #assertExists(map, id, entityName, sourceField = null) {
        const item = map.get(id);
        if (!item) {
            const prefix = sourceField ? `${sourceField} references missing ` : "";
            throw new NotFoundError(`${prefix}${entityName.toLowerCase()} "${id}".`);
        }
        return item;
    }
}

module.exports = Graph;
