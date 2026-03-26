import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
} from "react-router-dom";
import {
  BarChart2,
  Brain,
  ChevronDown,
  LayoutDashboard,
  Menu,
  Newspaper,
  Search,
  Trophy,
  X,
} from "lucide-react";

import Team_Analytics from "./Team_Analytics";
import Team_Analytics_Rankings from "./Team_Analytics_rankings";
import Team_Analytics_Individual from "./Team_Analytics_individual";
import Team_Analytics_Analysis from "./Team_Analytics_Analysis";
import Team_Predictions from "./Team_Predictions";
import AIChipTeam from "./AI_Chip_Team";
import MyTeam from "./My_team";
import Player_analytics from "./Player_Analytics";
import Player_analytics_rankings from "./Player_Analytics_rankings";
import PlayerAnalyticsIndividual from "./Player_Analytics_individual";
import NewsBlog from "./News";
import TeamPredictionsFuture from "./Fixture_Ticker";
import WeeklyReview from "./Weekly_Review";
import SeasonAnalytics from "./SeasonAnalysis";
import PlayerMeasureAveragesChart_TEAMS from "./Season_Analyticss_Teams";
import PlayerMeasureAveragesChart_Player from "./Season_Analytics_Players";
import AdjustmentAnalytics from "./Adjustment_Analytics";
import TeamAdjustmentsPage from "./Adjustment_Analytics_Team";
import PlayerAdjustmentsPage from "./Adjustment_Analytics_Player";
import FixturesPage from "./Adjustement_Analytics_Fixtures";
import AITeams from "./AITeams";
import MyTeamOverview from "./MyTeam_Display";

