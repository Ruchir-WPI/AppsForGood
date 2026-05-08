// Room domain model for routing destinations. A room may map to multiple graph
// node ids, allowing RouteService to choose the best entrance node for a route.
const {
    assertObject,
    assertNonEmptyString,
    assertArray,
} = require("../utils/validators");
const { ValidationError } = require("../utils/errors");

class Room {
    constructor(data) {
        assertObject(data, "Room");
        assertNonEmptyString(data.id, "Room.id");
        assertNonEmptyString(data.buildingId, "Room.buildingId");
        assertNonEmptyString(data.floorId, "Room.floorId");
        assertNonEmptyString(data.name, "Room.name");
        assertArray(data.nodeIds || [], "Room.nodeIds");

        const nodeIds = data.nodeIds || [];
        nodeIds.forEach((nodeId, index) => {
            if (typeof nodeId !== "string" || nodeId.trim().length === 0) {
                throw new ValidationError(`Room.nodeIds[${index}] must be a non-empty string.`);
            }
        });

        this.id = data.id;
        this.buildingId = data.buildingId;
        this.floorId = data.floorId;
        this.name = data.name;
        this.nodeIds = nodeIds;
        this.metadata = data.metadata || {};
    }
}

module.exports = Room;
