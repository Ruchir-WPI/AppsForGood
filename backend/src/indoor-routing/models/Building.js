const {
    assertObject,
    assertNonEmptyString,
    assertOptionalString,
} = require("../utils/validators");

class Building {
    constructor(data) {
        assertObject(data, "Building");
        assertNonEmptyString(data.id, "Building.id");
        assertNonEmptyString(data.name, "Building.name");
        assertOptionalString(data.code, "Building.code");

        this.id = data.id;
        this.name = data.name;
        this.code = data.code || null;
        this.description = data.description || null;
        this.metadata = data.metadata || {};
    }
}

module.exports = Building;
