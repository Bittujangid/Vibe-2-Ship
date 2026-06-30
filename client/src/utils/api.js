/**
 * API service to call the Node.js Express server's intelligence endpoints.
 * Unpacks the standardized backend envelope: { success, data, error }
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

// Helper for POST requests
async function postData(endpoint, data) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errText = await response.text();
      try {
        const parsed = JSON.parse(errText);
        if (parsed && parsed.error) {
          throw new Error(parsed.error);
        }
      } catch (jsonErr) {
        // Fallback to raw text error
      }
      throw new Error(errText || `API Request failed with status ${response.status}`);
    }
    
    const wrapper = await response.json();
    
    if (wrapper && wrapper.success) {
      if (wrapper.error) {
        console.warn(`[API AI Warning] Endpoint ${endpoint}:`, wrapper.error);
      }
      return wrapper.data; // Unpack and return data block directly
    } else {
      throw new Error(wrapper ? wrapper.error : "Unknown backend failure");
    }
  } catch (error) {
    console.error(`[API Error] calling ${endpoint}:`, error.message);
    throw error;
  }
}

/**
 * 1. Task Breakdown
 * Inputs: { title, description, deadline }
 */
export async function fetchTaskBreakdown(title, description, deadline, userId, taskId) {
  return postData("/ai/breakdown-task", { title, description, deadline, userId, taskId });
}

/**
 * 2. Risk Prediction (Deterministic logic on backend)
 */
export async function fetchRiskPrediction(progressPercentage, deadline, estimatedHours, availableHoursPerDay, userId, taskId) {
  return postData("/ai/predict-risk", { 
    progressPercentage: Number(progressPercentage), 
    deadline, 
    estimatedHours: Number(estimatedHours), 
    availableHoursPerDay: Number(availableHoursPerDay),
    userId,
    taskId
  });
}

/**
 * 3. Schedule Generator
 * Inputs: { deadline, availableHoursPerDay, subtasks }
 */
export async function fetchGeneratedSchedule(deadline, availableHoursPerDay, subtasks, userId, taskId) {
  return postData("/ai/generate-schedule", { 
    deadline, 
    availableHoursPerDay: Number(availableHoursPerDay),
    subtasks,
    userId,
    taskId
  });
}

/**
 * 4. Auto Replanner
 * Inputs: { currentSchedule, progressPercentage, remainingWork, delayReason }
 */
export async function fetchReplannedTask(currentSchedule, progressPercentage, remainingWork, delayReason, userId, taskId, task) {
  return postData("/ai/replan-task", { 
    currentSchedule, 
    progressPercentage: Number(progressPercentage), 
    remainingWork, 
    delayReason, 
    userId, 
    taskId,
    task
  });
}

/**
 * 5. Rescue Mode
 * Inputs: { deadline, progressPercentage, riskLevel, remainingWork }
 */
export async function fetchRescueModeStatus(deadline, progressPercentage, riskLevel, remainingWork, userId, taskId) {
  return postData("/ai/rescue-mode", { 
    deadline, 
    progressPercentage: Number(progressPercentage), 
    riskLevel, 
    remainingWork,
    userId,
    taskId
  });
}

/**
 * 6. Health Score (Deterministic logic on backend)
 */
export async function fetchHealthScore(riskScore, userId, taskId) {
  return postData("/ai/health-score", { riskScore: Number(riskScore), userId, taskId });
}

/**
 * 7. Complete Task Analysis (Consolidated single AI pipeline)
 * Inputs: { title, description, deadline, estimatedHours, availableHoursPerDay, userId, taskId, forceRefresh }
 */
export async function fetchTaskAnalysis(title, description, deadline, estimatedHours, availableHoursPerDay, userId, taskId, forceRefresh = false) {
  return postData("/ai/analyze-task", {
    title,
    description,
    deadline,
    estimatedHours: Number(estimatedHours),
    availableHoursPerDay: Number(availableHoursPerDay),
    userId,
    taskId,
    forceRefresh
  });
}
