const geminiService = require("../services/geminiService");
const { dbAdmin, isFirebaseAdminConfigured } = require("../config/firebaseAdmin");

const CURRENT_AI_VERSION = "1.1.0";

// Helper: Preserve checked state of completed subtasks when regenerating
const preserveUserProgress = (oldSubtasks, newSubtasks) => {
  if (!oldSubtasks || oldSubtasks.length === 0) return newSubtasks;
  return newSubtasks.map((newSt, idx) => {
    // Try to find a matching old subtask by title similarity (case-insensitive, trimmed)
    const matchByTitle = oldSubtasks.find(oldSt => 
      oldSt.title.trim().toLowerCase() === newSt.title.trim().toLowerCase()
    );
    if (matchByTitle) {
      return { ...newSt, completed: matchByTitle.completed };
    }
    // Fallback: match by index if title similarity fails
    if (idx < oldSubtasks.length) {
      return { ...newSt, completed: oldSubtasks[idx].completed };
    }
    return newSt;
  });
};


// Helper: Save generated content to Firestore
const saveToFirestore = async ({ userId, taskId, dataToSave }) => {
  if (!dbAdmin || !isFirebaseAdminConfigured || !taskId) {
    return; // Safe skip - running in fallback mode
  }
  try {
    let docRef;
    if (userId) {
      docRef = dbAdmin.collection("users").doc(userId).collection("tasks").doc(taskId);
    } else {
      docRef = dbAdmin.collection("tasks").doc(taskId);
    }
    
    await docRef.set(dataToSave, { merge: true });
    console.log(`[AI] Firestore Updated. Cached AI output for task ID: ${taskId}`);
  } catch (error) {
    console.error(`[Firestore Admin] Error caching task details:`, error.message);
  }
};

// Helper: Read content from Firestore
const getFromFirestore = async ({ userId, taskId }) => {
  if (!dbAdmin || !isFirebaseAdminConfigured || !taskId) {
    return null;
  }
  try {
    let docRef;
    if (userId) {
      docRef = dbAdmin.collection("users").doc(userId).collection("tasks").doc(taskId);
    } else {
      docRef = dbAdmin.collection("tasks").doc(taskId);
    }
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return docSnap.data();
    }
  } catch (error) {
    console.error(`[Firestore Admin] Error reading task details:`, error.message);
  }
  return null;
};

// Helper: Get local date string YYYY-MM-DD
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper: Calculate days remaining until a deadline using local midnight differences (inclusive of deadline day)
const getDaysRemaining = (deadlineStr) => {
  if (!deadlineStr) return 1;
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const deadlineDate = new Date(deadlineStr);
  const deadlineMidnight = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
  
  const diffTime = deadlineMidnight.getTime() - todayMidnight.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays >= 0 ? diffDays + 1 : diffDays;
};

// Helper: Evaluate 5-condition deterministic Rescue Mode trigger
const checkRescueModeActivation = (params) => {
  const {
    remainingWorkHours,
    remainingCapacityHours,
    healthScore,
    riskLevel,
    daysRemaining,
    progressPercentage,
    userReportedDelaySignificant
  } = params;

  // Condition 1: Remaining Work > Remaining Capacity
  if (remainingWorkHours > remainingCapacityHours) {
    return { active: true, reason: `Emergency threshold: Remaining estimated work (${remainingWorkHours.toFixed(1)}h) exceeds total capacity (${remainingCapacityHours.toFixed(1)}h).` };
  }

  // Condition 2: Health Score <= 20
  if (healthScore <= 20) {
    return { active: true, reason: `Critical health score of ${healthScore}/100 detected.` };
  }

  // Condition 3: Risk Level = Critical
  if (riskLevel?.toLowerCase() === "critical") {
    return { active: true, reason: `Critical risk level flagged for task timeline.` };
  }

  // Condition 4: Deadline <= 48 hours (i.e. <= 2 days) AND Progress < 50%
  if (daysRemaining <= 2 && progressPercentage < 50) {
    return { active: true, reason: `Urgent compression: Deadline is within 48 hours (${daysRemaining.toFixed(1)} days remaining) and progress is lagging under 50% (${progressPercentage}%).` };
  }

  // Condition 5: User reports a significant delay
  if (userReportedDelaySignificant) {
    return { active: true, reason: `Significant user-reported delay makes original schedule unrealistic.` };
  }

  return { active: false, reason: "Timeline parameters are stable." };
};

