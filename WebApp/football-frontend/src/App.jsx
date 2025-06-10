import React from "react";
import Team_Analytics from "./Team_Analytics";
import Team_Predictions from "./Team_Predictions";
import { Routes, Route, NavLink } from "react-router-dom";
import logo from "./assets/FPL_analytics_logo.png"; // adjust path based on location


export default function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="bg-royal-beige text-royal-gold px-6 py-4 shadow relative">
  <div className="flex items-center justify-between w-full max-w-16xl mx-auto relative">
    
    {/* Left: Logo + Title */}
    <div className="flex items-center space-x-3 absolute left-1 top-1/2 -translate-y-1/2">
      <img
        src={logo}
        alt="FPL Logo"
        className="h-16 w-16 object-contain"
      />
      <div className="text-3xl font-bold">FPL Analytics</div>
    </div>

    {/* Center: Navigation */}
    <div className="flex gap-4 mx-auto">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `px-4 py-2 rounded border border-royal-gold text-royal-gold font-semibold ${
            isActive ? "bg-black hover:text-royal-gold " : "hover:bg-royal-gold hover:text-black"
          }`
        }
      >
        Team Analytics
      </NavLink>
      <NavLink
        to="/Score_Predictions"
        className={({ isActive }) =>
          `px-4 py-2 rounded border border-royal-gold text-royal-gold font-semibold ${
            isActive ? "bg-black hover:text-royal-gold " : "hover:bg-royal-gold hover:text-black"
          }`
        }
      >
        Score Predictions
      </NavLink>
    </div>
  </div>
</nav>


      {/* Routes */}
      <Routes>
        <Route path="/" element={<Team_Analytics />} />
        <Route path="/Score_Predictions" element={<Team_Predictions />} />
      </Routes>
    </div>
  );
}
