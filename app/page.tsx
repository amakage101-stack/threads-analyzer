"use client";

import { useState } from "react";

type AnalysisResult = {
  message?: string;
  error?: string;
  profileUrl?: string;
  posts?: unknown[];
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    setError("");
    setResult(null);

    const profileUrl = url.trim();
    if (!/^https?:\/\/(www\\.)?threads\\.net\/@[\\w.]+\/?(?:\\?.*)?$/.test(profileUrl)) {
      setError("ThreadsのプロフィールURLを正しく入力してください。例：https://www.threads.net/@username");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrl }),
      });
      const data: AnalysisResult = await response.json();
      if (!response.ok) throw new Error(data.error || "分析リクエストに失敗しました。");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 36 }}>Threads Analyzer</h1>
      <p>Threadsアカウントの投稿分析ツール</p>
      <label htmlFor="profile-url">ThreadsプロフィールURL</label>
      <input
        id="profile-url"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.threads.net/@username"
        autoComplete="url"
        style={{ display: "block", width: "100%", padding: 14, margin: "12px 0", boxSizing: "border-box", border: "1px solid #bbb", borderRadius: 8 }}
      />
      <button
        onClick={analyze}
        disabled={loading}
        style={{ padding: "13px 20px", border: 0, borderRadius: 8, background: "#2563eb", color: "white", opacity: loading ? 0.7 : 1 }}
      >
        {loading ? "処理中..." : "アカウントを分析する"}
      </button>
      {error && <p role="alert" style={{ marginTop: 20, color: "#b91c1c" }}>{error}</p>}
      {result && (
        <section style={{ marginTop: 24, padding: 18, border: "1px solid #ddd", borderRadius: 10, overflowWrap: "anywhere" }}>
          <h2>処理結果</h2>
          <p>{result.message || "APIから応答を受信しました。"}</p>
          {result.profileUrl && <p>プロフィール：{result.profileUrl}</p>}
          {result.posts && <p>取得投稿数：{result.posts.length}件</p>}
        </section>
      )}
    </main>
  );
}
