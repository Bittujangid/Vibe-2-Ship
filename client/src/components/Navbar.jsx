import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";
import { Shield } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header 
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 2rem",
        borderBottom: "1px solid var(--border-color)",
        backgroundColor: "var(--bg-secondary)",
        height: "64px"
      }}
    >
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "1.1rem" }}>
        <Shield size={20} style={{ color: "var(--brand-secondary)" }} />
        <span>ChronoGuard <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>AI</span></span>
      </Link>

      <nav style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <Link to="/" style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }} className="nav-link">Home</Link>
        {user ? (
          <>
            <Link to="/dashboard" style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }} className="nav-link">Dashboard</Link>
            <button 
              onClick={logout} 
              className="btn btn-secondary" 
              style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem" }}
              id="logout-button"
            >
              Sign Out
            </button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary" style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem" }}>
            Sign In
          </Link>
        )}
        <ThemeToggle />
      </nav>
    </header>
  );
}
