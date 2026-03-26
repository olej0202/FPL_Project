import React, { useEffect, useMemo, useState } from "react";
import { useOtherData } from "./Contexts/OtherContext";

const PALETTE = {
  red: "#f8fafc",
  gold: "#5f8f7b",
  black: "#e2e8f0",
  beige: "#1e293b",
};

// Small helpers
const toRelative = (iso) => {
  if (!iso) return "";
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleString();
};

const getFavicon = (url) => {
  try {
    const { origin } = new URL(url);
    return `${origin}/favicon.ico`;
  } catch {
    return null;
  }
};

export default function NewsBlog() {
  const [articles, setArticles] = useState([]);
  const [groupedNews, setGroupedNews] = useState({});
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({}); // topic -> bool

  const { fetchIfNeeded, NewsData, loading } = useOtherData();

  useEffect(() => {
    const loadNews = async () => {
      await fetchIfNeeded();
      if (!NewsData.current) return;

      const parsed = NewsData.current.map((article) => {
        let sourceObj = {};
        try {
          sourceObj = JSON.parse(
            String(article.source || "{}")
              .replace(/'\s*:\s*'/g, '"$1"')
              .replace(/'/g, '"')
          );
        } catch {
          // ignore parse errors, keep empty sourceObj
        }
        return { ...article, parsedSource: sourceObj };
      });

      setArticles(parsed);

      const grouped = parsed.reduce((acc, a) => {
        const k = a.topic || "Other";
        (acc[k] ||= []).push(a);
        return acc;
      }, {});

      const defaults = Object.keys(grouped).reduce((m, k) => {
        m[k] = true;
        return m;
      }, {});

      setOpen(defaults);
      setGroupedNews(grouped);
    };
    loadNews();
  }, [fetchIfNeeded, NewsData]);

  // Topic list + counts
  const topics = useMemo(
    () =>
      Object.entries(groupedNews)
        .map(([k, arr]) => ({ key: k, count: arr.length }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    [groupedNews]
  );

  // Filtered by query (search in content + source name)
  const filtered = useMemo(() => {
    if (!query.trim()) return groupedNews;
    const q = query.toLowerCase();
    const out = {};
    for (const [topic, arr] of Object.entries(groupedNews)) {
      const hit = arr.filter((a) => {
        const c = String(a.content || "").toLowerCase();
        const s = String(a.parsedSource?.name || "").toLowerCase();
        return c.includes(q) || s.includes(q);
      });
      if (hit.length) out[topic] = hit;
    }
    return out;
  }, [groupedNews, query]);

  const toggle = (t) => setOpen((o) => ({ ...o, [t]: !o[t] }));

  // Skeleton card
  const Skeleton = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="h-3 w-24 bg-slate-200 rounded mb-3 animate-pulse" />
      <div className="h-4 w-40 bg-slate-200 rounded mb-2 animate-pulse" />
      <div className="h-4 w-3/4 bg-slate-200 rounded mb-1 animate-pulse" />
      <div className="h-4 w-2/3 bg-slate-200 rounded animate-pulse" />
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "1.5rem 1rem 2.5rem",
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 55%, #cbd5e1 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
            Premier League News
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-2xl mx-auto">
            Latest headlines, grouped by topic. Click a topic to collapse or expand, or search across all articles.
          </p>
        </header>

        {/* Toolbar */}
        <section className="mb-6 space-y-3">
          {/* Search card */}
          <div className="max-w-xl mx-auto w-full rounded-2xl border border-slate-200 bg-white shadow-sm px-3 sm:px-4 py-2 sm:py-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search news (team, player, source)…"
              className="
                w-full h-10
                rounded-md
                bg-slate-50
                text-sm
                px-3
                border border-slate-300
                outline-none
                text-slate-800
                focus:ring-2 focus:ring-emerald-300
              "
            />
          </div>

          {/* Topic chips – horizontally scrollable on small screens */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {topics.map((t) => (
              <button
                key={t.key}
                onClick={() => toggle(t.key)}
                aria-pressed={!!open[t.key]}
                className={`
                  flex-shrink-0
                  h-8 sm:h-9 px-3 rounded-full
                  text-xs sm:text-sm
                  border
                  transition
                  focus:outline-none focus:ring-2 focus:ring-emerald-300
                  ${
                    open[t.key]
                      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }
                `}
              >
                <span className="truncate max-w-[120px] sm:max-w-none">
                  {t.key}
                </span>
                <span className="opacity-70 ml-1">({t.count})</span>
              </button>
            ))}
          </div>
        </section>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8 mt-4">
            {Object.entries(filtered).map(([topic, entries]) => (
              <section
                key={topic}
                className="
                  rounded-2xl
                  border border-slate-200
                  bg-white
                  shadow-sm
                  overflow-hidden
                "
              >
                {/* Topic header */}
                <button
                  type="button"
                  onClick={() => toggle(topic)}
                  aria-expanded={!!open[topic]}
                  className="
                    w-full
                    flex items-center justify-between
                    px-4 py-3
                    text-left
                    bg-slate-50
                    hover:bg-slate-100
                    transition
                    focus:outline-none focus:ring-2 focus:ring-emerald-300
                  "
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-base sm:text-lg font-semibold text-emerald-700 truncate">
                      {topic}
                    </span>
                    <span className="text-[11px] sm:text-xs text-slate-500 whitespace-nowrap">
                      {entries.length} article{entries.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="text-emerald-700 text-xs sm:text-sm">
                    {open[topic] ? "▲" : "▼"}
                  </span>
                </button>

                {/* Articles */}
                {open[topic] && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-4">
                    {entries.map((article, idx) => {
                      const isFPLTips = article.topic === "FPL tips";
                      const url = article.parsedSource?.url || "";
                      const sourceName = article.parsedSource?.name || "";
                      const Favicon = getFavicon(url);

                      const CardInner = (
                        <div
                          className={`
                            h-full
                            rounded-xl
                            border
                            ${
                              isFPLTips
                                ? "border-emerald-300"
                                : "border-slate-200"
                            }
                            bg-white
                            p-4
                            shadow-sm
                            transition
                            hover:shadow-md hover:-translate-y-1
                            flex flex-col
                          `}
                        >
                          {/* Top row: source + time */}
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {Favicon ? (
                                <img
                                  src={Favicon}
                                  alt=""
                                  className="h-4 w-4 object-contain flex-shrink-0"
                                  onError={(e) =>
                                    (e.currentTarget.style.display = "none")
                                  }
                                />
                              ) : null}
                              <span className="text-[11px] text-slate-500 truncate">
                                {sourceName || (isFPLTips ? "FPL Tips" : "")}
                              </span>
                            </div>
                            <time className="text-[11px] text-slate-500 flex-shrink-0">
                              {toRelative(article.date)}
                            </time>
                          </div>

                          {/* Content */}
                          <p className="text-sm sm:text-[15px] leading-5 text-slate-700 whitespace-pre-line">
                            {article.content}
                          </p>
                        </div>
                      );

                      // FPL tips stay in-app, others open in new tab
                      return isFPLTips ? (
                        <div key={idx}>{CardInner}</div>
                      ) : (
                        <a
                          key={idx}
                          href={url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-inherit no-underline"
                        >
                          {CardInner}
                        </a>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}

            {Object.keys(filtered).length === 0 && (
              <div className="text-center text-slate-600 py-10">
                No articles match your search.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}



