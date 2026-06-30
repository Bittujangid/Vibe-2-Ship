const { GoogleGenAI } = require("@google/genai");

// Helper: Retrieve Gemini client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined in the backend configurations.");
  }
  return new GoogleGenAI({ apiKey });
};

// Helper: Sleep function for retry delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Get local date string YYYY-MM-DD
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper: Calculate days remaining until a deadline using local midnight differences (inclusive of deadline day)
const getDaysRemainingLocal = (deadlineStr) => {
  if (!deadlineStr) return 1;
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const deadlineDate = new Date(deadlineStr);
  const deadlineMidnight = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
  
  const diffTime = deadlineMidnight.getTime() - todayMidnight.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays >= 0 ? diffDays + 1 : diffDays;
};

// Helper: Validate and correct schedule dates (BUG 1, CAP daily available hours)
const correctScheduleDates = (schedule, capacityHours, deadlineStr, impossibleWithinDeadline) => {
  if (!Array.isArray(schedule)) return [];
  const todayStr = getLocalDateString(new Date());
  
  // 1. Filter out dates strictly before today
  let corrected = schedule.filter(item => item.date >= todayStr);
  
  // 2. Sort by date
  corrected.sort((a, b) => a.date.localeCompare(b.date));
  
  // 3. Cap hoursAllocated per day at daily capacityHours
  for (const item of corrected) {
    if (item.hoursAllocated > capacityHours) {
      item.hoursAllocated = capacityHours;
    }
  }
  
  // 4. If not impossible, filter out dates after deadline
  if (deadlineStr && !impossibleWithinDeadline) {
    const deadlineDateStr = getLocalDateString(new Date(deadlineStr));
    corrected = corrected.filter(item => item.date <= deadlineDateStr);
  }
  
  return corrected;
};

// Helper: Deep structural comparison between two schedule arrays
const isSameSchedule = (sch1, sch2) => {
  if (!Array.isArray(sch1) || !Array.isArray(sch2)) return false;
  if (sch1.length !== sch2.length) return false;
  
  for (let i = 0; i < sch1.length; i++) {
    const day1 = sch1[i];
    const day2 = sch2[i];
    if (!day1 || !day2) return false;
    if (day1.date !== day2.date) return false;
    if (Number(day1.hoursAllocated) !== Number(day2.hoursAllocated)) return false;
    if ((day1.priority || "medium") !== (day2.priority || "medium")) return false;
    
    const tasks1 = Array.isArray(day1.tasks) ? day1.tasks : [];
    const tasks2 = Array.isArray(day2.tasks) ? day2.tasks : [];
    if (tasks1.length !== tasks2.length) return false;
    for (let j = 0; j < tasks1.length; j++) {
      if (String(tasks1[j]).trim() !== String(tasks2[j]).trim()) return false;
    }
  }
  return true;
};

// ==========================================
// REQUEST QUEUING & CONCURRENCY LOCKS
// ==========================================
const requestQueue = [];
let processingCount = 0;
const MAX_CONCURRENT = 1; // Allow only 1 concurrent Gemini call to conserve quota

// Memory locks to prevent concurrent duplicate requests for the same target
const activeLocks = new Set();

const acquireLock = (lockKey) => {
  if (activeLocks.has(lockKey)) {
    return false;
  }
  activeLocks.add(lockKey);
  return true;
};

const releaseLock = (lockKey) => {
  activeLocks.delete(lockKey);
};

const enqueueRequest = (requestFn) => {
  return new Promise((resolve, reject) => {
    requestQueue.push({ requestFn, resolve, reject });
    console.log(`[AI] Request queued. Current queue size: ${requestQueue.length}`);
    processQueue();
  });
};

const processQueue = async () => {
  if (processingCount >= MAX_CONCURRENT || requestQueue.length === 0) {
    return;
  }
  
  processingCount++;
  const { requestFn, resolve, reject } = requestQueue.shift();
  console.log(`[AI] Queue Released. Running task...`);
  
  try {
    const result = await requestFn();
    resolve(result);
  } catch (error) {
    reject(error);
  } finally {
    processingCount--;
    processQueue();
  }
};

