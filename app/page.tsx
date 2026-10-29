
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
  const v = value(post, ["text", "caption", "content", "body"]);
  if (v === undefined || v === null || v === "") return "本文なし";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function timestamp(post: Post): number {
  const raw = value(post, ["createdAt", "created_at", "timestamp"]);

  if (typeof raw === "number") {
    return raw < 1e12 ? raw * 1000 : raw;
  }

  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;

    const n = Number(raw);
    if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
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

function postKey(post: Post, fallback: number): string {
  return String(value(post, ["id", "postId", "code"]) ?? fallback);
}

function authorName(post: Post): string {
  return String(value(post, ["authorUsername", "username"]) ?? "")
    .replace(/^@/, "")
    .toLowerCase();
}

function parentReference(post: Post): string {
  return String(
    value(post, [
      "parentPostId",
      "parentId",
      "replyToPostId",
      "inReplyToId",
      "rootPostId",
    ]) ?? ""
  );
}

function PostContent({ post }: { post: Post }) {
  const link = postLink(post);

  return (
    <>
      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
        {postText(post)}
      </p>
      <p style={{ color: "#666", fontSize: 13 }}>
        投稿日：{dateLabel(post)}
      </p>
      {link.startsWith("https://") && (
        <p>
          <a href={link} target="_blank" rel="noreferrer">
            Threadsで投稿を見る
          </a>
        </p>
      )}
    </>
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
      ![
        "threads.net",
        "www.threads.net",
        "threads.com",
        "www.threads.com",
      ].includes(parsed.hostname) ||
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
      setError(
        e instanceof Error ? e.message : "通信エラーが発生しました。"
      );
    } finally {
      setLoading(false);
    }
  }

  // 分析対象は親投稿のみ。返信の反応数は分析に加算しない。
  const roots = [...(result?.posts ?? [])].sort(
    (a, b) => timestamp(a) - timestamp(b)
  );

  const replies = [...(result?.ownReplies ?? [])].sort(
    (a, b) => timestamp(a) - timestamp(b)
  );

  const groups = roots.map((root, index) => ({
    root,
    anchor: `parent-${postKey(root, index)}`,
    replies: [] as Post[],
  }));

  const unmatched: Post[] = [];

  for (const reply of replies) {
    const reference = parentReference(reply);
    let matched = -1;

    // 親投稿IDが取得できていれば、IDで紐づける。
    if (reference) {
      matched = groups.findIndex((group, index) => {
        const rootId = String(
          value(group.root, ["id", "postId", "rootPostId"]) ?? ""
        );
        const rootCode = String(value(group.root, ["code"]) ?? "");

        return (
          reference === rootId ||
          reference === rootCode ||
          reference === postKey(group.root, index)
        );
      });
    }

    // 親投稿IDがない場合は、同じ本人・時刻・threadPositionから推定する。
    if (matched < 0) {
      const replyTime = timestamp(reply);
      const position = numberValue(reply, ["threadPosition"]);
      const author = authorName(reply);

      const candidates = groups
        .map((group, index) => ({ group, index }))
        .filter(({ group }) => {
          const rootTime = timestamp(group.root);
          const rootAuthor = authorName(group.root);
          const rootPosition =
            numberValue(group.root, ["threadPosition"]) || 1;

          return (
            author !== "" &&
            rootAuthor === author &&
            rootTime > 0 &&
            replyTime >= rootTime &&
            replyTime - rootTime <= 30 * 60 * 1000 &&
            position > rootPosition
          );
        })
        .sort(
          (a, b) => timestamp(b.group.root) - timestamp(a.group.root)
        );

      if (candidates.length > 0) {
        matched = candidates[0].index;
      }
    }

    if (matched >= 0) {
      groups[matched].replies.push(reply);
    } else {
      unmatched.push(reply);
    }
  }

  // 全体集計も親投稿のみ。
  const totalLikes = roots.reduce((sum, post) => sum + likes(post), 0);
  const totalReplies = roots.reduce(
    (sum, post) => sum + repliesCount(post),
    0
  );
  const totalReposts = roots.reduce(
    (sum, post) => sum + reposts(post),
    0
  );

  const rankedRoots = [...roots].sort(
    (a, b) => engagement(b) - engagement(a)
  );

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

      <p>
        親投稿ごとに本文・分析・本人の返信をまとめて表示します。
      </p>

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

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {result && (
        <section style={{ marginTop: 24 }}>
          <h2>分析結果</h2>

          <p>{result.message || "取得処理が完了しました。"}</p>
          <p>プロフィール：{result.profileUrl}</p>
          <p>
            親投稿：{roots.length}件 ／ 本人の返信：{replies.length}件
          </p>

          <section
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 12,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
            }}
          >
            <h3 style={{ marginTop: 0 }}>親投稿全体の反応</h3>
            <p>いいね合計：{totalLikes}</p>
            <p>返信数合計：{totalReplies}</p>
            <p>リポスト合計：{totalReposts}</p>
            <p>
              <strong>
                反応合計：{totalLikes + totalReplies + totalReposts}
              </strong>
            </p>
            <p style={{ fontSize: 13, color: "#555", marginBottom: 0 }}>
              ※親投稿に表示された反応数のみを集計。本人の返信投稿の反応は加算していません。
            </p>
          </section>

          <h2 style={{ marginTop: 30 }}>親投稿と投稿ごとの分析</h2>

          <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            ランキングも親投稿のみが対象です。反応合計は、いいね・返信・リポストの単純合計です。
          </p>

          {groups.length === 0 && <p>親投稿が取得できませんでした。</p>}

          {groups.map((group, index) => {
            const root = group.root;
            const link = postLink(root);
            const rank =
              rankedRoots.findIndex((post) => post === root) + 1;

            return (
              <section
                key={group.anchor}
                id={group.anchor}
                style={{
                  marginTop: 18,
                  padding: 16,
                  border: "1px solid #d1d5db",
                  borderRadius: 14,
                  background: "#fff",
                  overflowWrap: "anywhere",
                }}
              >
                <h3 style={{ marginTop: 0 }}>親投稿 {index + 1}</h3>

                <PostContent post={root} />

                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    borderRadius: 10,
                    background: "#f3f4f6",
                  }}
                >
                  <h4 style={{ margin: "0 0 10px" }}>この投稿の分析</h4>
                  <p>いいね：{likes(root)}</p>
                  <p>返信：{repliesCount(root)}</p>
                  <p>リポスト：{reposts(root)}</p>
                  <p>
                    <strong>反応合計：{engagement(root)}</strong>
                  </p>
                  <p>
                    反応ランキング：{rank}位 / {roots.length}件
                  </p>
                </div>

                <h4 style={{ marginTop: 18 }}>
                  この親投稿に紐づく本人の返信：{group.replies.length}件
                </h4>

                {group.replies.length === 0 ? (
                  <p style={{ color: "#666", fontSize: 14 }}>
                    紐づけできた返信はありません。
                  </p>
                ) : (
                  group.replies
                    .sort((a, b) => timestamp(a) - timestamp(b))
                    .map((reply, replyIndex) => (
                      <article
                        key={postKey(reply, replyIndex)}
                        style={{
                          marginTop: 10,
                          marginLeft: 12,
                          padding: 14,
                          borderLeft: "4px solid #93c5fd",
                          borderRadius: 8,
                          background: "#f8fafc",
                          overflowWrap: "anywhere",
                        }}
                      >
                        <strong>本人の返信 {replyIndex + 1}</strong>
                        <PostContent post={reply} />
                        <a
                          href={`#${group.anchor}`}
                          style={{ fontSize: 14 }}
                        >
                          ↑ 親投稿に戻る
                        </a>
                      </article>
                    ))
                )}

                {link.startsWith("https://") && (
                  <p style={{ marginBottom: 0 }}>
                    <a href={link} target="_blank" rel="noreferrer">
                      親投稿をThreadsで開く
                    </a>
                  </p>
                )}
              </section>
            );
          })}

          {unmatched.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <h2>親投稿に紐づけできなかった本人の返信</h2>

              <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6 }}>
                親投稿を特定できる情報がない場合は、誤った投稿に紐づけず、ここに分けて表示します。
              </p>

              {unmatched.map((reply, index) => (
                <article
                  key={postKey(reply, index)}
                  style={{
                    marginTop: 10,
                    padding: 14,
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>未紐づけの返信 {index + 1}</strong>
                  <PostContent post={reply} />
                </article>
              ))}
            </section>
          )}

          {result.note && (
            <p style={{ color: "#666", marginTop: 20 }}>{result.note}</p>
          )}
        </section>
      )}
    </main>
  );
}
