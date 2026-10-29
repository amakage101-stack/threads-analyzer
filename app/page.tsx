"use client";
import { useState } from "react";
type Post = Record<string, unknown>;
type AnalysisResult = {
  message?: string;
  error?: string;
  profileUrl?: string;
  username?: string;
  posts?: Post[];
  ownReplies?: Post[];
  note?: string;
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
function PostCard({
  post,
  title,
}: {
  post: Post;
  title: string;
}) {
  const text = getValue(post, [
    "text",
    "caption",
    "content",
    "body",
    "postText",
    "threadText",
  ]);
  const date = getValue(post, [
    "createdAt",
    "created_at",
    "timestamp",
    "date",
    "publishedAt",
  ]);
  const likes = getValue(post, [
    "likeCount",
    "likesCount",
    "likes",
    "like_count",
  ]);
  const postUrl = getValue(post, [
    "url",
    "postUrl",
    "permalink",
    "link",
  ]);
  return (
    <article
      style={{
        marginTop: 14,
        padding: 18,
        border: "1px solid #ddd",
        borderRadius: 12,
        overflowWrap: "anywhere",
        background: "white",
      }}
    >
      <h3>{title}</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>
        {displayValue(text)}
      </p>
      <p>投稿日：{displayValue(date)}</p>
      <p>いいね：{displayValue(likes)}</p>
      {typeof postUrl === "string" &&
        /^https?:\/\//.test(postUrl) && (
          <p>
            <a
              href={postUrl}
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
}
export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] =
    useState<AnalysisResult | null>(null);
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileUrl: url.trim(),
        }),
      });
      const data: AnalysisResult = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "投稿の取得に失敗しました。"
        );
      }
      setResult(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "通信エラーが発生しました。"
      );
    } finally {
      setLoading(false);
    }
  }
  const posts = result?.posts ?? [];
  const ownReplies = result?.ownReplies ?? [];
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
      <label htmlFor="profile-url">
        ThreadsプロフィールURL
      </label>
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
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
      {result && (
        <section style={{ marginTop: 28 }}>
          <h2>取得結果</h2>
          <p>{result.message || "取得処理が完了しました。"}</p>
          <p>プロフィール：{result.profileUrl}</p>
          <p>通常投稿：{posts.length}件</p>
          <p>本人の返信投稿：{ownReplies.length}件</p>
          <h2 style={{ marginTop: 28 }}>通常投稿</h2>
          {posts.length === 0 && (
            <p>通常投稿は見つかりませんでした。</p>
          )}
          {posts.map((post, index) => (
            <PostCard
              key={String(post.id ?? post.postId ?? index)}
              post={post}
              title={`投稿 ${index + 1}`}
            />
          ))}
          <h2 style={{ marginTop: 32 }}>
            本人の返信投稿
          </h2>
          {ownReplies.length === 0 ? (
            <p>
              本人の返信投稿は取得データから確認できませんでした。
            </p>
          ) : (
            ownReplies.map((post, index) => (
              <PostCard
                key={String(post.id ?? post.postId ?? index)}
                post={post}
                title={`本人の返信 ${index + 1}`}
              />
            ))
          )}
          {result.note && (
            <p style={{ marginTop: 20, color: "#555" }}>
              {result.note}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
