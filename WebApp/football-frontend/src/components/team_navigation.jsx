import { NavLink, useLocation } from "react-router-dom";

export default function AITeamNav() {
  const location = useLocation();

  const aiPaths = ["/Free_Hit", "/Wildcard_Team", "/My_Team"];
  const shouldShow = aiPaths.includes(location.pathname);

  if (!shouldShow) return null;

  return (
    <div className="bg-royal-red text-white py-2 px-4 border-t border-b border-royal-gold">
      <div className="max-w-5xl mx-auto flex justify-center gap-6">
        {[
          { label: "Free Hit", path: "/Free_Hit" },
          { label: "Wildcard", path: "/Wildcard_Team" },
          { label: "My Team", path: "/My_Team" },
        ].map(({ label, path }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `px-4 py-2 font-semibold rounded border border-royal-gold transition-colors duration-150
              ${
                isActive
                  ? "bg-royal-gold text-black hover:text-black"
                  : "text-white hover:bg-gray-700 hover:text-white"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
