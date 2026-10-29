
"use client";

import { useState } from "react";

type Post = Record<string, unknown>;

type AnalysisResult = {
  message?: string;
  error?: string;
  profileUrl?: string;
  posts?: Post[];
};

function getValue(post: Post, keys: string[]): unknown {
  for (const key of keys) {
    const value = post[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "未取得";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    setError("");
    setResult(null);

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url.trim());
    } catch {
      setError("ThreadsのプロフィールURLを正しく入力してください。");
      return;
    }

    const validHost = [
      "threads.net",
      "www.threads.net",
      "threads.com",
      "www.threads.com",
    ].includes(parsedUrl.hostname);

    if (
      !["https:", "http:"].includes(parsedUrl.protocol) ||
      !validHost ||
      !/^\/@[\w.]+\/?$/.test(parsedUrl.pathname)
    ) {
      setError("有効なThreadsプロフィールURLを入力してください。");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrl: url.trim() }),
      });

      const data: AnalysisResult = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "投稿の取得に失敗しました。");
      }

      setResult(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "通信エラーが発生しました。"
      );
    } finally {
      setLoading(false);
    }
  }

  const posts = result?.posts ?? [];

  return (
    <main
      style={{
        maxWidth: 800,
        margin: "30px auto",
        padding: 20,
        fontFamily: "Arial, sans-serif",
        color: "#172033",
      }}
    >
      <h1 style={{ fontSize: 34 }}>Threads Analyzer</h1>
      <p>Threadsアカウントの投稿分析ツール</p>

      <label htmlFor="profile-url">ThreadsプロフィールURL</label>
      <input
        id="profile-url"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.threads.com/@username"
        autoComplete="url"
        style={{
          display: "block",
          width: "100%",
          padding: 14,
          margin: "12px 0",
          boxSizing: "border-box",
          border: "1px solid #bbb",
          borderRadius: 8,
          fontSize: 16,
        }}
      />

      <button
        onClick={analyze}
        disabled={loading}
        style={{
          padding: "13px 20px",
          border: 0,
          borderRadius: 8,
          background: "#2563eb",
          color: "white",
          fontSize: 16,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "投稿を取得中..." : "アカウントを分析する"}
      </button>

      {error && (
        <p role="alert" style={{ marginTop: 20, color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {result && (
        <section style={{ marginTop: 28 }}>
          <h2>取得結果</h2>
          <p>{result.message || "取得処理が完了しました。"}</p>
          <p>プロフィール：{result.profileUrl}</p>
          <p>取得データ数：{posts.length}件</p>

          {posts.length === 0 && (
            <p>投稿データがありませんでした。</p>
          )}

          {posts.map((post, index) => {
            const text = getValue(post, [
              "text",
              "caption",
              "content",
              "body",
              "postText",
              "threadText",
            ]);

            const date = getValue(post, [
              "timestamp",
              "createdAt",
              "created_at",
              "takenAt",
              "date",
              "publishedAt",
            ]);

            const likes = getValue(post, [
              "likeCount",
              "likesCount",
              "likes",
              "like_count",
              "likes_count",
            ]);

            const replies = getValue(post, [
              "replyCount",
              "repliesCount",
              "commentsCount",
              "replies",
              "reply_count",
              "comments",
            ]);

            const reposts = getValue(post, [
              "repostCount",
              "repostsCount",
              "reposts",
              "repost_count",
              "repostCount",
            ]);

            const quotes = getValue(post, [
              "quoteCount",
              "quotesCount",
              "quotes",
              "quote_count",
            ]);

            const urlValue = getValue(post, [
              "url",
              "postUrl",
              "permalink",
              "link",
            ]);

            return (
              <article
                key={String(post.id ?? post.postId ?? index)}
                style={{
                  marginTop: 16,
                  padding: 18,
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  overflowWrap: "anywhere",
                  background: "white",
                }}
              >
                <h3>投稿 {index + 1}</h3>

                <p style={{ whiteSpace: "pre-wrap" }}>
                  {displayValue(text)}
                </p>

                <p>投稿日：{displayValue(date)}</p>

                <p>
                  いいね：{displayValue(likes)}　
                  返信：{displayValue(replies)}
                </p>

                <p>
                  リポスト：{displayValue(reposts)}　
                  引用：{displayValue(quotes)}
                </p>

                {typeof urlValue === "string" &&
                  /^https?:\/\//.test(urlValue) && (
                    <p>
                      <a
                        href={urlValue}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Threadsで投稿を見る
                      </a>
                    </p>
                  )}

                <details style={{ marginTop: 12 }}>
                  <summary>取得した元データを確認</summary>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      fontSize: 12,
                      background: "#f3f4f6",
                      padding: 12,
                      borderRadius: 8,
                    }}
                  >
                    {JSON.stringify(post, null, 2)}
                  </pre>
                </details>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
