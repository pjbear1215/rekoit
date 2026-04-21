import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function validateIp(s: string): string {
  // Only allow IP address characters (digits and dots)
  if (!/^[\d.]+$/.test(s)) {
    throw new Error("Invalid IP address");
  }
  return s;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get("ip") ?? "";

  try {
    const safeIp = validateIp(ip);
    // Quick ping with 2 second timeout
    await execAsync(`ping -c 1 -W 2 ${safeIp}`);
    return NextResponse.json({ reachable: true });
  } catch {
    return NextResponse.json({ reachable: false });
  }
}
