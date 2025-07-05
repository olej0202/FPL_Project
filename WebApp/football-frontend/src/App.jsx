import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import Team_Analytics from "./Team_Analytics";
import Team_Predictions from "./Team_Predictions";
import FreeHitTeam from "./Free_Hit";
import WildcardTeam from "./Wildcard_team";
import MyTeam from "./My_team";
import PlayerAnalytics from "./Player_Analytics";
import NewsBlog from "./News";
import AITeamNav from "./components/team_navigation";
import logo from "./assets/FPL_analytics_logo.png";

import { User, Brain, Trophy, Users, Newspaper } from "lucide-react";

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Primary Top Navbar */}
      <nav className="bg-royal-beige text-royal-gold shadow">
        <div className="w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between px-4 py-3">
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-3 mr-6">
            <img src={logo} alt="FPL Logo" className="h-14 w-14 object-contain" />
            <span className="text-2xl sm:text-3xl font-bold">FPL Analytics</span>
          </div>

          {/* Main Navigation Links */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4 -translate-x-4">
            <NavLink
              to="/news"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded border border-royal-gold text-royal-gold font-semibold ${
                  isActive
                    ? "bg-black hover:text-royal-gold"
                    : "hover:bg-royal-gold hover:text-black"
                }`
              }
            >
              <Newspaper size={18} /> News Blog
            </NavLink>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded border border-royal-gold text-royal-gold font-semibold ${
                  isActive
                    ? "bg-black hover:text-royal-gold"
                    : "hover:bg-royal-gold hover:text-black"
                }`
              }
            >
              <Users size={18} /> Team Analytics
            </NavLink>
            <NavLink
              to="/Player_Analytics"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded border border-royal-gold text-royal-gold font-semibold ${
                  isActive
                    ? "bg-black hover:text-royal-gold"
                    : "hover:bg-royal-gold hover:text-black"
                }`
              }
            >
              <User size={18} /> Player Analytics
            </NavLink>
            <NavLink
              to="/Score_Predictions"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded border border-royal-gold text-royal-gold font-semibold ${
                  isActive
                    ? "bg-black hover:text-royal-gold"
                    : "hover:bg-royal-gold hover:text-black"
                }`
              }
            >
              <Trophy size={18} /> Score Predictions
            </NavLink>
            <NavLink
              to="/Free_Hit"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded border border-royal-gold text-royal-gold font-semibold ${
                  isActive
                    ? "bg-black hover:text-royal-gold"
                    : "hover:bg-royal-gold hover:text-black"
                }`
              }
            >
              <Brain size={18} /> AI Teams
            </NavLink>
          </div>
        </div>
      </nav>

      {/* AI Sub-navigation */}
      <AITeamNav />

      {/* Routes */}
      <Routes>
        <Route path="/" element={<Team_Analytics />} />
        <Route path="/Score_Predictions" element={<Team_Predictions />} />
        <Route path="/Player_Analytics" element={<PlayerAnalytics />} />
        <Route path="/Free_Hit" element={<FreeHitTeam />} />
        <Route path="/Wildcard_Team" element={<WildcardTeam />} />
        <Route path="/My_Team" element={<MyTeam />} />
        <Route path="/news" element={<NewsBlog />} />
      </Routes>
    </div>
  );
}
