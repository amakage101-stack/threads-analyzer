
import { NextResponse } from "next/server";

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
      !["threads.net", "www.threads.net", "threads.com", "www.threads.com"].includes(
        url.hostname
      ) ||
      !/^\/@[\w.]+\/?$/.test(url.pathname) ||
      !["https:", "http:"].includes(url.protocol)
    ) {
      return NextResponse.json(
        {
          error:
            "有効なThreadsプロフィールURLを入力してください。",
        },
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

    const response = await fetch(
      `https://api.apify.com/v2/acts/varnmill~threads-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          mode: "posts",
          usernames: [url.origin + url.pathname],
          maxPostsPerProfile: 100,
          includeProfile: true,
        }),
        signal: AbortSignal.timeout(240000),
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

    const posts = await response.json();

    if (!Array.isArray(posts)) {
      return NextResponse.json(
        { error: "Apifyから予期しないデータが返されました。" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: `${posts.length}件のデータを取得しました。`,
      profileUrl: url.origin + url.pathname,
      posts,
    });
  } catch (error) {
    console.error("Analysis API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "投稿取得がタイムアウトしました。投稿数を減らして再試行してください。"
            : "投稿取得中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
