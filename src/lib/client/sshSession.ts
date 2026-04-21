"use client";

export async function ensureSshSession(
  ip: string,
  password: string,
): Promise<void> {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip, password }),
  });

  if (!response.ok) {
    let message = "SSH 세션 생성 실패";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // Ignore JSON parsing failure and keep the default message.
    }
    throw new Error(message);
  }
}
