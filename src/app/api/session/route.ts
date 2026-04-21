import { NextRequest, NextResponse } from "next/server";
import {
  createSshSession,
  getSshSessionCookieConfig,
} from "@/lib/server/sshSession";

interface SessionRequest {
  ip: string;
  password: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as SessionRequest;
  const { ip, password } = body;

  if (!ip || !password || !/^[\d.]+$/.test(ip)) {
    return NextResponse.json(
      { error: "Invalid SSH session request" },
      { status: 400 },
    );
  }

  const token = createSshSession(ip, password);
  const response = NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(getSshSessionCookieConfig(token, request.nextUrl.hostname));
  return response;
}
