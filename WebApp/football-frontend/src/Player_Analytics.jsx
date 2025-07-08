import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { User, BarChart} from "lucide-react";

export default function Player_analytics() {

  return (
 <div className="min-h-screen bg-black text-white px-4 py-6 space-y-6">

  {/* Tabs */}
  <div className="flex justify-center gap-4 mb-6">
<NavLink
  to="Rankings"
  end
  className={({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 font-semibold  ${
      isActive
        ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
        : "text-white hover:text-royal-gold"
    }`
  }
>
  <BarChart size={18}/>
  Player Rankings
</NavLink>

<NavLink
  to="Individual"
  className={({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 font-semibold ${
      isActive
        ? "border-b-2 border-royal-gold text-royal-gold hover:text-royal-gold"
        : "text-white hover:text-royal-gold"
    }`
  }
>
  <User size={18}/>
  Individual Player
</NavLink>


  </div>

  {/* 🔽 This renders the nested content */}
  <Outlet />
</div>)}
