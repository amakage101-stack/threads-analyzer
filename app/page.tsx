
"use client";

import { useState } from "react";

type Platform = "threads" | "x";
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
  const v = value(post, [
    "text",
    "fullText",
    "full_text",
    "caption",
    "content",
    "body",
  ]);

  if (v === undefined || v === null || v === "") return "本文なし";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function timestamp(post: Post): number {
  const raw = value(post, [
    "createdAt",
    "created_at",
    "timestamp",
    "date",
  ]);

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
  const v = value(post, [
    "url",
    "postUrl",
    "permalink",
    "link",
    "tweetUrl",
  ]);
  return typeof v === "string" ? v : "";
}

function likes(post: Post): number {
  return numberValue(post, [
    "likeCount",
    "likesCount",
    "likes",
    "favoriteCount",
  ]);
}

function repliesCount(post: Post): number {
  return numberValue(post, [
    "replyCount",
    "repliesCount",
    "commentsCount",
  ]);
}

function reposts(post: Post): number {
  return numberValue(post, [
    "repostCount",
    "repostsCount",
    "reshareCount",
    "retweetCount",
    "retweets",
  ]);
}

function engagement(post: Post): number {
  return likes(post) + repliesCount(post) + reposts(post);
}

function postKey(post: Post, fallback: number): string {
  return String(
    value(post, [
      "id",
      "postId",
      "code",
      "tweetId",
      "rest_id",
    ]) ?? fallback
  );
}

function authorName(post: Post): string {
  const direct = value(post, [
    "authorUsername",
    "username",
    "screenName",
    "screen_name",
    "userName",
    "handle",
  ]);

  const author = post.author;
  const user = post.user;

  const nested =
    typeof author === "object" && author !== null
      ? value(author as Post, [
          "username",
          "userName",
          "screenName",
          "screen_name",
          "handle",
        ])
      : undefined;

  const nestedUser =
    typeof user === "object" && user !== null
      ? value(user as Post, [
          "username",
          "userName",
          "screenName",
          "screen_name",
          "handle",
        ])
      : undefined;

  return String(direct ?? nested ?? nestedUser ?? "")
    .replace(/^@/, "")
    .toLowerCase();
}

// XではconversationIdを使って会話の起点となる親投稿を探す。
function parentReference(post: Post): string {
  const directReference = value(post, [
    "parentPostId",
    "parentId",
    "replyToPostId",
    "inReplyToId",
    "inReplyToStatusId",
    "inReplyToStatusIdStr",
    "inReplyToTweetId",
    "replyToTweetId",
    "in_reply_to_status_id_str",
    "in_reply_to_status_id",
    "rootPostId",
  ]);

  if (directReference !== undefined) {
    return String(directReference);
  }

  return String(value(post, ["conversationId"]) ?? "");
}

function isReplyPost(post: Post): boolean {
  return (
    post.isReply === true ||
    Boolean(
      value(post, [
        "inReplyToStatusId",
        "inReplyToStatusIdStr",
        "inReplyToTweetId",
        "inReplyToId",
        "replyToTweetId",
        "in_reply_to_status_id",
        "in_reply_to_status_id_str",
      ])
    )
  );
}

function PostContent({
  post,
  platform,
}: {
  post: Post;
  platform: Platform;
}) {
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
            {platform === "x" ? "Xで投稿を見る" : "Threadsで投稿を見る"}
          </a>
        </p>
      )}
    </>
  );
}

