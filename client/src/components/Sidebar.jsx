import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTasks } from "../context/TaskContext";
import ThemeToggle from "./ThemeToggle";
import { Shield, LayoutDashboard, LogOut, ExternalLink, Flame } from "lucide-react";

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const { tasks } = useTasks();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (onClose) onClose();
    await logout();
    navigate("/");
  };

  const handleLinkClick = () => {
    if (onClose) onClose();
  };

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      {/* Sidebar Header Brand */}
      <div 
        style={{
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Link to="/dashboard" onClick={handleLinkClick} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700 }}>
          <Shield size={18} style={{ color: "var(--brand-secondary)" }} />
          <span>ChronoGuard <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>AI</span></span>
        </Link>
        <ThemeToggle />
      </div>

      {/* Navigation Links */}
      <nav style={{ padding: "1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <NavLink
          to="/dashboard"
          onClick={handleLinkClick}
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.9rem",
            fontWeight: 500,
            borderRadius: "var(--radius-sm)",
            backgroundColor: isActive ? "var(--active-bg)" : "transparent",
            color: isActive ? "var(--text-primary)" : "var(--text-secondary)"
          })}
        >
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </NavLink>
        <Link
          to="/"
          onClick={handleLinkClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.9rem",
            fontWeight: 500,
            color: "var(--text-secondary)"
          }}
        >
          <ExternalLink size={16} />
          <span>Landing Page</span>
        </Link>
      </nav>

      {/* Active Tasks / Deadlines Submenu */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem 0.75rem" }}>
        <div 
          style={{ 
            fontSize: "0.75rem", 
            fontWeight: 600, 
            textTransform: "uppercase", 
            letterSpacing: "0.05em",
            color: "var(--text-muted)",
            padding: "0 0.75rem 0.5rem 0.75rem"
          }}
        >
          Active Deadlines
        </div>
        {tasks.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0.5rem 0.75rem" }}>
            No active tasks
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            {tasks.map(task => {
              const isRescue = task.rescueMode;
              return (
                <Link
                  key={task.id}
                  to={`/task/${task.id}`}
                  onClick={handleLinkClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.4rem 0.75rem",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-secondary)",
                    textDecoration: "none"
                  }}
                  className="sidebar-task-link"
                >
                  <span 
                    style={{ 
                      whiteSpace: "nowrap", 
                      overflow: "hidden", 
                      textOverflow: "ellipsis",
                      marginRight: "0.5rem"
                    }}
                  >
                    {task.title}
                  </span>
                  
                  {isRescue ? (
                    <Flame size={12} style={{ color: "var(--brand-danger)", flexShrink: 0 }} />
                  ) : (
                    <span 
                      style={{ 
                        fontSize: "0.7rem", 
                        padding: "0.05rem 0.35rem", 
                        borderRadius: "2px",
                        backgroundColor: `var(--priority-${task.priority})`,
                        color: "#fff",
                        flexShrink: 0
                      }}
                    >
                      {task.priority[0].toUpperCase()}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* User Session Footer Card */}
      {user && (
        <div
          style={{
            padding: "1rem",
            borderTop: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
            <img
              src={user.photoURL || "https://api.dicebear.com/7.x/bottts/svg?seed=chronoguard"}
              alt="User Avatar"
              style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--border-color)", flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.displayName || "User"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.email}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "0.25rem",
              display: "flex",
              alignItems: "center"
            }}
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}
