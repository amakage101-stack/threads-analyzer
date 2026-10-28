"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Threads Analyzer</h1>
      <p>Threadsアカウントの投稿を分析するツール</p>
      <label htmlFor="profile">ThreadsプロフィールURL</label>
      <input
        id="profile"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.threads.net/@username"
        style={{ display: "block", width: "100%", padding: 12, margin: "12px 0", boxSizing: "border-box" }}
      />
      <button
        onClick={() => alert("分析機能は次の手順で接続します。")}
        style={{ padding: "12px 20px", cursor: "pointer" }}
      >
        アカウントを分析する
      </button>
    </main>
  );
}
