import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const OtherDataContext = createContext();

export const useOtherData = () => useContext(OtherDataContext);

export function OtherDataProvider({ children }) {
  const newsRef = useRef(null);
  const ScorePredRef = useRef(null);
  const FixtureRef = useRef(null);
  const SeasonRef = useRef(null);
  const TableRef = useRef(null);
  const inFlightRef = useRef(null);
  const [dataVersion, setDataVersion] = useState(0);

  const [loading, setLoading] = useState(false);

  const fetchIfNeeded = useCallback(async () => {
    if (newsRef.current && ScorePredRef.current && FixtureRef.current && SeasonRef.current && TableRef.current) return;
    if (inFlightRef.current) return inFlightRef.current;

    const request = (async () => {
      setLoading(true);
      try {
        const [NewsRes, ScorePredRes, FixtureRes, SeasonRes, TableRes] = await Promise.all([
          fetch("https://fpl-project-t5e9.onrender.com/News").then((res) => res.json()),
          fetch("https://fpl-project-t5e9.onrender.com/Team_Predictions").then((res) => res.json()),
          fetch("https://fpl-project-t5e9.onrender.com/Team_Predictions_Future").then((res) => res.json()),
          fetch("https://fpl-project-t5e9.onrender.com/Season_Analysis").then((res) => res.json()),
          fetch("https://fpl-project-t5e9.onrender.com/Table_Prediction").then((res) => res.json()),
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
        inFlightRef.current = null;
        setLoading(false);
      }
    })();

    inFlightRef.current = request;
    return request;
  }, []);

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
