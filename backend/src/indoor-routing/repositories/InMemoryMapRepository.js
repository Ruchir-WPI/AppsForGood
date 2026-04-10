const Graph = require("../models/Graph");

class InMemoryMapRepository {
    constructor(seedData) {
        this.seedData = seedData || {};
    }

    loadGraph() {
        // Return a fresh graph so callers never share mutable route state by accident.
        return Graph.fromData(this.seedData);
    }
}

module.exports = InMemoryMapRepository;
