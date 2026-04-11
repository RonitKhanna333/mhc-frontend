import { NextResponse } from "next/server";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(): Promise<NextResponse> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "offline",
          detail: `Backend returned ${response.status}`,
        },
        { status: 200 },
      );
    }

    const payload = await response.json();
    return NextResponse.json(
      {
        status: "online",
        detail: payload?.status ?? "ok",
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        status: "offline",
        detail: "Backend unreachable",
      },
      { status: 200 },
    );
  }
}
