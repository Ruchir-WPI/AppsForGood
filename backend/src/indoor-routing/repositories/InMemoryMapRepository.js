const Graph = require("../models/Graph");

class InMemoryMapRepository {
  constructor(seedData) {
    this.seedData = seedData || {};
  }

  loadGraph() {
    return Graph.fromData(this.seedData);
  }
}

module.exports = InMemoryMapRepository;
