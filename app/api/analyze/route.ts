import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profileUrl = body.profileUrl;

    if (
      typeof profileUrl !== "string" ||
      !/^https?:\/\/(www\.)?threads\.net\/@[\w.]+\/?$/.test(profileUrl)
    ) {
      return NextResponse.json(
        { error: "有効なThreadsプロフィールURLを入力してください。" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "URLを受け取りました。投稿取得機能はまだ接続されていません。",
      profileUrl,
      posts: [],
    });
  } catch {
    return NextResponse.json(
      { error: "リクエストを読み取れませんでした。" },
      { status: 400 }
    );
  }
}
