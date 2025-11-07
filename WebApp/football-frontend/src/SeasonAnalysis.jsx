import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { User, Users} from "lucide-react";

export default function SeasonAnalytics() {
  return (
    <div className="min-h-screen bg-black text-white px-1 py-3 space-y-8">
      {/* Tabs */}
      <div className="flex justify-center gap-4 mb-3">
        <NavLink
          to="Season_Players"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-1 font-semibold  ${
              isActive
                ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
                : "text-white hover:text-royal-gold"
            }`
          }
        >
          <User size={18} />
          Players
        </NavLink>

        <NavLink
          to="Season_Teams"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-1 font-semibold ${
              isActive
                ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
                : "text-white hover:text-royal-gold"
            }`
          }
        >
          <Users size={18} />
          Teams
        </NavLink>
      </div>

      {/* Nested content */}
      <Outlet />
    </div>
  );
}
