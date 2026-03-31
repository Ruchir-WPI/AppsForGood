const {
    assertObject,
    assertNonEmptyString,
    assertOptionalString,
    assertFiniteNumber,
} = require("../utils/validators");
const { ValidationError } = require("../utils/errors");

const NODE_TYPES = Object.freeze({
    HALLWAY: "hallway",
    ROOM_ENTRANCE: "room_entrance",
    STAIRS: "stairs",
    ELEVATOR: "elevator",
    EXIT: "exit",
    OUTDOOR_TRANSITION: "outdoor_transition",
    INTERSECTION: "intersection",
});

const VALID_NODE_TYPES = new Set(Object.values(NODE_TYPES));

class Node {
    constructor(data) {
        assertObject(data, "Node");
        assertNonEmptyString(data.id, "Node.id");
        assertNonEmptyString(data.buildingId, "Node.buildingId");
        assertNonEmptyString(data.floorId, "Node.floorId");
        assertFiniteNumber(data.x, "Node.x");
        assertFiniteNumber(data.y, "Node.y");
        assertOptionalString(data.roomId, "Node.roomId");
        assertOptionalString(data.label, "Node.label");
        assertNonEmptyString(data.type, "Node.type");

        if (!VALID_NODE_TYPES.has(data.type)) {
            throw new ValidationError(`Node.type "${data.type}" is invalid.`);
        }

        this.id = data.id;
        this.buildingId = data.buildingId;
        this.floorId = data.floorId;
        this.x = data.x;
        this.y = data.y;
        this.roomId = data.roomId || null;
        this.label = data.label || null;
        this.type = data.type;
        this.metadata = data.metadata || {};
    }
}

module.exports = {
    Node,
    NODE_TYPES,
};
