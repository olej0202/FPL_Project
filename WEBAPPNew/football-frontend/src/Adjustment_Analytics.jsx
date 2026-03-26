import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, User, Users } from "lucide-react";

const tabClass = ({ isActive }) =>
  [
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
    isActive
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : "border-slate-200 text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700",
  ].join(" ");

export default function AdjustmentAnalytics() {
  return (
    <div className="space-y-4 px-2 py-2 text-slate-800 sm:px-3">
      <div className="flex flex-wrap justify-center gap-2 border-b border-slate-200 pb-3">
        <NavLink to="Adjustment_Player" end className={tabClass}>
          <User size={16} />
          Players
        </NavLink>

        <NavLink to="Adjustment_Teams" className={tabClass}>
          <Users size={16} />
          Teams
        </NavLink>

        <NavLink to="Adjustment_Fixture" className={tabClass}>
          <CalendarDays size={16} />
          Fixtures
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
}




