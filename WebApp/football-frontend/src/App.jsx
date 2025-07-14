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
import { User, Brain, Trophy, Users, Newspaper, Calendar, Menu } from "lucide-react";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { to: "/", icon: Newspaper, label: "News Blog" },
    { to: "/Team_Analytics", icon: Users, label: "Team Analytics" },
    { to: "/Player_Analytics", icon: User, label: "Player Analytics" },
    { to: "/TeamPredictionsFuture", icon: Calendar, label: "Fixtures" },
    { to: "/Score_Predictions", icon: Trophy, label: "Score Predictions" },
    { to: "/AITeams", icon: Brain, label: "AI Teams" },
  ];

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Primary Top Navbar */}
      <nav className="relative bg-royal-beige text-royal-gold shadow">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
          {/* Logo + Title */}
          <div className="flex items-center gap-2">
            <img src={logo} alt="FPL Logo" className="h-16 w-16 object-contain" />
            <span className="text-3xl font-bold">FPL Analytics</span>
          </div>

          {/* Desktop Nav (md+) */}
          <div className="hidden md:flex flex-wrap gap-1 border-royale-gold">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `nav-card ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                <span className="text-sm truncate">{label}</span>
              </NavLink>
            ))}
          </div>

          {/* Mobile Menu Button (below md) */}
          <div className="md:hidden border-royale-gold ">
              <button
    onClick={() => setMenuOpen(!menuOpen)}
    className="p-2 rounded border border-royal-gold bg-royale-beige"   // <- added border here
  >
    <Menu size={28} />
  </button>
          </div>
        </div>

        {/* Mobile Dropdown (below md) */}
        {menuOpen && (
              <div 
    className="
      md:hidden 
      bg-royal-beige text-royal-gold 
      shadow-lg absolute top-full right-4 
      w-48 rounded z-50
    "
  >
    <ul className="flex flex-col">
      {navItems.map(({ to, icon: Icon, label }) => (
        <li 
          key={to} 
          className="border-b border-black last:border-b-0"  // <-- black bottom border
        >
          <NavLink
  to={to}
  className={({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 border border-black rounded-sm
    ${
      isActive
        ? "bg-black text-royal-gold"
        : "bg-royal-beige text-royal-gold hover:bg-royal-gold hover:text-black"
    }`
  }
  onClick={() => setMenuOpen(false)}
>
  <Icon size={18} />
  <span>{label}</span>
</NavLink>
        </li>
      ))}
    </ul>
  </div>
        )}
      </nav>

      {/* AI Sub-navigation */}
      <AITeamNav />

      {/* Routes */}
      <Routes>
        <Route path="/Team_Analytics" element={<Team_Analytics />}>
          <Route index element={<Team_Analytics_Rankings />} />
          <Route path="Team_Individual" element={<Team_Analytics_Individual />} />
          <Route path="Team_Rankings" element={<Team_Analytics_Rankings />} />
        </Route>

        <Route path="/Score_Predictions" element={<Team_Predictions />} />

        <Route path="/AITeams" element={<AITeams />}>
          <Route index element={<FreeHitTeam />} />
          <Route path="FreeHitTeam" element={<FreeHitTeam />} />
          <Route path="Wildcard_Team" element={<WildcardTeam />} />
          <Route path="My_Team" element={<MyTeam />} />
        </Route>

        <Route path="/Player_Analytics" element={<Player_analytics />}>
          <Route path="Rankings" element={<Player_analytics_rankings />} />
          <Route path="Individual" element={<PlayerAnalyticsIndividual />} />
        </Route>

        <Route path="/" element={<NewsBlog />} />
        <Route path="/TeamPredictionsFuture" element={<TeamPredictionsFuture />} />
      </Routes>
    </div>
  );
}