// ==========================================
// TIMEOUT PROTECTION WRAPPER
// ==========================================
const runWithTimeout = async (promise, timeoutMs) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Timeout"));
    }, timeoutMs);
  });
  
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

// ==========================================
// CORE EXPONENTIAL RETRY & PIPELINE ENGINE
// ==========================================
const generateWithRetry = async (prompt, responseSchema, fallbackValue, endpointName = "Task Creation", timeoutMs = 20000) => {
  const modelName = "gemini-2.5-flash";
  let lastError = null;

  // Log prompt diagnostics at the beginning of generateWithRetry
  const charCount = prompt.length;
  const estTokens = Math.ceil(charCount / 4);
  console.log(`[AI] Endpoint: ${endpointName}`);
  console.log(`[AI] Prompt Length: ${charCount} characters`);
  console.log(`[AI] Estimated Tokens: ${estTokens}`);

  // Wrapped function execution to run inside the global concurrent queue
  const executeApiCall = async () => {
    // Attempt 1
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const ai = getAiClient();
        const startTime = Date.now();
        console.log(`[AI] Gemini Started. Model: ${modelName} | Attempt ${attempt + 1}/4`);
        
        // Wrap the generation call in a timeout limit
        const apiPromise = ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
          }
        });

        const response = await runWithTimeout(apiPromise, timeoutMs);

        if (!response || !response.text) {
          throw new Error("Empty response received from Gemini API");
        }

        const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[AI] Response Time: ${responseTime}s`);
        console.log(`[AI] Gemini Completed. Success on attempt ${attempt + 1}`);
        return { data: JSON.parse(response.text), fallbackUsed: false };
      } catch (error) {
        lastError = error;
        const errorMsg = error.message || String(error);
        const statusCode = error.status || error.code || (error.error && error.error.code) || 0;
        
        console.warn(`[AI] Attempt ${attempt + 1} failed. Status: ${statusCode}. Error: ${errorMsg}`);

        // Abort on Timeout and allow retry
        if (errorMsg === "Timeout") {
          console.error(`[AI] Timeout after ${timeoutMs / 1000}s on attempt ${attempt + 1}`);
          if (attempt < 3) {
            const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
            console.log(`[AI] Retry. Waiting ${delay / 1000}s before next attempt...`);
            await sleep(delay);
            continue;
          } else {
            console.error(`[AI] All attempts timed out. Switching to fallback.`);
            return { data: fallbackValue, fallbackUsed: true };
          }
        }

        // Smart Rate Limit (429) Handling: Wait Retry-After and retry exactly once
        if (statusCode === 429) {
          let waitTime = 5000; // Default 5s
          const responseHeaders = error.response && error.response.headers;
          if (responseHeaders) {
            const retryAfter = typeof responseHeaders.get === 'function' 
              ? responseHeaders.get('retry-after') 
              : responseHeaders['retry-after'];
            if (retryAfter) {
              const parsed = parseInt(retryAfter, 10);
              if (!isNaN(parsed)) {
                waitTime = parsed * 1000;
              }
            }
          }
          console.warn(`[AI] Retry. Rate Limit (429) encountered. Sleeping for ${waitTime / 1000}s before single retry attempt...`);
          await sleep(waitTime);

          // Second and FINAL attempt for 429
          try {
            const ai = getAiClient();
            const retryStartTime = Date.now();
            console.log(`[AI] Gemini Started (429 Retry Attempt)...`);
            const apiPromise = ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema
              }
            });
            const response = await runWithTimeout(apiPromise, timeoutMs);
            if (!response || !response.text) throw new Error("Empty response");
            const responseTime = ((Date.now() - retryStartTime) / 1000).toFixed(1);
            console.log(`[AI] Response Time: ${responseTime}s`);
            console.log(`[AI] Gemini Completed on retry attempt.`);
            return { data: JSON.parse(response.text), fallbackUsed: false };
          } catch (retryErr) {
            const retryErrorMsg = retryErr.message || String(retryErr);
            if (retryErrorMsg === "Timeout") {
              console.error(`[AI] Timeout after ${timeoutMs / 1000}s`);
            } else {
              console.error(`[AI] Retry failed. Switching immediately to fallback. Error: ${retryErrorMsg}`);
            }
            return { data: fallbackValue, fallbackUsed: true };
          }
        }

        // Check for other transient errors to retry normally
        const isTransient = 
          statusCode === 500 || 
          statusCode === 503 || 
          statusCode === 0 || 
          errorMsg.toUpperCase().includes("UNAVAILABLE") || 
          errorMsg.toUpperCase().includes("RESOURCE_EXHAUSTED") ||
          errorMsg.toUpperCase().includes("HIGH DEMAND") ||
          errorMsg.toUpperCase().includes("RATE_LIMIT") ||
          errorMsg.toUpperCase().includes("TEMPORARY") ||
          errorMsg.toUpperCase().includes("FETCH FAILED");

        if (attempt < 3 && isTransient) {
          const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
          console.log(`[AI] Retry. Waiting ${delay / 1000}s before next attempt...`);
          await sleep(delay);
        } else {
          break;
        }
      }
    }

    console.error(`[AI] Fallback Used. All API attempts failed or unconfigured.`);
    return { data: fallbackValue, fallbackUsed: true };
  };

  // Queue the request to avoid concurrent rate limit collisions
  return enqueueRequest(executeApiCall);
};

// ==========================================
// DETAILED OFFLINE MATHEMATICAL GENERATORS
// ==========================================
const generateFallbackAnalysis = (title, estimatedHours, availableHoursPerDay, deadline) => {
  const totalHours = Number(estimatedHours) || 10;
  const dailyCap = Number(availableHoursPerDay) || 2;
  
  // Timezone-safe local calculation
  const todayStr = getLocalDateString(new Date());
  const daysRemaining = Math.max(1, Math.ceil(getDaysRemainingLocal(deadline)));
  
  // Conforms exactly to the Task Breakdown schema
  const subtasks = [
    { id: `sb-${Date.now()}-1`, title: `Requirements & Research planning for "${title}"`, completed: false, estimatedHours: Math.max(1, Math.round(totalHours * 0.2)) },
    { id: `sb-${Date.now()}-2`, title: "Core implementation & integration drafts", completed: false, estimatedHours: Math.max(2, Math.round(totalHours * 0.5)) },
    { id: `sb-${Date.now()}-3`, title: "Validation checks & Quality Assurance audits", completed: false, estimatedHours: Math.max(1, Math.round(totalHours * 0.2)) },
    { id: `sb-${Date.now()}-4`, title: "Final document wrap-up and publication release", completed: false, estimatedHours: Math.max(1, Math.round(totalHours * 0.1)) }
  ];

  // Mathematically calculate impossibility (BUG 2)
  const remainingCapacity = daysRemaining * dailyCap;
  const impossibleWithinDeadline = totalHours > remainingCapacity;
  const extraHours = Math.max(0, totalHours - remainingCapacity);
  
  const impossibleDeadlineExplanation = impossibleWithinDeadline
    ? `The deadline is impossible. Remaining estimated work (${totalHours.toFixed(1)}h) exceeds your total available capacity (${remainingCapacity.toFixed(1)}h) over the remaining ${daysRemaining} days. You require ${extraHours.toFixed(1)} additional hours. Recommended options: 1. Increase daily available hours. 2. Extend the deadline. 3. Reduce the project scope.`
    : "";

  const schedule = [];
  let hoursRemaining = totalHours;

  const today = new Date();
  for (let i = 0; i < daysRemaining && hoursRemaining > 0; i++) {
    const scheduledDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dateString = getLocalDateString(scheduledDate);
    const allocated = Math.min(dailyCap, Math.round(hoursRemaining * 10) / 10);
    if (allocated <= 0) break;

    schedule.push({
      date: dateString,
      hoursAllocated: allocated,
      priority: allocated > (dailyCap * 0.8) ? "high" : allocated > (dailyCap * 0.4) ? "medium" : "low",
      tasks: [
        i === 0 ? `Initialize workspace targets and execute planning guidelines (${allocated}h)` : 
        i === daysRemaining - 1 ? `Finalize all QA test routines & deploy deliverables (${allocated}h)` : 
        `Perform scheduled work blocks - segment ${i + 1} (${allocated}h)`
      ]
    });
    hoursRemaining -= allocated;
  }

  // Conforms exactly to the Rescue Plan schema
  const totalAvailableHours = daysRemaining * dailyCap;
  const ratio = totalHours / Math.max(0.1, totalAvailableHours);
  const isRescueTriggered = ratio > 1.0 || (daysRemaining <= 2 && totalHours > 5) || impossibleWithinDeadline;

  const rescuePlan = {
    active: isRescueTriggered,
    reason: isRescueTriggered 
      ? `Emergency threshold reached. High workload ratio (${ratio.toFixed(1)}x) over available ${daysRemaining} days capacity.`
      : "Timeline parameters are stable.",
    emergencyActionPlan: {
      criticalTasks: [
        "Deliver essential functional MVP modules",
        "Perform basic verification on core operations"
      ],
      tasksToSkip: [
        "Postpone cosmetic animations & styling refinements",
        "Omit non-critical advanced test suites"
      ],
      emergencySchedule: [
        { date: todayStr, priorityAction: "Focus exclusively on minimum deliverable milestones." }
      ],
      actionPlan: [
        "Ignore styling changes and cosmetic code.",
        "Deduplicate meetings and focus on execution sprints."
      ],
      reasoning: "Prioritizing core functional components ensures a working deliverable, while postponing secondary styling avoids total project failure.",
      realisticDeliveryExplanation: "A baseline working core MVP can be successfully delivered by focusing strictly on critical path items before the deadline.",
      successProbability: isRescueTriggered ? 55 : 100
    }
  };

  const timelineSuggestions = [
    `Consider adding a 1-2 day buffer before the deadline of ${deadline}.`,
    "Break the implementation phase into smaller daily micro-deliverables."
  ];

  const aiRecommendations = [
    "Work in 90-minute hyper-focus blocks using the Pomodoro technique.",
    "Minimize context switching by batching task reviews."
  ];

  return { 
    subtasks, 
    schedule, 
    rescuePlan, 
    timelineSuggestions, 
    aiRecommendations,
    impossibleWithinDeadline,
    impossibleDeadlineExplanation
  };
};

// ==========================================
// CONSOLIDATED SINGLE AI PIPELINE CALL
// ==========================================
exports.generateCompleteTaskAnalysis = async (title, description, deadline, estimatedHours, availableHoursPerDay) => {
  const daysRemaining = Math.max(0, getDaysRemainingLocal(deadline));
  const remainingCapacity = Math.ceil(daysRemaining) * Number(availableHoursPerDay);
  const impossibleWithinDeadline = estimatedHours > remainingCapacity;

  let impossiblePromptSection = "";
  if (impossibleWithinDeadline) {
    const extraHours = estimatedHours - remainingCapacity;
    impossiblePromptSection = `