// Helper: Strict input validator for timelines and work boundaries
const validateTaskInputs = ({ deadline, estimatedHours, availableHoursPerDay, progressPercentage, riskScore }) => {
  if (deadline) {
    const parsedDate = new Date(deadline);
    if (isNaN(parsedDate.getTime())) {
      return "Invalid deadline format. Must be a parsable date string.";
    }
    if (parsedDate < new Date()) {
      return "Deadline date must be in the future.";
    }
  }

  if (estimatedHours !== undefined) {
    const est = Number(estimatedHours);
    if (isNaN(est) || est < 0) {
      return "Estimated hours must be a non-negative number.";
    }
  }

  if (availableHoursPerDay !== undefined) {
    const avail = Number(availableHoursPerDay);
    if (isNaN(avail) || avail <= 0 || avail > 24) {
      return "Available hours per day must be a number between 1 and 24.";
    }
  }

  if (progressPercentage !== undefined) {
    const progress = Number(progressPercentage);
    if (isNaN(progress) || progress < 0 || progress > 100) {
      return "Progress percentage must be a number between 0 and 100.";
    }
  }

  if (riskScore !== undefined) {
    const score = Number(riskScore);
    if (isNaN(score) || score < 0 || score > 100) {
      return "Risk score must be a number between 0 and 100.";
    }
  }

  return null;
};

