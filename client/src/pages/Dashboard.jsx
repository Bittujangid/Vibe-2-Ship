import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTasks } from "../context/TaskContext";
import { 
  fetchTaskAnalysis
} from "../utils/api";
import { Plus, X, Shield, AlertTriangle, Flame, Calendar, CheckSquare, Hourglass, CheckCircle2, Clock } from "lucide-react";

export default function Dashboard() {
  const getDaysLeftInclusive = (deadlineStr) => {
    if (!deadlineStr) return 0;
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const deadlineDate = new Date(deadlineStr);
    const deadlineMidnight = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
    
    const diffTime = deadlineMidnight.getTime() - todayMidnight.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays + 1 : 0;
  };

  const { user } = useAuth();
  const { tasks, addTask, deleteTask, updateTask, loading } = useTasks();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState('medium');
  const [estimatedHours, setEstimatedHours] = useState(10);
  const [availableHoursPerDay, setAvailableHoursPerDay] = useState(2);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalTasks = tasks.length;
  const avgHealthScore = totalTasks > 0 ? Math.round(tasks.reduce((sum, t) => sum + (t.healthScore || 0), 0) / totalTasks) : 100;
  const avgRiskScore = totalTasks > 0 ? Math.round(tasks.reduce((sum, t) => sum + (t.riskScore || 0), 0) / totalTasks) : 0;
  const rescueModeCount = tasks.filter(t => t.rescueMode).length;
  const isRescueActive = rescueModeCount > 0;
  const highRiskTasks = tasks.filter(t => t.riskLevel === 'high' || t.riskLevel === 'critical');
  const upcomingTasks = [...tasks].filter(t => t.status !== 'completed').sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 5);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ height: '40px', width: '240px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', animation: 'pulse-border 2s infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div style={{ height: '80px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', animation: 'pulse-border 2s infinite' }} />
          <div style={{ height: '80px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', animation: 'pulse-border 2s infinite' }} />
          <div style={{ height: '80px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', animation: 'pulse-border 2s infinite' }} />
        </div>
        <div style={{ height: '320px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', animation: 'pulse-border 2s infinite' }} />
      </div>
    );
  }

  // Get current local datetime string in 'YYYY-MM-DDTHH:MM' format for input limits
  const getCurrentDateTimeString = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now - tzOffset).toISOString().slice(0, 16);
  };

  // Helper: Generates realistic offline schedules and subtasks if the API fails
  const generateOfflineTaskData = (taskTitle, estHours, capacityHours, deadlineStr) => {
    const totalHours = Number(estHours);
    const dailyCap = Number(capacityHours);

    // 1. Core subtasks breakdown
    const subtasks = [
      { id: `sb-${Date.now()}-1`, title: `Analyze & Research requirements for "${taskTitle}"`, completed: false, estimatedHours: Math.max(1, Math.round(totalHours * 0.2)) },
      { id: `sb-${Date.now()}-2`, title: "Implement core development and initial architecture drafts", completed: false, estimatedHours: Math.max(2, Math.round(totalHours * 0.5)) },
      { id: `sb-${Date.now()}-3`, title: "Run validation audits and integration tests", completed: false, estimatedHours: Math.max(1, Math.round(totalHours * 0.2)) },
      { id: `sb-${Date.now()}-4`, title: "Final document polish and release package compile", completed: false, estimatedHours: Math.max(1, Math.round(totalHours * 0.1)) }
    ];

    // 2. Schedule workload distribution
    const today = new Date();
    const deadlineVal = new Date(deadlineStr);
    const diffTime = deadlineVal - today;
    const daysRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    
    const schedule = [];
    let hoursRemaining = totalHours;

    for (let i = 0; i < daysRemaining && hoursRemaining > 0; i++) {
      const scheduledDate = new Date();
      scheduledDate.setDate(today.getDate() + i);
      const dateString = scheduledDate.toISOString().split("T")[0];

      const hoursForDay = Math.min(dailyCap, Math.round(hoursRemaining * 10) / 10);
      if (hoursForDay <= 0) break;

      schedule.push({
        date: dateString,
        hoursAllocated: hoursForDay,
        priority: hoursForDay > (dailyCap * 0.8) ? "high" : hoursForDay > (dailyCap * 0.4) ? "medium" : "low",
        tasks: [
          i === 0 ? `Kickoff study variables & initiate Research phase (${hoursForDay}h)` :
          i === daysRemaining - 1 ? `Finalize verification loops & submit target deliverables (${hoursForDay}h)` :
          `Work on core components - block slot ${i + 1} (${hoursForDay}h)`
        ]
      });

      hoursRemaining -= hoursForDay;
    }

    // 3. Offline Heuristic Risk Assessment (Matches backend controller ratio math)
    const totalAvailableHours = daysRemaining * dailyCap;
    const ratio = totalHours / Math.max(0.1, totalAvailableHours);

    let riskScore = 20;
    let riskLevel = "low";

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

    if (daysRemaining > 0 && daysRemaining < 2 && totalHours > 5) {
      riskScore = Math.min(98, riskScore + 20);
      if (riskLevel === "low") riskLevel = "medium";
      else if (riskLevel === "medium") riskLevel = "high";
      else if (riskLevel === "high") riskLevel = "critical";
    }

    const healthScore = Math.max(0, Math.min(100, 100 - riskScore));
    const rescueMode = ratio > 1.0 || (daysRemaining <= 2 && totalHours > 5);
    const rescueReason = rescueMode 
      ? `Emergency threshold reached. High workload ratio (${ratio.toFixed(1)}x) over available ${daysRemaining} days capacity.`
      : "Timeline parameters are stable.";

    const emergencyActionPlan = {
      criticalTasks: [
        "Deliver essential functional MVP modules",
        "Perform basic verification on core operations"
      ],
      tasksToSkip: [
        "Postpone cosmetic animations & styling refinements",
        "Omit non-critical advanced test suites"
      ],
      emergencySchedule: [
        { date: today.toISOString().split("T")[0], priorityAction: "Focus exclusively on minimum deliverable milestones." }
      ],
      successProbability: rescueMode ? 55 : 100,
      actionPlan: [
        "Ignore styling changes and cosmetic code.",
        "Deduplicate meetings and focus on execution sprints."
      ]
    };

    const timelineSuggestions = [
      `Consider adding a 1-2 day buffer before the deadline of ${deadlineStr}.`,
      "Break the implementation phase into smaller daily micro-deliverables."
    ];

    const aiRecommendations = [
      "Work in 90-minute focus blocks using the Pomodoro technique.",
      "Minimize context switching by batching task reviews."
    ];

    const aiMetadata = {
      model: "local-offline-engine",
      generatedAt: new Date().toISOString(),
      version: "1.0.0",
      fallbackUsed: true,
      cacheStatus: "fallback",
      generationTime: 0
    };

    return { subtasks, schedule, riskScore, riskLevel, healthScore, rescueMode, rescueReason, emergencyActionPlan, timelineSuggestions, aiRecommendations, aiMetadata };
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!title || !deadline) return;

    if (isSubmitting) return;

    // Strict client-side validation rules
    if (!title.trim()) {
      alert("Validation Error: Task name cannot be empty or contain only whitespace.");
      return;
    }

    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      alert("Validation Error: Invalid deadline target date format.");
      return;
    }

    if (deadlineDate <= new Date()) {
      alert("Validation Error: Deadline target date must be in the future.");
      return;
    }

    const est = Number(estimatedHours);
    if (isNaN(est) || est < 1 || est > 500) {
      alert("Validation Error: Estimated work hours must be a number between 1 and 500.");
      return;
    }

    const avail = Number(availableHoursPerDay);
    if (isNaN(avail) || avail < 1 || avail > 24) {
      alert("Validation Error: Daily available hours capacity must be between 1 and 24.");
      return;
    }

    setIsSubmitting(true);
    
    // Generate Task ID and User ID to support server side Firestore caching
    const newTaskId = `task-${Date.now()}`;
    const userId = user?.uid || "anonymous";

    try {
      // Fetch consolidated AI task analysis in exactly ONE backend request
      const analysisRes = await fetchTaskAnalysis(
        title,
        description,
        deadline,
        estimatedHours,
        availableHoursPerDay,
        userId,
        newTaskId,
        false
      );

      // Assemble final task payload complying with task model schema
      const newTaskPayload = {
        id: newTaskId,
        title,
        description,
        deadline: new Date(deadline).toISOString(),
        priority,
        estimatedHours: Number(estimatedHours),
        availableHoursPerDay: Number(availableHoursPerDay),
        riskScore: analysisRes.riskScore,
        riskLevel: analysisRes.riskLevel,
        healthScore: analysisRes.healthScore,
        rescueMode: analysisRes.rescuePlan?.active || false,
        rescueReason: analysisRes.rescuePlan?.reason || "",
        emergencyActionPlan: analysisRes.rescuePlan?.emergencyActionPlan || {},
        timelineSuggestions: analysisRes.timelineSuggestions || [],
        aiRecommendations: analysisRes.aiRecommendations || [],
        aiMetadata: analysisRes.aiMetadata || {
          model: "gemini-2.5-flash",
          generatedAt: new Date().toISOString(),
          version: "1.0.0",
          fallbackUsed: false,
          cacheStatus: "generated",
          generationTime: 0
        },
        status: "pending",
        progressPercentage: 0,
        subtasks: analysisRes.subtasks || [],
        schedule: analysisRes.schedule || [],
        replanningHistory: [
          { date: new Date().toISOString(), log: "Task created and analyzed by ChronoGuard backend." }
        ]
      };

      addTask(newTaskPayload);
      
      // Reset Form
      setTitle("");
      setDescription("");
      setDeadline("");
      setPriority("medium");
      setEstimatedHours(10);
      setAvailableHoursPerDay(2);
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error generating task metrics:", err);
      
      // If it is a validation error returned by the server, block creation and notify user
      if (err.message && err.message.includes("Validation Error:")) {
        alert(err.message);
        setIsSubmitting(false);
        return;
      }
      
      alert("Failed to reach ChronoGuard Backend. Running task creation with local offline defaults.");
      
      // Generate highly structured mathematical local fallback data
      const offlineData = generateOfflineTaskData(title, estimatedHours, availableHoursPerDay, deadline);

      // Fallback local creation
      addTask({
        id: newTaskId,
        title,
        description,
        deadline: new Date(deadline).toISOString(),
        priority,
        estimatedHours: Number(estimatedHours),
        availableHoursPerDay: Number(availableHoursPerDay),
        riskScore: offlineData.riskScore,
        riskLevel: offlineData.riskLevel,
        healthScore: offlineData.healthScore,
        rescueMode: offlineData.rescueMode,
        rescueReason: offlineData.rescueReason,
        emergencyActionPlan: offlineData.emergencyActionPlan,
        timelineSuggestions: offlineData.timelineSuggestions,
        aiRecommendations: offlineData.aiRecommendations,
        aiMetadata: offlineData.aiMetadata,
        status: "pending",
        progressPercentage: 0,
        subtasks: offlineData.subtasks,
        schedule: offlineData.schedule,
        replanningHistory: [{ date: new Date().toISOString(), log: "Created local offline backup schedule." }]
      });
      
      // Reset Form
      setTitle("");
      setDescription("");
      setDeadline("");
      setPriority("medium");
      setEstimatedHours(10);
      setAvailableHoursPerDay(2);
      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSubtask = (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = task.subtasks.map(st => {
      if (st.id === subtaskId) {
        return { ...st, completed: !st.completed };
      }
      return st;
    });

    const completedCount = updatedSubtasks.filter(st => st.completed).length;
    const progressPercentage = Math.round((completedCount / updatedSubtasks.length) * 100) || 0;
    
    const updatedFields = {
      subtasks: updatedSubtasks,
      progressPercentage,
      status: progressPercentage === 100 ? "completed" : "in_progress"
    };

    updateTask(taskId, updatedFields);
  };

  const getHealthColor = (score) => {
    if (score > 75) return "var(--brand-success)";
    if (score > 40) return "var(--brand-warning)";
    return "var(--brand-danger)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Dashboard Title Header */}
      <div className="flex-between">
        <div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Workspace Dashboard</h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Real-time deadline tracking and schedule health auditing
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)} 
          className="btn btn-primary"
          id="add-task-button"
        >
          <Plus size={16} />
          <span>New Target</span>
        </button>
      </div>

      {/* Rescue Mode System Level Alert Banner */}
      {isRescueActive && (
        <div className="rescue-banner">
          <div className="rescue-banner-title">
            <Flame size={20} style={{ animation: "pulse-border 1.5s infinite" }} />
            <div>
              <strong>🚨 Rescue Mode Active ({rescueModeCount} target{rescueModeCount > 1 ? 's' : ''})</strong>
              <div style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                Emergency actions loaded. Focus exclusively on critical paths and ignore secondary features.
              </div>
            </div>
          </div>
          <Link to={`/task/${tasks.find(t => t.rescueMode)?.id}`} className="btn btn-danger" style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}>
            View Emergency Plan
          </Link>
        </div>
      )}

      {/* High-Level Auditing Metric Cards */}
      <div 
        style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", 
          gap: "1rem" 
        }}
      >
        {/* Health Score Card */}
        <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: getHealthColor(avgHealthScore) }}>
            <Shield size={24} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase" }}>Deadline Health</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
              <span style={{ color: getHealthColor(avgHealthScore) }}>{avgHealthScore}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 400 }}>/100</span>
            </div>
          </div>
        </div>

        {/* Risk Score Card */}
        <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: avgRiskScore > 50 ? "var(--brand-danger)" : "var(--brand-success)" }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase" }}>Avg Risk Index</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
              <span style={{ color: avgRiskScore > 60 ? "var(--brand-danger)" : avgRiskScore > 30 ? "var(--brand-warning)" : "var(--brand-success)" }}>
                {avgRiskScore}%
              </span>
            </div>
          </div>
        </div>

        {/* Rescue Mode Status Card */}
        <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ 
            padding: "0.5rem", 
            borderRadius: "var(--radius-sm)", 
            backgroundColor: isRescueActive ? "rgba(239, 68, 68, 0.1)" : "var(--bg-secondary)", 
            border: `1px solid ${isRescueActive ? "var(--brand-danger)" : "var(--border-color)"}`, 
            color: isRescueActive ? "var(--brand-danger)" : "var(--text-muted)" 
          }}>
            <Flame size={24} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase" }}>Rescue Protocols</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: isRescueActive ? "var(--brand-danger)" : "var(--text-secondary)" }}>
              {isRescueActive ? "🚨 CRITICAL HAZARD" : "STANDBY (NORMAL)"}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Task list & side panels */}
      <div className="grid-dashboard">
        {/* Left Side: Tasks Feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Active Deadlines Track</h2>
            </div>
            
            {tasks.length === 0 ? (
              <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                <CheckSquare size={36} style={{ marginBottom: "1rem", strokeWidth: 1.5 }} />
                <div>No tasks in this workspace. Click "New Target" to start tracking.</div>
              </div>
            ) : (
              <div>
                {/* Header Row */}
                <div className="notion-table-row notion-table-header">
                  <div>Task Name</div>
                  <div>Priority</div>
                  <div>Risk Level</div>
                  <div>Progress</div>
                  <div>Deadline</div>
                </div>
                
                {/* Task Items */}
                {tasks.map(task => {
                  const daysLeft = getDaysLeftInclusive(task.deadline);
                  return (
                    <div key={task.id} className="notion-table-row">
                      {/* Title & Navigation */}
                      <div>
                        <Link 
                          to={`/task/${task.id}`} 
                          style={{ fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}
                          className="task-title-hover"
                        >
                          {task.rescueMode && <Flame size={14} style={{ color: "var(--brand-danger)" }} />}
                          <span>{task.title}</span>
                        </Link>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "260px" }}>
                          {task.description || "No description provided."}
                        </div>
                      </div>

                      {/* Priority */}
                      <div>
                        <span className={`badge badge-${task.priority}`}>
                          {task.priority}
                        </span>
                      </div>

                      {/* Risk Level */}
                      <div>
                        <span className={`badge badge-${task.riskLevel}`}>
                          {task.riskLevel}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ paddingRight: "1rem" }}>
                        <div className="flex-between" style={{ fontSize: "0.75rem", marginBottom: "0.25rem", color: "var(--text-secondary)" }}>
                          <span>{task.progressPercentage}%</span>
                        </div>
                        <div className="progress-bar-container">
                          <div 
                            className="progress-bar-fill" 
                            style={{ 
                              width: `${task.progressPercentage}%`,
                              backgroundColor: task.rescueMode ? "var(--brand-danger)" : "var(--brand-success)"
                            }} 
                          />
                        </div>
                      </div>

                      {/* Due date status */}
                      <div style={{ fontSize: "0.8rem", color: daysLeft <= 1 ? "var(--brand-danger)" : daysLeft <= 3 ? "var(--brand-warning)" : "var(--text-secondary)", fontWeight: daysLeft <= 3 ? 600 : 400 }}>
                        {daysLeft <= 0 ? "Overdue" : daysLeft === 1 ? "Due Tomorrow" : `In ${daysLeft} days`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Sidebar Panels */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Upcoming Deadlines */}
          <div className="card">
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Calendar size={16} style={{ color: "var(--text-muted)" }} />
              <span>Upcoming Deadlines</span>
            </h3>
            {upcomingTasks.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No upcoming deadlines.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {upcomingTasks.map(t => {
                  const daysLeft = getDaysLeftInclusive(t.deadline);
                  return (
                    <Link 
                      key={t.id} 
                      to={`/task/${t.id}`}
                      style={{ 
                        display: "block", 
                        padding: "0.5rem", 
                        borderRadius: "var(--radius-sm)", 
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)"
                      }}
                    >
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.title}
                      </div>
                      <div style={{ display: "flex", justifyContent: "between", alignItems: "center", marginTop: "0.25rem", fontSize: "0.75rem" }}>
                        <span style={{ color: daysLeft <= 1 ? "var(--brand-danger)" : "var(--text-muted)" }}>
                          {daysLeft <= 0 ? "Overdue" : daysLeft === 1 ? "Tomorrow" : `In ${daysLeft} days`}
                        </span>
                        <span style={{ color: "var(--text-secondary)" }}>{t.progressPercentage}% done</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* High Risk Targets panel */}
          <div className="card">
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertTriangle size={16} style={{ color: "var(--brand-warning)" }} />
              <span>High-Risk Targets</span>
            </h3>
            {highRiskTasks.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No high risk tasks currently. Keep it up!</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {highRiskTasks.map(t => (
                  <Link 
                    key={t.id} 
                    to={`/task/${t.id}`}
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      padding: "0.5rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(212, 64, 64, 0.2)",
                      backgroundColor: "rgba(212, 64, 64, 0.05)"
                    }}
                  >
                    <div style={{ minWidth: 0, paddingRight: "0.5rem" }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                        Health Index: {t.healthScore}/100
                      </div>
                    </div>
                    <span className={`badge badge-${t.riskLevel}`} style={{ flexShrink: 0 }}>
                      {t.riskLevel}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Task Modal Dialog */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Create New Tracking Target</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateTask}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="task-title-input">Target Name</label>
                  <input 
                    id="task-title-input"
                    type="text" 
                    className="input-field" 
                    placeholder="e.g. Write Literature Thesis" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="task-desc-input">Description</label>
                  <textarea 
                    id="task-desc-input"
                    className="input-field" 
                    rows="3" 
                    placeholder="Provide details about parameters, guides, or files..." 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="task-deadline-input">Deadline Target</label>
                    <input 
                      id="task-deadline-input"
                      type="datetime-local" 
                      className="input-field" 
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      min={getCurrentDateTimeString()}
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="task-priority-select">Priority Level</label>
                    <select 
                      id="task-priority-select"
                      className="input-field"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      disabled={isSubmitting}
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="task-est-input">Est. Work Hours</label>
                    <input 
                      id="task-est-input"
                      type="number" 
                      className="input-field" 
                      min="1" 
                      max="500"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="task-avail-input">Daily Avail. Hours</label>
                    <input 
                      id="task-avail-input"
                      type="number" 
                      className="input-field" 
                      min="1" 
                      max="24"
                      value={availableHoursPerDay}
                      onChange={(e) => setAvailableHoursPerDay(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>
              
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  id="submit-task-button"
                >
                  {isSubmitting ? "Running AI Audit..." : "Initiate Audit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
