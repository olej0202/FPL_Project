// File: src/App.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
} from "react-router-dom";

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
// still unused but kept if you need it later
import MyTeamOverview from "./MyTeam_Display";

import logo from "./assets/FPL_analytics_logo.png";
import "./index.css";

import {
  Brain,
  Trophy,
  Newspaper,
  Menu,
  X,
  Wrench,
  BarChart2,
  ChevronDown,
  Search, // ✅ loope icon for Analysis
} from "lucide-react";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Separate states so mobile can't be killed by desktop "click outside" logic
  const [analysisOpenDesktop, setAnalysisOpenDesktop] = useState(false);
  const [analysisOpenMobile, setAnalysisOpenMobile] = useState(false);

  const location = useLocation();
  const desktopDropdownRef = useRef(null);

  // Analysis group children (Statistical Model is NOT here)
  const analysisChildren = useMemo(
    () => [
      { to: "/Team_Analytics", label: "Team Analytics" },
      { to: "/Player_Analytics", label: "Player Analytics" },
      { to: "/Season_Analysis", label: "Season Analysis" },
      { to: "/TeamPredictionsFuture", label: "Fixture Analytics" },
    ],
    []
  );

  const analysisPaths = useMemo(
    () => analysisChildren.map((c) => c.to),
    [analysisChildren]
  );

  const analysisActive = useMemo(
    () => analysisPaths.some((p) => location.pathname.startsWith(p)),
    [analysisPaths, location.pathname]
  );

  // ✅ REMOVED: auto-open analysis group on analysis routes
  // (so navigating closes it and it stays closed)

  // Close desktop dropdown when clicking outside (but DON'T interfere with mobile drawer)
  useEffect(() => {
    const onDocMouseDown = (e) => {
      // If mobile drawer is open, do nothing (prevents mobile issues)
      if (menuOpen) return;
      if (!analysisOpenDesktop) return;
      if (!desktopDropdownRef.current) return;

      if (!desktopDropdownRef.current.contains(e.target)) {
        setAnalysisOpenDesktop(false);
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [analysisOpenDesktop, menuOpen]);

  const navItems = [
    { type: "link", to: "/My_Team", icon: Brain, label: "AI Teams" },

    // ✅ Statistical Model as its own top-level item
    {
      type: "link",
      to: "/Adjustment_Analysis",
      icon: BarChart2,
      label: "Statistical Model",
    },

    // ✅ Analysis group WITHOUT Statistical Model, with loope icon
    {
      type: "group",
      icon: Search,
      label: "Analysis",
      children: analysisChildren,
    },

    {
      type: "link",
      to: "/Score_Predictions",
      icon: Trophy,
      label: "Score Predictions",
    },
    { type: "link", to: "/News", icon: Newspaper, label: "PL News" },
  ];

  const desktopLinkClass = ({ isActive }) =>
    [
      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border",
      "hover:bg-royal-beige/10 hover:text-royal-gold",
      isActive
        ? "bg-royal-gold text-black border-royal-gold shadow-sm"
        : "border-transparent text-royal-gold/80",
    ].join(" ");

  const mobileLinkClass = ({ isActive }) =>
    [
      "flex items-center gap-3 px-3 py-3 rounded-lg border text-sm font-medium transition-colors",
      isActive
        ? "bg-royal-gold text-black border-royal-gold"
        : "bg-transparent text-royal-gold border-royal-gold/40 hover:bg-royal-gold hover:text-black",
    ].join(" ");

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 border-b border-royal-gold/40 bg-black/80 backdrop-blur">
        <nav className="max-w-7xl mx-auto px-3 sm:px-4">
          {/* Smoother PC header layout: logo left, nav centered, mobile button right */}
          <div className="flex items-center py-2 sm:py-3 gap-3">
            {/* Left: Logo + brand */}
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

            {/* Center: Desktop nav (centered) */}
            <div className="hidden md:flex flex-1 justify-center">
              <div className="flex items-center gap-1 lg:gap-2">
                {navItems.map((item) => {
                  if (item.type === "group") {
                    const Icon = item.icon;
                    const groupActive = analysisActive;

                    return (
                      <div
                        key={item.label}
                        className="relative"
                        ref={desktopDropdownRef}
                      >
                        <button
                          type="button"
                          onClick={() => setAnalysisOpenDesktop((v) => !v)}
                          className={[
                            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border hover:border-none",
                            "hover:bg-royal-beige/10 hover:text-royal-gold",
                            groupActive
                              ? "bg-royal-gold text-black border-royal-gold shadow-sm"
                              : "bg-black border-transparent text-royal-gold/80",
                          ].join(" ")}
                        >
                          <Icon size={16} />
                          <span className="whitespace-nowrap">{item.label}</span>
                          <ChevronDown
                            size={16}
                            className={
                              analysisOpenDesktop
                                ? "rotate-180 transition"
                                : "transition"
                            }
                          />
                        </button>

                        {/* Dropdown */}
                        <div
                          className={[
                            "absolute left-0 mt-2 w-60 rounded-xl border border-royal-gold/30 bg-black/95 shadow-xl p-2 ",
                            "origin-top transition-all duration-150",
                            analysisOpenDesktop
                              ? "opacity-100 translate-y-0 pointer-events-auto "
                              : "opacity-0 -translate-y-1 pointer-events-none",
                          ].join(" ")}
                          style={{ backdropFilter: "blur(10px)" }}
                        >
                          {item.children.map((c) => (
                            <NavLink
                              key={c.to}
                              to={c.to}
                              onClick={() => setAnalysisOpenDesktop(false)} // ✅ close on navigation
                              className={({ isActive }) =>
                                [
                                  "block px-3 py-2 rounded-lg text-sm border transition",
                                  isActive
                                    ? // ✅ active should NOT change on hover
                                      "bg-royal-gold text-black border-royal-gold hover:bg-royal-gold hover:text-black hover:border-royal-gold"
                                    : "border-transparent text-royal-gold/80 hover:bg-royal-beige/10 hover:text-royal-gold",
                                ].join(" ")
                              }
                            >
                              {c.label}
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  // Normal item
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={desktopLinkClass}
                      onClick={() => {
                        // ✅ close analysis dropdown if user navigates anywhere
                        setAnalysisOpenDesktop(false);
                      }}
                    >
                      <Icon size={16} />
                      <span className="whitespace-nowrap">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>

            {/* Right: Mobile button */}
            <div className="ml-auto md:ml-0">
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
          </div>
        </nav>

        {/* Mobile slide-in drawer + backdrop */}
        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-40">
            <div
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-black/60 transition-opacity opacity-100"
            />

            <div className="absolute inset-y-0 right-0 w-72 max-w-full bg-black text-royal-gold shadow-xl border-l border-royal-gold/40 transform translate-x-0 transition-transform duration-200">
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

              <nav className="flex-1 overflow-auto px-3 py-3 space-y-2 bg-black">
                {navItems.map((item) => {
                  if (item.type === "group") {
                    const Icon = item.icon;

                    return (
                      <div key={item.label} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setAnalysisOpenMobile((v) => !v)}
                          className={[
                            "w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg border text-sm font-medium transition-colors",
                            analysisActive
                              ? "bg-royal-gold text-black border-royal-gold"
                              : "bg-transparent text-royal-gold border-royal-gold/40 hover:bg-royal-gold hover:text-black",
                          ].join(" ")}
                        >
                          <div className="flex items-center gap-3">
                            <Icon size={20} />
                            <span>{item.label}</span>
                          </div>

                          <ChevronDown
                            size={18}
                            className={
                              analysisOpenMobile
                                ? "rotate-180 transition"
                                : "transition"
                            }
                          />
                        </button>

                        <div
                          className={[
                            "overflow-hidden transition-all duration-200",
                            analysisOpenMobile
                              ? "max-h-[420px] opacity-100"
                              : "max-h-0 opacity-0",
                          ].join(" ")}
                        >
                          <div className="pl-3 pt-2 space-y-2">
                            {item.children.map((c) => (
                              <NavLink
                                key={c.to}
                                to={c.to}
                                onClick={() => {
                                  // ✅ close the drawer AND the analysis section on navigation
                                  setMenuOpen(false);
                                  setAnalysisOpenMobile(false);
                                }}
                                className={({ isActive }) =>
                                  [
                                    "block px-3 py-2 rounded-lg border text-sm transition",
                                    isActive
                                      ? // ✅ active should NOT change on hover
                                        "bg-royal-gold text-black border-royal-gold hover:bg-royal-gold hover:text-black hover:border-royal-gold"
                                      : "border-royal-gold/30 text-royal-gold/85 hover:bg-royal-beige/10 hover:text-royal-gold",
                                  ].join(" ")
                                }
                              >
                                {c.label}
                              </NavLink>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => {
                        setMenuOpen(false);
                        setAnalysisOpenMobile(false); // ✅ also close analysis accordion when navigating
                      }}
                      className={mobileLinkClass}
                    >
                      <Icon size={20} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>

              <div className="px-4 py-3 border-t border-royal-gold/20 bg-black text-xs text-royal-beige/80">
                <p>Tip: Expand “Analysis” to jump between analytics pages.</p>
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
            <Route index element={<Navigate to="Season_Players" replace />} />
            <Route path="Season_Teams" element={<PlayerMeasureAveragesChart_TEAMS />} />
            <Route path="Season_Players" element={<PlayerMeasureAveragesChart_Player />} />
          </Route>

          {/* Still routed, now also shown as "Statistical Model" in nav */}
          <Route path="/Adjustment_Analysis" element={<AdjustmentAnalytics />}>
            <Route index element={<Navigate to="Adjustment_Player" replace />} />
            <Route path="Adjustment_Teams" element={<TeamAdjustmentsPage />} />
            <Route path="Adjustment_Player" element={<PlayerAdjustmentsPage />} />
            <Route path="Adjustment_Fixture" element={<FixturesPage />} />
          </Route>

          <Route path="/TeamPredictionsFuture" element={<TeamPredictionsFuture />} />
        </Routes>
      </main>
    </div>
  );
}
