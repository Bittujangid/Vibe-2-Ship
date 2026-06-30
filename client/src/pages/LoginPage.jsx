import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Shield, Mail, Chrome, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { signInWithGoogle, signUpWithEmail, signInWithEmail, isFirebaseConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  // Determine where to redirect after login (default: /dashboard)
  const from = location.state?.from?.pathname || "/dashboard";

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate(from, { replace: true });
    } catch (err) {
      console.error(err);
      setError("Failed to sign in. Please verify connection credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError("");
    
    // Client-side validations
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      console.error("Email Auth Error:", err);
      const code = err.code || "";
      if (code === "auth/email-already-in-use") {
        setError("This email address is already registered.");
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Invalid email or password.");
      } else if (code === "auth/weak-password") {
        setError("Password must be at least 6 characters.");
      } else {
        setError(err.message || "Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      style={{ 
        flex: 1, 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        padding: "2rem",
        backgroundColor: "var(--bg-primary)"
      }}
    >
      <div 
        className="card"
        style={{
          width: "100%",
          maxWidth: "400px",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem"
        }}
      >
        {/* Branding header */}
        <div style={{ textAlign: "center" }}>
          <div 
            style={{ 
              width: "48px", 
              height: "48px", 
              borderRadius: "8px", 
              backgroundColor: "var(--bg-secondary)", 
              border: "1px solid var(--border-color)", 
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--brand-secondary)",
              marginBottom: "1rem"
            }}
          >
            <Shield size={24} />
          </div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 600 }}>Welcome to ChronoGuard AI</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Secure your schedules and defeat deadline delay
          </p>
        </div>

        {error && (
          <div 
            style={{ 
              backgroundColor: "rgba(212, 64, 64, 0.1)", 
              border: "1px solid var(--brand-danger)", 
              color: "var(--brand-danger)", 
              padding: "0.75rem", 
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* OAuth Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <button
            onClick={handleGoogleLogin}
            disabled={loading || !isFirebaseConfigured}
            className="btn btn-secondary"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.75rem",
              padding: "0.75rem",
              width: "100%",
              fontWeight: 500,
              cursor: isFirebaseConfigured ? "pointer" : "not-allowed",
              opacity: isFirebaseConfigured ? 1 : 0.5
            }}
            id="google-login-button"
          >
            <Chrome size={18} />
            <span>{loading ? "Authenticating..." : "Continue with Google"}</span>
          </button>
        </div>

        {/* Form Separator divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border-color)" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>or</span>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border-color)" }} />
        </div>

        {/* Email Password Form */}
        <form onSubmit={handleEmailSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email-input">Email Address</label>
            <input 
              id="email-input"
              type="email" 
              className="input-field" 
              placeholder="name@company.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || !isFirebaseConfigured}
              style={{ opacity: isFirebaseConfigured ? 1 : 0.6 }}
              required
            />
          </div>
          
          <div className="form-group" style={{ marginBottom: "0.5rem" }}>
            <label className="form-label" htmlFor="password-input">Password</label>
            <input 
              id="password-input"
              type="password" 
              className="input-field" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || !isFirebaseConfigured}
              style={{ opacity: isFirebaseConfigured ? 1 : 0.6 }}
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading || !isFirebaseConfigured}
            className="btn btn-primary"
            style={{ width: "100%", padding: "0.75rem", fontWeight: 500, marginTop: "1rem" }}
          >
            {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
          </button>

          <div style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.8rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--brand-secondary)",
                fontWeight: 600,
                cursor: "pointer",
                padding: 0
              }}
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </div>
        </form>

        {/* Offline Bypass Notice Box replaced with strict configuration error */}
        {!isFirebaseConfigured && (
          <div
            style={{
              padding: "0.75rem",
              backgroundColor: "rgba(212, 64, 64, 0.05)",
              border: "1px solid var(--brand-danger)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              color: "var(--brand-danger)",
              lineHeight: 1.4
            }}
          >
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.25rem" }}>
              <span>⚠️ Configuration Error</span>
            </div>
            Firebase credentials are not configured in your environment variables. Please provide active Firebase API credentials in your `.env` configuration file to enable sign-in.
          </div>
        )}
      </div>
    </div>
  );
}