// ==========================================
// 1. POST /api/ai/analyze-task (CONSOLIDATED PIPELINE)
// ==========================================
exports.analyzeTask = async (req, res) => {
  const { title, description, deadline, estimatedHours, availableHoursPerDay, userId, taskId, forceRefresh } = req.body;

  // Validation (Phase 14 Security)
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, data: null, error: "Validation Error: Task title is required" });
  }

  const validationError = validateTaskInputs({ deadline, estimatedHours, availableHoursPerDay });
  if (validationError) {
    return res.status(400).json({ success: false, data: null, error: `Validation Error: ${validationError}` });
  }

  const lockKey = taskId || `${userId || "anonymous"}-${title}`;

  // Cache check (Phase 3 Caching)
  if (!forceRefresh && taskId) {
    const cachedTask = await getFromFirestore({ userId, taskId });
    if (cachedTask && 
        cachedTask.subtasks && cachedTask.subtasks.length > 0 &&
        cachedTask.schedule && cachedTask.schedule.length > 0 &&
        cachedTask.emergencyActionPlan) {
      
      const cachedVersion = cachedTask.aiMetadata?.version || "1.0.0";
      
      if (cachedVersion === CURRENT_AI_VERSION) {
        console.log(`[AI] Cache HIT`);
        
        return res.json({
          success: true,
          data: {
            subtasks: cachedTask.subtasks,
            schedule: cachedTask.schedule,
            rescuePlan: {
              active: cachedTask.rescueMode || false,
              reason: cachedTask.rescueReason || "",
              emergencyActionPlan: cachedTask.emergencyActionPlan
            },
            timelineSuggestions: cachedTask.timelineSuggestions || [],
            aiRecommendations: cachedTask.aiRecommendations || [],
            riskScore: cachedTask.riskScore,
            riskLevel: cachedTask.riskLevel,
            healthScore: cachedTask.healthScore,
            aiMetadata: cachedTask.aiMetadata || {
              model: "gemini-2.5-flash",
              generatedAt: new Date().toISOString(),
              version: "1.0.0",
              fallbackUsed: false,
              cacheStatus: "cached",
              generationTime: 0,
              needsRefresh: false
            }
          },
          error: null
        });
      } else {
        // Versions differ. Return cached task with needsRefresh = true override, but do NOT write to database automatically
        console.log(`[AI] Cache HIT (needs refresh due to version mismatch: current ${CURRENT_AI_VERSION} vs cached ${cachedVersion})`);
        
        const cachedMeta = cachedTask.aiMetadata || {
          model: "gemini-2.5-flash",
          generatedAt: new Date().toISOString(),
          version: cachedVersion,
          fallbackUsed: false,
          cacheStatus: "cached",
          generationTime: 0
        };

        return res.json({
          success: true,
          data: {
            subtasks: cachedTask.subtasks,
            schedule: cachedTask.schedule,
            rescuePlan: {
              active: cachedTask.rescueMode || false,
              reason: cachedTask.rescueReason || "",
              emergencyActionPlan: cachedTask.emergencyActionPlan
            },
            timelineSuggestions: cachedTask.timelineSuggestions || [],
            aiRecommendations: cachedTask.aiRecommendations || [],
            riskScore: cachedTask.riskScore,
            riskLevel: cachedTask.riskLevel,
            healthScore: cachedTask.healthScore,
            aiMetadata: {
              ...cachedMeta,
              needsRefresh: true
            }
          },
          error: null
        });
      }
    }
  }

  console.log(`[AI] Cache MISS`);

  // Request Locking (Phase 5)
  const lockAcquired = geminiService.acquireLock(lockKey);
  if (!lockAcquired) {
    console.log(`[AI] Request locked. Duplicate request ignored for key: ${lockKey}`);
    return res.status(429).json({ success: false, error: "A task analysis request is already in progress for this task." });
  }

  const startTime = Date.now();

  try {
    // Single Gemini Request (Phase 1)
    const result = await geminiService.generateCompleteTaskAnalysis(
      title,
      description,
      deadline || new Date().toISOString(),
      Number(estimatedHours || 10),
      Number(availableHoursPerDay || 2)
    );

    const generationTime = Date.now() - startTime;
    const fallbackUsed = result.fallbackUsed || false;
    const cacheStatus = fallbackUsed ? "fallback" : "generated";

    if (fallbackUsed) {
      console.log(`[AI] Fallback Used`);
    }

    // Deterministic Calculations (Phase 1)
    const daysRemaining = getDaysRemaining(deadline);
    const remainingHoursNeeded = Number(estimatedHours || 10);
    const totalAvailableHours = Math.max(0, daysRemaining) * Number(availableHoursPerDay || 2);

    let riskScore = 0;
    let riskLevel = "low";

    if (daysRemaining <= 0) {
      riskScore = 100;
      riskLevel = "critical";
    } else if (remainingHoursNeeded === 0) {
      riskScore = 5;
      riskLevel = "low";
    } else {
      const ratio = remainingHoursNeeded / Math.max(0.1, totalAvailableHours);

      if (ratio > 1.5) {
        riskScore = Math.min(100, Math.round(90 + (ratio - 1.5) * 20));
        riskLevel = "critical";
      } else if (ratio > 1.0) {
        riskScore = Math.round(50 + (ratio - 1.0) * 80);
        riskLevel = "high";
      } else {
        riskScore = Math.round(ratio * 50);
        riskLevel = riskScore > 35 ? "medium" : "low";
      }
    }

    if (daysRemaining > 0 && daysRemaining < 2 && remainingHoursNeeded > 0) {
      riskScore = Math.min(98, riskScore + 20);
      if (riskLevel === "low") riskLevel = "medium";
      else if (riskLevel === "medium") riskLevel = "high";
      else if (riskLevel === "high") riskLevel = "critical";
    }

    const healthScore = Math.max(0, Math.min(100, Math.round(100 - riskScore)));

    // Deterministic Rescue Mode activation (BUG 3)
    const rescueEval = checkRescueModeActivation({
      remainingWorkHours: remainingHoursNeeded,
      remainingCapacityHours: totalAvailableHours,
      healthScore,
      riskLevel,
      daysRemaining,
      progressPercentage: 0,
      userReportedDelaySignificant: false
    });

    const rescueMode = rescueEval.active;
    const rescueReason = rescueEval.reason;

    // Merge/fill emergencyActionPlan if active (BUG 3 recovery)
    let emergencyActionPlan = result.data.rescuePlan?.emergencyActionPlan || {};
    if (rescueMode && (!emergencyActionPlan.criticalTasks || emergencyActionPlan.criticalTasks.length === 0)) {
      emergencyActionPlan = {
        criticalTasks: [
          "Focus on core functionality MVP components",
          "Conduct critical validation and basic checks"
        ],
        tasksToSkip: [
          "Postpone advanced styling, animations, and non-essential UI features",
          "Omit secondary test suites and redundant QA"
        ],
        emergencySchedule: [
          { date: getLocalDateString(new Date()), priorityAction: "Exclusively build critical path elements" }
        ],
        actionPlan: [
          "Cut out meetings and cosmetic adjustments",
          "Dedicate consecutive time blocks to key tasks"
        ],
        reasoning: "Prioritizing MVP components ensures functional delivery before deadline, while skipping cosmetic features avoids complete timeline failure.",
        realisticDeliveryExplanation: "A working core MVP deliverable can be successfully produced within remaining capacity by focusing strictly on essential components.",
        successProbability: 60
      };
    }

    const aiMetadata = {
      model: "gemini-2.5-flash",
      generatedAt: new Date().toISOString(),
      version: CURRENT_AI_VERSION,
      fallbackUsed,
      cacheStatus,
      generationTime,
      needsRefresh: false
    };

    let subtasks = result.data.subtasks || [];

    // If forceRefresh is active (manual refresh of task), load existing to preserve checked states (Requirement 10)
    if (forceRefresh && taskId) {
      const existingTask = await getFromFirestore({ userId, taskId });
      if (existingTask && existingTask.subtasks) {
        subtasks = preserveUserProgress(existingTask.subtasks, subtasks);
      }
    }

    const impossibleWithinDeadline = result.data.impossibleWithinDeadline || false;
    const impossibleDeadlineExplanation = result.data.impossibleDeadlineExplanation || "";

    const dataToSave = {
      subtasks: subtasks,
      schedule: result.data.schedule || [],
      emergencyActionPlan,
      rescueMode,
      rescueReason,
      riskScore,
      riskLevel,
      healthScore,
      timelineSuggestions: result.data.timelineSuggestions || [],
      aiRecommendations: result.data.aiRecommendations || [],
      aiMetadata,
      generatedAt: new Date().toISOString(),
      impossibleWithinDeadline,
      impossibleDeadlineExplanation
    };

    // Save cache (Phase 3 Caching)
    if (taskId) {
      await saveToFirestore({ userId, taskId, dataToSave });
    }

    return res.json({
      success: true,
      data: {
        ...result.data,
        subtasks,
        riskScore,
        riskLevel,
        healthScore,
        aiMetadata,
        impossibleWithinDeadline,
        impossibleDeadlineExplanation
      },
      error: null
    });
  } catch (err) {
    console.error("[AI controller] analyzeTask failed:", err.message);
    return res.status(500).json({
      success: false,
      data: null,
      error: `Task analysis failed: ${err.message}`
    });
  } finally {
    geminiService.releaseLock(lockKey);
  }
};

