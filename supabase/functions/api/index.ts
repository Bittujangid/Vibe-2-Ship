import { createRequire } from "node:module";

// Create a Node-compatible require function
const require = createRequire(import.meta.url);

// Import the existing Node.js Express application
const app = require("../../../server/index.js");

// Bind and serve the Express application via Deno
Deno.serve(app);
