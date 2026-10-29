
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
    const v = post[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function display(v: unknown): string {
  if (v === undefined || v === null || v === "") return "不明";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function numberValue(post: Post, keys: string[]): number {
  const raw = value(post, keys);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function postText(post: Post): string {
  return display(value(post, ["text", "caption", "content", "body"]));
}

function timestamp(post: Post): number {
  const raw = value(post, ["createdAt", "created_at", "timestamp"]);

  if (typeof raw === "number") {
    return raw < 1e12 ? raw * 1000 : raw;
  }

  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;

    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
  }

  return 0;
}

function dateLabel(post: Post): string {
  const time = timestamp(post);
  return time ? new Date(time).toLocaleString("ja-JP") : "日時不明";
}

function postLink(post: Post): string {
  const v = value(post, ["url", "postUrl", "permalink", "link"]);
  return typeof v === "string" ? v : "";
}

function likes(post: Post): number {
  return numberValue(post, ["likeCount", "likesCount", "likes"]);
}

function repliesCount(post: Post): number {
  return numberValue(post, ["replyCount", "repliesCount", "commentsCount"]);
}

function reposts(post: Post): number {
  return numberValue(post, ["repostCount", "repostsCount", "reshareCount"]);
}

function engagement(post: Post): number {
  return likes(post) + repliesCount(post) + reposts(post);
}

function PostCard({
  post,
  title,
}: {
  post: Post;
  title: string;
}) {
  const link = postLink(post);

  return (
    <article
      style={{
        marginTop: 12,
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 12,
        background: "#fff",
        color: "#172033",
        overflowWrap: "anywhere",
      }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
        {postText(post)}
      </p>
      <p style={{ color: "#666", fontSize: 13 }}>
        投稿日：{dateLabel(post)}
      </p>
      <p>
        いいね：{likes(post)}　返信：{repliesCount(post)}　リポスト：{reposts(post)}
      </p>
      <p>反応合計：{engagement(post)}</p>

      {link.startsWith("https://") && (
        <p>
          <a href={link} target="_blank" rel="noreferrer">
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
      setError("ThreadsのプロフィールURLを正しく入力してください。");
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

      if (!response.ok) {
        throw new Error(data.error || "投稿の取得に失敗しました。");
      }

      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  const roots = result?.posts ?? [];
  const replies = result?.ownReplies ?? [];

  const sortedRoots = [...roots].sort(
    (a, b) => timestamp(a) - timestamp(b)
  );
  const sortedReplies = [...replies].sort(
    (a, b) => timestamp(a) - timestamp(b)
  );

  const groups = sortedRoots.map((root) => ({
    root,
    replies: [] as Post[],
  }));

  const unmatched: Post[] = [];

  for (const reply of sortedReplies) {
    const replyTime = timestamp(reply);
    const position = Number(value(reply, ["threadPosition"]) ?? 0);

    const replyAuthor = String(
      value(reply, ["authorUsername", "username"]) ?? ""
    ).replace(/^@/, "").toLowerCase();

    const candidates = groups.filter((group) => {
      const rootTime = timestamp(group.root);

      const rootAuthor = String(
        value(group.root, ["authorUsername", "username"]) ?? ""
      ).replace(/^@/, "").toLowerCase();

      const lastPosition = group.replies.reduce(
        (max, item) =>
          Math.max(max, Number(value(item, ["threadPosition"]) ?? 0)),
        0
      );

      return (
        replyAuthor !== "" &&
        rootAuthor === replyAuthor &&
        rootTime > 0 &&
        replyTime >= rootTime &&
        replyTime - rootTime <= 30 * 60 * 1000 &&
        position >= 2 &&
        position > lastPosition
      );
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => timestamp(b.root) - timestamp(a.root));
      candidates[0].replies.push(reply);
    } else {
      unmatched.push(reply);
    }
  }

  const allPosts = [
    ...roots.map((post) => ({ post, kind: "通常投稿" })),
    ...replies.map((post) => ({ post, kind: "本人の返信" })),
  ];

  const rankedPosts = [...allPosts]
    .sort((a, b) => engagement(b.post) - engagement(a.post))
    .slice(0, 10);

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "24px auto",
        padding: 16,
        color: "#172033",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 32 }}>Threads Analyzer</h1>
      <p>Threadsの投稿と反応を分析できます。</p>

      <label htmlFor="profile-url">ThreadsプロフィールURL</label>
      <input
        id="profile-url"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.threads.com/@username"
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          padding: 14,
          margin: "10px 0",
          border: "1px solid #bbb",
          borderRadius: 8,
          fontSize: 16,
        }}
      />

      <button
        onClick={analyze}
        disabled={loading}
        style={{
          padding: "13px 18px",
          border: 0,
          borderRadius: 8,
          background: "#2563eb",
          color: "white",
          fontSize: 16,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "取得中..." : "アカウントを分析する"}
      </button>

      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}

      {result && (
        <section style={{ marginTop: 24 }}>
          <h2>取得結果</h2>
          <p>{result.message || "取得処理が完了しました。"}</p>
          <p>プロフィール：{result.profileUrl}</p>
          <p>通常投稿：{roots.length}件 ／ 本人の返信：{replies.length}件</p>

          <h2 style={{ marginTop: 32 }}>反応ランキング TOP 10</h2>
          <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            いいね・返信・リポストを単純合計して順位を付けています。
            閲覧数や投稿後の経過時間は考慮していません。
          </p>

          {rankedPosts.length === 0 && <p>ランキング対象の投稿がありません。</p>}

          {rankedPosts.map((item, index) => (
            <article
              key={String(item.post.id ?? item.post.code ?? index)}
              style={{
                marginTop: 12,
                padding: 16,
                border: "1px solid #ddd",
                borderRadius: 12,
                background: "#fff",
                overflowWrap: "anywhere",
              }}
            >
              <h3 style={{ marginTop: 0 }}>
                {index + 1}位　反応合計 {engagement(item.post)}
              </h3>
              <p style={{ color: "#666", fontSize: 13 }}>{item.kind}</p>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {postText(item.post)}
              </p>
              <p>いいね：{likes(item.post)}　返信：{repliesCount(item.post)}　リポスト：{reposts(item.post)}</p>
              {postLink(item.post).startsWith("https://") && (
                <a href={postLink(item.post)} target="_blank" rel="noreferrer">
                  Threadsで投稿を見る
                </a>
              )}
            </article>
          ))}

          <h2 style={{ marginTop: 32 }}>スレッド候補</h2>
          <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            投稿日時と threadPosition から推定しています。
            親投稿のIDがない場合、紐づけは確定ではありません。
          </p>

          {groups.map((group, index) => (
            <section key={String(group.root.id ?? index)} style={{ marginTop: 20 }}>
              <PostCard post={group.root} title={`投稿 ${index + 1} · 最初の投稿`} />
              {group.replies.map((reply, replyIndex) => (
                <div
                  key={String(reply.id ?? replyIndex)}
                  style={{
                    marginLeft: 12,
                    paddingLeft: 12,
                    borderLeft: "3px solid #93c5fd",
                  }}
                >
                  <PostCard post={reply} title={`続きの投稿 ${replyIndex + 1}`} />
                </div>
              ))}
            </section>
          ))}

          {unmatched.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <h2>紐づけできなかった返信</h2>
              {unmatched.map((reply, index) => (
                <PostCard
                  key={String(reply.id ?? index)}
                  post={reply}
                  title={`未分類の返信 ${index + 1}`}
                />
              ))}
            </section>
          )}

          {result.note && <p style={{ color: "#666", marginTop: 20 }}>{result.note}</p>}
        </section>
      )}
    </main>
  );
}
