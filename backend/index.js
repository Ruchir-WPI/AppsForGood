// Serverless entrypoint that initializes the shared Express app once and exports
// it for platforms such as Vercel; local listening is handled by server.js.
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
