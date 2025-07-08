import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";

export default function AITeams() {

  return (
 <div className="min-h-screen bg-black text-white px-4 py-6 space-y-6">

  {/* Tabs */}
  <div className="flex justify-center gap-4 mb-6">
<NavLink
  to="FreeHitTeam"
  end
  className={({ isActive }) =>
    `px-4 py-2 font-semibold ${
      isActive
        ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
        : "text-white hover:text-royal-gold"
    }`
  }
>
  Free Hit Team
</NavLink>

<NavLink
  to="Wildcard_Team"
  className={({ isActive }) =>
    `px-4 py-2 font-semibold ${
      isActive
        ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
        : "text-white hover:text-royal-gold"
    }`
  }
>
  Wildcard Team
</NavLink>

<NavLink
  to="My_Team"
  className={({ isActive }) =>
    `px-4 py-2 font-semibold ${
      isActive
        ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
        : "text-white hover:text-royal-gold"
    }`
  }
>
  My Team
</NavLink>

  </div>

  {/* 🔽 This renders the nested content */}
  <Outlet />
</div>)}