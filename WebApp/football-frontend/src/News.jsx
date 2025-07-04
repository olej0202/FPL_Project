import React, { useEffect, useState } from "react";

export default function NewsBlog() {
  const [articles, setArticles] = useState([]);
  const [groupedNews, setGroupedNews] = useState({});

  useEffect(() => {
    fetch("https://fpl-project-t5e9.onrender.com/News")
      .then((res) => res.json())
      .then((data) => {
        setArticles(data);
        const grouped = data.reduce((acc, article) => {
          if (!acc[article.topic]) acc[article.topic] = [];
          acc[article.topic].push(article);
          return acc;
        }, {});
        setGroupedNews(grouped);
      })
      .catch((err) => console.error("Failed to fetch news:", err));
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-6 py-12 space-y-10">
      <h1 className="text-4xl font-bold text-center text-royal-beige">Premier League News</h1>

      {Object.entries(groupedNews).map(([topic, entries]) => (
        <div key={topic} className="w-full max-w-5xl">
          <h2 className="text-3xl font-bold text-royal-gold border-b border-royal-gold mb-6 pb-2">{topic}</h2>
          <div className="space-y-6">
            {entries.map((article, idx) => (
              <a
                key={idx}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-royal-red border border-royal-gold p-4 rounded-lg shadow text-white hover:bg-royal-red/80 transition duration-200"
              >
                <p className="text-sm text-royal-beige mb-2">
                  {new Date(article.date).toLocaleString()}
                  {article.source && <span className="ml-4 italic text-xs text-royal-gold">({article.source})</span>}
                </p>
                <p className="whitespace-pre-line">{article.content}</p>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