CRITICAL WARNING: The deadline is MATHEMATICALLY IMPOSSIBLE to achieve within the daily capacity!
- Total Estimated Hours: ${estimatedHours} hours
- Total Capacity over ${daysRemaining.toFixed(1)} remaining days: ${remainingCapacity} hours
- Shortfall: ${extraHours.toFixed(1)} hours
You MUST:
1. Set "impossibleWithinDeadline" to true in the response.
2. In "impossibleDeadlineExplanation", explain clearly why it's impossible, state that there is a shortfall of ${extraHours.toFixed(1)} hours, and recommend options: (a) increase daily available hours, (b) extend the deadline, or (c) reduce the project scope.
3. In "schedule", prioritize only the most critical work that can fit within available days. If you allocate work after the deadline, clearly explain in the tasks that these are overflow tasks.
`;
  } else {
    impossiblePromptSection = `
- The deadline is mathematically possible. Set "impossibleWithinDeadline" to false, and "impossibleDeadlineExplanation" to "".
`;
  }

  const prompt = `You are a productivity auditor and timeline optimization engine.
Analyze the target task parameters:
- Task Title: "${title}"
- Description: "${description || "none"}"
- Target Deadline: "${deadline}"
- Estimated Total Work Hours: ${estimatedHours} hours
- Daily Available Focus Capacity: ${availableHoursPerDay} hours/day
${impossiblePromptSection}

