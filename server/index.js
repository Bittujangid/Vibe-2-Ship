const express = require("express");
const cors = require("cors");
const dns = require("dns");
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}
require("dotenv").config();

const apiRouter = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173", 
    "http://localhost:3000",
    "https://chronoguard-ai-e59fb.web.app",
    "https://chronoguard-ai-e59fb.firebaseapp.com"
  ],
  credentials: true
}));
app.use(express.json());

// Routes mounting
app.use("/api", apiRouter);
app.use("/functions/v1/api", apiRouter);

// Root route check
app.get("/", (req, res) => {
  res.json({ message: "ChronoGuard AI Backend API Server is running." });
});

// Start listening only if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[ChronoGuard Server] running on http://localhost:${PORT}`);
  });
}

module.exports = app;
