import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface SshTestRequest {
  ip: string;
  password: string;
}

function buildSshCommand(ip: string, command: string): string {
  const escapedCommand = command.replace(/'/g, "'\\''");
  // Force ONLY password authentication and prevent any interactive prompts or key fallback
  const sshOpts = [
    "-o StrictHostKeyChecking=no",
    "-o UserKnownHostsFile=/dev/null",
    "-o ConnectTimeout=10",
    "-o PubkeyAuthentication=no",
    "-o PasswordAuthentication=yes",
    "-o PreferredAuthentications=password",
    "-o NumberOfPasswordPrompts=1",
  ].join(" ");
  return `sshpass -e ssh ${sshOpts} root@${ip} '${escapedCommand}'`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as SshTestRequest;
  const { ip, password } = body;

  if (!ip || !password) {
    return NextResponse.json(
      { error: "IP and password are required." },
      { status: 400 },
    );
  }

  // Validate IP format
  if (!/^[\d.]+$/.test(ip)) {
    return NextResponse.json(
      { error: "Invalid IP address format." },
      { status: 400 },
    );
  }

  try {
    const sshCmd = buildSshCommand(
      ip,
      "hostname; cat /etc/version 2>/dev/null || echo unknown; df -h /home | tail -1 | awk '{print $4}'; cat /proc/device-tree/model 2>/dev/null || echo unknown",
    );
    const extPath = `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`;
    // Pass SSHPASS securely through the env object
    const { stdout } = await execAsync(sshCmd, { 
      timeout: 15000, 
      env: { 
        ...process.env, 
        PATH: extPath,
        SSHPASS: password 
      } 
    });
    const lines = stdout.trim().split("\n");

    const model = (lines[3] ?? "unknown").replace(/\0/g, "").trim();

    // Auto-detect device model (based on codename)
    // Paper Pro = "Ferrari" (i.MX8MM)
    // Paper Pro Move = "Chiappa" (i.MX93)
    // Other devices like reMarkable 2 are not supported
    const modelLower = model.toLowerCase();
    let detectedDevice: "paper-pro-move" | "paper-pro" | null = null;
    if (modelLower.includes("ferrari")) {
      detectedDevice = "paper-pro";
    } else if (modelLower.includes("chiappa")) {
      detectedDevice = "paper-pro-move";
    }

    return NextResponse.json({
      connected: true,
      reachable: true,
      hostname: (lines[0] ?? "unknown").trim(),
      firmware: (lines[1] ?? "unknown").trim(),
      freeSpace: (lines[2] ?? "unknown").trim(),
      model,
      detectedDevice,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    let diagnosis = "Connection failed.";
    let status = 400;

    if (msg.includes("REMOTE HOST IDENTIFICATION HAS CHANGED")) {
      diagnosis = "SSH host key has changed. Please check your known_hosts file.";
    } else if (msg.includes("Permission denied")) {
      diagnosis = "Incorrect SSH password. Please check the accurate password in your device settings.";
      status = 401;
    } else if (msg.includes("Connection refused")) {
      diagnosis = "SSH service is not responding. Please check your USB connection.";
    } else if (msg.includes("timed out") || msg.includes("ETIMEDOUT")) {
      diagnosis = "Connection timed out. Please check your USB cable.";
    } else if (msg.includes("command not found")) {
      diagnosis = "sshpass is not installed. Please install it in the Prerequisites stage or directly via your host terminal.";
    }
    return NextResponse.json(
      { connected: false, reachable: false, error: diagnosis },
      { status },
    );
  }
}