Generate a complete optimization package in a single structured JSON response:
1. "subtasks": Break this task down into 3 to 6 logical, sequentially ordered action items. Each subtask must have:
   - "id": unique string key (e.g. "st-1", "st-2")
   - "title": a concise action-oriented title
   - "completed": boolean value set to false
   - "estimatedHours": realistic number representing duration
2. "schedule": Distribute the workload hours across dates starting from today until the deadline, ensuring the hours allocated per date do not exceed the daily available capacity of ${availableHoursPerDay} hours (unless deadline is impossible, in which case allocate only critical fit, or explain overflow). Each day must have:
   - "date": YYYY-MM-DD (must be on or after today, ${getLocalDateString(new Date())})
   - "hoursAllocated": number
   - "priority": "low" | "medium" | "high"
   - "tasks": array of string tasks for that day
3. "rescuePlan": Evaluate emergency recommendations. Rescue Mode activates when the project is mathematically impossible to complete within remaining available time or under severe compression. Instead of creating a schedule, compile an Emergency Completion Plan to deliver a usable Minimum Viable Product (MVP) before the deadline:
   - "active": boolean (true if deadline is short, hours are high relative to capacity, or impossible)
   - "reason": string explaining timeline risk
   - "emergencyActionPlan": object containing:
     - "criticalTasks": array of essential MVP features that MUST be completed before the deadline
     - "tasksToSkip": array of non-essential features that can safely be postponed or skipped
     - "actionPlan": array of prioritized action plan steps for remaining available hours
     - "reasoning": string explaining the strategic reasoning behind every recommendation
     - "realisticDeliveryExplanation": string clearly stating what MVP deliverables can realistically be completed before deadline
     - "emergencySchedule": array of objects with "date" and "priorityAction"
     - "successProbability": integer from 0 to 100
