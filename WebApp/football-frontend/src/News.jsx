import React, { useEffect, useMemo, useState } from "react";
import { useOtherData } from "./Contexts/OtherContext";

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
          sourceObj = JSON.parse(String(article.source || "{}").replace(/'\s*:\s*'/g, '"$1"').replace(/'/g, '"'));
        } catch {
          // keep empty sourceObj if parse fails
        }
        return { ...article, parsedSource: sourceObj };
      });

      setArticles(parsed);

      const grouped = parsed.reduce((acc, a) => {
        const k = a.topic || "Other";
        (acc[k] ||= []).push(a);
        return acc;
      }, {});

      // default: all topics open
      const defaults = Object.keys(grouped).reduce((m, k) => ((m[k] = true), m), {});
      setOpen(defaults);
      setGroupedNews(grouped);
    };
    loadNews();
  }, [fetchIfNeeded, NewsData]);

  // Topic list + counts
  const topics = useMemo(() => {
    return Object.entries(groupedNews)
      .map(([k, arr]) => ({ key: k, count: arr.length }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [groupedNews]);

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
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="h-3 w-24 bg-neutral-800 rounded mb-3 animate-pulse" />
      <div className="h-4 w-40 bg-neutral-800 rounded mb-2 animate-pulse" />
      <div className="h-4 w-3/4 bg-neutral-800 rounded mb-1 animate-pulse" />
      <div className="h-4 w-2/3 bg-neutral-800 rounded animate-pulse" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-royal-beige">
            Premier League News
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-2">
            Latest headlines, grouped by topic. Click a topic to collapse/expand.
          </p>
        </header>

        {/* Toolbar */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search news (team, player, source)…"
              className="w-full h-10 rounded-md bg-black/60 text-sm px-3 border border-white/10 outline-none focus:ring-2 focus:ring-royal-gold/60"
            />
          </div>
          {/* Topic chips */}
          <div className="flex flex-wrap items-center gap-2">
            {topics.map((t) => (
              <button
                key={t.key}
                onClick={() => toggle(t.key)}
                aria-pressed={!!open[t.key]}
                className={`h-9 px-3 rounded-full text-sm border transition focus:outline-none focus:ring-2 focus:ring-royal-gold/60 ${
                  open[t.key]
                    ? "bg-royal-gold text-black border-yellow-400"
                    : "bg-white/5 text-neutral-200 border-white/10 hover:bg-white/10"
                }`}
              >
                {t.key} <span className="opacity-70 ml-1">({t.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(filtered).map(([topic, entries]) => (
              <section key={topic} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                {/* Topic header */}
                <button
                  type="button"
                  onClick={() => toggle(topic)}
                  aria-expanded={!!open[topic]}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-royal-gold">{topic}</span>
                    <span className="text-xs text-neutral-400">{entries.length} articles</span>
                  </div>
                  <span className="text-royal-gold text-sm">{open[topic] ? "▲" : "▼"}</span>
                </button>

                {/* Articles */}
                {open[topic] && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 pt-0">
                    {entries.map((article, idx) => {
                      const isFPLTips = article.topic === "FPL tips";
                      const url = article.parsedSource?.url || "";
                      const sourceName = article.parsedSource?.name || "";
                      const Favicon = getFavicon(url);

                      const Card = (
                        <div className="h-full rounded-xl border border-white/10 bg-black/60 p-4 shadow-sm hover:shadow-md transition">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {Favicon ? (
                                <img src={Favicon} alt="" className="h-4 w-4 object-contain" onError={(e)=> (e.currentTarget.style.display='none')} />
                              ) : null}
                              <span className="text-[11px] text-neutral-400 truncate">{sourceName || (isFPLTips ? "FPL Tips" : "")}</span>
                            </div>
                            <time className="text-[11px] text-neutral-400">{toRelative(article.date)}</time>
                          </div>
                          <p className="text-sm leading-5 text-neutral-100 whitespace-pre-line">
                            {article.content}
                          </p>
                        </div>
                      );

                      return isFPLTips ? (
                        <div key={idx}>{Card}</div>
                      ) : (
                        <a
                          key={idx}
                          href={url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-inherit no-underline"
                        >
                          {Card}
                        </a>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}

            {Object.keys(filtered).length === 0 && (
              <div className="text-center text-neutral-400 py-10">No articles match your search.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
