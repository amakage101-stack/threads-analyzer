
import { NextResponse } from "next/server";

type Post = Record<string, unknown>;

function getString(post: Post, keys: string[]): string {
  for (const key of keys) {
    const value = post[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getAuthorUsername(post: Post): string {
  const direct = getString(post, [
    "authorUsername",
    "username",
    "userName",
    "screenName",
    "screen_name",
  ]);

  if (direct) {
    return direct.replace(/^@/, "").toLowerCase();
  }

  const author = post.author ?? post.user;

  if (author && typeof author === "object") {
    return getString(author as Post, [
      "userName",
      "username",
      "screenName",
      "screen_name",
    ])
      .replace(/^@/, "")
      .toLowerCase();
  }

  return "";
}

function isReply(post: Post): boolean {
  return (
    post.isReply === true ||
    Boolean(
      post.inReplyToStatusId ||
      post.inReplyToStatusIdStr ||
      post.inReplyToTweetId ||
      post.inReplyToId ||
      post.replyToTweetId ||
      post.in_reply_to_status_id ||
      post.in_reply_to_status_id_str
    )
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const profileUrl = body.profileUrl;
    const maxPosts = body.maxPosts ?? 500;

    if (typeof profileUrl !== "string") {
      return NextResponse.json(
        { error: "XプロフィールURLを入力してください。" },
        { status: 400 }
      );
    }

    if (
      typeof maxPosts !== "number" ||
      !Number.isInteger(maxPosts) ||
      maxPosts < 1 ||
      maxPosts > 1500
    ) {
      return NextResponse.json(
        { error: "取得する投稿数は1〜1500の整数で指定してください。" },
        { status: 400 }
      );
    }

    let url: URL;

    try {
      url = new URL(profileUrl.trim());
    } catch {
      return NextResponse.json(
        { error: "プロフィールURLの形式が正しくありません。" },
        { status: 400 }
      );
    }

    if (
      ![
        "x.com",
        "www.x.com",
        "twitter.com",
        "www.twitter.com",
      ].includes(url.hostname) ||
      !/^\/[A-Za-z0-9_]{1,15}\/?$/.test(url.pathname) ||
      !["https:", "http:"].includes(url.protocol)
    ) {
      return NextResponse.json(
        { error: "有効なXプロフィールURLを入力してください。" },
        { status: 400 }
      );
    }

    const token = process.env.APIFY_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "ApifyのAPIトークンが設定されていません。" },
        { status: 500 }
      );
    }

    const username = url.pathname
      .split("/")
      .filter(Boolean)[0];

    if (!username) {
      return NextResponse.json(
        { error: "ユーザー名を読み取れませんでした。" },
        { status: 400 }
      );
    }

    const endpoint =
      "https://api.apify.com/v2/acts/himanshu-data~x-twitter-scraper/run-sync-get-dataset-items";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        profiles: [username],
        includeProfileReplies: true,
        maxItems: maxPosts,
        maxTotalItems: maxPosts,
      }),
      signal: AbortSignal.timeout(300000),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Apify X request failed:", response.status);

      return NextResponse.json(
        {
          error:
            response.status === 401 || response.status === 403
              ? "Apifyの認証に失敗しました。APIトークンを確認してください。"
              : "Apifyで投稿を取得できませんでした。Actorの設定や利用状況を確認してください。",
        },
        { status: 502 }
      );
    }

    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: "Apifyから予期しないデータが返されました。" },
        { status: 502 }
      );
    }

    const allPosts = (data as Post[]).filter((post) => {
      const author = getAuthorUsername(post);

      return !author || author === username.toLowerCase();
    });

    const ownReplies = allPosts.filter(
      (post) =>
        getAuthorUsername(post) === username.toLowerCase() &&
        isReply(post)
    );

    const mainPosts = allPosts.filter(
      (post) => !isReply(post)
    );

    return NextResponse.json({
      message:
        `取得完了。親投稿：${mainPosts.length}件、本人の返信：${ownReplies.length}件`,
      profileUrl: `https://x.com/${username}`,
      username,
      posts: mainPosts,
      ownReplies,
      note:
        `取得上限は親投稿と本人の返信を合わせて最大${maxPosts}件です。実際の取得件数はActorの仕様、公開データ、利用プランによって変わります。返信の親投稿IDが取得できない場合、画面上で親投稿に紐づけられないことがあります。`,
    });
  } catch (error) {
    console.error("X Analysis API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          error.name === "TimeoutError"
            ? "投稿取得がタイムアウトしました。時間をおいて再試行してください。"
            : "投稿取得中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