4. "timelineSuggestions": array of strings suggesting shifts, deadline adjustments, or safety buffers.
5. "aiRecommendations": array of strings providing productivity guidelines or strategies tailored to this task.
6. "impossibleWithinDeadline": boolean flag
7. "impossibleDeadlineExplanation": string explanation
`;

  const responseSchema = {
    type: "object",
    properties: {
      subtasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            completed: { type: "boolean" },
            estimatedHours: { type: "number" }
          },
          required: ["id", "title", "completed", "estimatedHours"]
        }
      },
      schedule: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            hoursAllocated: { type: "number" },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            tasks: { type: "array", items: { type: "string" } }
          },
          required: ["date", "hoursAllocated", "priority", "tasks"]
        }
      },
      rescuePlan: {
        type: "object",
        properties: {
          active: { type: "boolean" },
          reason: { type: "string" },
          emergencyActionPlan: {
            type: "object",
            properties: {
              criticalTasks: { type: "array", items: { type: "string" } },
              tasksToSkip: { type: "array", items: { type: "string" } },
              actionPlan: { type: "array", items: { type: "string" } },
              reasoning: { type: "string" },
              realisticDeliveryExplanation: { type: "string" },
              emergencySchedule: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string" },
                    priorityAction: { type: "string" }
                  },
                  required: ["date", "priorityAction"]
                }
              },
              successProbability: { type: "integer" }
            },
            required: ["criticalTasks", "tasksToSkip", "actionPlan", "reasoning", "realisticDeliveryExplanation", "emergencySchedule", "successProbability"]
          }
        },
        required: ["active", "reason", "emergencyActionPlan"]
      },
      timelineSuggestions: {
        type: "array",
        items: { type: "string" }
      },
      aiRecommendations: {
        type: "array",
        items: { type: "string" }
      },
      impossibleWithinDeadline: { type: "boolean" },
      impossibleDeadlineExplanation: { type: "string" }
    },
    required: ["subtasks", "schedule", "rescuePlan", "timelineSuggestions", "aiRecommendations", "impossibleWithinDeadline", "impossibleDeadlineExplanation"]
  };

  const fallbackValue = generateFallbackAnalysis(title, estimatedHours, availableHoursPerDay, deadline);
  const result = await generateWithRetry(prompt, responseSchema, fallbackValue, "Task Creation", 20000);
  
  // Clean and Correct dates returned (BUG 1, CAP daily hours)
  if (result && result.data && result.data.schedule) {
    result.data.schedule = correctScheduleDates(
      result.data.schedule, 
      Number(availableHoursPerDay), 
      deadline,
      result.data.impossibleWithinDeadline || impossibleWithinDeadline
    );
  }
  return result;
};

/**
 * 3. Auto Replanner (Used during Re-Optimize)
 */
exports.generateReplannedSchedule = async (currentSchedule, progressPercentage, remainingWork, delayReason, taskContext = null) => {
  // Simplify currentSchedule to reduce payload character count
  const simplifiedSchedule = (currentSchedule || []).map(item => ({
    date: item.date,
    hoursAllocated: item.hoursAllocated,
    priority: item.priority || "medium",
    tasks: item.tasks || []
  }));

  let contextPrompt = "";
  if (taskContext) {
    contextPrompt = `