// ==========================================
// 2. POST /api/ai/predict-risk (DETERMINISTIC)
// ==========================================
exports.predictRisk = async (req, res) => {
  const { progressPercentage = 0, deadline, estimatedHours = 0, availableHoursPerDay = 1, userId, taskId } = req.body;

  const validationError = validateTaskInputs({ deadline, estimatedHours, availableHoursPerDay, progressPercentage });
  if (validationError) {
    return res.status(400).json({ success: false, data: null, error: `Validation Error: ${validationError}` });
  }

  try {
    const daysRemaining = getDaysRemaining(deadline);
    const remainingHoursNeeded = estimatedHours * (1 - (progressPercentage / 100));
    const totalAvailableHours = Math.max(0, daysRemaining) * availableHoursPerDay;

    let riskScore = 0;
    let riskLevel = "low";

    if (daysRemaining <= 0) {
      riskScore = 100;
      riskLevel = "critical";
    } else if (remainingHoursNeeded === 0) {
      riskScore = 5;
      riskLevel = "low";
    } else {
      const ratio = remainingHoursNeeded / Math.max(0.1, totalAvailableHours);

      if (ratio > 1.5) {
        riskScore = Math.min(100, Math.round(90 + (ratio - 1.5) * 20));
        riskLevel = "critical";
      } else if (ratio > 1.0) {
        riskScore = Math.round(50 + (ratio - 1.0) * 80);
        riskLevel = "high";
      } else {
        riskScore = Math.round(ratio * 50);
        riskLevel = riskScore > 35 ? "medium" : "low";
      }
    }

    if (daysRemaining > 0 && daysRemaining < 2 && progressPercentage < 80) {
      riskScore = Math.min(98, riskScore + 20);
      if (riskLevel === "low") riskLevel = "medium";
      else if (riskLevel === "medium") riskLevel = "high";
      else if (riskLevel === "high") riskLevel = "critical";
    }

    const resultData = { riskScore, riskLevel };

    if (taskId) {
      await saveToFirestore({ userId, taskId, dataToSave: resultData });
    }

    return res.json({ success: true, data: resultData, error: null });
  } catch (err) {
    console.error("[AI controller] predictRisk failed:", err.message);
    return res.json({ success: false, data: null, error: err.message });
  }
};

