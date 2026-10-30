
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const rawUsername = body.username;
    const maxItems = body.maxItems ?? 500;

    // アカウント名の確認
    if (typeof rawUsername !== "string" || !rawUsername.trim()) {
      return NextResponse.json(
        { error: "Xのユーザー名を入力してください。" },
        { status: 400 }
      );
    }

    const username = rawUsername.trim().replace(/^@/, "");

    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
      return NextResponse.json(
        { error: "有効なXのユーザー名を入力してください。" },
        { status: 400 }
      );
    }

    // 取得件数の確認
    if (
      typeof maxItems !== "number" ||
      !Number.isInteger(maxItems) ||
      maxItems < 1 ||
      maxItems > 5000
    ) {
      return NextResponse.json(
        { error: "取得件数は1〜5000件で指定してください。" },
        { status: 400 }
      );
    }

    // Apify APIトークン
    const token = process.env.APIFY_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "ApifyのAPIトークンが設定されていません。" },
        { status: 500 }
      );
    }

    // X用Actorを非同期で実行
    const endpoint =
      "https://api.apify.com/v2/acts/apidojo~tweet-scraper/runs";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        twitterHandles: [username],
        maxItems,
        sort: "Latest",
      }),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Apify X Actor error:", response.status);

      return NextResponse.json(
        {
          error:
            "Xの投稿取得を開始できませんでした。Apifyの設定を確認してください。",
        },
        { status: 502 }
      );
    }

    const run = data?.data;

    if (!run?.id || !run?.defaultDatasetId) {
      return NextResponse.json(
        { error: "Apifyから実行情報を取得できませんでした。" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: "Xの投稿取得を開始しました。",
      username,
      maxItems,
      runId: run.id,
      datasetId: run.defaultDatasetId,
      status: run.status,
    });
  } catch (error) {
    console.error("X Analysis API error:", error);

    return NextResponse.json(
      { error: "Xの投稿取得中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}
