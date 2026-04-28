import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

function runSsh(
  ip: string,
  password: string,
  command: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SSHPASS: password,
      PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`,
    };
    const proc = spawn(
      "sshpass",
      [
        "-e",
        "ssh",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "ConnectTimeout=30",
        `root@${ip}`,
        command,
      ],
      { env },
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else {
        const errorLines = stderr
          .split("\n")
          .filter((l) => !l.includes("Warning: Permanently added") && l.trim())
          .join("\n");
        reject(new Error(errorLines || `Exit code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const { ip, password } = body;

  if (!ip || !password) {
    return NextResponse.json({ error: "ip and password are required" }, { status: 400 });
  }

  if (!/^[\d.]+$/.test(ip)) {
    return NextResponse.json({ error: "Invalid IP format" }, { status: 400 });
  }

  try {
    const output = await runSsh(ip, password, `
ACTIVE=$(systemctl is-active bluetooth.service 2>/dev/null || true)
POWERED=no
if [ "$ACTIVE" = "active" ]; then
  POWERED=$(bluetoothctl show 2>/dev/null | grep "Powered:" | awk '{print $2}')
  [ -n "$POWERED" ] || POWERED=no
  
  # List all known devices (extract Paired or Trusted devices)
  # [NEW] Remove prefixes and accurately extract columns
  bluetoothctl devices 2>/dev/null | sed 's/\\[NEW\\] //' | while read -r TYPE ADDR NAME; do
    [ "$TYPE" = "Device" ] || continue
    INFO=$(bluetoothctl info "$ADDR" 2>/dev/null || true)
    
    # Consider as a saved device if Paired or Trusted
    IS_PAIRED=$(echo "$INFO" | grep -q "Paired: yes" && echo "yes" || echo "no")
    IS_TRUSTED=$(echo "$INFO" | grep -q "Trusted: yes" && echo "yes" || echo "no")
    
    if [ "$IS_PAIRED" = "yes" ] || [ "$IS_TRUSTED" = "yes" ]; then
      IS_CONNECTED=$(echo "$INFO" | grep -q "Connected: yes" && echo "yes" || echo "no")
      # Extract name from info if it is empty
      [ -z "$NAME" ] && NAME=$(echo "$INFO" | grep "Name:" | cut -d' ' -f2- || echo "Unknown")
      echo "DEVICE|$ADDR|$IS_CONNECTED|$NAME"
    fi
  done
fi
echo "ACTIVE:$ACTIVE"
echo "POWERED:$POWERED"
`);

    const active = output.includes("ACTIVE:active");
    const powered = output.includes("POWERED:yes");
    
    const devices: Array<{ address: string; connected: boolean; name: string }> = [];
    output.split("\n").forEach(line => {
      if (line.startsWith("DEVICE|")) {
        const parts = line.split("|");
        if (parts.length >= 4) {
          devices.push({
            address: parts[1],
            connected: parts[2] === "yes",
            name: parts.slice(3).join("|").trim()
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      active,
      powered,
      devices
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