// ==========================================
// 3. POST /api/ai/health-score (DETERMINISTIC)
// ==========================================
exports.calculateHealthScore = async (req, res) => {
  const { riskScore = 0, userId, taskId } = req.body;

  const validationError = validateTaskInputs({ riskScore });
  if (validationError) {
    return res.status(400).json({ success: false, data: null, error: `Validation Error: ${validationError}` });
  }

  try {
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - riskScore)));
    const resultData = { healthScore };

    if (taskId) {
      await saveToFirestore({ userId, taskId, dataToSave: resultData });
    }

    return res.json({ success: true, data: resultData, error: null });
  } catch (err) {
    console.error("[AI controller] calculateHealthScore failed:", err.message);
    return res.json({ success: false, data: null, error: err.message });
  }
};

// ==========================================
// 4. POST /api/ai/rescue-mode (DETERMINISTIC)
// ==========================================
exports.evaluateRescueMode = async (req, res) => {
  const { deadline, progressPercentage = 0, riskLevel = "low", remainingWork, userId, taskId, task } = req.body;

  const validationError = validateTaskInputs({ deadline, progressPercentage });
  if (validationError) {
    return res.status(400).json({ success: false, data: null, error: `Validation Error: ${validationError}` });
  }

  try {
    const daysRemaining = getDaysRemaining(deadline);
    let healthScore = 100;
    let remainingWorkHours = 0;
    let remainingCapacityHours = 0;

    let activeTask = task;
    if (taskId) {
      const dbTask = await getFromFirestore({ userId, taskId });
      if (dbTask) {
        activeTask = { ...activeTask, ...dbTask };
      }
    }

    if (activeTask) {
      healthScore = activeTask.healthScore !== undefined ? activeTask.healthScore : 100;
      remainingWorkHours = activeTask.estimatedHours * (1 - (progressPercentage / 100));
      remainingCapacityHours = Math.max(0, daysRemaining) * (activeTask.availableHoursPerDay || 2);
    } else {
      // Sensible defaults if no task context exists
      remainingWorkHours = 10 * (1 - (progressPercentage / 100));
      remainingCapacityHours = Math.max(0, daysRemaining) * 2;
    }

    const rescueEval = checkRescueModeActivation({
      remainingWorkHours,
      remainingCapacityHours,
      healthScore,
      riskLevel,
      daysRemaining,
      progressPercentage,
      userReportedDelaySignificant: false
    });

    const result = {
      active: rescueEval.active,
      reason: rescueEval.reason
    };

    if (taskId) {
      const dataToSave = { 
        rescueMode: result.active,
        rescueReason: result.reason
      };
      
      // If rescue mode is active, make sure emergency action plan exists in task
      if (result.active && (!activeTask || !activeTask.emergencyActionPlan || !activeTask.emergencyActionPlan.criticalTasks)) {
        dataToSave.emergencyActionPlan = {
          criticalTasks: [
            "Focus on core functionality MVP components",
            "Conduct critical validation and basic checks"
          ],
          tasksToSkip: [
            "Postpone advanced styling, animations, and non-essential UI features",
            "Omit secondary test suites and redundant QA"
          ],
          emergencySchedule: [
            { date: getLocalDateString(new Date()), priorityAction: "Exclusively build critical path elements" }
          ],
          successProbability: 55,
          actionPlan: [
            "Cut out meetings and cosmetic adjustments",
            "Dedicate consecutive time blocks to key tasks"
          ]
        };
      }
      await saveToFirestore({ 
        userId, 
        taskId, 
        dataToSave: dataToSave
      });
    }

    return res.json({ success: true, data: result, error: null });
  } catch (err) {
    console.error("[AI controller] evaluateRescueMode failed:", err.message);
    return res.json({ 
      success: false, 
      data: null, 
      error: err.message
    });
  }
};

