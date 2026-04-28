import { NextRequest } from "next/server";
import { spawn, exec } from "child_process";
import path from "path";
import fs from "fs";
import { getSshSessionFromRequest } from "@/lib/server/sshSession";
import { renderInstallState } from "@/lib/remarkable/installState.js";
import { shouldRebuildArtifact } from "@/lib/remarkable/buildArtifacts.js";

interface FileMapping {
  local: string;
  remote: string;
}

interface InstallState {
  installHangul: boolean;
  installBt: boolean;
  swapLeftCtrlCapsLock: boolean;
  btDeviceAddress: string;
  btDeviceIrk?: string;
  locales: string[];
}

type DetectedInstallState = InstallState;

const FILES_COMMON: FileMapping[] = [
  { local: "install.sh", remote: "install.sh" },
  { local: "restore.sh", remote: "restore.sh" },
  { local: "post-update.sh", remote: "post-update.sh" },
  { local: "rekoit-restore.service", remote: "rekoit-restore.service" },
];

const FILES_HANGUL: FileMapping[] = [
  { local: "install-hangul.sh", remote: "install-hangul.sh" },
  { local: "restore-hangul.sh", remote: "restore-hangul.sh" },
  { local: "post-update-hangul.sh", remote: "post-update-hangul.sh" },
  { local: "hangul-daemon/hangul-daemon", remote: "hangul-daemon" },
  { local: "hangul-daemon.service", remote: "hangul-daemon.service" },
  {
    local: "fonts/NotoSansCJKkr-Regular.otf",
    remote: "fonts/NotoSansCJKkr-Regular.otf",
  },
];

const FILES_BT: FileMapping[] = [
  { local: "install-bt.sh", remote: "install-bt.sh" },
  { local: "restore-bt.sh", remote: "restore-bt.sh" },
  { local: "post-update-bt.sh", remote: "post-update-bt.sh" },
  { local: "bt-wake-reconnect.sh", remote: "bt-wake-reconnect.sh" },
  { local: "rekoit-bt-wake-reconnect.service", remote: "rekoit-bt-wake-reconnect.service" },
  { local: "rekoit-bt-helper/rekoit-bt-helper", remote: "rekoit-bt-helper" },
];

// Font download URL (Google Noto CJK - SIL OFL License)
const FONT_URLS = [
  "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf",
  "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf",
];

