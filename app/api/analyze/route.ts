
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profileUrl = body.profileUrl;

    if (typeof profileUrl !== "string") {
      return NextResponse.json(
        { error: "ThreadsプロフィールURLを入力してください。" },
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
        "threads.net",
        "www.threads.net",
        "threads.com",
        "www.threads.com",
      ].includes(url.hostname) ||
      !/^\/@[\w.]+\/?$/.test(url.pathname) ||
      !["https:", "http:"].includes(url.protocol)
    ) {
      return NextResponse.json(
        { error: "有効なThreadsプロフィールURLを入力してください。" },
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

    const username = url.pathname.match(/^\/@([\w.]+)/)?.[1];

    if (!username) {
      return NextResponse.json(
        { error: "ユーザー名を読み取れませんでした。" },
        { status: 400 }
      );
    }

    const endpoint =
      "https://api.apify.com/v2/acts/varnmill~threads-scraper/run-sync-get-dataset-items";

    const response = await fetch(
      `${endpoint}?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          mode: "posts",
          usernames: [username],
          maxPostsPerProfile: 500,
          includeProfile: false,
        }),
        signal: AbortSignal.timeout(300000),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("Apify request failed:", response.status);

      return NextResponse.json(
        {
          error:
            response.status === 401 || response.status === 403
              ? "Apifyの認証に失敗しました。APIトークンを確認してください。"
              : "Apifyで投稿を取得できませんでした。時間をおいて再試行してください。",
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

    const posts = (data as Post[])
      .filter((post) => {
        const author = getString(post, [
          "authorUsername",
          "username",
        ]).replace(/^@/, "").toLowerCase();

        return !author || author === username.toLowerCase();
      })
      .slice(0, 500);

    const ownReplies = posts.filter((post) => {
      const author = getString(post, [
        "authorUsername",
        "username",
      ]).replace(/^@/, "").toLowerCase();

      return author === username.toLowerCase() && post.isReply === true;
    });

    const mainPosts = posts.filter(
      (post) => post.isReply !== true
    );

    return NextResponse.json({
      message: `最大500件を確認しました。親投稿：${mainPosts.length}件、本人の返信：${ownReplies.length}件`,
      profileUrl: url.origin + url.pathname,
      username,
      posts: mainPosts,
      ownReplies,
      note:
        "親投稿と返信を合わせて最大500件を取得します。取得元データに返信が含まれない場合、本人の返信をすべて検出できないことがあります。",
    });
  } catch (error) {
    console.error("Analysis API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "投稿取得がタイムアウトしました。投稿数が多い可能性があります。時間をおいて再試行してください。"
            : "投稿取得中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
