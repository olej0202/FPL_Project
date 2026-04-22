export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://fpl-project-t5e9.onrender.com";

const DEFAULT_GOOGLE_CLIENT_ID =
  "57284591314-0cojou9ct466fim5hgmo2l6nhqe86rdt.apps.googleusercontent.com";

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
