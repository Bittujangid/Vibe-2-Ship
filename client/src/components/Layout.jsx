import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import { Menu, Shield } from "lucide-react";

export default function Layout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const publicPaths = ["/", "/login"];
  const isPublicPath = publicPaths.includes(location.pathname);

  // If path is public OR user is not authenticated, render layout with Top Nav Header
  if (isPublicPath || !user) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
        <Navbar />
        <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {children}
        </main>
        <footer 
          style={{ 
            padding: "1.5rem 2rem", 
            borderTop: "1px solid var(--border-color)", 
            textAlign: "center", 
            fontSize: "0.8rem", 
            color: "var(--text-muted)",
            backgroundColor: "var(--bg-secondary)"
          }}
        >
          &copy; {new Date().getFullYear()} ChronoGuard AI. All rights reserved. Built with minimalist SaaS principles.
        </footer>
      </div>
    );
  }

  // Dashboard / Authenticated views show the Left Sidebar Layout
  return (
    <div className="app-container">
      {/* Sidebar Drawer */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {/* Mobile Drawer Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="main-content">
        {/* Mobile Header Bar */}
        <header className="mobile-header">
          <button 
            className="mobile-menu-btn" 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle Navigation Sidebar"
          >
            <Menu size={20} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700 }}>
            <Shield size={16} style={{ color: "var(--brand-secondary)" }} />
            <span style={{ fontSize: "0.95rem" }}>ChronoGuard AI</span>
          </div>
          <div style={{ width: 20 }} /> {/* Layout balance spacer */}
        </header>

        <main className="content-body" style={{ overflowY: "auto", maxHeight: "100vh" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
