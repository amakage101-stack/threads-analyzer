
"use client";

import { useState } from "react";

type Post = Record<string, unknown>;

type AnalysisResult = {
  message?: string;
  error?: string;
  profileUrl?: string;
  posts?: Post[];
  ownReplies?: Post[];
  note?: string;
};

function value(post: Post, keys: string[]): unknown {
  for (const key of keys) {
    if (post[key] !== undefined && post[key] !== null && post[key] !== "") {
      return post[key];
    }
  }
  return undefined;
}

function text(post: Post): string {
  const v = value(post, ["text", "caption", "content", "body"]);
  return typeof v === "string" ? v : "本文なし";
}

function date(post: Post): number {
  const raw = value(post, ["createdAt", "created_at", "timestamp"]);
  if (typeof raw === "number") return raw < 1e12 ? raw * 1000 : raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  return 0;
}

function dateLabel(post: Post): string {
  const ms = date(post);
  return ms ? new Date(ms).toLocaleString("ja-JP") : "日時不明";
}

function postUrl(post: Post): string {
  const v = value(post, ["url", "postUrl", "permalink", "link"]);
  return typeof v === "string" ? v : "";
}

function Card({ post, title }: { post: Post; title: string }) {
  const url = postUrl(post);
  const likes = value(post, ["likeCount", "likesCount", "likes"]);

  return (
    <article
      style={{
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 12,
        background: "white",
        marginTop: 10,
        overflowWrap: "anywhere",
      }}
    >
      <strong>{title}</strong>
      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{text(post)}</p>
      <p style={{ color: "#666", fontSize: 13 }}>
        {dateLabel(post)} · いいね {likes ?? "不明"}
      </p>
      {url.startsWith("https://") && (
        <a href={url} target="_blank" rel="noreferrer">
          Threadsで投稿を見る
        </a>
      )}
      <details style={{ marginTop: 10 }}>
        <summary>元データ</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>
          {JSON.stringify(post, null, 2)}
        </pre>
      </details>
    </article>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    setError("");
    setResult(null);

    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      setError("ThreadsのプロフィールURLを入力してください。");
      return;
    }

    if (
      !["threads.net", "www.threads.net", "threads.com", "www.threads.com"].includes(parsed.hostname) ||
      !/^\/@[\w.]+\/?$/.test(parsed.pathname)
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
      if (!response.ok) throw new Error(data.error || "取得に失敗しました。");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  const roots = result?.posts ?? [];
  const replies = result?.ownReplies ?? [];

  // 投稿と返信を時系列で扱い、返信の紐づけ候補を探す
  const sortedRoots = [...roots].sort((a, b) => date(a) - date(b));
  const sortedReplies = [...replies].sort((a, b) => date(a) - date(b));

  const groups = sortedRoots.map((root) => ({
    root,
    replies: [] as Post[],
  }));

  const unmatched: Post[] = [];

  for (const reply of sortedReplies) {
    const replyTime = date(reply);
    const position = Number(value(reply, ["threadPosition"]) ?? 0);

    const candidates = groups.filter((group) => {
      const rootTime = date(group.root);
      const sameAuthor =
        String(value(group.root, ["authorUsername", "username"]) ?? "").replace(/^@/, "").toLowerCase() ===
        String(value(reply, ["authorUsername", "username"]) ?? "").replace(/^@/, "").toLowerCase();

      return (
        sameAuthor &&
        rootTime > 0 &&
        replyTime >= rootTime &&
        replyTime - rootTime <= 30 * 60 * 1000 &&
        !group.replies.some((item) => Number(value(item, ["threadPosition"]) ?? 0) >= position)
      );
    });

    // threadPosition が2以上なら、近い時刻の先行投稿を候補にする
    if (position >= 2 && candidates.length > 0) {
      candidates.sort((a, b) => date(b.root) - date(a.root));
      candidates[0].replies.push(reply);
    } else {
      unmatched.push(reply);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "24px auto", padding: 16, color: "#172033", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 32 }}>Threads Analyzer</h1>
      <p>Threadsの投稿と連投候補を確認できます。</p>

      <label htmlFor="profile-url">ThreadsプロフィールURL</label>
      <input
        id="profile-url"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.threads.com/@username"
        style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 14, margin: "10px 0", border: "1px solid #bbb", borderRadius: 8, fontSize: 16 }}
      />

      <button
        onClick={analyze}
        disabled={loading}
        style={{ padding: "13px 18px", border: 0, borderRadius: 8, background: "#2563eb", color: "white", fontSize: 16 }}
      >
        {loading ? "取得中..." : "アカウントを分析する"}
      </button>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {result && (
        <section style={{ marginTop: 24 }}>
          <h2>取得結果</h2>
          <p>{result.message}</p>
          <p>プロフィール：{result.profileUrl}</p>
          <p>通常投稿：{roots.length}件 ／ 本人の返信：{replies.length}件</p>

          <h2 style={{ marginTop: 28 }}>スレッド候補</h2>
          <p style={{ color: "#666", fontSize: 14 }}>
            投稿順・日時・threadPositionから推定しています。正確な親投稿を示すIDがない場合、紐づけは確定ではありません。
          </p>

          {groups.map((group, index) => (
            <section key={String(group.root.id ?? index)} style={{ marginTop: 20 }}>
              <Card post={group.root} title={`スレッド候補 ${index + 1} · 最初の投稿`} />
              {group.replies.map((reply, replyIndex) => (
                <div key={String(reply.id ?? replyIndex)} style={{ marginLeft: 18, paddingLeft: 12, borderLeft: "3px solid #93c5fd" }}>
                  <Card post={reply} title={`続きの投稿 ${replyIndex + 1}`} />
                </div>
              ))}
            </section>
          ))}

          {unmatched.length > 0 && (
            <>
              <h2 style={{ marginTop: 32 }}>紐づけできなかった返信</h2>
              <p style={{ color: "#666", fontSize: 14 }}>
                誤って別の投稿につなげないよう、候補が見つからない返信はここに分けています。
              </p>
              {unmatched.map((reply, index) => (
                <Card key={String(reply.id ?? index)} post={reply} title={`未分類の返信 ${index + 1}`} />
              ))}
            </>
          )}
          {result.note && <p style={{ color: "#666", marginTop: 20 }}>{result.note}</p>}
        </section>
      )}
    </main>
  );
}
