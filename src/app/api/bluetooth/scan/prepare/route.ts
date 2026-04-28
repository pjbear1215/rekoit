import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { getSshSessionFromRequest } from "@/lib/server/sshSession";

export async function POST(request: NextRequest): Promise<Response> {
  const session = getSshSessionFromRequest(request);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const env = { ...process.env, SSHPASS: session.password, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` };
  
  // Perform only hardware preparation and terminate the session (cleanup script not executed)
  const prepCmd = `
    # 1. Stop reconnection service and create sentinel
    systemctl stop rekoit-bt-wake-reconnect.service 2>/dev/null || true
    killall -9 bluetoothctl 2>/dev/null || true
    touch /tmp/rekoit-setup-active
    touch /tmp/rekoit-pair-SCAN.sh
    
    # 2. Hardware reset
    modprobe btnxpuart 2>/dev/null || true
    systemctl restart bluetooth.service 2>/dev/null || true
    sleep 3.5
    
    # 3. Enable adapter
    bluetoothctl power on 2>/dev/null || true
    bluetoothctl pairable on 2>/dev/null || true
    
    # Activation check loop
    COUNT=0
    while [ $COUNT -lt 10 ]; do
      if bluetoothctl show | grep -q "Powered: yes"; then break; fi
      sleep 1
      COUNT=$((COUNT+1))
    done
    
    # 4. Set filter (LE only)
    bluetoothctl discovery-filter --clear 2>/dev/null || true
    bluetoothctl discovery-filter --transport le 2>/dev/null || true
  `;

  return new Promise((resolve) => {
    const proc = spawn("sshpass", ["-e", "ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", `root@${session.ip}`, prepCmd], { env });
    proc.on("close", (code) => {
      resolve(new Response(JSON.stringify({ success: code === 0 }), { status: 200 }));
    });
  });
}
