import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpDown,
  BarChart2,
  Brain,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Trophy,
  UserCircle2,
  X,
} from "lucide-react";

import Team_Analytics from "./Team_Analytics";
import Team_Analytics_Rankings from "./Team_Analytics_rankings";
import Team_Analytics_Individual from "./Team_Analytics_individual";
import Team_Analytics_Analysis from "./Team_Analytics_Analysis";
import Team_Predictions from "./Team_Predictions";
import AIChipTeam from "./AI_Chip_Team";
import AIModel from "./AI_Model";
import MyTeam from "./My_team";
import Player_analytics from "./Player_Analytics";
import Player_analytics_rankings from "./Player_Analytics_rankings";
import PlayerAnalyticsIndividual from "./Player_Analytics_individual";
import NewsBlog from "./News";
import PriceChanges from "./Price_Changes";
import TeamPredictionsFuture from "./Fixture_Ticker";
import WeeklyReview from "./Weekly_Review";
import PersonalAnalysis from "./Personal_Analysis";
import SeasonAnalytics from "./SeasonAnalysis";
import PlayerMeasureAveragesChart_TEAMS from "./Season_Analyticss_Teams";
import PlayerMeasureAveragesChart_Player from "./Season_Analytics_Players";
import AdjustmentAnalytics from "./Adjustment_Analytics";
import TeamAdjustmentsPage from "./Adjustment_Analytics_Team";
import PlayerAdjustmentsPage from "./Adjustment_Analytics_Player";
import FixturesPage from "./Adjustement_Analytics_Fixtures";
import AdjustmentSimulatorPage from "./Adjustment_Analytics_Simulator";
import AITeams from "./AITeams";
import MyTeamOverview from "./MyTeam_Display";
import CurrentlyUnavailable from "./components/CurrentlyUnavailable";
import LoginGate from "./components/LoginGate";
import { isSiteAvailable } from "./config/siteAvailability";
import { useUserData } from "./Contexts/UserContext";
import { useMyteamData } from "./Contexts/MyTeamContext";

