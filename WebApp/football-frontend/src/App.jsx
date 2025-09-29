// File: src/App.jsx
import React, { useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import Team_Analytics from "./Team_Analytics";
import Team_Analytics_Rankings from "./Team_Analytics_rankings";
import Team_Analytics_Individual from "./Team_Analytics_individual";
import Team_Predictions from "./Team_Predictions";
import FreeHitTeam from "./Free_Hit";
import WildcardTeam from "./Wildcard_team";
import MyTeam from "./My_team";
import Player_analytics from "./Player_Analytics";
import Player_analytics_rankings from "./Player_Analytics_rankings";
import PlayerAnalyticsIndividual from "./Player_Analytics_individual";
import NewsBlog from "./News";
import TeamPredictionsFuture from "./Fixture_Ticker";
import AITeams from "./AITeams";
import AITeamNav from "./components/team_navigation";
import logo from "./assets/FPL_analytics_logo.png";
import "./index.css";
import {
  User,
  Brain,
  Trophy,
  Users,
  Newspaper,
  Calendar,
  Menu,
  X,
} from "lucide-react";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { to: "/My_Team", icon: Brain, label: "AI Teams" },
    { to: "/Team_Analytics", icon: Users, label: "Team Analytics" },
    { to: "/Player_Analytics", icon: User, label: "Player Analytics" },
    { to: "/TeamPredictionsFuture", icon: Calendar, label: "Fixture Analytics" },
    { to: "/Score_Predictions", icon: Trophy, label: "Score Predictions" },
    { to: "/News", icon: Newspaper, label: "PL News" },
  ];

   const menuItems = [
    { to: "/Team_Analytics", icon: Users, label: "Team Analytics" },
    { to: "/TeamPredictionsFuture", icon: Calendar, label: "Fixtures" },
    { to: "/Score_Predictions", icon: Trophy, label: "Score Predictions" },
    { to: "/News", icon: Newspaper, label: "News Blog" },
  ];

     const tabItems = [
    { to: "/", icon: Brain, label: "AI Teams" },
    { to: "/Player_Analytics", icon: User, label: "Player Analytics" },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Navbar */}
      <nav className="relative bg-royal-beige text-royal-gold shadow">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-1">
          {/* Logo + Title */}
          <div className="flex items-center gap-1">
            <img
              src={logo}
              alt="FPL Logo"
              className="h-14 w-14 object-contain"
            />
            
          </div>

          {/* Desktop Nav (md+) */}
          <div className="hidden md:flex flex-wrap gap-0">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `nav-card ${isActive ? "active" : ""}`
                }
              >
                <Icon size={18} />
                <span className="text-sm truncate">{label}</span>
              </NavLink>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setMenuOpen(true)}
              className="p-2 rounded border border-royal-gold"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>

        {/* Side-Drawer for Mobile */}
        {menuOpen && (
          <div className="md:hidden fixed inset-y-0 right-0 w-3/4 bg-royal-beige text-royal-gold z-50 flex flex-col">
            {/* Close Button */}
            <div className="flex justify-end p-2">
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 rounded border border-black"
              >
                <X size={22} />
              </button>
            </div>

            {/* Nav Links */}
            <nav className="flex-1 overflow-auto px-4 space-y-2">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-5 rounded border border-royal-gold ${
                      isActive
                        ? "bg-black text-royal-gold"
                        : "bg-transparent text-royal-gold hover:bg-royal-gold hover:text-black"
                    }`
                  }
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon size={20} />
                  <span className="text-lg">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </nav>

      <Routes>
        <Route path="/Team_Analytics" element={<Team_Analytics />}>
          <Route index element={<Team_Analytics_Rankings />} />
          <Route path="Team_Individual" element={<Team_Analytics_Individual />} />
          <Route
            path="Team_Rankings"
            element={<Team_Analytics_Rankings />}
          />
        </Route>
        <Route path="/Score_Predictions" element={<Team_Predictions />} />
        <Route path="/" element={<AITeams />}>
          <Route path="FreeHitTeam" element={<FreeHitTeam />} />
          <Route path="Wildcard_Team" element={<WildcardTeam />} />
          <Route path="My_Team" element={<MyTeam />} />
        </Route>
        <Route path="/Player_Analytics" element={<Player_analytics />}>
          <Route
            path="Rankings"
            element={<Player_analytics_rankings />}
          />
          <Route
            path="Individual"
            element={<PlayerAnalyticsIndividual />}
          />
        </Route>
        <Route path="/News" element={<NewsBlog />} />
        <Route
          path="/TeamPredictionsFuture"
          element={<TeamPredictionsFuture />}
        />
      </Routes>
    </div>
  );
}
