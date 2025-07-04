import os
import requests
from dotenv import load_dotenv
import pandas as pd
from datetime import datetime, timedelta
from openai import OpenAI

# Load environment variables
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GNEWS_API_KEY = os.getenv("GNEWS_API_KEY")

client = OpenAI(api_key=OPENAI_API_KEY)

# === Fetch News ===
def fetch_premier_league_news():
    one_week_ago = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
    print("📅 Fetching news since:", one_week_ago)

    keywords = [
        "Premier League", "Arsenal", "Manchester United", "Manchester City",
        "Liverpool", "Chelsea", "Tottenham", "Newcastle United", "Aston Villa",
        "Brighton", "West Ham", "Brentford", "Fulham", "Wolves",
        "Crystal Palace", "Nottingham Forest", "Bournemouth"
    ]

    all_articles = []
    seen_urls = set()

    for keyword in keywords:
        query = keyword.replace(" ", "+")
        url = (
            f"https://gnews.io/api/v4/search?"
            f"q={query}&lang=en&country=gb&max=10&from={one_week_ago}&apikey={GNEWS_API_KEY}"
        )

        response = requests.get(url)
        print(f"🔍 {keyword}: {response.status_code}")
        
        if response.status_code == 200:
            articles = response.json().get("articles", [])
            for a in articles:
                if a["url"] not in seen_urls:
                    seen_urls.add(a["url"])
                    all_articles.append({
                        "title": a["title"],
                        "description": a.get("description", ""),
                        "content": a.get("content", ""),
                        "url": a["url"],
                        "source": a.get("source", "")
                    })
        else:
            print(f"⚠️ Error fetching {keyword}: {response.text}")

    print(f"\n✅ Total unique articles: {len(all_articles)}")
    return all_articles

# === Extract Stories from Articles ===
def extract_news_stories(all_articles_text):
    prompt = f"""
The following text is a compilation of multiple Premier League news articles. Your task is to extract and write **separate concise news stories** for each distinct event. 
Use this format for each:

Title: [A short headline]
Content: [The body of the story]

- Every short story is of relevance.
- Return multiple stories, separated by ###
- Group similar topics into one story.
- Keep tone journalistic.
- Mention Fantasy Premier League relevance if applicable.
- Be respectful with sensitive topics.

Text:
{all_articles_text}

Return only stories using the format described.
"""

    messages = [
        {"role": "system", "content": "You are a professional football news editor."},
        {"role": "user", "content": prompt}
    ]
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.7
    )
    return response.choices[0].message.content.strip().split("###")

# === Classify Stories ===
def classify_topic(story_content):
    messages = [
        {"role": "system", "content": "You are a football news classifier."},
        {"role": "user", "content": f"""Classify this Premier League article into ONE category:
- Transfer News
- Injury News
- Match News
- General News

Return only the category.

Article: {story_content}"""}
    ]
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0
    )
    return response.choices[0].message.content.strip()

# === Generate FPL Tips ===
def generate_fpl_tips_from_csv(path="Model_Predictions.csv", top_n=40):
    try:
        df = pd.read_csv(path)
        df = df.sort_values(by="Predictions", ascending=False).head(top_n)
        
        df["Name"] = df["Name"].str.replace(r'\d+$', '', regex=True).str.strip()
        data = pd.read_csv("Raw_Data_24/Fantasy_season_2024_data.csv").iloc[:, 1:]
        data['kickoff_time'] = pd.to_datetime(data['kickoff_time'])
        latest_rows = data.loc[data.groupby("element")["kickoff_time"].idxmax()]

        merged = df.merge(
            latest_rows[['Full_Name', 'team_name', 'selected', 'transfers_in', 'news']],
            how='left',
            left_on='Name',
            right_on='Full_Name'
        )

        merged.drop(columns=['Full_Name'], inplace=True)

        player_summaries = "\n".join([
            f"{row['Name']} ({row['position']}, {row['time_index']}) - {row['Predictions']} pts - {row['transfers_in']} transfers in - {row['team_name']} - {row['selected']} selected - {row['news']}"
            for _, row in merged.iterrows()
        ])

        prompt = f"""
Based on the following Fantasy Premier League (FPL) player predictions, write a list of FPL tips or suggestions.
Cover transfer targets, differentials, and captaincy picks.
Do not explicitly mention predicted points.

Players:
{player_summaries}
Return a short, article-style summary.
"""
        messages = [
            {"role": "system", "content": "You are a Fantasy Premier League expert."},
            {"role": "user", "content": prompt}
        ]
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.5
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"⚠️ Failed to generate FPL tips: {e}")
        return None

# === Main Execution ===
def main():
    news_df = pd.DataFrame(columns=["header", "content", "topic", "date", "index", "source"])
    articles = fetch_premier_league_news()

    if not articles:
        print("❌ No articles found.")
        return

    article_texts = []
    article_sources = []

    for article in articles:
        article_texts.append(
            f"\nTitle: {article['title']}\nDescription: {article['description']}\nContent: {article['content']}\n"
        )
        article_sources.append(article.get("source", "Unknown"))

    stories = extract_news_stories("".join(article_texts))

    for i, story in enumerate(stories):
        story = story.strip()
        if not story:
            continue

        try:
            if "Title:" in story and "Content:" in story:
                title_part = story.split("Title:")[1].split("Content:")[0].strip()
                content_part = story.split("Content:")[1].strip()
            else:
                title_part = f"Story {i+1}"
                content_part = story

            topic = classify_topic(content_part)
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
            source = article_sources[i] if i < len(article_sources) else "Unknown"

            news_df = pd.concat([
                news_df,
                pd.DataFrame([{
                    "header": title_part,
                    "content": content_part,
                    "topic": topic,
                    "date": timestamp,
                    "index": len(news_df),
                    "source": source
                }])
            ], ignore_index=True)

            print(f"✅ Story {i+1}: {title_part[:50]}... → {topic} ({source})")

        except Exception as e:
            print(f"⚠️ Failed to process story {i+1}: {e}")

    # Add FPL Tips
    fpl_tips = generate_fpl_tips_from_csv("Model_predictions.csv")
    if fpl_tips:
        news_df = pd.concat([
            news_df,
            pd.DataFrame([{
                "header": "Fantasy Premier League Tips",
                "content": fpl_tips,
                "topic": "FPL tips",
                "date": datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
                "index": len(news_df),
                "source": "Fantasy Model"
            }])
        ], ignore_index=True)
        print("✅ Added FPL tips section.")

    news_df.to_csv("PL_news.csv", index=False)
    print("\n📝 Final DataFrame:")
    print(news_df)

if __name__ == "__main__":
    main()