import logo from "./assets/FPL_analytics_logo.png";
import "./index.css";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [analysisOpenDesktop, setAnalysisOpenDesktop] = useState(false);
  const [analysisOpenMobile, setAnalysisOpenMobile] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const desktopDropdownRef = useRef(null);
  const settingsDropdownRef = useRef(null);
  const pageTrackPathRef = useRef(location.pathname || "/");
  const pageTrackStartRef = useRef(Date.now());
  const {
    authReady,
    authBusy,
    authError,
    hasSession,
    provider,
    user,
    recentTeamIds,
    loginAsGuest,
    loginWithGoogleCredential,
    logout,
    trackPageActivity,
  } = useUserData();
  const { setTeamId } = useMyteamData();

  const analysisChildren = useMemo(
    () => [
      { to: "/Team_Analytics", label: "Team Analytics" },
      { to: "/Player_Analytics", label: "Player Analytics" },
      { to: "/Season_Analysis", label: "Season Analytics" },
      { to: "/Weekly_Review", label: "Weekly Review" },
      { to: "/Personal_Analysis", label: "Personal Analysis" },
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
    setSettingsOpen(false);
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

  useEffect(() => {
    const onDocMouseDown = (event) => {
      if (!settingsOpen || !settingsDropdownRef.current) return;
      if (!settingsDropdownRef.current.contains(event.target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [settingsOpen]);

  useEffect(() => {
    if (!hasSession) return;
    const nowMs = Date.now();
    const previousPath = pageTrackPathRef.current || "/";
    const startedMs = pageTrackStartRef.current || nowMs;
    const durationSeconds = (nowMs - startedMs) / 1000;

    if (durationSeconds >= 1) {
      trackPageActivity({
        path: previousPath,
        durationSeconds,
        startedAt: new Date(startedMs).toISOString(),
        endedAt: new Date(nowMs).toISOString(),
      });
    }

    pageTrackPathRef.current = location.pathname || "/";
    pageTrackStartRef.current = nowMs;
  }, [hasSession, location.pathname, trackPageActivity]);

  useEffect(() => {
    if (!hasSession) return;

    const flushCurrentPage = () => {
      const nowMs = Date.now();
      const activePath = pageTrackPathRef.current || location.pathname || "/";
      const startedMs = pageTrackStartRef.current || nowMs;
      const durationSeconds = (nowMs - startedMs) / 1000;
      if (durationSeconds < 1) return;

      trackPageActivity({
        path: activePath,
        durationSeconds,
        startedAt: new Date(startedMs).toISOString(),
        endedAt: new Date(nowMs).toISOString(),
      });

      pageTrackStartRef.current = nowMs;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushCurrentPage();
      }
    };

    window.addEventListener("beforeunload", flushCurrentPage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flushCurrentPage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasSession, location.pathname, trackPageActivity]);

  const applyRecentTeamId = (id) => {
    if (id == null) return;
    setTeamId(String(id));
    setSettingsOpen(false);
    navigate("/My_Team");
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-app-gradient flex items-center justify-center">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-semibold text-slate-700 shadow-sm">
          Preparing session...
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <LoginGate
        authBusy={authBusy}
        authError={authError}
        onGuestLogin={loginAsGuest}
        onGoogleCredential={loginWithGoogleCredential}
      />
    );
  }

  const navItems = [
    { type: "link", to: "/My_Team", icon: Brain, label: "Optimize" },
    {
      type: "link",
      to: "/AI_Model",
      icon: LayoutDashboard,
      label: "AI Model",
    },
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
    { type: "link", to: "/Price_Changes", icon: ArrowUpDown, label: "Price Changes" },
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

  const routeElement = (siteKey, element, title) =>
    isSiteAvailable(siteKey) ? element : <CurrentlyUnavailable title={title} />;

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

            <div className="ml-auto flex items-center gap-2">
              <div className="relative" ref={settingsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-200 hover:text-sky-700"
                >
                  <Settings size={16} />
                  <span className="hidden sm:inline">Settings</span>
                </button>

                <div
                  className={[
                    "z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg",
                    "fixed left-2 right-2 top-[68px] max-h-[70vh] overflow-auto",
                    "origin-top transition-all duration-150",
                    "sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-72 sm:max-h-[28rem] sm:origin-top-right",
                    settingsOpen
                      ? "translate-y-0 opacity-100 pointer-events-auto"
                      : "-translate-y-1 opacity-0 pointer-events-none",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <UserCircle2 size={18} className="text-sky-700" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {user?.name || "Session"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {provider === "google" ? user?.email || "Google account" : "Guest mode"}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3">
                    <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                      <Clock3 size={13} />
                      Recent Team IDs
                    </p>

                    {Array.isArray(recentTeamIds) && recentTeamIds.length ? (
                      <div className="max-h-44 space-y-1 overflow-auto pr-1">
                        {recentTeamIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => applyRecentTeamId(id)}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                          >
                            Team ID {id}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-500">
                        No recent team IDs yet.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={logout}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    <LogOut size={15} />
                    Log out
                  </button>
                </div>
              </div>

              <div className="md:hidden">
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
            <Route
              path="/Team_Analytics"
              element={routeElement("teamAnalyticsShell", <Team_Analytics />, "Team Analytics")}
            >
              <Route
                index
                element={routeElement(
                  "teamAnalyticsRankings",
                  <Team_Analytics_Rankings />,
                  "Team Analytics Rankings"
                )}
              />
              <Route
                path="Team_Individual"
                element={routeElement(
                  "teamAnalyticsIndividual",
                  <Team_Analytics_Individual />,
                  "Team Analytics Individual"
                )}
              />
              <Route
                path="Team_Rankings"
                element={routeElement(
                  "teamAnalyticsRankings",
                  <Team_Analytics_Rankings />,
                  "Team Analytics Rankings"
                )}
              />
              <Route
                path="Team_Analysis"
                element={routeElement(
                  "teamAnalyticsAnalysis",
                  <Team_Analytics_Analysis />,
                  "Team Analytics Analysis"
                )}
              />
            </Route>

            <Route
              path="/Score_Predictions"
              element={routeElement("scorePredictions", <Team_Predictions />, "Score Predictions")}
            />
            <Route
              path="/Weekly_Review"
              element={routeElement("weeklyReview", <WeeklyReview />, "Weekly Review")}
            />
            <Route
              path="/Personal_Analysis"
              element={routeElement("personalAnalysis", <PersonalAnalysis />, "Personal Analysis")}
            />

            <Route
              path="/"
              element={routeElement("aiTeamsShell", <AITeams />, "AI Teams")}
            >
              <Route path="FreeHitTeam" element={<Navigate to="/Chip_Team?mode=freehit" replace />} />
              <Route
                path="Team_Overview"
                element={routeElement("aiTeamsOverview", <MyTeamOverview />, "Team Overview")}
              />
              <Route path="Wildcard_Team" element={<Navigate to="/Chip_Team?mode=wildcard" replace />} />
              <Route
                path="Chip_Team"
                element={routeElement("aiTeamsChip", <AIChipTeam />, "AI Teams")}
              />
              <Route
                path="My_Team"
                element={routeElement("aiTeamsOptimize", <MyTeam />, "Optimize My Team")}
              />
            </Route>

            <Route
              path="/AI_Model"
              element={routeElement("playerAnalyticsRankings", <AIModel />, "AI Model")}
            >
              <Route index element={<Navigate to="Players" replace />} />
              <Route
                path="Players"
                element={routeElement(
                  "playerAnalyticsRankings",
                  <Player_analytics_rankings />,
                  "AI Model Players"
                )}
              />
              <Route
                path="Fixtures"
                element={routeElement(
                  "fixtureAnalytics",
                  <TeamPredictionsFuture />,
                  "AI Model Fixtures"
                )}
              />
              <Route path="Teams" element={<Navigate to="/AI_Model/Fixtures" replace />} />
            </Route>

            <Route
              path="/Player_Analytics"
              element={routeElement("playerAnalyticsShell", <Player_analytics />, "Player Analytics")}
            >
              <Route
                path="Rankings"
                element={<Navigate to="/AI_Model/Players" replace />}
              />
              <Route
                path="Individual"
                element={routeElement(
                  "playerAnalyticsIndividual",
                  <PlayerAnalyticsIndividual />,
                  "Player Analytics Individual"
                )}
              />
            </Route>

            <Route path="/News" element={routeElement("news", <NewsBlog />, "PL News")} />

            <Route
              path="/Price_Changes"
              element={routeElement("priceChanges", <PriceChanges />, "Price Changes")}
            />

            <Route
              path="/Season_Analysis"
              element={routeElement("seasonAnalyticsShell", <SeasonAnalytics />, "Season Analysis")}
            >
              <Route index element={<Navigate to="Season_Players" replace />} />
              <Route
                path="Season_Teams"
                element={routeElement(
                  "seasonAnalyticsTeams",
                  <PlayerMeasureAveragesChart_TEAMS />,
                  "Season Analytics Teams"
                )}
              />
              <Route
                path="Season_Players"
                element={routeElement(
                  "seasonAnalyticsPlayers",
                  <PlayerMeasureAveragesChart_Player />,
                  "Season Analytics Players"
                )}
              />
            </Route>

            <Route
              path="/Adjustment_Analysis"
              element={routeElement(
                "statisticalModelShell",
                <AdjustmentAnalytics />,
                "Statistical Model"
              )}
            >
              <Route index element={<Navigate to="Adjustment_Player" replace />} />
              <Route
                path="Adjustment_Teams"
                element={routeElement(
                  "statisticalModelTeams",
                  <TeamAdjustmentsPage />,
                  "Statistical Model Team Adjustment"
                )}
              />
              <Route
                path="Adjustment_Player"
                element={routeElement(
                  "statisticalModelPlayers",
                  <PlayerAdjustmentsPage />,
                  "Statistical Model Player Adjustment"
                )}
              />
              <Route
                path="Adjustment_Fixture"
                element={routeElement(
                  "statisticalModelFixtures",
                  <FixturesPage />,
                  "Statistical Model Fixture Adjustment"
                )}
              />
              <Route
                path="Adjustment_Simulator"
                element={routeElement(
                  "statisticalModelSimulator",
                  <AdjustmentSimulatorPage />,
                  "Statistical Model Simulator"
                )}
              />
            </Route>

            <Route
              path="/TeamPredictionsFuture"
              element={routeElement("fixtureAnalytics", <TeamPredictionsFuture />, "Fixture Analytics")}
            />
          </Routes>
        </section>
      </main>
    </div>
  );
}
