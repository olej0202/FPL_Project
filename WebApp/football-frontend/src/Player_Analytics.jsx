import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { User, BarChart } from "lucide-react";

export default function Player_analytics() {
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to Rankings if on /Player_Analytics
  useEffect(() => {
    if (location.pathname === "/Player_Analytics") {
      navigate("/Player_Analytics/Rankings");
    }
  }, [location, navigate]);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-1 space-y-0">
      {/* Tabs */}
      <div className="flex justify-center gap-4 mb-6">
        <NavLink
          to="Rankings"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-0 font-semibold  ${
              isActive
                ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
                : "text-white hover:text-royal-gold"
            }`
          }
        >
          <BarChart size={18} />
          Player Rankings
        </NavLink>

        <NavLink
          to="Individual"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-1 font-semibold ${
              isActive
                ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
                : "text-white hover:text-royal-gold"
            }`
          }
        >
          <User size={18} />
          Individual Player
        </NavLink>
      </div>

      {/* 🔽 This renders the nested content */}
      <Outlet />
    </div>
  );
}