export default function Home() {
  const [platform, setPlatform] = useState<Platform>("threads");
  const [url, setUrl] = useState("");
  const [maxPosts, setMaxPosts] = useState(500);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const serviceName = platform === "x" ? "X" : "Threads";

  function changePlatform(nextPlatform: Platform) {
    setPlatform(nextPlatform);
    setUrl("");
    setResult(null);
    setError("");
  }

  async function analyze() {
    setError("");
    setResult(null);

    let parsed: URL;

    try {
      parsed = new URL(url.trim());
    } catch {
      setError(`${serviceName}のプロフィールURLを正しく入力してください。`);
      return;
    }

    if (platform === "threads") {
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
    } else {
      if (
        ![
          "x.com",
          "www.x.com",
          "twitter.com",
          "www.twitter.com",
        ].includes(parsed.hostname) ||
        !/^\/[A-Za-z0-9_]{1,15}\/?$/.test(parsed.pathname)
      ) {
        setError("有効なXプロフィールURLを入力してください。");
        return;
      }
    }

    if (
      !Number.isInteger(maxPosts) ||
      maxPosts < 1 ||
      maxPosts > 1500
    ) {
      setError("取得する投稿数は1〜1500の整数で入力してください。");
      return;
    }

    setLoading(true);

    try {
      const endpoint =
        platform === "x" ? "/api/analyze-x" : "/api/analyze";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileUrl: url.trim(),
          maxPosts,
        }),
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

    // X：返信先IDまたはconversationIdで親投稿を探す。
    if (reference) {
      matched = groups.findIndex((group, index) => {
        const rootId = String(
          value(group.root, [
            "id",
            "postId",
            "rootPostId",
            "tweetId",
            "rest_id",
          ]) ?? ""
        );

        const rootCode = String(value(group.root, ["code"]) ?? "");
        const rootConversationId = String(
          value(group.root, ["conversationId"]) ?? ""
        );

        return (
          reference === rootId ||
          reference === rootCode ||
          reference === rootConversationId ||
          reference === postKey(group.root, index)
        );
      });
    }

    // Threads：従来の時間・投稿順による推定を維持。
    if (matched < 0 && platform === "threads") {
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

  function downloadTxt() {
    if (!result) return;

    const lines: string[] = [];

    lines.push(`${serviceName} Analyzer - 分析結果`);
    lines.push(`プロフィール: ${result.profileUrl ?? url}`);
    lines.push(`ユーザー名: ${result.username ?? "不明"}`);
    lines.push(`出力日時: ${new Date().toLocaleString("ja-JP")}`);
    lines.push("");
    lines.push("========================================");
    lines.push("【取得結果の概要】");
    lines.push(result.message ?? "");
    lines.push(`親投稿数: ${roots.length}`);
    lines.push(`本人の返信数: ${replies.length}`);
    lines.push(`未紐づけ返信数: ${unmatched.length}`);
    lines.push("");
    lines.push("【親投稿全体の集計】");
    lines.push(`いいね合計: ${totalLikes}`);
    lines.push(`返信数合計: ${totalReplies}`);
    lines.push(`リポスト合計: ${totalReposts}`);
    lines.push(`反応合計: ${totalLikes + totalReplies + totalReposts}`);
    lines.push("※集計・ランキングの対象は親投稿のみです。");
    lines.push("※反応合計はいいね・返信・リポストの単純合計です。");
    lines.push("========================================");

    groups.forEach((group, index) => {
      const post = group.root;
      const rank = rankedRoots.findIndex((item) => item === post) + 1;

      lines.push("");
      lines.push(`【親投稿 ${index + 1}】`);
      lines.push(`投稿日: ${dateLabel(post)}`);
      lines.push(`本文:\n${postText(post)}`);
      lines.push(`URL: ${postLink(post) || "不明"}`);
      lines.push("");
      lines.push("【この投稿の分析】");
      lines.push(`いいね: ${likes(post)}`);
      lines.push(`返信: ${repliesCount(post)}`);
      lines.push(`リポスト: ${reposts(post)}`);
      lines.push(`反応合計: ${engagement(post)}`);
      lines.push(`反応ランキング: ${rank}位 / ${roots.length}件`);
      lines.push("");
      lines.push(`【この親投稿に紐づく本人の返信: ${group.replies.length}件】`);

      const sortedGroupReplies = [...group.replies].sort(
        (a, b) => timestamp(a) - timestamp(b)
      );

      sortedGroupReplies.forEach((reply, replyIndex) => {
        lines.push("");
        lines.push(`--- 本人の返信 ${replyIndex + 1} ---`);
        lines.push(`投稿日: ${dateLabel(reply)}`);
        lines.push(`本文:\n${postText(reply)}`);
        lines.push(`URL: ${postLink(reply) || "不明"}`);
      });

      lines.push("");
      lines.push("========================================");
    });

    if (unmatched.length > 0) {
      lines.push("");
      lines.push(`【親投稿に紐づけできなかった本人の返信: ${unmatched.length}件】`);

      unmatched.forEach((reply, index) => {
        lines.push("");
        lines.push(`--- 未紐づけ返信 ${index + 1} ---`);
        lines.push(`投稿日: ${dateLabel(reply)}`);
        lines.push(`本文:\n${postText(reply)}`);
        lines.push(`URL: ${postLink(reply) || "不明"}`);
      });
    }

    if (result.note) {
      lines.push("");
      lines.push("【注意事項】");
      lines.push(result.note);
    }

    const blob = new Blob(
      ["\uFEFF" + lines.join("\n")],
      { type: "text/plain;charset=utf-8" }
    );

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const username =
      result.username ??
      result.profileUrl?.match(/@?([\w.]+)$/)?.[1] ??
      platform;

    link.href = downloadUrl;
    link.download = `${platform}-analysis-${username}-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

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
      <h1 style={{ fontSize: 32 }}>{serviceName} Analyzer</h1>

      <p>分析するSNSを選択してください。</p>

      <div
        style={{
          display: "flex",
          gap: 10,
          margin: "16px 0 24px",
        }}
      >
        <button
          type="button"
          onClick={() => changePlatform("threads")}
          style={{
            flex: 1,
            padding: 13,
            border: "1px solid #bbb",
            borderRadius: 8,
            background: platform === "threads" ? "#2563eb" : "#fff",
            color: platform === "threads" ? "#fff" : "#172033",
            fontSize: 16,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Threads
        </button>

        <button
          type="button"
          onClick={() => changePlatform("x")}
          style={{
            flex: 1,
            padding: 13,
            border: "1px solid #bbb",
            borderRadius: 8,
            background: platform === "x" ? "#111827" : "#fff",
            color: platform === "x" ? "#fff" : "#172033",
            fontSize: 16,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          X
        </button>
      </div>

      <p>
        親投稿ごとに本文・分析・本人の返信をまとめて表示します。
      </p>

      <label htmlFor="profile-url">
        {serviceName}プロフィールURL
      </label>

      <input
        id="profile-url"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={
          platform === "x"
            ? "https://x.com/username"
            : "https://www.threads.com/@username"
        }
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

      <label htmlFor="max-posts">取得する投稿数</label>

      <input
        id="max-posts"
        type="number"
        min={1}
        max={1500}
        step={1}
        value={maxPosts}
        onChange={(e) => {
          const inputValue = e.target.value;
          setMaxPosts(inputValue === "" ? 0 : Number(inputValue));
        }}
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

      <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
        1〜1500件。デフォルトは500件です。実際の取得件数は公開データや取得サービスの仕様により変わる場合があります。
      </p>

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

          <button
            onClick={downloadTxt}
            style={{
              marginTop: 12,
              padding: "14px 18px",
              border: 0,
              borderRadius: 8,
              background: "#15803d",
              color: "white",
              fontSize: 16,
              fontWeight: "bold",
              cursor: "pointer",
              width: "100%",
            }}
          >
            TXTですべての結果をダウンロード
          </button>

          <p style={{ color: "#666", fontSize: 13 }}>
            親投稿・分析・返信を1つのTXTファイルに保存します。
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

                <PostContent post={root} platform={platform} />

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
                  [...group.replies]
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
                        <PostContent post={reply} platform={platform} />
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
                      親投稿を{serviceName}で開く
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
                  <PostContent post={reply} platform={platform} />
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
