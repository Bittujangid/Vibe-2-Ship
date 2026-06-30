const express = require("express");
const router = express.Router();
const aiController = require("../controllers/aiController");

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});

// AI Intelligence Endpoints
router.post("/ai/analyze-task", aiController.analyzeTask);
router.post("/ai/breakdown-task", aiController.breakdownTask);
router.post("/ai/predict-risk", aiController.predictRisk);
router.post("/api/ai/predict-risk", aiController.predictRisk); // Support double-slash issues if any
router.post("/ai/generate-schedule", aiController.generateSchedule);
router.post("/ai/replan-task", aiController.replanTask);
router.post("/ai/rescue-mode", aiController.evaluateRescueMode);
router.post("/ai/health-score", aiController.calculateHealthScore);

module.exports = router;
