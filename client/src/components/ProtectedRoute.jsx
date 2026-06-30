import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div 
        style={{ 
          height: "100vh", 
          display: "flex", 
          flexDirection: "column",
          alignItems: "center", 
          justifyContent: "center",
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-secondary)"
        }}
      >
        <div style={{
          width: "24px",
          height: "24px",
          border: "2px solid var(--border-color)",
          borderTopColor: "var(--brand-secondary)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          marginBottom: "1rem"
        }} />
        <span style={{ fontSize: "0.9rem" }}>Loading secure session...</span>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}} />
      </div>
    );
  }

  if (!user) {
    // Redirect to login page and save previous location for post-login redirect
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
