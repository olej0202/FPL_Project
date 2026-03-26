import React, { useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { User, BarChart } from "lucide-react";

const tabClass = ({ isActive }) =>
  [
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
    isActive
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : "border-slate-200 text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700",
  ].join(" ");

export default function Player_analytics() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/Player_Analytics") {
      navigate("/Player_Analytics/Rankings");
    }
  }, [location.pathname, navigate]);

  return (
    <div className="space-y-4 px-2 py-2 text-slate-800 sm:px-3">
      <div className="flex flex-wrap justify-center gap-2 border-b border-slate-200 pb-3">
        <NavLink to="Rankings" end className={tabClass}>
          <BarChart size={16} />
          Player Rankings
        </NavLink>

        <NavLink to="Individual" className={tabClass}>
          <User size={16} />
          Individual Player
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
}




