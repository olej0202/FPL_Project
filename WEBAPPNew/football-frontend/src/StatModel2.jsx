import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, Sparkles, User, Users } from "lucide-react";

const tabClass = ({ isActive }) =>
  [
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
    isActive
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-700",
  ].join(" ");

function QuickCard({ title, text, to }) {
  return (
    <NavLink
      to={to}
      className="block rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/60"
    >
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <div className="mt-1 text-xs text-slate-600">{text}</div>
    </NavLink>
  );
}

export default function StatModel2() {
  return (
    <div className="space-y-4 px-2 py-2 text-slate-800 sm:px-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">StatModel2</h1>
            <p className="mt-1 text-sm text-slate-600">
              New statistical model workspace with the same core tools and a cleaner flow.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <Sparkles size={14} />
            Beta Navigation
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <QuickCard
          title="Player Adjustment"
          text="Tune player parameters and instantly feed optimization."
          to="Players"
        />
        <QuickCard
          title="Team Adjustment"
          text="Adjust team-level assumptions and fixture impact."
          to="Teams"
        />
        <QuickCard
          title="Fixture Adjustment"
          text="Control fixture probabilities and schedule scenarios."
          to="Fixtures"
        />
      </section>

      <div className="flex flex-wrap justify-center gap-2 border-b border-slate-200 pb-3">
        <NavLink to="Players" end className={tabClass}>
          <User size={16} />
          Players
        </NavLink>

        <NavLink to="Teams" className={tabClass}>
          <Users size={16} />
          Teams
        </NavLink>

        <NavLink to="Fixtures" className={tabClass}>
          <CalendarDays size={16} />
          Fixtures
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
}
