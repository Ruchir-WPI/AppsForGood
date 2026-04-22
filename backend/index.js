const { createApp } = require("./server");

let app;

try {
  app = createApp();
  console.log("[backend] Serverless handler initialized");
} catch (error) {
  console.error("[backend] Failed to initialize serverless handler", error);
  throw error;
}

module.exports = app;