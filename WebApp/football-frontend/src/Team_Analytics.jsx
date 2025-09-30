import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { User, BarChart } from "lucide-react";

export default function Team_Analytics() {
  const navigate = useNavigate();
  const location = useLocation();


  // Redirect to Rankings if on /Player_Analytics
  useEffect(() => {
    if (location.pathname === "/Team_Analytics") {
      navigate("/Team_Analytics/Team_Rankings");
    }
  }, [location, navigate]);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6 space-y-6">
      {/* Tabs */}
      <div className="flex justify-center gap-4 mb-6">
        <NavLink
          to="Team_Rankings"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 font-semibold  ${
              isActive
                ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
                : "text-white hover:text-royal-gold"
            }`
          }
        >
          <BarChart size={18} />
          Team Rankings
        </NavLink>

        <NavLink
          to="Team_Individual"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 font-semibold ${
              isActive
                ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
                : "text-white hover:text-royal-gold"
            }`
          }
        >
          <User size={18} />
          Individual Team
        </NavLink>


        <NavLink
          to="Team_Analysis"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 font-semibold ${
              isActive
                ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
                : "text-white hover:text-royal-gold"
            }`
          }
        >
          <User size={18} />
           Team Analysis
        </NavLink>


        
      </div>

      {/* 🔽 This renders the nested content */}
      <Outlet />
    </div>
  );
}