- Task Title: "${taskContext.title}"
- Task Description: "${taskContext.description || "none"}"
- Target Deadline: "${taskContext.deadline}"
- Verified Calendar Days Remaining: ${Number(taskContext.daysRemaining).toFixed(1)} days
- Daily Focus Capacity: ${taskContext.availableHoursPerDay} hours/day
- Current Progress: ${taskContext.progressPercentage}%
- Current Health Score: ${taskContext.healthScore}/100
- Current Risk Score: ${taskContext.riskScore}%
- Completed Subtasks: ${JSON.stringify(taskContext.completedSubtasks)}
- Remaining Subtasks: ${JSON.stringify(taskContext.remainingSubtasks)}
- Remaining Estimated Work Hours: ${Number(taskContext.remainingEstimatedHours).toFixed(1)} hours
- User Reported Delay / Feedback: "${taskContext.delayReason}"
- Previous AI Recommendations: ${JSON.stringify(taskContext.previousRecommendations)}
`;
  } else {
    contextPrompt = `
- Progress percentage: ${progressPercentage}%
- Scope of remaining work: "${remainingWork}"
- User Reported Delay / Feedback: "${delayReason}"
`;
  }

  const prompt = `You are ChronoGuard AI, an expert timeline auditor and adaptive scheduling engine.
Current Scenario & Verified Parameters:
- Current active schedule blocks (simplified): ${JSON.stringify(simplifiedSchedule)}
${contextPrompt}

Your task is to analyze the user's progress, reported delay feedback, and remaining workload to determine if an actual schedule adjustment is required.

CRITICAL REASONING & RECONCILIATION RULES:
1. CONTRADICTION RECONCILIATION:
   - Compare the user's reported delay feedback ("${delayReason}") against the verified system parameters (Verified Calendar Days Remaining: ${taskContext ? Number(taskContext.daysRemaining).toFixed(1) : "N/A"} days, Target Deadline: "${taskContext?.deadline}").
   - If the user claims or implies a remaining timeframe (e.g., "Only 1 day remains", "Only today left", "I lost 3 days") that contradicts the verified calendar deadline (${taskContext ? Number(taskContext.daysRemaining).toFixed(1) : "N/A"} days remaining), do NOT blindly copy or accept their claim. Reconcile the statement in your "reason" and "logMessage" by stating the actual verified calendar days remaining while addressing their reported loss of focus time.
