import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

function runScp(
  ip: string,
  password: string,
  localPath: string,
  remotePath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, SSHPASS: password, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` };
    const proc = spawn(
      "sshpass",
      [
        "-e",
        "scp",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        localPath,
        `root@${ip}:${remotePath}`,
      ],
      { env },
    );

    let stderr = "";
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const errorLines = stderr
          .split("\n")
          .filter((l) => !l.includes("Warning: Permanently added") && l.trim())
          .join("\n");
        reject(new Error(errorLines || `SCP failed with code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

function runSsh(ip: string, password: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, SSHPASS: password, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` };
    const proc = spawn(
      "sshpass",
      [
        "-e",
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=30",
        `root@${ip}`,
        command,
      ],
      { env },
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Exit code ${code}`));
    });
    proc.on("error", reject);
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get("font") as File | null;
  const ip = formData.get("ip") as string | null;
  const password = formData.get("password") as string | null;

  if (!file || !ip || !password) {
    return Response.json({ error: "Missing parameters" }, { status: 400 });
  }

  if (!/^[\d.]+$/.test(ip)) {
    return Response.json({ error: "Invalid IP" }, { status: 400 });
  }

  // Check font file extension
  const ext = file.name.toLowerCase().split(".").pop();
  if (!ext || !["otf", "ttf", "woff2"].includes(ext)) {
    return Response.json({ error: "Unsupported font format. Only OTF and TTF are allowed." }, { status: 400 });
  }

  // Check size (50MB limit)
  if (file.size > 50 * 1024 * 1024) {
    return Response.json({ error: "Font file is too large (max 50MB)." }, { status: 400 });
  }

  try {
    // Save to temporary file
    const tmpDir = path.join(process.cwd(), "resources", ".tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `font_upload.${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    // Upload to reMarkable
    await runScp(ip, password, tmpPath, "/home/root/rekoit/fonts/NotoSansCJKkr-Regular.otf");

    // Copy to system font path and restart xochitl
    await runSsh(ip, password, `
      mount -o remount,rw / 2>/dev/null || true
      mkdir -p /usr/share/fonts/ttf/noto
      cp /home/root/rekoit/fonts/NotoSansCJKkr-Regular.otf /usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf
      fc-cache -f 2>/dev/null || true
      systemctl restart xochitl 2>/dev/null || true
    `);

    // Save to local resources (for future installations)
    const localFontPath = path.join(process.cwd(), "resources", "fonts", "NotoSansCJKkr-Regular.otf");
    fs.mkdirSync(path.dirname(localFontPath), { recursive: true });
    fs.copyFileSync(tmpPath, localFontPath);

    // Remove temporary file
    fs.unlinkSync(tmpPath);

    return Response.json({ success: true, message: "Font replaced successfully. xochitl will now restart." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 500 });
  }
}
