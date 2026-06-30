import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { TaskProvider } from "./context/TaskContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

// Pages
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import TaskDetailsPage from "./pages/TaskDetailsPage";

// Global style references
import "./styles/index.css";

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <TaskProvider>
          <Layout>
            <Routes>
              {/* Public Views */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              
              {/* Protected Workspace Views */}
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/task/:id" 
                element={
                  <ProtectedRoute>
                    <TaskDetailsPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* Fallback route */}
              <Route path="*" element={<LandingPage />} />
            </Routes>
          </Layout>
        </TaskProvider>
      </AuthProvider>
    </Router>
  );
}