2. DYNAMIC REPLANNING REASON:
   - Do NOT simply repeat or echo the user's input text in "reason" or "logMessage".
   - Formulate a dynamic, professional explanation of the ACTUAL scheduling decision (e.g. how daily hours were redistributed across remaining dates, priorities shifted, or why the current schedule is already optimal).
3. SCHEDULE COMPARISON & DETERMINATION:
   - If workload, dates, or priorities must be adjusted to accommodate progress or delays, set "scheduleChanged" to true and return the rebalanced schedule in "updatedSchedule".
   - If the existing schedule already fits the remaining workload and deadline without requiring changes in dates, task order, or daily hours, set "scheduleChanged" to false and return the original schedule in "updatedSchedule".
4. NO SCOPE REDUCTION OR TASK REMOVAL:
   - Re-Optimize manages time and scheduling ONLY.
   - If workload fits or can be rebalanced across dates, adjust daily hours, workload distribution, and task priorities.
   - You MUST keep every remaining task and subtask in the schedule. You must NEVER reduce project scope or delete tasks.

In all cases, return JSON conforming strictly to the schema:
- "scheduleChanged" (boolean)
- "reason" (string explaining the scheduling decision and reconciling any contradictions)
- "updatedSchedule" (array of daily blocks)
- "newRecommendations" (array of actionable recovery/maintenance advice)
- "logMessage" (concise log entry summarizing the schedule decision)
`;

  const responseSchema = {
    type: "object",
    properties: {
      scheduleChanged: { type: "boolean" },
      reason: { type: "string" },
      updatedSchedule: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            hoursAllocated: { type: "number" },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            tasks: { type: "array", items: { type: "string" } }
          },
          required: ["date", "hoursAllocated", "priority", "tasks"]
        }
      },
      newRecommendations: {
        type: "array",
        items: { type: "string" }
      },
      logMessage: { type: "string" }
    },
    required: ["scheduleChanged", "reason", "updatedSchedule", "newRecommendations", "logMessage"]
  };

  const shiftedSchedule = (currentSchedule || []).map(item => {
    const d = new Date(item.date);
    d.setDate(d.getDate() + 1); // Shift dates by 1 day
    return {
      ...item,
      date: d.toISOString().split("T")[0],
      priority: "high"
    };
  });

  const isNoDelay = 
    (delayReason && /no\s+delay|smoothly|on\s+track|optimal|no\s+change/i.test(delayReason)) ||
    (progressPercentage >= 90);

  const fallbackReplanned = {
    scheduleChanged: !isNoDelay,
    reason: isNoDelay 
      ? "AI schedule audit completed: Existing schedule is already optimal for the remaining workload." 
      : `Schedule rebalanced: Workload redistributed across remaining active calendar days to accommodate reported progress and focus availability.`,
    updatedSchedule: isNoDelay 
      ? (currentSchedule || []) 
      : (shiftedSchedule.length > 0 ? shiftedSchedule : [
          {
            date: new Date().toISOString().split("T")[0],
            hoursAllocated: 2,
            priority: "high",
            tasks: [`Recover delayed tasks: ${remainingWork}`]
          }
        ]),
    newRecommendations: isNoDelay 
      ? ["Maintain current pace and review targets regularly."]
      : [
          "Focus on high-priority core deliverables during peak energy hours.",
          "Buffer daily focus sessions to absorb unexpected delays."
        ],
    logMessage: isNoDelay 
      ? "AI schedule audit completed: Existing schedule is already optimal." 
      : `Re-optimization applied: Reallocated remaining focus hours across available calendar days.`
  };

  const result = await generateWithRetry(prompt, responseSchema, fallbackReplanned, "Re-Optimize", 30000);
  
  if (result && result.data && result.data.updatedSchedule) {
    const dailyCap = taskContext ? Number(taskContext.availableHoursPerDay) : 2;
    const deadline = taskContext ? taskContext.deadline : null;
    const remainingHours = taskContext ? Number(taskContext.remainingEstimatedHours) : 0;
    const daysRemaining = taskContext ? Number(taskContext.daysRemaining) : 0;
    const impossible = taskContext ? (remainingHours > daysRemaining * dailyCap) : false;
    
    result.data.updatedSchedule = correctScheduleDates(
      result.data.updatedSchedule, 
      dailyCap, 
      deadline,
      impossible
    );

    // Deep structural comparison: If post-processed updatedSchedule is identical to currentSchedule, override scheduleChanged to false
    if (isSameSchedule(currentSchedule, result.data.updatedSchedule)) {
      result.data.scheduleChanged = false;
      result.data.reason = "The re-optimized schedule is structurally identical to your active schedule. No shifts in dates, task order, or workload distribution were required.";
      result.data.logMessage = "AI schedule audit completed: Generated schedule matches active schedule with zero net changes.";
    }
  }
  
  return result;
};

/**
 * 4. Rescue Mode Recommendations (Used for explicit manual refresh)
 */
exports.generateRescueRecommendations = async (deadline, progressPercentage, riskLevel, remainingWork) => {
  const todayStr = new Date().toISOString().split("T")[0];
  const prompt = `You are an emergency response engine for productivity goals.
