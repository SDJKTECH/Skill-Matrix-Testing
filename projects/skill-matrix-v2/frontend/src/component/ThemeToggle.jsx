import React from "react";
import { useTheme } from "../context/ThemeContext"; // import the context

const ThemeToggle = () => {
  const { dark, toggleTheme } = useTheme(); // use global state

  return (
    <button
      onClick={toggleTheme} // toggle via context
      className="p-1 rounded bg-gray-200 dark:bg-gray-800 text-black dark:text-white transition-colors duration-300"
      title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {dark ? "🌙" : "☀️"}
    </button>
  );
};

export default ThemeToggle;
