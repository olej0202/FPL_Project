// File: src/App.jsx
import React, { useState } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";

import Team_Analytics from "./Team_Analytics";
import Team_Analytics_Rankings from "./Team_Analytics_rankings";
import Team_Analytics_Individual from "./Team_Analytics_individual";
import Team_Analytics_Analysis from "./Team_Analytics_Analysis";

import Team_Predictions from "./Team_Predictions";
import FreeHitTeam from "./Free_Hit";
import WildcardTeam from "./Wildcard_team";
import MyTeam from "./My_team";

import Player_analytics from "./Player_Analytics";
import Player_analytics_rankings from "./Player_Analytics_rankings";
import PlayerAnalyticsIndividual from "./Player_Analytics_individual";

import NewsBlog from "./News";
import TeamPredictionsFuture from "./Fixture_Ticker";

import SeasonAnalytics from "./SeasonAnalysis";
import PlayerMeasureAveragesChart_TEAMS from "./Season_Analyticss_Teams";
import PlayerMeasureAveragesChart_Player from "./Season_Analytics_Players";

import AdjustmentAnalytics from "./Adjustment_Analytics";
import TeamAdjustmentsPage from "./Adjustment_Analytics_Team";
import PlayerAdjustmentsPage from "./Adjustment_Analytics_Player";
import FixturesPage from "./Adjustement_Analytics_Fixtures";

import AITeams from "./AITeams";
import AITeamNav from "./components/team_navigation"; // still unused but kept if you need it later
import MyTeamOverview from "./MyTeam_Display"

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
  Wrench,
  BarChart2,
} from "lucide-react";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { to: "/My_Team", icon: Brain, label: "AI Teams" },
    { to: "/Adjustment_Analysis", icon: BarChart2, label: "Statistical Model" },
    { to: "/Team_Analytics", icon: Users, label: "Team Analytics" },
    { to: "/Player_Analytics", icon: User, label: "Player Analytics" },
    { to: "/TeamPredictionsFuture", icon: Calendar, label: "Fixture Analytics" },
    { to: "/Score_Predictions", icon: Trophy, label: "Score Predictions" },
    { to: "/News", icon: Newspaper, label: "PL News" },
    { to: "/Season_Analysis", icon: BarChart2, label: "Season Analysis" },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 border-b border-royal-gold/40 bg-black/80 backdrop-blur">
        <nav className="max-w-7xl mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between py-2 sm:py-3 gap-3">
            {/* Logo + brand */}
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={logo}
                alt="FPL Analytics"
                className="h-10 w-10 sm:h-12 sm:w-12 object-contain rounded-full border border-royal-gold/60 shadow"
              />
              <div className="hidden sm:flex flex-col">
                <span className="text-sm font-semibold tracking-wide text-royal-gold">
                  FPL Analytics
                </span>
                <span className="text-xs text-royal-beige/80">
                  Advanced FPL Analytics tools
                </span>
              </div>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1 lg:gap-2">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    [
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border",
                      "hover:bg-royal-beige/10 hover:text-royal-gold",
                      isActive
                        ? "bg-royal-gold text-black border-royal-gold shadow-sm"
                        : "border-transparent text-royal-gold/80",
                    ].join(" ")
                  }
                >
                  <Icon size={16} />
                  <span className="whitespace-nowrap">{label}</span>
                </NavLink>
              ))}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMenuOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-royal-gold px-3 py-1 text-xs font-medium text-royal-gold bg-black/70 shadow-sm active:scale-[0.98] transition"
              >
                <Wrench size={16} />
                <span>All tools</span>
                <Menu size={16} />
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile slide-in drawer + backdrop (only rendered when open) */}
        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-40">
            {/* Backdrop */}
            <div
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-black/60 transition-opacity opacity-100"
            />

            {/* Drawer */}
            <div className="absolute inset-y-0 right-0 w-72 max-w-full bg-black text-royal-gold shadow-xl border-l border-royal-gold/40 transform translate-x-0 transition-transform duration-200">
              {/* Drawer header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-royal-gold/30 bg-black">
                <div className="flex items-center gap-2">
                  <img
                    src={logo}
                    alt="FPL Analytics"
                    className="h-8 w-8 rounded-full border border-royal-gold/60"
                  />
                  <span className="text-sm font-semibold tracking-wide text-royal-gold">
                    FPL Analytics
                  </span>
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="p-2 rounded-full border border-royal-gold/40 bg-black/60"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer nav items */}
              <nav className="flex-1 overflow-auto px-3 py-3 space-y-2 bg-black">
                {navItems.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-3 px-3 py-3 rounded-lg border text-sm font-medium transition-colors",
                        isActive
                          ? "bg-royal-gold text-black border-royal-gold"
                          : "bg-transparent text-royal-gold border-royal-gold/40 hover:bg-royal-gold hover:text-black",
                      ].join(" ")
                    }
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </nav>

              {/* Drawer footer */}
              <div className="px-4 py-3 border-t border-royal-gold/20 bg-black text-xs text-royal-beige/80">
                <p>Tip: Use this menu to quickly switch between tools.</p>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-3 pb-6">
        <Routes>
          <Route path="/Team_Analytics" element={<Team_Analytics />}>
            <Route index element={<Team_Analytics_Rankings />} />
            <Route path="Team_Individual" element={<Team_Analytics_Individual />} />
            <Route path="Team_Rankings" element={<Team_Analytics_Rankings />} />
            <Route path="Team_Analysis" element={<Team_Analytics_Analysis />} />
          </Route>

          <Route path="/Score_Predictions" element={<Team_Predictions />} />

          <Route path="/" element={<AITeams />}>
            <Route path="FreeHitTeam" element={<FreeHitTeam />} />
            <Route path="Team_Overview" element={<MyTeamOverview />} />
            <Route path="Wildcard_Team" element={<WildcardTeam />} />
            <Route path="My_Team" element={<MyTeam />} />
          </Route>

          <Route path="/Player_Analytics" element={<Player_analytics />}>
            <Route path="Rankings" element={<Player_analytics_rankings />} />
            <Route path="Individual" element={<PlayerAnalyticsIndividual />} />
          </Route>

          <Route path="/News" element={<NewsBlog />} />

          <Route path="/Season_Analysis" element={<SeasonAnalytics />}>
            {/* redirect index to Season_Players so the tab is active */}
            <Route index element={<Navigate to="Season_Players" replace />} />
            <Route path="Season_Teams" element={<PlayerMeasureAveragesChart_TEAMS />} />
            <Route path="Season_Players" element={<PlayerMeasureAveragesChart_Player />} />
          </Route>

          <Route path="/Adjustment_Analysis" element={<AdjustmentAnalytics />}>
            {/* redirect index to Adjustment_Player so the tab is active */}
            <Route index element={<Navigate to="Adjustment_Player" replace />} />
            <Route path="Adjustment_Teams" element={<TeamAdjustmentsPage />} />
            <Route path="Adjustment_Player" element={<PlayerAdjustmentsPage />} />
            <Route path="Adjustment_Fixture" element={<FixturesPage />} />

          </Route>

          <Route
            path="/TeamPredictionsFuture"
            element={<TeamPredictionsFuture />}
          />
        </Routes>
      </main>
    </div>
  );
}
