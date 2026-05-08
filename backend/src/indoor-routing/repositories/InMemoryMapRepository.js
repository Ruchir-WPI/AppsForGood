// Minimal repository adapter for seed-backed indoor maps. Each load returns a
// fresh Graph so route services do not share mutable graph state across tests or requests.
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
