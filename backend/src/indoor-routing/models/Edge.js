const {
    assertObject,
    assertNonEmptyString,
    assertFiniteNumber,
    assertBoolean,
} = require("../utils/validators");
const { ValidationError } = require("../utils/errors");

class Edge {
    constructor(data) {
        assertObject(data, "Edge");
        assertNonEmptyString(data.id, "Edge.id");
        assertNonEmptyString(data.fromNodeId, "Edge.fromNodeId");
        assertNonEmptyString(data.toNodeId, "Edge.toNodeId");
        assertFiniteNumber(data.distance, "Edge.distance");

        if (data.distance <= 0) {
            throw new ValidationError("Edge.distance must be greater than 0.");
        }

        const bidirectional = data.bidirectional !== undefined ? data.bidirectional : true;
        assertBoolean(bidirectional, "Edge.bidirectional");

        this.id = data.id;
        this.fromNodeId = data.fromNodeId;
        this.toNodeId = data.toNodeId;
        this.distance = data.distance;
        this.bidirectional = bidirectional;
        this.accessibility = {
            wheelchair: true,
            stairsOnly: false,
            ...data.accessibility,
        };
        this.metadata = data.metadata || {};
    }
}

module.exports = Edge;
