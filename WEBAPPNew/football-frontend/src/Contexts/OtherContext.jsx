import React, { createContext, useContext, useRef, useState } from "react";

const OtherDataContext = createContext();

export const useOtherData = () => useContext(OtherDataContext);

export function OtherDataProvider({ children }) {
  const newsRef = useRef(null);
  const ScorePredRef = useRef(null);
  const FixtureRef = useRef(null);
  const SeasonRef = useRef(null);
  const TableRef = useRef(null);
  const [dataVersion, setDataVersion] = useState(0);

  const [loading, setLoading] = useState(false);

  const fetchIfNeeded = async () => {
    if (newsRef.current && ScorePredRef.current && FixtureRef.current && SeasonRef.current &&TableRef.current) return;

    setLoading(true);
    try {
      const [NewsRes, ScorePredRes, FixtureRes, SeasonRes, TableRes] = await Promise.all([
        fetch("https://fpl-project-t5e9.onrender.com/News").then(res => res.json()),
        fetch("https://fpl-project-t5e9.onrender.com/Team_Predictions").then(res => res.json()),
        fetch("https://fpl-project-t5e9.onrender.com/Team_Predictions_Future").then(res => res.json()),
        fetch("https://fpl-project-t5e9.onrender.com/Season_Analysis").then(res => res.json()),
        fetch("https://fpl-project-t5e9.onrender.com/Table_Prediction").then(res => res.json()),
      ]);
      newsRef.current = NewsRes;
      ScorePredRef.current = ScorePredRes;
      FixtureRef.current = FixtureRes;
      SeasonRef.current = SeasonRes;
      TableRef.current = TableRes;
      setDataVersion((v) => v + 1);
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
        dataVersion,
        NewsData: newsRef,
        ScorePredData: ScorePredRef,
        FixtureData: FixtureRef,
        SeasonData: SeasonRef,
        TableData: TableRef,
      }}
    >
      {children}
    </OtherDataContext.Provider>
  );
}