Metrics:
- Deadline Date: "${deadline}"
- Current Date: "${todayStr}"
- Progress: ${progressPercentage}%
- Evaluated Risk Level: "${riskLevel}"
- Description of remaining tasks: "${remainingWork}"

Evaluate if Emergency Rescue Mode is active (activated if deadline is within 48h and progress < 50%, or risk level is critical/high and work is lagging).
If active is false, set reason to "Timeline parameters are stable." and other fields can be empty.
If active is true, explain the reason and compile the emergencyActionPlan object:
1. criticalTasks: Essential path elements that MUST be completed to deliver.
2. tasksToSkip: Non-essential elements to skip.
3. emergencySchedule: Sprints containing dates and priorityAction strings.
4. successProbability: Success percentage (0-100).
5. actionPlan: Direct, urgent working rules.
`;

  const responseSchema = {
    type: "object",
    properties: {
      active: { type: "boolean" },
      reason: { type: "string" },
      emergencyActionPlan: {
        type: "object",
        properties: {
          criticalTasks: { type: "array", items: { type: "string" } },
          tasksToSkip: { type: "array", items: { type: "string" } },
          emergencySchedule: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                priorityAction: { type: "string" }
              },
              required: ["date", "priorityAction"]
            }
          },
          successProbability: { type: "integer" },
          actionPlan: { type: "array", items: { type: "string" } }
        },
        required: ["criticalTasks", "tasksToSkip", "emergencySchedule", "successProbability", "actionPlan"]
      }
    },
    required: ["active", "reason"]
  };

  const today = new Date();
  const deadlineVal = new Date(deadline);
  const diffTime = deadlineVal - today;
  const daysLeft = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  
  const isRescueTriggered = (daysLeft <= 2 && progressPercentage < 50) || riskLevel === "critical" || riskLevel === "high";

  const fallbackRescue = {
    active: isRescueTriggered,
    reason: isRescueTriggered 
      ? `Emergency threshold reached. Lagging timeline (${progressPercentage}% complete) with ${daysLeft} days remaining.`
      : "Timeline parameters are stable.",
    emergencyActionPlan: {
      criticalTasks: [
        "Core feature implementation",
        "Deploying database schema & validation layers"
      ],
      tasksToSkip: [
        "Design polish & transition animations",
        "Comprehensive end-to-end tests"
      ],
      emergencySchedule: [
        { date: new Date().toISOString().split("T")[0], priorityAction: "Develop critical path modules" }
      ],
      successProbability: isRescueTriggered ? 50 : 100,
      actionPlan: [
        "Postpone all non-essential meetings.",
        "Commit to active core-only features."
      ]
    }
  };

  return generateWithRetry(prompt, responseSchema, fallbackRescue, "Rescue", 30000);
};

module.exports = {
  acquireLock,
  releaseLock,
  generateCompleteTaskAnalysis: exports.generateCompleteTaskAnalysis,
  generateReplannedSchedule: exports.generateReplannedSchedule,
  generateRescueRecommendations: exports.generateRescueRecommendations
};
