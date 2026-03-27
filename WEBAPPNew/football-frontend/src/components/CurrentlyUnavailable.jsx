import React from "react";

export default function CurrentlyUnavailable({ title = "This page" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">Currently not available</p>
    </div>
  );
}
