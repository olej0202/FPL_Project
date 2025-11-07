import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { User, BarChart } from "lucide-react";

export default function SeasonAnalytics() {
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to Rankings if on /Player_Analytics
  useEffect(() => {
    if (location.pathname === "/SeasonAnalytics_Player") {
      navigate("/SeasonAnalytics/Player");
    }
  }, [location, navigate]);

  return (
    <div className="min-h-screen bg-black text-white px-1 py-3 space-y-8">
      {/* Tabs */}
      <div className="flex justify-center gap-4 mb-3">
        <NavLink
          to="SeasonAnalyticsPlayer"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-1 font-semibold  ${
              isActive
                ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
                : "text-white hover:text-royal-gold"
            }`
          }
        >
          <BarChart size={18} />
          Players
        </NavLink>

        <NavLink
          to="SeasonAnalyticsTeams"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-1 font-semibold ${
              isActive
                ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
                : "text-white hover:text-royal-gold"
            }`
          }
        >
          <User size={18} />
          Teams
        </NavLink>
      </div>

      {/* 🔽 This renders the nested content */}
      <Outlet />
    </div>
  );
}
