import React, { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  // Check localStorage first, fallback to dark mode by default
  const [isDark, setIsDark] = useState(() => {
    const savedTheme = localStorage.getItem("chronoguard_theme");
    return savedTheme ? savedTheme === "dark" : true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.remove("theme-light");
      root.classList.add("theme-dark");
      localStorage.setItem("chronoguard_theme", "dark");
    } else {
      root.classList.remove("theme-dark");
      root.classList.add("theme-light");
      localStorage.setItem("chronoguard_theme", "light");
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="btn btn-secondary"
      style={{ padding: "0.4rem", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center" }}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle Theme"
      id="theme-toggle-button"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
