import React, { useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Sparkles, Target, Users } from "lucide-react";

const tabClass = ({ isActive }) =>
  [
    "inline-flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-[10px] font-semibold leading-tight transition-colors shadow-sm sm:h-12 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
    isActive
      ? "border-sky-300 bg-white text-sky-800"
      : "border-slate-300 bg-white/95 text-slate-700 hover:border-sky-200 hover:bg-white hover:text-sky-700",
  ].join(" ");

export default function AITeams() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/") {
      navigate("/My_Team");
    }
  }, [location.pathname, navigate]);

  return (
    <div className="space-y-4 px-2 py-2 pb-24 text-slate-800 sm:px-3 sm:pb-28">
      <Outlet />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-400 bg-slate-200/95 shadow-lg backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-2 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-2 sm:px-4 sm:pt-3">
          <div className="mx-auto flex w-full items-center gap-2">
            <NavLink to="My_Team" end className={tabClass}>
              <Target size={16} />
              Optimize
            </NavLink>

            <NavLink to="Team_Overview" className={tabClass}>
              <Users size={16} />
              My Team
            </NavLink>

            <NavLink to="Chip_Team" className={tabClass}>
              <Sparkles size={16} />
              <span className="hidden sm:inline">AI Chip Team</span>
              <span className="sm:hidden">Chip</span>
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  );
}




