import React, { createContext, useContext, useRef, useState } from "react";

const OtherDataContext = createContext();

export const useOtherData = () => useContext(OtherDataContext);

export function OtherDataProvider({ children }) {
  const newsRef = useRef(null);
  const ScorePredRef = useRef(null);
  const FixtureRef = useRef(null);
  const SeasonRef = useRef(null);

  const [loading, setLoading] = useState(false);

  const fetchIfNeeded = async () => {
    if (newsRef.current && ScorePredRef.current && FixtureRef.current && SeasonRef.current) return;

    setLoading(true);
    try {
      const [NewsRes, ScorePredRes, FixtureRes, SeasonRes] = await Promise.all([
        fetch("https://fpl-project-t5e9.onrender.com/News").then(res => res.json()),
        fetch("https://fpl-project-t5e9.onrender.com/Team_Predictions").then(res => res.json()),
        fetch("https://fpl-project-t5e9.onrender.com/Team_Predictions_Future").then(res => res.json()),
        fetch("https://fpl-project-t5e9.onrender.com/Season_Analysis").then(res => res.json()),
      ]);
      newsRef.current = NewsRes;
      ScorePredRef.current = ScorePredRes;
      FixtureRef.current = FixtureRes;
      SeasonRef.current = SeasonRes;
    } catch (err) {
      console.error("Failed fetching AI team data:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <OtherDataContext.Provider
      value={{
        fetchIfNeeded,
        loading,
        NewsData: newsRef,
        ScorePredData: ScorePredRef,
        FixtureData: FixtureRef,
        SeasonData: SeasonRef,
      }}
    >
      {children}
    </OtherDataContext.Provider>
  );
}
