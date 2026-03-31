const {
    assertObject,
    assertNonEmptyString,
    assertFiniteNumber,
} = require("../utils/validators");

class Floor {
    constructor(data) {
        assertObject(data, "Floor");
        assertNonEmptyString(data.id, "Floor.id");
        assertNonEmptyString(data.buildingId, "Floor.buildingId");
        assertFiniteNumber(data.level, "Floor.level");
        assertNonEmptyString(data.name, "Floor.name");

        this.id = data.id;
        this.buildingId = data.buildingId;
        this.level = data.level;
        this.name = data.name;
        this.metadata = data.metadata || {};
    }
}

module.exports = Floor;
