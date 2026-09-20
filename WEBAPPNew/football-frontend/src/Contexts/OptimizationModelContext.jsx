import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const MODEL_STORAGE_KEY = "fpl_optimizer_model_type_v1";
const DEFAULT_MODEL_TYPE = "ai";

const normalizeModelType = (value) =>
  value === "statistical" ? "statistical" : DEFAULT_MODEL_TYPE;

const readStoredModelType = () => {
  if (typeof window === "undefined") return DEFAULT_MODEL_TYPE;
  try {
    return normalizeModelType(window.localStorage.getItem(MODEL_STORAGE_KEY));
  } catch {
    return DEFAULT_MODEL_TYPE;
  }
};

const OptimizationModelContext = createContext(null);

export function OptimizationModelProvider({ children }) {
  const [modelType, setModelTypeState] = useState(readStoredModelType);

  const setModelType = useCallback((nextModelType) => {
    setModelTypeState((currentModelType) =>
      normalizeModelType(
        typeof nextModelType === "function"
          ? nextModelType(currentModelType)
          : nextModelType
      )
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, modelType);
    } catch (error) {
      console.warn("Could not persist optimizer model selection:", error);
    }
  }, [modelType]);

  const value = useMemo(
    () => ({ modelType, setModelType }),
    [modelType, setModelType]
  );

  return (
    <OptimizationModelContext.Provider value={value}>
      {children}
    </OptimizationModelContext.Provider>
  );
}

export const useOptimizationModel = () => {
  const context = useContext(OptimizationModelContext);
  if (!context) {
    throw new Error("useOptimizationModel must be used inside OptimizationModelProvider");
  }
  return context;
};