// ==========================================
// 5. POST /api/ai/replan-task (SAFE RE-OPTIMIZE / LOCKING)
// ==========================================
exports.replanTask = async (req, res) => {
  const { task, currentSchedule, progressPercentage, remainingWork, delayReason = "Behind schedule", userId, taskId } = req.body;

  const activeSchedule = currentSchedule || (task && task.schedule) || [];
  const progress = progressPercentage !== undefined ? progressPercentage : (task ? task.progressPercentage : 0);
  const workDescription = remainingWork || (task ? task.description : "") || "Remaining work tasks";
  const targetTaskId = taskId || (task ? task.id : null);
  const targetDeadline = task ? task.deadline : null;

  const validationError = validateTaskInputs({ deadline: targetDeadline, progressPercentage: progress });
  if (validationError) {
    return res.status(400).json({ success: false, data: null, error: `Validation Error: ${validationError}` });
  }

  const lockKey = targetTaskId || `${userId || "anonymous"}-replan`;
  const lockAcquired = geminiService.acquireLock(lockKey);
  if (!lockAcquired) {
    console.log(`[AI] Replan locked. Duplicate ignored for key: ${lockKey}`);
    return res.status(429).json({ success: false, error: "A schedule optimization is already in progress." });
  }

  try {
    // Retrieve additional task context from Firestore if taskId is present
    let activeTask = task;
    if (targetTaskId) {
      const dbTask = await getFromFirestore({ userId, taskId: targetTaskId });
      if (dbTask) {
        activeTask = { ...activeTask, ...dbTask };
      }
    }

    const deadlineToUse = targetDeadline || (activeTask && activeTask.deadline) || null;
    const daysRemainingVal = deadlineToUse ? getDaysRemaining(deadlineToUse) : 0;

    const taskContext = {
      title: activeTask?.title || "Untitled Task",
      description: activeTask?.description || "",
      deadline: deadlineToUse,
      daysRemaining: daysRemainingVal,
      availableHoursPerDay: activeTask?.availableHoursPerDay || 2,
      progressPercentage: progress,
      healthScore: activeTask?.healthScore || 100,
      riskScore: activeTask?.riskScore || 0,
      completedSubtasks: (activeTask?.subtasks || []).filter(s => s.completed).map(s => s.title),
      remainingSubtasks: (activeTask?.subtasks || []).filter(s => !s.completed).map(s => s.title),
      remainingEstimatedHours: activeTask?.estimatedHours ? (activeTask.estimatedHours * (1 - (progress / 100))) : 0,
      delayReason: delayReason,
      previousRecommendations: activeTask?.aiRecommendations || []
    };

    const result = await geminiService.generateReplannedSchedule(
      activeSchedule, 
      Number(progress), 
      workDescription, 
      delayReason,
      taskContext
    );

    const replanData = (result && result.data) ? result.data : {};

    if (targetTaskId) {
      const historyItem = {
        date: new Date().toISOString(),
        log: replanData.logMessage || replanData.reason || `Schedule replanned due to: "${delayReason}"`
      };

      const dataToSave = {};
      if (replanData.scheduleChanged) {
        dataToSave.schedule = replanData.updatedSchedule;
        if (replanData.newRecommendations) {
          dataToSave.aiRecommendations = replanData.newRecommendations;
        }
      }

      // Re-evaluate Impossible Deadline during Replan
      const remainingWorkHours = taskContext.remainingEstimatedHours;
      const remainingCapacityHours = taskContext.daysRemaining * taskContext.availableHoursPerDay;
      const impossibleWithinDeadline = remainingWorkHours > remainingCapacityHours;
      
      dataToSave.impossibleWithinDeadline = impossibleWithinDeadline;
      if (impossibleWithinDeadline) {
        const extraHours = remainingWorkHours - remainingCapacityHours;
        dataToSave.impossibleDeadlineExplanation = `The deadline is impossible. Remaining estimated work (${remainingWorkHours.toFixed(1)}h) exceeds total capacity (${remainingCapacityHours.toFixed(1)}h) over the remaining ${taskContext.daysRemaining} days. You require ${extraHours.toFixed(1)} additional hours. Recommended options: 1. Increase daily available hours. 2. Extend the deadline. 3. Reduce the project scope.`;
      } else {
        dataToSave.impossibleDeadlineExplanation = "";
      }

      // Re-evaluate Rescue Mode during Replan (BUG 3)
      const rescueEval = checkRescueModeActivation({
        remainingWorkHours,
        remainingCapacityHours,
        healthScore: taskContext.healthScore,
        riskLevel: taskContext.riskScore > 60 ? "critical" : (taskContext.riskScore > 30 ? "high" : "medium"),
        daysRemaining: taskContext.daysRemaining,
        progressPercentage: taskContext.progressPercentage,
        userReportedDelaySignificant: true
      });

      dataToSave.rescueMode = rescueEval.active;
      dataToSave.rescueReason = rescueEval.reason;

      if (rescueEval.active) {
        dataToSave.emergencyActionPlan = {
          criticalTasks: [
            "Focus on core functionality MVP components",
            "Conduct critical validation and basic checks"
          ],
          tasksToSkip: [
            "Postpone advanced styling, animations, and non-essential UI features",
            "Omit secondary test suites and redundant QA"
          ],
          emergencySchedule: [
            { date: getLocalDateString(new Date()), priorityAction: "Exclusively build critical path elements" }
          ],
          actionPlan: [
            "Cut out meetings and cosmetic adjustments",
            "Dedicate consecutive time blocks to key tasks"
          ],
          reasoning: "Prioritizing MVP components ensures functional delivery before deadline, while skipping cosmetic features avoids complete timeline failure.",
          realisticDeliveryExplanation: "A working core MVP deliverable can be successfully produced within remaining capacity by focusing strictly on essential components.",
          successProbability: 60
        };
      }

      // Inject deterministic fields back into the replanData object returned to client
      replanData.impossibleWithinDeadline = impossibleWithinDeadline;
      replanData.impossibleDeadlineExplanation = dataToSave.impossibleDeadlineExplanation;
      replanData.rescueMode = rescueEval.active;
      replanData.rescueReason = rescueEval.reason;
      replanData.emergencyActionPlan = dataToSave.emergencyActionPlan;

      await saveToFirestore({ 
        userId, 
        taskId: targetTaskId, 
        dataToSave: dataToSave
      });

      if (dbAdmin && isFirebaseAdminConfigured) {
        try {
          const docRef = userId 
            ? dbAdmin.collection("users").doc(userId).collection("tasks").doc(targetTaskId)
            : dbAdmin.collection("tasks").doc(targetTaskId);

          const docSnap = await docRef.get();
          if (docSnap.exists) {
            const currentHistory = docSnap.data().replanningHistory || [];
            await docRef.update({
              replanningHistory: [historyItem, ...currentHistory]
            });
          }
        } catch (dbErr) {
          console.warn("[Firestore Replan Logging] Failed to update replanningHistory:", dbErr.message);
        }
      }
    }

    return res.json({ success: true, data: replanData, error: null });
  } catch (err) {
    console.error("[AI controller] replanTask failed:", err.message);
    return res.json({ 
      success: false, 
      data: null, 
      error: `Gemini service failed: ${err.message}`
    });
  } finally {
    geminiService.releaseLock(lockKey);
  }
};

// ==========================================
// 6. LEGACY / COMPATIBILITY HANDLERS (NO LONGER DIRECTLY CALLED BY OPTIMIZED CLIENT)
// ==========================================
exports.breakdownTask = async (req, res) => {
  const { title, description, deadline, userId, taskId } = req.body;
  try {
    const result = await geminiService.generateCompleteTaskAnalysis(
      title, 
      description, 
      deadline, 
      10, 
      2
    );
    const responseData = { subtasks: result.data.subtasks };
    if (taskId) {
      await saveToFirestore({ userId, taskId, dataToSave: responseData });
    }
    return res.json({ success: true, data: responseData, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};

exports.generateSchedule = async (req, res) => {
  const { deadline, availableHoursPerDay = 2, subtasks = [], userId, taskId } = req.body;
  try {
    const result = await geminiService.generateCompleteTaskAnalysis(
      "Task Schedule",
      "",
      deadline,
      10,
      availableHoursPerDay
    );
    const responseData = { schedule: result.data.schedule };
    if (taskId) {
      await saveToFirestore({ userId, taskId, dataToSave: responseData });
    }
    return res.json({ success: true, data: responseData, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: err.message });
  }
};
