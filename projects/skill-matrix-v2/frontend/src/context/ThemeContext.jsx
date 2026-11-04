// src/context/ThemeContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";

// Create the context
const ThemeContext = createContext();

// Custom hook to consume the context
export const useTheme = () => useContext(ThemeContext);

// Provider component
export const ThemeProvider = ({ children }) => {
  const [dark, setDark] = useState(false);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") setDark(true);
    else if (savedTheme === "light") setDark(false);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches)
      setDark(true);
  }, []);

  // Apply/remove "dark" class on <html> and persist in localStorage
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  // Toggle function
  const toggleTheme = () => setDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ dark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
