import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTasks } from "../context/TaskContext";
import { fetchReplannedTask, fetchRiskPrediction, fetchHealthScore, fetchTaskAnalysis } from "../utils/api";
import { 
  ArrowLeft, Shield, AlertTriangle, Flame, Calendar, CheckSquare, 
  RefreshCw, BarChart3, Clock, Play, List, HelpCircle, History 
} from "lucide-react";

export default function TaskDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getTaskById, updateTask, deleteTask, loading } = useTasks();
  const task = getTaskById(id);

  const [isReplanning, setIsReplanning] = useState(false);
  const [replanReason, setReplanReason] = useState("");
  const [showReplanForm, setShowReplanForm] = useState(false);
  const [isRefreshingAI, setIsRefreshingAI] = useState(false);
  const [replanAlert, setReplanAlert] = useState(null);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ height: '24px', width: '150px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', animation: 'pulse-border 2s infinite' }} />
        <div style={{ height: '140px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', animation: 'pulse-border 2s infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          <div style={{ height: '300px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', animation: 'pulse-border 2s infinite' }} />
          <div style={{ height: '300px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', animation: 'pulse-border 2s infinite' }} />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
        <h2 style={{ marginBottom: "1rem" }}>Target Not Found</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          The deadline target you are looking for does not exist in this workspace.
        </p>
        <Link to="/dashboard" className="btn btn-primary">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const rescuePlan = task.emergencyActionPlan;
  const rescueReason = task.rescueReason;

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

  const daysLeft = getDaysLeftInclusive(task.deadline);
  const remainingHours = task.estimatedHours * (1 - (task.progressPercentage / 100));
  const roundedRemainingHours = Math.round(remainingHours * 10) / 10;

  // Handle manual progress slider change (Deterministic calculation, zero Gemini requests)
  const handleProgressChange = async (newVal) => {
    const progressPercentage = Number(newVal);
    const status = progressPercentage === 100 ? "completed" : progressPercentage > 0 ? "in_progress" : "pending";
    const userId = user?.uid || "anonymous";
    
    try {
      const riskRes = await fetchRiskPrediction(
        progressPercentage, 
        task.deadline, 
        task.estimatedHours, 
        task.availableHoursPerDay,
        userId,
        task.id
      );
      const healthRes = await fetchHealthScore(riskRes.riskScore, userId, task.id);
      
      const remainingWorkHours = task.estimatedHours * (1 - (progressPercentage / 100));
      const remainingCapacityHours = Math.max(0, daysLeft) * (task.availableHoursPerDay || 2);
      const healthScore = healthRes.healthScore;
      const riskLevel = riskRes.riskLevel;

      let isRescueTriggered = false;
      let rescueReason = "";
      
      if (remainingWorkHours > remainingCapacityHours) {
        isRescueTriggered = true;
        rescueReason = `Emergency threshold: Remaining estimated work (${remainingWorkHours.toFixed(1)}h) exceeds total capacity (${remainingCapacityHours.toFixed(1)}h).`;
      } else if (healthScore <= 20) {
        isRescueTriggered = true;
        rescueReason = `Critical health score of ${healthScore}/100 detected.`;
      } else if (riskLevel?.toLowerCase() === "critical") {
        isRescueTriggered = true;
        rescueReason = `Critical risk level flagged for task timeline.`;
      } else if (daysLeft <= 2 && progressPercentage < 50) {
        isRescueTriggered = true;
        rescueReason = `Urgent compression: Deadline is within 48 hours (${daysLeft.toFixed(1)} days remaining) and progress is lagging under 50% (${progressPercentage}%).`;
      }

      updateTask(task.id, {
        progressPercentage,
        status,
        riskScore: riskRes.riskScore,
        riskLevel: riskRes.riskLevel,
        healthScore: healthRes.healthScore,
        rescueMode: isRescueTriggered,
        rescueReason: rescueReason || ""
      });
    } catch (e) {
      console.warn("Could not recalculate risk on backend. Updating progress locally.", e);
      updateTask(task.id, { progressPercentage, status });
    }
  };

  // Toggle Subtask Completion (Deterministic calculation, zero Gemini requests)
  const handleSubtaskToggle = async (subtaskId) => {
    const updatedSubtasks = task.subtasks.map(st => {
      if (st.id === subtaskId) {
        return { ...st, completed: !st.completed };
      }
      return st;
    });

    const completedCount = updatedSubtasks.filter(st => st.completed).length;
    const progressPercentage = Math.round((completedCount / updatedSubtasks.length) * 100) || 0;
    const status = progressPercentage === 100 ? "completed" : "in_progress";
    const userId = user?.uid || "anonymous";

    try {
      const riskRes = await fetchRiskPrediction(
        progressPercentage, 
        task.deadline, 
        task.estimatedHours, 
        task.availableHoursPerDay,
        userId,
        task.id
      );
      const healthRes = await fetchHealthScore(riskRes.riskScore, userId, task.id);
      
      const remainingWorkHours = task.estimatedHours * (1 - (progressPercentage / 100));
      const remainingCapacityHours = Math.max(0, daysLeft) * (task.availableHoursPerDay || 2);
      const healthScore = healthRes.healthScore;
      const riskLevel = riskRes.riskLevel;

      let isRescueTriggered = false;
      let rescueReason = "";
      
      if (remainingWorkHours > remainingCapacityHours) {
        isRescueTriggered = true;
        rescueReason = `Emergency threshold: Remaining estimated work (${remainingWorkHours.toFixed(1)}h) exceeds total capacity (${remainingCapacityHours.toFixed(1)}h).`;
      } else if (healthScore <= 20) {
        isRescueTriggered = true;
        rescueReason = `Critical health score of ${healthScore}/100 detected.`;
      } else if (riskLevel?.toLowerCase() === "critical") {
        isRescueTriggered = true;
        rescueReason = `Critical risk level flagged for task timeline.`;
      } else if (daysLeft <= 2 && progressPercentage < 50) {
        isRescueTriggered = true;
        rescueReason = `Urgent compression: Deadline is within 48 hours (${daysLeft.toFixed(1)} days remaining) and progress is lagging under 50% (${progressPercentage}%).`;
      }

      updateTask(task.id, {
        subtasks: updatedSubtasks,
        progressPercentage,
        status,
        riskScore: riskRes.riskScore,
        riskLevel: riskRes.riskLevel,
        healthScore: healthRes.healthScore,
        rescueMode: isRescueTriggered,
        rescueReason: rescueReason || ""
      });
    } catch (e) {
      updateTask(task.id, { subtasks: updatedSubtasks, progressPercentage, status });
    }
  };

  // Trigger Backend schedule optimization (Replan) (Exactly ONE Gemini request, queue & server locking)
  const handleReplanTrigger = async (e) => {
    e.preventDefault();
    if (!replanReason || !replanReason.trim()) {
      alert("Validation Error: Re-plan reason cannot be empty or contain only whitespace.");
      return;
    }

    if (isReplanning) return;

    setIsReplanning(true);
    const userId = user?.uid || "anonymous";
    try {
      const replanRes = await fetchReplannedTask(task.schedule, task.progressPercentage, task.description || "Replan backlog", replanReason, userId, task.id, task);
      
      if (replanRes.scheduleChanged === false) {
        setReplanAlert({
          type: "info",
          reason: replanRes.reason || "The existing schedule already fits the remaining workload and deadline.",
          message: "No schedule changes were required because your current schedule is already optimal.",
          recommendations: replanRes.newRecommendations || []
        });

        const newHistoryItem = {
          date: new Date().toISOString(),
          log: replanRes.logMessage || replanRes.reason || "AI schedule audit completed: Existing schedule is already optimal."
        };

        updateTask(task.id, {
          replanningHistory: [newHistoryItem, ...(task.replanningHistory || [])]
        });

        setReplanReason("");
        setShowReplanForm(false);
        return;
      }

      setReplanAlert({
        type: "success",
        reason: replanRes.reason || `Schedule replanned due to: "${replanReason}"`,
        message: "Your schedule has been successfully re-optimized by ChronoGuard AI!",
        recommendations: replanRes.newRecommendations || []
      });

      const newHistoryItem = {
        date: new Date().toISOString(),
        log: replanRes.logMessage || replanRes.reason || `Schedule replanned due to: "${replanReason}"`
      };

      updateTask(task.id, {
        schedule: replanRes.updatedSchedule || task.schedule,
        healthScore: replanRes.newHealthScore || task.healthScore,
        aiRecommendations: replanRes.newRecommendations || task.aiRecommendations || [],
        replanningHistory: [newHistoryItem, ...(task.replanningHistory || [])]
      });

      setReplanReason("");
      setShowReplanForm(false);
    } catch (err) {
      console.error(err);
      alert("Failed to replan schedule using server API.");
    } finally {
      setIsReplanning(false);
    }
  };

  // Manual Trigger to refresh analysis if fallback data is used (Exactly ONE Gemini request)
  const handleRefreshAI = async () => {
    if (isRefreshingAI) return;
    setIsRefreshingAI(true);
    const userId = user?.uid || "anonymous";
    try {
      const analysisRes = await fetchTaskAnalysis(
        task.title,
        task.description,
        task.deadline,
        task.estimatedHours,
        task.availableHoursPerDay,
        userId,
        task.id,
        true // forceRefresh = true to force bypass cache check and call Gemini
      );

      updateTask(task.id, {
        subtasks: analysisRes.subtasks || task.subtasks,
        schedule: analysisRes.schedule || task.schedule,
        riskScore: analysisRes.riskScore,
        riskLevel: analysisRes.riskLevel,
        healthScore: analysisRes.healthScore,
        rescueMode: analysisRes.rescuePlan?.active || false,
        rescueReason: analysisRes.rescuePlan?.reason || "",
        emergencyActionPlan: analysisRes.rescuePlan?.emergencyActionPlan || {},
        timelineSuggestions: analysisRes.timelineSuggestions || [],
        aiRecommendations: analysisRes.aiRecommendations || [],
        aiMetadata: analysisRes.aiMetadata
      });

      alert("AI Analysis successfully refreshed!");
    } catch (err) {
      console.error("Refresh AI Analysis failed:", err);
      alert("Failed to refresh AI Analysis. Please try again later.");
    } finally {
      setIsRefreshingAI(false);
    }
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to stop tracking this target? This action is permanent.")) {
      deleteTask(task.id);
      navigate("/dashboard");
    }
  };

  const getHealthColor = (score) => {
    if (score > 75) return "var(--brand-success)";
    if (score > 40) return "var(--brand-warning)";
    return "var(--brand-danger)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Back button & Controls */}
      <div className="flex-between">
        <Link to="/dashboard" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </Link>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(task.aiMetadata?.fallbackUsed || task.aiMetadata?.needsRefresh === true) && (
            <button 
              onClick={handleRefreshAI} 
              disabled={isRefreshingAI}
              className="btn btn-primary" 
              style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
            >
              <RefreshCw size={14} className={isRefreshingAI ? "animate-spin" : ""} />
              <span>{isRefreshingAI ? "Refreshing..." : "Refresh AI Analysis"}</span>
            </button>
          )}
          <button onClick={handleDelete} className="btn btn-danger" style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem" }}>
            Delete Target
          </button>
        </div>
      </div>

      {/* IMPOSSIBLE DEADLINE WARNING CARD */}
      {task.impossibleWithinDeadline && (
        <div 
          className="card" 
          style={{ 
            backgroundColor: "rgba(245, 158, 11, 0.08)", 
            borderColor: "rgba(245, 158, 11, 0.4)", 
            display: "flex", 
            flexDirection: "column",
            gap: "0.75rem",
            borderLeft: "4px solid rgb(245, 158, 11)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "rgb(245, 158, 11)" }}>
            <AlertTriangle size={20} />
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "rgb(245, 158, 11)", margin: 0 }}>🚨 Deadline Mathematically Impossible</h2>
          </div>
          
          <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
            {task.impossibleDeadlineExplanation || "The current workload exceeds the total available capacity before the deadline."}
          </div>
        </div>
      )}

      {/* Main Target Header */}
      <div 
        className="card"
        style={{
          borderLeft: task.rescueMode ? "3px solid var(--brand-danger)" : "1px solid var(--border-color)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "1.6rem" }}>{task.title}</h1>
              <span className={`badge badge-${task.priority}`}>{task.priority} Priority</span>
              <span className={`badge badge-${task.status === "in_progress" ? "medium" : task.status === "completed" ? "low" : "high"}`}>{task.status.replace("_", " ")}</span>
            </div>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "0.5rem", maxWidth: "700px" }}>
              {task.description || "No description provided."}
            </p>
            {task.aiMetadata?.needsRefresh === true && (
              <div style={{ 
                marginTop: "0.75rem", 
                padding: "0.5rem 0.75rem", 
                backgroundColor: "rgba(245, 158, 11, 0.08)", 
                border: "1px solid rgba(245, 158, 11, 0.3)", 
                borderRadius: "var(--radius-sm)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem"
              }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <AlertTriangle size={14} style={{ color: "var(--brand-warning)" }} />
                  <span>This task was generated using an older AI version.</span>
                </span>
                <button 
                  onClick={handleRefreshAI}
                  disabled={isRefreshingAI}
                  className="btn btn-secondary" 
                  style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                >
                  {isRefreshingAI ? "Refreshing..." : "Refresh AI Analysis"}
                </button>
              </div>
            )}
          </div>
          
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Time Remaining</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: daysLeft <= 1 ? "var(--brand-danger)" : "var(--text-primary)" }}>
                {daysLeft <= 0 ? "Expired" : `${daysLeft} day${daysLeft > 1 ? 's' : ''}`}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Work Backlog</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                {roundedRemainingHours} hrs / {task.estimatedHours} hrs
              </div>
            </div>
          </div>
        </div>

        {/* Progress Slider */}
        <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
          <div className="flex-between" style={{ marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Overall Progress</span>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{task.progressPercentage}% Complete</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <input 
              id="progress-slider"
              type="range" 
              min="0" 
              max="100" 
              value={task.progressPercentage} 
              onChange={(e) => handleProgressChange(e.target.value)}
              style={{ flex: 1, accentColor: task.rescueMode ? "var(--brand-danger)" : "var(--brand-secondary)", cursor: "pointer" }}
            />
          </div>
        </div>
      </div>

      {/* EMERGENCY RESCUE BANNER DISPLAY */}
      {task.rescueMode && (
        <div 
          className="card" 
          style={{ 
            backgroundColor: "rgba(212, 64, 64, 0.05)", 
            borderColor: "var(--brand-danger)", 
            display: "flex", 
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--brand-danger)" }}>
            <Flame size={20} style={{ animation: "pulse-border 1.5s infinite" }} />
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--brand-danger)" }}>🚨 Rescue Mode Activated</h2>
          </div>
          
          <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>Trigger Reason:</strong> <span style={{ color: "var(--brand-danger)", fontWeight: 500 }}>{rescueReason || task.rescueReason || "Timeline threshold exceeded."}</span>
            </div>
            This target's progress is lagging significantly behind the remaining available hours. ChronoGuard AI has compiled emergency recommendations below to prevent project failure.
          </div>

          {rescuePlan ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Realistic MVP Goal & Strategic Reasoning */}
              {(rescuePlan.realisticDeliveryExplanation || rescuePlan.reasoning) && (
                <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", fontSize: "0.85rem", lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, color: "var(--brand-secondary)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>📦 Realistic MVP Deliverable Goal</span>
                  </div>
                  <div>{rescuePlan.realisticDeliveryExplanation || rescuePlan.reason}</div>
                  {rescuePlan.reasoning && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-secondary)", fontStyle: "italic", borderTop: "1px dashed var(--border-color)", paddingTop: "0.4rem" }}>
                      <strong>Strategic Reasoning:</strong> {Array.isArray(rescuePlan.reasoning) ? rescuePlan.reasoning.join(" ") : rescuePlan.reasoning}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                {/* Essential MVP vs De-prioritized Tasks */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--brand-success)", marginBottom: "0.5rem" }}>🎯 Essential MVP Features (Must Complete)</div>
                    <ul style={{ paddingLeft: "1.25rem", fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {rescuePlan.criticalTasks?.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--brand-danger)", marginBottom: "0.5rem" }}>❌ De-prioritized / Postponed (Skip These)</div>
                    <ul style={{ paddingLeft: "1.25rem", fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {rescuePlan.tasksToSkip?.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                </div>

                {/* Prioritized Action Plan & Success Probability */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>⚡ Prioritized Emergency Action Plan</div>
                    <ol style={{ paddingLeft: "1.25rem", fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {(rescuePlan.actionPlan || rescuePlan.emergencySchedule?.map(s => s.priorityAction))?.map((a, i) => (
                        <li key={i} style={{ lineHeight: 1.4 }}>{typeof a === 'string' ? a : a.priorityAction}</li>
                      ))}
                    </ol>
                  </div>

                  <div style={{ marginTop: "auto", padding: "0.6rem 0.8rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>MVP Delivery Probability:</span>
                    <span style={{ fontSize: "1.1rem", fontWeight: 700, color: (rescuePlan.successProbability || 60) > 50 ? "var(--brand-success)" : "var(--brand-warning)" }}>
                      {rescuePlan.successProbability || 60}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No emergency plan compiled.</div>
          )}
        </div>
      )}

      {replanAlert && (
        <div 
          className="card" 
          style={{ 
            borderLeft: replanAlert.type === "success" ? "3px solid var(--brand-success)" : "3px solid var(--brand-secondary)",
            backgroundColor: "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            position: "relative"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: replanAlert.type === "success" ? "var(--brand-success)" : "var(--brand-secondary)" }}>
              <Shield size={18} />
              <strong style={{ fontSize: "0.95rem" }}>
                {replanAlert.type === "success" ? "📅 Schedule Re-Optimized Successfully" : "✨ Schedule Audit Completed"}
              </strong>
            </div>
            <button 
              onClick={() => setReplanAlert(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.8rem" }}
            >
              Dismiss
            </button>
          </div>
          
          <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", margin: 0 }}>
            {replanAlert.message}
          </p>
          
          {replanAlert.reason && (
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              <strong>Reason:</strong> {replanAlert.reason}
            </div>
          )}

          {replanAlert.recommendations && replanAlert.recommendations.length > 0 && (
            <div style={{ marginTop: "0.25rem" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem" }}>💡 New Recommendations:</div>
              <ul style={{ paddingLeft: "1.25rem", fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.25rem", margin: 0 }}>
                {replanAlert.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Columns: Subtasks checklist & Schedule details */}
      <div className="grid-dashboard">
        
        {/* Left: Subtask list & Generated Schedule */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Subtasks */}
          <div className="card">
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CheckSquare size={18} style={{ color: "var(--text-muted)" }} />
              <span>AI Task Breakdown Checklist</span>
            </h3>
            
            {task.subtasks.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No subtasks calculated.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {task.subtasks.map(st => (
                  <label 
                    key={st.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                      fontSize: "0.9rem",
                      cursor: "pointer",
                      padding: "0.35rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: st.completed ? "var(--bg-secondary)" : "transparent",
                      border: "1px solid transparent",
                      transition: "background-color 0.15s ease"
                    }}
                    className="checkbox-label-hover"
                  >
                    <input 
                      type="checkbox"
                      checked={st.completed}
                      onChange={() => handleSubtaskToggle(st.id)}
                      style={{ marginTop: "0.25rem", cursor: "pointer", accentColor: "var(--brand-secondary)" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "baseline" }}>
                      <span style={{ textDecoration: st.completed ? "line-through" : "none", color: st.completed ? "var(--text-muted)" : "var(--text-primary)" }}>
                        {st.title}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", flexShrink: 0 }}>
                        {st.estimatedHours} hrs
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Generated Work Schedule */}
          <div className="card">
            <div className="flex-between" style={{ marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Calendar size={18} style={{ color: "var(--text-muted)" }} />
                <span>AI Generated Work Schedule</span>
              </h3>
              
              <button 
                onClick={() => setShowReplanForm(!showReplanForm)}
                className="btn btn-secondary"
                style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
              >
                <RefreshCw size={14} />
                <span>Re-Optimize</span>
              </button>
            </div>

            {/* Replanning Form Banner */}
            {showReplanForm && (
              <form onSubmit={handleReplanTrigger} style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="replan-reason-input">Reason for Re-plan</label>
                  <input 
                    id="replan-reason-input"
                    type="text" 
                    className="input-field"
                    placeholder="e.g. Spent too much time researching, got sick..." 
                    value={replanReason}
                    onChange={(e) => setReplanReason(e.target.value)}
                    required
                    disabled={isReplanning}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: "0.8rem" }} onClick={() => setShowReplanForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ fontSize: "0.8rem" }} disabled={isReplanning}>
                    {isReplanning ? "Recalculating..." : "Optimize Schedule"}
                  </button>
                </div>
              </form>
            )}

            {task.schedule.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No work schedule generated yet. Complete AI audits by creating new targets.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {task.schedule.map((day, idx) => (
                  <div 
                    key={idx}
                    style={{ 
                      padding: "0.75rem 1rem", 
                      border: "1px solid var(--border-color)", 
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--bg-primary)"
                    }}
                  >
                    <div className="flex-between" style={{ marginBottom: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{day.date}</span>
                        {day.priority && (
                          <span className={`badge badge-${day.priority === 'high' ? 'high' : day.priority === 'medium' ? 'medium' : 'low'}`} style={{ fontSize: "0.65rem", padding: "0.05rem 0.25rem" }}>
                            {day.priority}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", borderRadius: "2px", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
                        {day.hoursAllocated} Hours
                      </span>
                    </div>
                    <ul style={{ paddingLeft: "1.25rem", fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      {day.tasks.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Risk Analysis, Health Index & logs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Health Index Card */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Shield size={16} style={{ color: "var(--text-muted)" }} />
              <span>Deadline Health Score</span>
            </h3>
            
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
              <span style={{ fontSize: "2rem", fontWeight: 800, color: getHealthColor(task.healthScore) }}>
                {task.healthScore}
              </span>
              <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>/100</span>
            </div>

            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ 
                  width: `${task.healthScore}%`, 
                  backgroundColor: getHealthColor(task.healthScore) 
                }} 
              />
            </div>
            
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
              Calculated dynamically. Higher health score indicates low risk, high available capacity buffers, and steady subtask completions.
            </p>
          </div>

          {/* Risk Analysis details */}
          <div className="card">
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <BarChart3 size={16} style={{ color: "var(--text-muted)" }} />
              <span>Risk Analysis Metrics</span>
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="flex-between">
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Risk Level</span>
                <span className={`badge badge-${task.riskLevel}`}>{task.riskLevel}</span>
              </div>
              
              <div className="flex-between">
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Risk Index</span>
                <span style={{ fontSize: "0.9rem", fontWeight: 600, color: task.riskScore > 60 ? "var(--brand-danger)" : "var(--brand-success)" }}>
                  {task.riskScore}%
                </span>
              </div>

              <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>Timeline Variables</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <div className="flex-between">
                    <span>Est. daily capacity:</span>
                    <strong>{task.availableHoursPerDay} hrs</strong>
                  </div>
                  <div className="flex-between">
                    <span>Required daily focus:</span>
                    <strong>{daysLeft > 0 ? (roundedRemainingHours / daysLeft).toFixed(1) : 0} hrs</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Replanning History Logs */}
          <div className="card">
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <History size={16} style={{ color: "var(--text-muted)" }} />
              <span>Replanning History Log</span>
            </h3>
            
            {(!task.replanningHistory || task.replanningHistory.length === 0) ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No schedule updates logged yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "180px", overflowY: "auto" }}>
                {task.replanningHistory.map((item, idx) => (
                  <div 
                    key={idx}
                    style={{ 
                      padding: "0.4rem 0.5rem", 
                      fontSize: "0.75rem", 
                      borderLeft: "2px solid var(--border-color)",
                      backgroundColor: "var(--bg-secondary)"
                    }}
                  >
                    <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginBottom: "0.15rem" }}>
                      {new Date(item.date).toLocaleString()}
                    </div>
                    <div style={{ color: "var(--text-secondary)", lineHeight: 1.3 }}>
                      {item.log}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