import logo from "./assets/FPL_analytics_logo.png";
import "./index.css";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [analysisOpenDesktop, setAnalysisOpenDesktop] = useState(false);
  const [analysisOpenMobile, setAnalysisOpenMobile] = useState(false);

  const location = useLocation();
  const desktopDropdownRef = useRef(null);

  const analysisChildren = useMemo(
    () => [
      { to: "/Team_Analytics", label: "Team Analytics" },
      { to: "/Player_Analytics", label: "Player Analytics" },
      { to: "/Season_Analysis", label: "Season Analytics" },
      { to: "/TeamPredictionsFuture", label: "Fixture Analytics" },
      { to: "/Weekly_Review", label: "Weekly Review" },
    ],
    []
  );

  const analysisActive = useMemo(
    () => analysisChildren.some((item) => location.pathname.startsWith(item.to)),
    [analysisChildren, location.pathname]
  );

  useEffect(() => {
    setMenuOpen(false);
    setAnalysisOpenDesktop(false);
    setAnalysisOpenMobile(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDocMouseDown = (event) => {
      if (menuOpen || !analysisOpenDesktop || !desktopDropdownRef.current) return;
      if (!desktopDropdownRef.current.contains(event.target)) {
        setAnalysisOpenDesktop(false);
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [analysisOpenDesktop, menuOpen]);

  const navItems = [
    { type: "link", to: "/My_Team", icon: Brain, label: "AI Teams" },
    {
      type: "link",
      to: "/Adjustment_Analysis",
      icon: BarChart2,
      label: "Statistical Model",
    },
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
      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
      isActive
        ? "border-sky-200 bg-sky-50 text-sky-800 shadow-sm"
        : "border-slate-300 text-slate-600 hover:border-sky-200 hover:text-sky-700 hover:bg-sky-50",
    ].join(" ");

  const mobileLinkClass = ({ isActive }) =>
    [
      "flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors",
      isActive
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-slate-300 text-slate-700 hover:bg-sky-50 hover:border-sky-200 hover:text-sky-700",
    ].join(" ");

  return (
    <div className="min-h-screen bg-app-gradient text-slate-800">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <nav className="mx-auto max-w-7xl px-3 sm:px-4">
          <div className="flex items-center gap-3 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={logo}
                alt="FPL Analytics"
                className="h-10 w-10 rounded-full border border-sky-300/40 object-contain shadow-sm"
              />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">FPL Analytics</p>
                <p className="text-xs text-slate-500">
                  Analysis and Model optimizer
                </p>
              </div>
            </div>

            <div className="hidden md:flex flex-1 justify-center">
              <div className="flex items-center gap-2">
                {navItems.map((item) => {
                  if (item.type === "group") {
                    const Icon = item.icon;

                    return (
                      <div key={item.label} className="relative" ref={desktopDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setAnalysisOpenDesktop((prev) => !prev)}
                          className={[
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                            analysisActive
                              ? "border-sky-200 bg-sky-50 text-sky-800 shadow-sm"
                              : "border-slate-300 text-slate-600 hover:border-sky-200 hover:text-sky-700 hover:bg-sky-50",
                          ].join(" ")}
                        >
                          <Icon size={16} />
                          <span>{item.label}</span>
                          <ChevronDown
                            size={16}
                            className={analysisOpenDesktop ? "rotate-180 transition" : "transition"}
                          />
                        </button>

                        <div
                          className={[
                            "absolute left-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg",
                            "origin-top transition-all duration-150",
                            analysisOpenDesktop
                              ? "translate-y-0 opacity-100 pointer-events-auto"
                              : "-translate-y-1 opacity-0 pointer-events-none",
                          ].join(" ")}
                        >
                          {item.children.map((child) => (
                            <NavLink
                              key={child.to}
                              to={child.to}
                              className={({ isActive }) =>
                                [
                                  "block rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                                  isActive
                                    ? "border-sky-200 bg-sky-50 text-sky-800"
                                    : "border-transparent text-slate-700 hover:bg-sky-50 hover:text-sky-700",
                                ].join(" ")
                              }
                            >
                              {child.label}
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  const Icon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to} className={desktopLinkClass}>
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>

            <div className="ml-auto md:hidden">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm"
              >
                <LayoutDashboard size={16} />
                <span>Navigation</span>
                <Menu size={16} />
              </button>
            </div>
          </div>
        </nav>

        {menuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-slate-700"
              onClick={() => setMenuOpen(false)}
            />

            <aside className="absolute inset-y-0 right-0 w-80 max-w-[90vw] border-l border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <img
                    src={logo}
                    alt="FPL Analytics"
                    className="h-8 w-8 rounded-full border border-sky-300/40"
                  />
                  <div className="leading-tight">
                    <span className="block text-sm font-semibold text-slate-900">FPL Analytics</span>
                    <span className="block text-[11px] text-slate-500">Analysis and Model optimizer</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-full border border-slate-300 p-2 text-slate-600"
                >
                  <X size={17} />
                </button>
              </div>

              <nav className="space-y-2 overflow-auto px-3 py-3">
                {navItems.map((item) => {
                  if (item.type === "group") {
                    const Icon = item.icon;

                    return (
                      <div key={item.label} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setAnalysisOpenMobile((prev) => !prev)}
                          className={[
                            "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm font-semibold",
                            analysisActive
                              ? "border-sky-200 bg-sky-50 text-sky-800"
                              : "border-slate-300 text-slate-700 hover:bg-sky-50 hover:border-sky-200 hover:text-sky-700",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-3">
                            <Icon size={18} />
                            {item.label}
                          </span>
                          <ChevronDown
                            size={17}
                            className={analysisOpenMobile ? "rotate-180 transition" : "transition"}
                          />
                        </button>

                        <div
                          className={[
                            "overflow-hidden transition-all duration-200",
                            analysisOpenMobile ? "max-h-[460px] opacity-100" : "max-h-0 opacity-0",
                          ].join(" ")}
                        >
                          <div className="space-y-2 pl-3">
                            {item.children.map((child) => (
                              <NavLink
                                key={child.to}
                                to={child.to}
                                className={({ isActive }) =>
                                  [
                                    "block rounded-lg border px-3 py-2 text-sm",
                                    isActive
                                      ? "border-sky-200 bg-sky-50 text-sky-800"
                                      : "border-slate-200 text-slate-600 hover:bg-sky-50 hover:text-sky-700",
                                  ].join(" ")
                                }
                              >
                                {child.label}
                              </NavLink>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const Icon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to} className={mobileLinkClass}>
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-2 pb-6 pt-4 sm:px-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
          <Routes>
            <Route path="/Team_Analytics" element={<Team_Analytics />}>
              <Route index element={<Team_Analytics_Rankings />} />
              <Route path="Team_Individual" element={<Team_Analytics_Individual />} />
              <Route path="Team_Rankings" element={<Team_Analytics_Rankings />} />
              <Route path="Team_Analysis" element={<Team_Analytics_Analysis />} />
            </Route>

            <Route path="/Score_Predictions" element={<Team_Predictions />} />
            <Route path="/Weekly_Review" element={<WeeklyReview />} />

            <Route path="/" element={<AITeams />}>
              <Route path="FreeHitTeam" element={<Navigate to="/Chip_Team?mode=freehit" replace />} />
              <Route path="Team_Overview" element={<MyTeamOverview />} />
              <Route path="Wildcard_Team" element={<Navigate to="/Chip_Team?mode=wildcard" replace />} />
              <Route path="Chip_Team" element={<AIChipTeam />} />
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

            <Route path="/Adjustment_Analysis" element={<AdjustmentAnalytics />}>
              <Route index element={<Navigate to="Adjustment_Player" replace />} />
              <Route path="Adjustment_Teams" element={<TeamAdjustmentsPage />} />
              <Route path="Adjustment_Player" element={<PlayerAdjustmentsPage />} />
              <Route path="Adjustment_Fixture" element={<FixturesPage />} />
            </Route>

            <Route path="/TeamPredictionsFuture" element={<TeamPredictionsFuture />} />
          </Routes>
        </section>
      </main>
    </div>
  );
}




