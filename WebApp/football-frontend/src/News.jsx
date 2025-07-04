import React, { useEffect, useState } from "react";

export default function NewsBlog() {
  const [articles, setArticles] = useState([]);
  const [groupedNews, setGroupedNews] = useState({});

  useEffect(() => {
    fetch("https://fpl-project-t5e9.onrender.com/News")
      .then((res) => res.json())
      .then((data) => {
        const parsed = data.map((article) => {
          let sourceObj = {};
          try {
            sourceObj = JSON.parse(article.source.replace(/'/g, '"'));
          } catch (e) {
            console.warn("Invalid source format:", article.source);
          }

          return {
            ...article,
            parsedSource: sourceObj,
          };
        });

        setArticles(parsed);

        const grouped = parsed.reduce((acc, article) => {
          if (!acc[article.topic]) acc[article.topic] = [];
          acc[article.topic].push(article);
          return acc;
        }, {});

        setGroupedNews(grouped);
      })
      .catch((err) => console.error("Failed to fetch news:", err));
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center px-4 sm:px-6 py-10 sm:py-12 space-y-10">
      <h1 className="text-3xl sm:text-4xl font-bold text-center text-royal-beige">
        Premier League News
      </h1>

      {Object.entries(groupedNews).map(([topic, entries]) => (
        <div key={topic} className="w-full max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-royal-gold border-b border-royal-gold mb-6 pb-2">
            {topic}
          </h2>

          <div className="space-y-6">
            {entries.map((article, idx) => {
              const isFPLTips = article.topic === "FPL tips";

              const Wrapper = isFPLTips ? "div" : "a";
              const wrapperProps = isFPLTips
                ? {}
                : {
                    href: article.parsedSource?.url || "#",
                    target: "_blank",
                    rel: "noopener noreferrer",
                  };

              return (
                <Wrapper
                  key={idx}
                  {...wrapperProps}
                  className="block bg-royal-red border border-royal-gold p-4 rounded-lg shadow-md hover:bg-royal-red/80 transition duration-200 text-inherit no-underline"
                >
                  <p className="text-sm text-royal-beige mb-2">
                    {new Date(article.date).toLocaleString()}
                    {article.parsedSource?.name && !isFPLTips && (
                      <span className="ml-4 italic text-xs text-royal-gold">
                        ({article.parsedSource.name})
                      </span>
                    )}
                  </p>
                  <p className="whitespace-pre-line">{article.content}</p>
                </Wrapper>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