function runSshOnce(ip: string, password: string, command: string): Promise<string> {
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
        "-o", "PubkeyAuthentication=no",
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
          .filter((l) => !l.includes("Warning: Permanently added") && !l.includes("Connection to") && l.trim())
          .join("\n");
        reject(new Error(errorLines || `Exit code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

function isTransientSshError(message: string): boolean {
  return (
    message.includes("Exit code 255") ||
    message.includes("Connection") ||
    message.includes("kex_exchange") ||
    message.includes("broken pipe") ||
    message.includes("reset by peer")
  );
}

async function runSsh(ip: string, password: string, command: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      return await runSshOnce(ip, password, command);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries - 1 && (msg.includes("Permission denied") || isTransientSshError(msg))) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("SSH connection failed after retries");
}

function runScpOnce(
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
        "-o", "PubkeyAuthentication=no",
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

function shouldShowInstallLogLine(line: string, state: InstallState): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("STATE:")) return false;
  if (trimmed.startsWith("==========================================")) return false;
  if (trimmed.startsWith("REKOIT Installer")) return false;
  if (trimmed.startsWith("Mode:")) return false;
  if (trimmed.startsWith("Restarting services")) return false;
  if (trimmed.startsWith("Components:")) return false;
  if (trimmed.startsWith("All settings persist across reboots")) return false;
  if (trimmed.startsWith("After firmware update, run:")) return false;
  if (trimmed === "bash /home/root/rekoit/install.sh") return false;
  if (trimmed.includes("uploaded")) return false;
  if (trimmed.includes("SKIP:")) return false;
  if (!state.installHangul) {
    if (trimmed.includes("hangul-daemon")) return false;
    if (trimmed.includes("NotoSansCJKkr")) return false;
    if (trimmed.includes("libepaper")) return false;
    if (trimmed.includes("login restore")) return false;
    if (trimmed.includes("original file backup")) return false;
  }
  return true;
}

async function runScp(
  ip: string,
  password: string,
  localPath: string,
  remotePath: string,
  retries = 3,
): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      return await runScpOnce(ip, password, localPath, remotePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries - 1 && msg.includes("Permission denied")) {
        continue;
      }
      throw err;
    }
  }
}

async function detectInstalledState(
  ip: string,
  password: string,
): Promise<DetectedInstallState> {
  const output = await runSsh(
    ip,
    password,
    `
      if [ -f /home/root/rekoit/install-state.conf ]; then
        . /home/root/rekoit/install-state.conf
        echo "STATE_INSTALL_HANGUL=\${INSTALL_HANGUL:-}"
        if [ "\${INSTALL_BT:-0}" = "1" ]; then
        echo "STATE_INSTALL_BT=1"
      else
        echo "STATE_INSTALL_BT=0"
      fi
      echo "SWAP_LEFT_CTRL_CAPSLOCK=\${SWAP_LEFT_CTRL_CAPSLOCK:-0}"
      echo "BT_DEVICE_ADDRESS=\${BT_DEVICE_ADDRESS:-}"
      echo "LOCALES=\${KEYBOARD_LOCALES:-}"
      else
        echo "STATE_INSTALL_HANGUL="
        echo "STATE_INSTALL_BT="
        echo "SWAP_LEFT_CTRL_CAPSLOCK=0"
        echo "BT_DEVICE_ADDRESS="
        echo "LOCALES="
      fi
      if [ -f /usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf ]; then
        echo "HANGUL_FONT=yes"
      else
        echo "HANGUL_FONT=no"
      fi
      HANGUL_SERVICE_LINK=$(readlink /etc/systemd/system/hangul-daemon.service 2>/dev/null || true)
      if [ -e /etc/systemd/system/hangul-daemon.service ] && [ "$HANGUL_SERVICE_LINK" != "/dev/null" ]; then
        echo "HANGUL_RUNTIME=yes"
      else
        echo "HANGUL_RUNTIME=no"
      fi
      if [ -f /etc/modules-load.d/btnxpuart.conf ]; then
        echo "BT_RUNTIME=yes"
      else
        echo "BT_RUNTIME=no"
      fi
    `,
  );

  const localesLine = output
    .split("\n")
    .find((line) => line.startsWith("LOCALES="));
  const locales = localesLine
    ? localesLine.replace("LOCALES=", "").split(",").filter(Boolean)
    : [];
  const swapLeftCtrlCapsLockLine = output
    .split("\n")
    .find((line) => line.startsWith("SWAP_LEFT_CTRL_CAPSLOCK="));
  const swapLeftCtrlCapsLock = swapLeftCtrlCapsLockLine?.replace("SWAP_LEFT_CTRL_CAPSLOCK=", "") === "1";
  const btDeviceAddressLine = output
    .split("\n")
    .find((line) => line.startsWith("BT_DEVICE_ADDRESS="));
  const btDeviceAddress = btDeviceAddressLine
    ? btDeviceAddressLine.replace("BT_DEVICE_ADDRESS=", "").trim()
    : "";
  const btDeviceIrkLine = output
    .split("\n")
    .find((line) => line.startsWith("BT_DEVICE_IRK="));
  const btDeviceIrk = btDeviceIrkLine
    ? btDeviceIrkLine.replace("BT_DEVICE_IRK=", "").trim()
    : "";
  const hasHangulRuntime = output.includes("HANGUL_RUNTIME=yes");
  const hasBtRuntime = output.includes("BT_RUNTIME=yes");

  return {
    installHangul: hasHangulRuntime,
    installBt: hasBtRuntime,
    swapLeftCtrlCapsLock,
    btDeviceAddress,
    btDeviceIrk,
    locales,
  };
}

async function verifyInstalledRuntime(
  ip: string,
  password: string,
  expectedState: InstallState,
): Promise<boolean> {
  const currentState = await detectInstalledState(ip, password);
  if (currentState.installHangul !== expectedState.installHangul) {
    return false;
  }
  if (currentState.installBt !== expectedState.installBt) {
    return false;
  }
  if (currentState.swapLeftCtrlCapsLock !== expectedState.swapLeftCtrlCapsLock) {
    return false;
  }
  if (expectedState.installHangul) {
    const daemonState = await runSsh(ip, password, "systemctl is-active hangul-daemon 2>/dev/null || true");
    if (!daemonState.includes("active")) {
      return false;
    }
  }
  if (expectedState.installBt) {
    const btRuntimeState = await runSsh(
      ip,
      password,
      "[ -f /etc/modules-load.d/btnxpuart.conf ] && echo enabled || echo missing",
    );
    if (!btRuntimeState.includes("enabled")) {
      return false;
    }
  }
  return true;
}

function runLocal(command: string, cwd?: string, timeout = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    // Include brew installation tool path (Apple Silicon / Intel)
    const extPath = `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin:/usr/local/go/bin`;
    exec(command, { cwd, timeout, env: { ...process.env, PATH: extPath } }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function buildHangulDaemon(
  resourceDir: string,
  send: (event: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const outputPath = path.join(resourceDir, "hangul-daemon/hangul-daemon");
  const sourceDir = path.resolve(process.cwd(), "services/hangul-daemon");
  const sourceFiles = [
    path.join(sourceDir, "main.go"),
    path.join(sourceDir, "go.mod"),
  ];

  if (!shouldRebuildArtifact(outputPath, sourceFiles)) {
    send("log", { line: "OK: hangul-daemon (already built)" });
    return;
  }

  if (!fs.existsSync(path.join(sourceDir, "main.go"))) {
    throw new Error(`Source file missing: ${sourceDir}/main.go`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  send("log", { line: "Cross-compiling Go (GOOS=linux GOARCH=arm64)..." });
  await runLocal(
    `GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o "${outputPath}" .`,
    sourceDir,
    180000,
  );
  send("log", { line: "OK: hangul-daemon build complete" });
}

async function buildBluetoothHelper(
  resourceDir: string,
  send: (event: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const outputPath = path.join(resourceDir, "rekoit-bt-helper/rekoit-bt-helper");
  const sourceDir = path.resolve(process.cwd(), "services/rekoit-bt-helper");
  const sourceFiles = [
    path.join(sourceDir, "main.go"),
    path.join(sourceDir, "go.mod"),
  ];

  if (!shouldRebuildArtifact(outputPath, sourceFiles)) {
    send("log", { line: "OK: rekoit-bt-helper (already built)" });
    return;
  }

  if (!fs.existsSync(path.join(sourceDir, "main.go"))) {
    throw new Error(`Source file missing: ${sourceDir}/main.go`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  send("log", { line: "Cross-compiling Bluetooth Helper (GOOS=linux GOARCH=arm64)..." });
  await runLocal(
    `GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o "${outputPath}" .`,
    sourceDir,
    180000,
  );
  send("log", { line: "OK: rekoit-bt-helper build complete" });
}

async function downloadFont(
  resourceDir: string,
  send: (event: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const outputPath = path.join(resourceDir, "fonts/NotoSansCJKkr-Regular.otf");

  if (fs.existsSync(outputPath)) {
    send("log", { line: "OK: NotoSansCJKkr-Regular.otf (already downloaded)" });
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  for (const url of FONT_URLS) {
    try {
      send("log", { line: "Downloading Korean font (Google Noto CJK)..." });
      await runLocal(
        `curl -fSL --connect-timeout 30 --max-time 300 -o "${outputPath}" "${url}"`,
        undefined,
        310000,
      );
      // Check file size (min 1MB)
      const stat = fs.statSync(outputPath);
      if (stat.size < 1_000_000) {
        fs.unlinkSync(outputPath);
        throw new Error("Downloaded file is too small");
      }
      send("log", { line: `OK: Font download complete (${(stat.size / 1024 / 1024).toFixed(1)}MB)` });
      return;
    } catch {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }
  throw new Error("Font download failed. Please manually place NotoSansCJKkr-Regular.otf in resources/fonts/.");
}

// ROLLBACK_SCRIPT: Complete restoration to pre-installation state
const ROLLBACK_SCRIPT = `#!/bin/sh
# hangul-rollback: Remove currently installed Korean input/Bluetooth setup
set -e

mount -o remount,rw / 2>/dev/null || true

LIBEPAPER="/usr/lib/plugins/platforms/libepaper.so"
LIBEPAPER_TMPFS="/dev/shm/hangul-libepaper.so"
ROOTFS_DEV=$(mount | grep ' / ' | head -n1 | awk '{print $1}')

echo "=== Starting Korean Input Rollback ==="

resolve_libepaper_mount_target() {
    if grep -q " $LIBEPAPER " /proc/mounts 2>/dev/null; then
        printf '%s\n' "$LIBEPAPER"
        return 0
    fi
    if grep -q ' /usr/lib/plugins/platforms ' /proc/mounts 2>/dev/null; then
        printf '%s\n' "/usr/lib/plugins/platforms"
        return 0
    fi
    return 1
}

unmount_libepaper_mounts() {
    while mounted_target="$(resolve_libepaper_mount_target)"; do
        umount "$mounted_target" 2>/dev/null || true
    done
}

echo "[1/7] Stopping services..."
systemctl stop xochitl 2>/dev/null || true
systemctl stop bluetooth.service 2>/dev/null || true
for svc in hangul-daemon.service rekoit-restore.service rekoit-factory-guard.service rekoit-bt-agent.service rekoit-bt-wake-reconnect.service; do
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
done
killall hangul-daemon 2>/dev/null || true

echo "[2/7] Cleaning up active partition..."
rm -f /etc/systemd/system/hangul-daemon.service
rm -f /etc/systemd/system/rekoit-restore.service
rm -f /etc/systemd/system/rekoit-factory-guard.service
rm -f /etc/systemd/system/rekoit-bt-agent.service
rm -f /etc/systemd/system/rekoit-bt-wake-reconnect.service
rm -f /etc/systemd/system/multi-user.target.wants/hangul-daemon.service
rm -f /etc/systemd/system/multi-user.target.wants/rekoit-restore.service
rm -f /etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service
rm -f /etc/systemd/system/multi-user.target.wants/rekoit-bt-agent.service
rm -f /etc/systemd/system/multi-user.target.wants/rekoit-bt-wake-reconnect.service
rm -f /etc/systemd/system/bluetooth.service.d/wait-for-hci.conf
rmdir /etc/systemd/system/bluetooth.service.d 2>/dev/null || true
rm -f /etc/swupdate/conf.d/99-rekoit-postupdate
rm -f /etc/modules-load.d/btnxpuart.conf
sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
sed -i '/^Privacy = off$/d' /etc/bluetooth/main.conf 2>/dev/null || true
sed -i '/^FastConnectable = true$/d' /etc/bluetooth/main.conf 2>/dev/null || true

echo "[3/7] Reverting libepaper (unmounting is sufficient)..."
unmount_libepaper_mounts || true
rm -f "$LIBEPAPER_TMPFS"

echo "[4/7] Removing fonts and rootfs support files..."
rm -f /usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf
fc-cache -f 2>/dev/null || true
rm -f /opt/rekoit/factory-guard.sh
rmdir /opt/rekoit 2>/dev/null || true

find /var/lib/bluetooth -path '*/cache' -prune -o -type f -name info -print 2>/dev/null |
while read -r INFO_FILE; do
    INFO=$(cat "$INFO_FILE" 2>/dev/null || true)
    case "$INFO" in
        *"Icon=input-keyboard"*|*"UUID=Human Interface Device"*|*"00001124-0000-1000-8000-00805f9b34fb"*)
            ADDR=$(basename "$(dirname "$INFO_FILE")")
            bluetoothctl remove "$ADDR" 2>/dev/null || true
            for ADAPTER in /var/lib/bluetooth/*; do
                [ -d "$ADAPTER" ] || continue
                rm -rf "$ADAPTER/$ADDR" "$ADAPTER/cache/$ADDR" 2>/dev/null || true
            done
            ;;
    esac
done

echo "[5/7] Cleaning up persistent rootfs files..."
if [ -n "$ROOTFS_DEV" ]; then
    mkdir -p /mnt/rootfs
    mount -o rw "$ROOTFS_DEV" /mnt/rootfs 2>/dev/null || true
    if [ -d /mnt/rootfs/etc ]; then
        rm -f /mnt/rootfs/etc/systemd/system/hangul-daemon.service
        rm -f /mnt/rootfs/etc/systemd/system/rekoit-restore.service
        rm -f /mnt/rootfs/etc/systemd/system/rekoit-factory-guard.service
        rm -f /mnt/rootfs/etc/systemd/system/rekoit-bt-agent.service
        rm -f /mnt/rootfs/etc/systemd/system/rekoit-bt-wake-reconnect.service
        rm -f /mnt/rootfs/etc/systemd/system/multi-user.target.wants/hangul-daemon.service
        rm -f /mnt/rootfs/etc/systemd/system/multi-user.target.wants/rekoit-restore.service
        rm -f /mnt/rootfs/etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service
        rm -f /mnt/rootfs/etc/systemd/system/multi-user.target.wants/rekoit-bt-agent.service
        rm -f /mnt/rootfs/etc/systemd/system/multi-user.target.wants/rekoit-bt-wake-reconnect.service
        rm -f /mnt/rootfs/etc/systemd/system/bluetooth.service.d/wait-for-hci.conf
        rmdir /mnt/rootfs/etc/systemd/system/bluetooth.service.d 2>/dev/null || true
        rm -f /mnt/rootfs/etc/swupdate/conf.d/99-rekoit-postupdate
        rm -f /mnt/rootfs/etc/modules-load.d/btnxpuart.conf
        sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /mnt/rootfs/usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
        sed -i '/^Privacy = off$/d' /mnt/rootfs/etc/bluetooth/main.conf 2>/dev/null || true
        sed -i '/^FastConnectable = true$/d' /mnt/rootfs/etc/bluetooth/main.conf 2>/dev/null || true
        sync
    fi
    umount /mnt/rootfs 2>/dev/null || true
fi

echo "[6/7] Cleaning up inactive partition..."
CURRENT=$(mount | grep ' / ' | head -n 1 | awk '{print $1}')
case "$CURRENT" in
    /dev/mmcblk0p2) INACTIVE=/dev/mmcblk0p3 ;;
    /dev/mmcblk0p3) INACTIVE=/dev/mmcblk0p2 ;;
    *) INACTIVE="" ;;
esac
if [ -n "$INACTIVE" ]; then
    mkdir -p /mnt/inactive
    mount -o rw "$INACTIVE" /mnt/inactive 2>/dev/null || true
    if [ -d /mnt/inactive/etc ]; then
        rm -rf /mnt/inactive/opt/rekoit
        rm -f /mnt/inactive/usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf
        rm -f /mnt/inactive/etc/systemd/system/hangul-daemon.service
        rm -f /mnt/inactive/etc/systemd/system/rekoit-restore.service
        rm -f /mnt/inactive/etc/systemd/system/rekoit-factory-guard.service
        rm -f /mnt/inactive/etc/systemd/system/rekoit-bt-agent.service
        rm -f /mnt/inactive/etc/systemd/system/rekoit-bt-wake-reconnect.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/hangul-daemon.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-restore.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-bt-agent.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-bt-wake-reconnect.service
        rm -f /mnt/inactive/etc/systemd/system/bluetooth.service.d/wait-for-hci.conf
        rmdir /mnt/inactive/etc/systemd/system/bluetooth.service.d 2>/dev/null || true
        rm -f /mnt/inactive/etc/swupdate/conf.d/99-rekoit-postupdate
        rm -f /mnt/inactive/etc/modules-load.d/btnxpuart.conf
        sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /mnt/inactive/usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
        sed -i '/^Privacy = off$/d' /mnt/inactive/etc/bluetooth/main.conf 2>/dev/null || true
        sed -i '/^FastConnectable = true$/d' /mnt/inactive/etc/bluetooth/main.conf 2>/dev/null || true
        sync
    fi
    umount /mnt/inactive 2>/dev/null || true
fi

echo "[7/7] Restarting services..."
rm -rf /home/root/rekoit 2>/dev/null || true
systemctl daemon-reload
systemctl restart xochitl 2>/dev/null || true

echo ""
echo "=== Rollback Complete ==="
echo "Currently supported installation items have been removed."
echo "The REKOIT directory and Bluetooth pairing backups have been deleted."
`;

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const installHangul = searchParams.get("hangul") !== "false";
  const installBt = searchParams.get("bt") === "true";
  const swapLeftCtrlCapsLock = searchParams.get("swapLeftCtrlCapsLock") === "true";
  const btDeviceAddress = searchParams.get("btDeviceAddress") ?? "";
  const session = getSshSessionFromRequest(request);

  if (!session) {
    return new Response("Missing SSH session", { status: 401 });
  }

  const { ip, password } = session;

  const projectDir = path.join(process.cwd(), "resources");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const requestedState: InstallState = {
          installHangul,
          installBt,
          swapLeftCtrlCapsLock,
          btDeviceAddress,
          locales: [],
        };
        const currentState = await detectInstalledState(ip, password);
        const effectiveInstallHangul = currentState.installHangul || requestedState.installHangul;
        const effectiveInstallBt = currentState.installBt || requestedState.installBt;
        const effectiveState: InstallState = {
          installHangul: effectiveInstallHangul,
          installBt: effectiveInstallBt,
          swapLeftCtrlCapsLock: effectiveInstallHangul
            ? requestedState.installHangul
              ? requestedState.swapLeftCtrlCapsLock
              : currentState.swapLeftCtrlCapsLock
            : false,
          btDeviceAddress: effectiveInstallBt
            ? requestedState.btDeviceAddress || currentState.btDeviceAddress
            : "",
          btDeviceIrk: effectiveInstallBt
            ? (requestedState.btDeviceAddress && requestedState.btDeviceAddress !== currentState.btDeviceAddress)
              ? ""
              : currentState.btDeviceIrk
            : "",
          locales: [],
        };

        // === Step 0: Build binary from source ===
        send("step", { step: 0, name: (effectiveState.installHangul || effectiveState.installBt) ? "Building binary from source" : "Preparing configuration resources", status: "running" });
        send("progress", { percent: 0, step: 0 });

        if (effectiveState.installHangul) {
          await downloadFont(projectDir, send);
          send("progress", { percent: 8, step: 0 });

          await buildHangulDaemon(projectDir, send);
          send("progress", { percent: 15, step: 0 });
        }
        if (effectiveState.installBt) {
          await buildBluetoothHelper(projectDir, send);
          send("progress", { percent: 20, step: 0 });
        }

        if (effectiveState.installHangul || effectiveState.installBt) {
          send("step", { step: 0, name: "Binary build from source complete", status: "complete" });
        } else {
          send("progress", { percent: 20, step: 0 });
          send("step", { step: 0, name: "Configuration resources ready", status: "complete" });
        }

        // === Step 1: Create remote directory and backup ===
        send("step", { step: 1, name: "Creating remote directory and backup", status: "running" });
        send("progress", { percent: 25, step: 1 });

        const mkdirPaths = ["/home/root/rekoit"];
        if (effectiveState.installHangul) {
          mkdirPaths.push("/home/root/rekoit/fonts", "/home/root/rekoit/backup");
        }
        await runSsh(ip, password, `mkdir -p ${mkdirPaths.join(" ")}`);
        await runSsh(
          ip,
          password,
          `cat > /home/root/rekoit/install-state.conf << 'STATE_EOF'\n${renderInstallState(effectiveState)}STATE_EOF`,
        );
        send("log", { line: "OK: install-state.conf recorded" });

        if (effectiveState.installHangul) {
          const backupCommands = `
            BACKUP_DIR="/home/root/rekoit/backup"
            LIBEPAPER_BACKUP="$BACKUP_DIR/libepaper.so.original"
            if [ -f "/usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf" ] && [ ! -f "$BACKUP_DIR/font_existed" ]; then
              touch "$BACKUP_DIR/font_existed"
            fi
            # Original libepaper.so backup (First time only)
            LIBEPAPER="/usr/lib/plugins/platforms/libepaper.so"
            if [ -f "$LIBEPAPER" ] && [ ! -f "$LIBEPAPER_BACKUP" ]; then
              cp "$LIBEPAPER" "$LIBEPAPER_BACKUP"
            fi
            echo "backup complete"
          `;
          await runSsh(ip, password, backupCommands);
          send("log", { line: "OK: Initial file backup complete (including libepaper.so)" });
        }

        send("step", { step: 1, name: "Remote directory and backup complete", status: "complete" });

        // Step 1.5: Stop existing services
        if (effectiveState.installHangul) {
          try {
              await runSsh(
                ip,
                password,
                "systemctl stop hangul-daemon.service 2>/dev/null || true; systemctl stop rekoit-restore.service 2>/dev/null || true;",
              );
              send("log", { line: "OK: Existing services stopped and login restore cleanup complete" });
            } catch {
              // Ignore if service does not exist
            }
        }

        // === Step 2: File Upload ===
        const filesToUpload: FileMapping[] = [
          ...FILES_COMMON,
          ...(effectiveState.installHangul ? FILES_HANGUL : []),
          ...(effectiveState.installBt ? FILES_BT : []),
        ];

        send("log", { line: `INFO: Transferring a total of ${filesToUpload.length} files (this may take time depending on device state)...` });

        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];
          const localPath = path.isAbsolute(file.local) ? file.local : path.join(projectDir, file.local);

          if (!fs.existsSync(localPath)) {
            send("log", { line: `WARNING: File ${file.local} not found, skipping.` });
            continue;
          }

          send("step", { step: 2, name: `Uploading file: ${file.remote}`, status: "running" });
          
          // Skip if large font file already exists
          let skipUpload = false;
          if (file.remote.endsWith(".otf")) {
            try {
              const check = await runSshOnce(ip, password, `[ -f "/home/root/rekoit/${file.remote}" ] && echo "YES" || echo "NO"`);
              skipUpload = check.trim() === "YES";
            } catch {
              skipUpload = false;
            }
          }

          if (skipUpload) {
            send("log", { line: `OK: ${file.remote} (already exists, skipping upload)` });
          } else {
            if (file.remote.endsWith(".otf") || file.remote.includes("daemon") || file.remote.includes("helper")) {
              send("log", { line: `Uploading: ${file.remote}...` });
            }
            await runScp(
              ip,
              password,
              localPath,
              `/home/root/rekoit/${file.remote}`,
            );
          }
          
          send("progress", {
            percent: 30 + Math.round(((i + 1) / filesToUpload.length) * 30),
            step: 2,
          });
        }
        send("log", { line: "OK: All files uploaded successfully" });
        send("step", { step: 2, name: "File upload complete", status: "complete" });

        // === Step 3: Install rollback script ===
        send("step", { step: 3, name: "Installing rollback script", status: "running" });
        send("progress", { percent: 62, step: 3 });

        await runSsh(
          ip,
          password,
          `cat > /home/root/rekoit/rollback.sh << 'ROLLBACK_EOF'\n${ROLLBACK_SCRIPT}ROLLBACK_EOF`,
        );
        await runSsh(ip, password, "chmod +x /home/root/rekoit/rollback.sh");
        send("log", { line: "OK: rollback.sh created (rollback using: bash /home/root/rekoit/rollback.sh)" });

        send("step", { step: 3, name: "Rollback script installation complete", status: "complete" });

        // === Step 4: Run install.sh ===
        send("step", { step: 4, name: "Executing installation script", status: "running" });
        send("progress", { percent: 65, step: 4 });

        try {
          const installOutput = await runSsh(
            ip,
            password,
          `INSTALL_HANGUL=${effectiveState.installHangul ? "1" : "0"} INSTALL_BT=${effectiveState.installBt ? "1" : "0"} SWAP_LEFT_CTRL_CAPSLOCK=${effectiveState.swapLeftCtrlCapsLock ? "1" : "0"} BT_DEVICE_ADDRESS=${effectiveState.btDeviceAddress} bash /home/root/rekoit/install.sh`,
          );
          const lines = installOutput.split("\n");
          for (const line of lines) {
            if (shouldShowInstallLogLine(line, effectiveState)) {
              send("log", { line });
            }
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          const transientDisconnect = msg.includes("Exit code 255") || msg.includes("Connection") || msg.includes("Permission denied");
          if (!transientDisconnect) {
            throw error;
          }

          send("log", { line: `WARNING: install.sh SSH disconnected (${msg}); verifying actual device state...` });
          await new Promise((resolve) => setTimeout(resolve, 3000));

          let installRecovered = false;
          for (let attempt = 0; attempt < 8; attempt++) {
            try {
              if (await verifyInstalledRuntime(ip, password, effectiveState)) {
                installRecovered = true;
                break;
              }
            } catch {
              // xochitl restart can bounce USB networking briefly
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }

          if (!installRecovered) {
            throw error;
          }

          send("log", { line: "OK: install.sh completed; transient SSH disconnect only" });
        }

        send("step", { step: 4, name: "Installation script execution complete", status: "complete" });
        send("progress", { percent: 80, step: 4 });

        // === Step 5: REKOIT permanent recovery engine injection (Full OverlayFS support) ===
        send("step", { step: 5, name: "Injecting permanent recovery engine", status: "running" });
        send("progress", { percent: 85, step: 5 });

        // 1. Create /usr/bin/rekoit-restore (embedded script to remove /home dependency)
        // === Step 5: Permanently install REKOIT recovery service (System Root injection) ===
        send("step", { step: 5, name: "Installing REKOIT recovery service for boot", status: "running" });
        send("progress", { percent: 85, step: 5 });

        const helperPaths = [
          "/home/root/rekoit/restore.sh",
          "/home/root/rekoit/post-update.sh",
          ...(effectiveState.installHangul ? ["/home/root/rekoit/restore-hangul.sh"] : []),
          ...(effectiveState.installBt ? ["/home/root/rekoit/restore-bt.sh"] : []),
        ];
        await runSsh(ip, password, `chmod +x ${helperPaths.join(" ")}`);

        // Register service in permanent /usr/lib/systemd/system instead of volatile /etc
        const persistentSvcCmd = `
          mount -o remount,rw / &&
          cp /home/root/rekoit/rekoit-restore.service /usr/lib/systemd/system/rekoit-restore.service &&
          mkdir -p /usr/lib/systemd/system/multi-user.target.wants &&
          ln -sf /usr/lib/systemd/system/rekoit-restore.service /usr/lib/systemd/system/multi-user.target.wants/rekoit-restore.service &&
          if [ -f /home/root/rekoit/rekoit-bt-wake-reconnect.service ]; then
            cp /home/root/rekoit/rekoit-bt-wake-reconnect.service /usr/lib/systemd/system/rekoit-bt-wake-reconnect.service &&
            ln -sf /usr/lib/systemd/system/rekoit-bt-wake-reconnect.service /usr/lib/systemd/system/multi-user.target.wants/rekoit-bt-wake-reconnect.service;
          fi &&
          systemctl daemon-reload
        `;
        await runSsh(ip, password, persistentSvcCmd);

        send("log", { line: "OK: REKOIT recovery service -> /usr/lib/systemd/system (Permanent install)" });
        send("step", { step: 5, name: "REKOIT recovery service installation complete", status: "complete" });

        // === Step 6: Finalize persistence settings ===
        send("step", { step: 6, name: "Finalizing persistence settings", status: "running" });
        
        // Replicate services and settings to the root area of the opposite partition (in preparation for updates)
        const inactivePersistenceCmd = `
          CURRENT_ROOT=$(mount | grep ' / ' | head -n1 | awk '{print $1}') && 
          ROOTFS_DEV="" && 
          case "$CURRENT_ROOT" in /dev/mmcblk0p2) ROOTFS_DEV="/dev/mmcblk0p3" ;; /dev/mmcblk0p3) ROOTFS_DEV="/dev/mmcblk0p2" ;; esac && 
          if [ -n "$ROOTFS_DEV" ]; then 
            mkdir -p /mnt/rootfs && umount /mnt/rootfs 2>/dev/null || true && 
            mount -o rw "$ROOTFS_DEV" /mnt/rootfs 2>/dev/null && 
            mkdir -p /mnt/rootfs/usr/lib/systemd/system/multi-user.target.wants &&
            cp /usr/lib/systemd/system/rekoit-restore.service /mnt/rootfs/usr/lib/systemd/system/rekoit-restore.service &&
            ln -sf /usr/lib/systemd/system/rekoit-restore.service /mnt/rootfs/usr/lib/systemd/system/multi-user.target.wants/rekoit-restore.service &&
            if [ -f /usr/lib/systemd/system/rekoit-bt-wake-reconnect.service ]; then
              cp /usr/lib/systemd/system/rekoit-bt-wake-reconnect.service /mnt/rootfs/usr/lib/systemd/system/rekoit-bt-wake-reconnect.service &&
              ln -sf /usr/lib/systemd/system/rekoit-bt-wake-reconnect.service /mnt/rootfs/usr/lib/systemd/system/multi-user.target.wants/rekoit-bt-wake-reconnect.service;
            fi &&
            if [ -f /etc/modules-load.d/btnxpuart.conf ]; then
              mkdir -p /mnt/rootfs/etc/modules-load.d &&
              cp /etc/modules-load.d/btnxpuart.conf /mnt/rootfs/etc/modules-load.d/btnxpuart.conf;
            fi &&
            sync && umount /mnt/rootfs 2>/dev/null || true; 
          fi &&
          mount -o remount,ro / 2>/dev/null || true
        `;
        await runSsh(ip, password, inactivePersistenceCmd);
        
        send("log", { line: "OK: Service and settings replication for firmware updates complete" });
        send("step", { step: 6, name: "Installation complete", status: "complete" });

        send("progress", { percent: 100, step: 6 });
        send("complete", { success: true });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        send("error", { message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
