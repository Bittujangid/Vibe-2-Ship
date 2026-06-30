import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Shield, Sparkles, AlertTriangle, RefreshCw, BarChart2, CheckCircle2, ArrowRight } from "lucide-react";

export default function LandingPage() {
  const { user } = useAuth();

  const workflowSteps = [
    { title: "Create Task", desc: "Define estimated hours & daily capacity.", icon: <Sparkles size={16} /> },
    { title: "AI Task Breakdown", desc: "Generate a targeted subtask checklist.", icon: <CheckCircle2 size={16} /> },
    { title: "Schedule Optimizing", desc: "Distribute tasks across daily study blocks.", icon: <BarChart2 size={16} /> },
    { title: "Risk Prediction", desc: "Monitor deadline risks in real time.", icon: <AlertTriangle size={16} /> },
    { title: "Health Scoring", desc: "Calculate overall completion likelihood.", icon: <Shield size={16} /> },
    { title: "Auto-Replanning", desc: "Automatically shift schedule when delayed.", icon: <RefreshCw size={16} /> },
    { title: "Emergency Rescue Mode", desc: "Activate emergency skips & priority action plans.", icon: <AlertTriangle size={16} style={{ color: "var(--brand-danger)" }} /> }
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Hero Section */}
      <section 
        style={{ 
          padding: "5rem 2rem 4rem 2rem", 
          textAlign: "center", 
          maxWidth: "900px", 
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem"
        }}
      >
        <div 
          style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: "0.5rem", 
            padding: "0.25rem 0.75rem", 
            backgroundColor: "var(--bg-secondary)", 
            border: "1px solid var(--border-color)",
            borderRadius: "50px",
            fontSize: "0.85rem",
            fontWeight: 500,
            color: "var(--text-secondary)"
          }}
        >
          <Shield size={14} style={{ color: "var(--brand-secondary)" }} />
          <span>Intelligent Deadline Security System</span>
        </div>

        <h1 style={{ fontSize: "3.2rem", lineHeight: 1.1, letterSpacing: "-0.03em" }}>
          Never miss a deadline.<br />
          Activate <span style={{ color: "var(--brand-danger)", fontWeight: 700 }}>Rescue Mode</span>.
        </h1>

        <p style={{ fontSize: "1.15rem", color: "var(--text-secondary)", maxWWidth: "640px", lineHeight: 1.6 }}>
          ChronoGuard AI is an intelligence-powered productivity companion that monitors your progress, calculates time buffers, auto-replans workloads, and steps in with emergency action protocols before deadlines fail.
        </p>

        <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <Link to={user ? "/dashboard" : "/login"} className="btn btn-primary" style={{ padding: "0.75rem 1.5rem", fontSize: "1rem" }}>
            <span>{user ? "Go to Dashboard" : "Sign Up Free"}</span>
            <ArrowRight size={16} />
          </Link>
          <a href="#features" className="btn btn-secondary" style={{ padding: "0.75rem 1.5rem", fontSize: "1rem" }}>
            Explore Core Engine
          </a>
        </div>
      </section>

      {/* AI Workflow Diagram */}
      <section 
        style={{ 
          padding: "3rem 2rem", 
          backgroundColor: "var(--bg-secondary)", 
          borderTop: "1px solid var(--border-color)",
          borderBottom: "1px solid var(--border-color)"
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "1.5rem", textAlign: "center", marginBottom: "2.5rem" }}>
            The ChronoGuard AI Lifecycle Workflow
          </h2>
          
          {/* Horizontal/Vertical Workflow Grid */}
          <div 
            style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", 
              gap: "1.5rem" 
            }}
          >
            {workflowSteps.map((step, idx) => (
              <div 
                key={idx} 
                className="card"
                style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "0.75rem",
                  position: "relative",
                  backgroundColor: "var(--bg-primary)"
                }}
              >
                <div 
                  style={{
                    position: "absolute",
                    top: "0.75rem",
                    right: "0.75rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    fontWeight: 600
                  }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </div>

                <div 
                  style={{ 
                    width: "32px", 
                    height: "32px", 
                    borderRadius: "4px", 
                    backgroundColor: "var(--bg-secondary)", 
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--brand-secondary)"
                  }}
                >
                  {step.icon}
                </div>

                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.25rem" }}>{step.title}</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" style={{ padding: "5rem 2rem", maxWidth: "1100px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "1.8rem", textAlign: "center", marginBottom: "3rem" }}>
          Core AI Capabilities
        </h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h3 style={{ fontSize: "1.1rem" }}>📋 Intelligent Subtask Breakdown</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Pass your assignments, coding tasks, or study goals. The backend API divides your task into atomic actionable items with precise hour estimations.
            </p>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h3 style={{ fontSize: "1.1rem" }}>⚡ Auto-Replanning Engine</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Life gets in the way. If you miss planned sessions or log a delay, our AI algorithm re-calculates required hours per day and shifts work dynamically.
            </p>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", borderLeft: "2px solid var(--brand-danger)" }}>
            <h3 style={{ fontSize: "1.1rem" }}>🚨 Emergency Rescue Protocols</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              When a deadline falls within 48 hours and progress is lagging, Rescue Mode activates. It flags optional components to skip, generates a compressed timeline, and targets a survival-rate strategy.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
