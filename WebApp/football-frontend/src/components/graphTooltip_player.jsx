// File: src/CustomTooltip.jsx
import React from "react";

export default function CustomTooltip({ active, payload, label, selectedMetric }) {
  if (!active || !payload || !payload.length) return null;

  const dataPoint = payload[0].payload;
  const opponent  = dataPoint["Opponent Name"];
  const value     = dataPoint[selectedMetric];

  return (
    <div className="bg-black p-2 border border-royal-gold rounded text-white">
      <p className="font-bold mb-1">{new Date(label).toLocaleDateString()}</p>
      <p>Opponent: <span className="text-royal-gold">{opponent}</span></p>
      <p>
        {selectedMetric.replace(/_/g, " ")}:{" "}
        <span className="text-royal-gold">{value}</span>
      </p>
    </div>
  );
}
