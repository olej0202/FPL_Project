import React, { useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { User, BarChart, ChartLine } from "lucide-react";

const tabClass = ({ isActive }) =>
  [
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
    isActive
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : "border-slate-200 text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700",
  ].join(" ");

export default function Team_Analytics() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/Team_Analytics") {
      navigate("/Team_Analytics/Team_Rankings");
    }
  }, [location.pathname, navigate]);

  return (
    <div className="space-y-4 px-2 py-2 text-slate-800 sm:px-3">
      <div className="flex flex-wrap justify-center gap-2 border-b border-slate-200 pb-3">
        <NavLink to="Team_Rankings" end className={tabClass}>
          <BarChart size={16} />
          Team Rankings
        </NavLink>

        <NavLink to="Team_Individual" className={tabClass}>
          <User size={16} />
          Individual Team
        </NavLink>

        <NavLink to="Team_Analysis" className={tabClass}>
          <ChartLine size={16} />
          Team Analysis
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
}




