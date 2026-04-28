import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { getSshSessionFromRequest } from "@/lib/server/sshSession";
import {
  buildBluetoothKeyboardCleanupScript,
  buildKeyboardBluetoothAddressScanScript,
} from "@/lib/bluetooth/bluetoothCleanup.js";
import {
  buildFontRemovalCommands,
  HANGUL_FONT_PATH,
} from "@/lib/remarkable/uninstallFontBehavior.js";

function runSshOnce(
  ip: string,
  password: string,
  command: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, SSHPASS: password, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` };
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
        "-o",
        "ServerAliveInterval=10",
        "-o",
        "ServerAliveCountMax=3",
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
      // Filter SSH warning messages (normal behavior)
      const filteredStderr = stderr
        .split("\n")
        .filter((line) => !line.includes("Warning: Permanently added") && !line.includes("Connection to") && line.trim() !== "")
        .join("\n")
        .trim();
      if (code === 0) resolve(stdout);
      else reject(new Error(filteredStderr || `Exit code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function runSsh(
  ip: string,
  password: string,
  command: string,
  retries = 3,
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      return await runSshOnce(ip, password, command);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries - 1 && msg.includes("Permission denied")) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("SSH connection failed after retries");
}

interface DetectionResult {
  hangulInstalled: boolean;
  btInstalled: boolean;
  hasInstallStateFile: boolean;
  hasKeyboardPairings: boolean;
  hasLibepaperBackup: boolean;
  hasFactoryGuard: boolean;
  hasSwupdateHook: boolean;
  hasFont: boolean;
}

async function detectInstallation(
  ip: string,
  password: string,
): Promise<DetectionResult> {
  const keyboardScanScript = buildKeyboardBluetoothAddressScanScript().trim();
  const output = await runSsh(
    ip,
    password,
    `echo "=== DETECT ==="
    if [ -f /home/root/rekoit/install-state.conf ]; then
      . /home/root/rekoit/install-state.conf
      echo "STATE_FILE=yes"
      echo "STATE_HANGUL=\${INSTALL_HANGUL:-}"
      echo "STATE_BT=\${INSTALL_BT:-0}"
    else
      echo "STATE_FILE=no"
      echo "STATE_HANGUL="
      echo "STATE_BT=0"
    fi

    # Check if normal Korean Input Engine installation files exist (excluding /dev/null mask links)
    HANGUL_SERVICE_LINK=$(readlink /etc/systemd/system/hangul-daemon.service 2>/dev/null || true)
    if [ -e /etc/systemd/system/hangul-daemon.service ] && [ "$HANGUL_SERVICE_LINK" != "/dev/null" ]; then
      echo "HANGUL=yes"
    else
      echo "HANGUL=no"
    fi

    # Bluetooth support availability
    if [ -f /etc/modules-load.d/btnxpuart.conf ]; then
      echo "BT=yes"
    else
      echo "BT=no"
    fi

    KEYBOARD_BT_COUNT=0
    for ADDR in $(
      ${keyboardScanScript}
    ); do
      KEYBOARD_BT_COUNT=$((KEYBOARD_BT_COUNT + 1))
    done
    [ "$KEYBOARD_BT_COUNT" -gt 0 ] && echo "KEYBOARD_BT=yes" || echo "KEYBOARD_BT=no"

    # libepaper backup
    [ -f /home/root/rekoit/backup/libepaper.so.original ] && echo "LIBEPAPER_BACKUP=yes" || echo "LIBEPAPER_BACKUP=no"

    # factory-guard
    [ -f /opt/rekoit/factory-guard.sh ] && echo "FACTORY_GUARD=yes" || echo "FACTORY_GUARD=no"

    # swupdate conf.d hook
    [ -f /etc/swupdate/conf.d/99-rekoit-postupdate ] && echo "SWUPDATE_HOOK=yes" || echo "SWUPDATE_HOOK=no"

    # Korean font
    [ -f /usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf ] && echo "FONT=yes" || echo "FONT=no"`,
  );

  const get = (key: string): boolean => output.includes(`${key}=yes`);

  return {
    hangulInstalled: get("HANGUL"),
    btInstalled: get("BT"),
    hasInstallStateFile: output.includes("STATE_FILE=yes"),
    hasKeyboardPairings: get("KEYBOARD_BT"),
    hasLibepaperBackup: get("LIBEPAPER_BACKUP"),
    hasFactoryGuard: get("FACTORY_GUARD"),
    hasSwupdateHook: get("SWUPDATE_HOOK"),
    hasFont: get("FONT"),
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const cleanupFiles = searchParams.get("cleanup") !== "false";
  const deleteFont = searchParams.get("deleteFont") !== "false";
  const session = getSshSessionFromRequest(request);

  if (!session) {
    return new Response("Missing SSH session", { status: 401 });
  }

  const { ip, password } = session;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const keyboardScanScript = buildKeyboardBluetoothAddressScanScript().trim();
        const storedBluetoothAddressScanScript = `
          {
            bluetoothctl devices 2>/dev/null || true
            bluetoothctl devices Paired 2>/dev/null || true
            bluetoothctl devices Trusted 2>/dev/null || true
            bluetoothctl devices Connected 2>/dev/null || true
          } | awk '/^Device [0-9A-F:]+/ {print $2}'
          find /var/lib/bluetooth -mindepth 2 -maxdepth 2 -type d 2>/dev/null | awk -F/ '
            /^[0-9A-F:]{17}$/ && $(NF-1) != "cache" {print $NF}
          '
        `.trim();
        // === Step 0: Detect installation state ===
        send("step", { step: 0, name: "Detecting installation state", status: "running" });
        send("progress", { percent: 5, step: 0 });

        const detected = await detectInstallation(ip, password);

        // Send detection results
        send("detect", {
          hangul: detected.hangulInstalled,
          bt: detected.btInstalled,
          factoryGuard: detected.hasFactoryGuard,
          swupdateHook: detected.hasSwupdateHook,
          keyboardBt: detected.hasKeyboardPairings,
        });

        if (detected.hangulInstalled) {
          send("log", { line: "Detected: Input Engine runtime installed" });
        }
        if (detected.btInstalled) {
          send("log", { line: "Detected: Bluetooth keyboard support installed" });
        }
        if (detected.hasKeyboardPairings) {
          send("log", { line: "Detected: Bluetooth keyboard pairing data remaining" });
        }
        if (detected.hasFactoryGuard) {
          send("log", { line: "Detected: Factory reset safety guard installed" });
        }
        if (detected.hasSwupdateHook) {
          send("log", { line: "Detected: Firmware update protection installed" });
        }
        if (
          !detected.hangulInstalled
          && !detected.btInstalled
          && !detected.hasKeyboardPairings
          && !detected.hasInstallStateFile
          && !detected.hasFont
          && !detected.hasFactoryGuard
          && !detected.hasSwupdateHook
          && !detected.hasLibepaperBackup
        ) {
          send("log", { line: "Detected: No Korean input components installed" });
          send("step", { step: 0, name: "Detection complete", status: "complete" });
          send("progress", { percent: 100, step: 0 });
          send("complete", { success: true });
          return;
        }

        send("step", { step: 0, name: "Detection complete", status: "complete" });
        send("progress", { percent: 10, step: 0 });

        // === Step 1: Stop services and prepare environment ===
        send("step", { step: 1, name: "Stopping services and preparing environment", status: "running" });
        send("progress", { percent: 15, step: 1 });

        // Stop and disable all related services
        // Also mount the root partition as rw for the entire process
        await runSsh(ip, password, `
          mount -o remount,rw / 2>/dev/null || true
          for svc in rekoit-factory-guard hangul-daemon rekoit-restore rekoit-bt-agent rekoit-bt-wake-reconnect; do
            systemctl stop "$svc" 2>/dev/null || true
            systemctl disable "$svc" 2>/dev/null || true
          done
          killall hangul-daemon 2>/dev/null || true
        `);
        send("log", { line: "OK: Related services stopped and rw permissions secured" });

        if (detected.btInstalled || detected.hasKeyboardPairings) {
          const btCleanupResult = await runSsh(ip, password, buildBluetoothKeyboardCleanupScript());
          const removedCountMatch = btCleanupResult.match(/BT_KEYBOARD_REMOVED_COUNT=(\d+)/);
          const removedCount = removedCountMatch ? Number.parseInt(removedCountMatch[1], 10) : 0;
          send("log", { line: `OK: Bluetooth keyboard pairings cleaned up (${removedCount} devices)` });

          await runSsh(ip, password, "systemctl stop bluetooth.service 2>/dev/null || true");
          send("log", { line: "OK: bluetooth.service stopped" });
          }

          send("step", { step: 1, name: "Service shutdown", status: "complete" });
        send("progress", { percent: 25, step: 1 });

        // === Step 2+3: Integrated restoration and deletion via direct block device mount ===
        // Key: Perform all ext4 writes only on the direct mount point
        // Writing to both root mount (/) and direct mount (/mnt/direct_rootfs) simultaneously causes page cache inconsistency
        // /etc is overlay (tmpfs upperdir) -> normal rm only creates whiteout, restored on reboot
        // /usr and /opt are not overlay but are on the same block device, so they are integrated via direct mount
        send("step", { step: 2, name: "Removing system files", status: "running" });
        send("progress", { percent: 30, step: 2 });

        const directResult = await runSsh(ip, password, `
          LIBEPAPER="/usr/lib/plugins/platforms/libepaper.so"
          LIBEPAPER_TMPFS="/dev/shm/hangul-libepaper.so"

          unmount_libepaper_mounts() {
            # Unmount direct bind mounts
            while grep -q " $LIBEPAPER " /proc/mounts 2>/dev/null; do
              umount -l "$LIBEPAPER" 2>/dev/null || umount "$LIBEPAPER" 2>/dev/null || break
              sleep 0.5
            done
            # Unmount all mount points based on tmpfs source
            while mount | grep -q "$LIBEPAPER_TMPFS"; do
              TARGET=$(mount | awk -v src="$LIBEPAPER_TMPFS" '$1==src {print $3; exit}')
              [ -n "$TARGET" ] || break
              umount -l "$TARGET" 2>/dev/null || umount "$TARGET" 2>/dev/null || break
              sleep 0.5
            done
          }

          unmount_libepaper_mounts
          rm -f "$LIBEPAPER_TMPFS"

          # Find the actual block device of the root partition
          ROOTDEV=""
          for dev in /dev/mmcblk0p2 /dev/mmcblk0p3; do
            if mount | grep -q "$dev on / "; then
              ROOTDEV="$dev"
              break
            fi
          done
          if [ -z "$ROOTDEV" ]; then
            ROOTDEV=$(findmnt -n -o SOURCE / 2>/dev/null | head -1)
          fi
          echo "ROOTDEV=$ROOTDEV"

          if [ -z "$ROOTDEV" ] || [ "$ROOTDEV" = "overlay" ] || [ "$ROOTDEV" = "tmpfs" ]; then
            echo "DIRECT_MOUNT_FAIL: no block device found"
            exit 1
          fi

          mkdir -p /mnt/direct_rootfs
          umount /mnt/direct_rootfs 2>/dev/null || true
          mount -o rw "$ROOTDEV" /mnt/direct_rootfs 2>&1

          if [ ! -d /mnt/direct_rootfs/etc ]; then
            echo "DIRECT_MOUNT_FAIL: /mnt/direct_rootfs/etc not found"
            umount /mnt/direct_rootfs 2>/dev/null || true
            exit 1
          fi
          echo "DIRECT_MOUNT_OK"

          # === libepaper.so original restoration (unmounting is sufficient) ===
          echo "LIBEPAPER_RESTORED_BY_UMOUNT"
          # === Delete /etc files (bypassing overlay) ===
          rm -f /mnt/direct_rootfs/etc/systemd/system/hangul-daemon.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/rekoit-restore.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/rekoit-factory-guard.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/rekoit-bt-agent.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/rekoit-bt-wake-reconnect.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/multi-user.target.wants/hangul-daemon.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/multi-user.target.wants/rekoit-restore.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/multi-user.target.wants/rekoit-bt-agent.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/multi-user.target.wants/rekoit-bt-wake-reconnect.service
          rm -f /mnt/direct_rootfs/etc/systemd/system/bluetooth.service.d/wait-for-hci.conf
          rm -rf /mnt/direct_rootfs/etc/systemd/system/bluetooth.service.d 2>/dev/null
          rm -f /mnt/direct_rootfs/etc/swupdate/conf.d/99-rekoit-postupdate
          rm -f /mnt/direct_rootfs/etc/modules-load.d/btnxpuart.conf

          # === Delete /opt/rekoit (via direct mount) ===
          rm -rf /mnt/direct_rootfs/opt/rekoit 2>/dev/null

          # === Delete font (via direct mount) ===
          ${buildFontRemovalCommands({ deleteFont, prefix: "/mnt/direct_rootfs" })}

          # === Revert bluetooth settings (via direct mount) ===
          sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /mnt/direct_rootfs/usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
          sed -i '/^Privacy = off$/d' /mnt/direct_rootfs/etc/bluetooth/main.conf 2>/dev/null || true
          sed -i '/^FastConnectable = true$/d' /mnt/direct_rootfs/etc/bluetooth/main.conf 2>/dev/null || true

          sync

          # === Integrated verification (check on direct mount) ===
          echo "POST_RM_CHECK:"
          [ -d /mnt/direct_rootfs/opt/rekoit ] && echo "STILL:/opt/rekoit" || echo "GONE:/opt/rekoit"
          # Font preservation is now the default policy, so only check for existence
          [ -d /mnt/direct_rootfs/home/root/.local/share/fonts/rekoit ] && echo "KEPT:font" || echo "GONE:font"
          [ -f /mnt/direct_rootfs/etc/systemd/system/rekoit-factory-guard.service ] && echo "STILL:rekoit-factory-guard.service" || echo "GONE:rekoit-factory-guard.service"
          [ -f /mnt/direct_rootfs/etc/swupdate/conf.d/99-rekoit-postupdate ] && echo "STILL:swupdate-hook" || echo "GONE:swupdate-hook"
          [ -f /mnt/direct_rootfs/etc/modules-load.d/btnxpuart.conf ] && echo "STILL:btnxpuart" || echo "GONE:btnxpuart"

          umount /mnt/direct_rootfs 2>/dev/null || true
          echo "DIRECT_REMOVE_DONE"
        `);

        // Parse results
        const stillExists = directResult.split("\n").filter((l) => l.startsWith("STILL:"));
        const goneItems = directResult.split("\n").filter((l) => l.startsWith("GONE:"));

        if (directResult.includes("DIRECT_MOUNT_OK")) {
          send("log", { line: "OK: Direct block device mount successful" });
        }

        if (directResult.includes("LIBEPAPER_RESTORED")) {
          send("log", { line: "OK: libepaper.so original restored" });
        }

        // File deletion results
        const stillItems = stillExists.map(i => i.replace("STILL:", ""));
        const goneItemsClean = goneItems.map(i => i.replace("GONE:", ""));
        const keptItems = directResult.split("\n").filter((l) => l.startsWith("KEPT:"));

        if (stillItems.length > 0) {
          for (const item of stillItems) {
            // Fonts in the deletion failure list are due to the preservation policy, so do not warn
            if (item.includes("font")) continue;
            send("log", { line: `WARNING: Failed to delete — ${item}` });
          }
        }
        
        if (keptItems.some(i => i.includes("font"))) {
          send("log", { line: "OK: Korean font preserved (User data area)" });
        } else if (goneItemsClean.some(i => i.includes("font"))) {
          send("log", { line: "OK: Korean font removed" });
        }

        if (directResult.includes("GONE:/opt/rekoit")) {
          send("log", { line: "OK: /opt/rekoit removed" });
        }
        if (deleteFont) {
          if (directResult.includes("GONE:font")) {
            send("log", { line: "OK: Korean font deleted" });
          } else {
            send("log", { line: "WARNING: Failed to delete Korean font" });
          }
        } else if (detected.hasFont) {
          if (directResult.includes("STILL:font")) {
            send("log", { line: "OK: Korean font preserved" });
          } else {
            send("log", { line: "WARNING: Failed to preserve Korean font" });
          }
        } else {
          send("log", { line: "INFO: No Korean font currently installed to preserve" });
        }

        if (directResult.includes("DIRECT_REMOVE_DONE")) {
          send("log", { line: `OK: ext4 file removal complete (${goneItems.length} items deleted)` });
        } else {
          send("log", { line: "ERROR: Direct block device mount failed" });
          for (const line of directResult.split("\n").filter((l) => l.trim())) {
            send("log", { line: `DIAG: ${line.trim()}` });
          }
        }

        if (detected.hasSwupdateHook) {
          send("log", { line: "OK: SWUpdate hook removed (deleted from ext4)" });
        }

        send("step", { step: 2, name: "Removing system files", status: "complete" });
        send("progress", { percent: 50, step: 2 });

        // === Step 3: Reverting system settings ===
        send("step", { step: 3, name: "Reverting system settings", status: "running" });
        send("progress", { percent: 55, step: 3 });

        await runSsh(ip, password, `
          # rm overlay /etc and /opt files (for immediate reflection in the current session)
          rm -rf /opt/rekoit 2>/dev/null || true
          rm -f /etc/systemd/system/hangul-daemon.service /etc/systemd/system/rekoit-restore.service /etc/systemd/system/rekoit-factory-guard.service /etc/systemd/system/rekoit-bt-agent.service /etc/systemd/system/rekoit-bt-wake-reconnect.service
          rm -f /etc/systemd/system/multi-user.target.wants/hangul-daemon.service /etc/systemd/system/multi-user.target.wants/rekoit-restore.service /etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service /etc/systemd/system/multi-user.target.wants/rekoit-bt-agent.service /etc/systemd/system/multi-user.target.wants/rekoit-bt-wake-reconnect.service
          rm -rf /etc/systemd/system/bluetooth.service.d 2>/dev/null
          rm -f /etc/swupdate/conf.d/99-rekoit-postupdate /etc/modules-load.d/btnxpuart.conf
          ${buildFontRemovalCommands({ deleteFont, ignoreMissing: true, refreshCache: true })}
          sync
          sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
          sed -i '/^Privacy = off$/d' /etc/bluetooth/main.conf 2>/dev/null || true
          sed -i '/^FastConnectable = true$/d' /etc/bluetooth/main.conf 2>/dev/null || true
          STATE_DIR="/home/root/rekoit"
          STATE_FILE="$STATE_DIR/install-state.conf"
          if [ -d "$STATE_DIR" ]; then
            cat > "$STATE_FILE" <<'STATE_EOF'
INSTALL_HANGUL=0
INSTALL_BT=0
BLUETOOTH_POWER_ON=0
SWAP_LEFT_CTRL_CAPSLOCK=0
KEYBOARD_LOCALES=
STATE_EOF
          fi
          # Switch to read-only after all operations are complete
          mount -o remount,ro / 2>/dev/null || true
          systemctl daemon-reload && sync
        `);
        send("log", { line: "OK: System settings reverted and switched to ro" });

        send("step", { step: 3, name: "Overlay cleanup", status: "complete" });
        send("progress", { percent: 60, step: 3 });

        // === Step 4: Removing installed files ===
        send("step", { step: 4, name: "Removing installed files", status: "running" });
        send("progress", { percent: 65, step: 4 });

        // Check SSH reconnection (the device may have rebooted due to swupdate restart)
        let step4Connected = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            await runSshOnce(ip, password, "echo OK");
            step4Connected = true;
            break;
          } catch {
            if (attempt === 0) {
              send("log", { line: "INFO: Waiting for SSH reconnection..." });
            }
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
        if (!step4Connected) {
          send("log", { line: "ERROR: SSH reconnection failed — some cleanup and verification tasks could not be performed" });
          send("error", { message: "Restoration verification could not be completed due to SSH reconnection failure" });
          return;
        }

        // .bashrc cleanup
        await runSsh(ip, password, `
          systemctl stop bluetooth.service 2>/dev/null || true
        `);

        send("step", { step: 4, name: "Installed files removed", status: "complete" });
        send("progress", { percent: 75, step: 4 });

        // === Step 5: Cleaning up inactive partition ===
        send("step", { step: 5, name: "Cleaning up inactive partition", status: "running" });
        send("progress", { percent: 80, step: 5 });

        await runSsh(ip, password, `
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
              ${buildFontRemovalCommands({ deleteFont, prefix: "/mnt/inactive" })}
              rm -f /mnt/inactive/etc/swupdate/conf.d/99-rekoit-postupdate
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
              rm -rf /mnt/inactive/etc/systemd/system/bluetooth.service.d 2>/dev/null || true
              sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /mnt/inactive/usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
              sed -i '/^Privacy = off$/d' /mnt/inactive/etc/bluetooth/main.conf 2>/dev/null || true
              sed -i '/^FastConnectable = true$/d' /mnt/inactive/etc/bluetooth/main.conf 2>/dev/null || true
              rm -f /mnt/inactive/etc/modules-load.d/btnxpuart.conf
              sync
            fi
            umount /mnt/inactive 2>/dev/null || true
          fi
        `);
        send("log", { line: "OK: Inactive partition REKOIT traces removed" });

        send("step", { step: 5, name: "Inactive partition cleanup complete", status: "complete" });
        send("progress", { percent: 85, step: 5 });

        // === Step 6: Cleaning up installation directory and final cleanup ===
        send("step", { step: 6, name: "Cleaning up installation directory", status: "running" });
        send("progress", { percent: 88, step: 6 });

        if (cleanupFiles) {
          await runSsh(ip, password, `
            find /home/root/rekoit -type f -delete 2>/dev/null || true
            find /home/root/rekoit -type d -empty -delete 2>/dev/null || true
            rm -rf /home/root/rekoit 2>/dev/null || true
          `);
          send("log", { line: "OK: /home/root/REKOIT directory removed" });
        }

        // Re-verify mask before daemon-reload to prevent overlay cache services from loading
        await runSsh(ip, password, `
          for svc in rekoit-factory-guard hangul-daemon rekoit-restore rekoit-bt-agent rekoit-bt-wake-reconnect; do
            systemctl mask "$svc" 2>/dev/null || true
          done
          systemctl daemon-reload && sync
        `);
        send("log", { line: "OK: REKOIT service mask re-verified + daemon-reload" });

        send("step", { step: 6, name: "Installation directory cleanup complete", status: "complete" });
        send("progress", { percent: 93, step: 6 });

        // === Step 7: Restarting xochitl (Final step — SSH disconnect expected) ===
        send("step", { step: 7, name: "System restart", status: "running" });
        send("progress", { percent: 95, step: 7 });

        try {
          // Since USB network temporarily disconnects during xochitl restart,
          // execute in the background after 2 seconds to allow the SSH session to terminate normally first.
          await runSsh(ip, password, `
            for svc in rekoit-factory-guard hangul-daemon rekoit-restore rekoit-bt-agent rekoit-bt-wake-reconnect; do
              systemctl mask "$svc" 2>/dev/null || true
            done
            sync && (sleep 2 && systemctl restart xochitl) &
          `);
          send("log", { line: "OK: xochitl restart command sent successfully (executing in 2s)" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          send("log", { line: `WARNING: Error sending xochitl restart command (ignored): ${msg}` });
        }

        send("step", { step: 7, name: "System restart complete", status: "complete" });
        send("progress", { percent: 96, step: 7 });

        // === Step 8: Post-restart removal verification ===
        send("step", { step: 8, name: "Verifying removal", status: "running" });
        send("progress", { percent: 97, step: 8 });

        // Wait for SSH reconnection (up to 20 seconds for USB network recovery after xochitl restart)
        let verifyOutput = "";
        let verified = false;
        for (let attempt = 0; attempt < 4; attempt++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            send("log", { line: "INFO: Attempting removal verification..." });
            verifyOutput = await runSshOnce(ip, password, `
              # Final live cleanup: Forcefully clean the current runtime view of the active rootfs once more
              rm -rf /opt/rekoit 2>/dev/null || true
              # Final verification of service unmask (was masked at the time of xochitl restart)
              for svc in rekoit-factory-guard hangul-daemon rekoit-restore rekoit-bt-agent rekoit-bt-wake-reconnect; do
                systemctl stop "$svc" 2>/dev/null || true
                systemctl disable "$svc" 2>/dev/null || true
                systemctl unmask "$svc" 2>/dev/null || true
              done
              systemctl daemon-reload 2>/dev/null || true

              echo "=== VERIFY ==="

              # Verify all rootfs files via direct mount (bypassing overlay/page cache)
              ROOTDEV=""
              for dev in /dev/mmcblk0p2 /dev/mmcblk0p3; do
                if mount | grep -q "$dev on / "; then
                  ROOTDEV="$dev"
                  break
                fi
              done
              if [ -z "$ROOTDEV" ]; then
                ROOTDEV=$(findmnt -n -o SOURCE / 2>/dev/null | grep mmcblk | head -1)
              fi

              DIRECT=""
              if [ -n "$ROOTDEV" ]; then
                mkdir -p /mnt/verify_rootfs
                umount /mnt/verify_rootfs 2>/dev/null || true
                mount -o ro "$ROOTDEV" /mnt/verify_rootfs 2>/dev/null
                if [ -d /mnt/verify_rootfs/etc ]; then
                  DIRECT="/mnt/verify_rootfs"
                  echo "VERIFY_DIRECT_MOUNT_OK"
                fi
              fi

              if [ -n "$DIRECT" ]; then
                # Check /etc files (ext4 directly)
                [ -f "$DIRECT/etc/systemd/system/hangul-daemon.service" ] && echo "REMAIN:hangul-daemon.service file" || true
                [ -f "$DIRECT/etc/systemd/system/rekoit-restore.service" ] && echo "REMAIN:rekoit-restore.service file" || true
                [ -f "$DIRECT/etc/systemd/system/rekoit-factory-guard.service" ] && echo "REMAIN:rekoit-factory-guard.service file" || true
                [ -f "$DIRECT/etc/systemd/system/rekoit-bt-agent.service" ] && echo "REMAIN:rekoit-bt-agent.service file" || true
                [ -f "$DIRECT/etc/systemd/system/rekoit-bt-wake-reconnect.service" ] && echo "REMAIN:rekoit-bt-wake-reconnect.service file" || true
                [ -f "$DIRECT/etc/swupdate/conf.d/99-rekoit-postupdate" ] && echo "REMAIN:swupdate hook file" || true
                [ -f "$DIRECT/etc/modules-load.d/btnxpuart.conf" ] && echo "REMAIN:btnxpuart module configuration" || true

                # Check rootfs files (via direct mount — bypassing root mount cache)
                [ -f "$DIRECT${HANGUL_FONT_PATH}" ] && echo "REMAIN:Korean font file" || true
                ${!deleteFont && detected.hasFont ? `[ -f "$DIRECT${HANGUL_FONT_PATH}" ] || echo "MISSING:Korean font file"` : ""}
                [ -d "$DIRECT/opt/rekoit" ] && echo "REMAIN:/opt/rekoit directory" || true
              else
                # Fallback to root mount if direct mount fails
                [ -f ${HANGUL_FONT_PATH} ] && echo "REMAIN:Korean font file" || true
                ${!deleteFont && detected.hasFont ? `[ -f ${HANGUL_FONT_PATH} ] || echo "MISSING:Korean font file"` : ""}
                [ -d /opt/rekoit ] && echo "REMAIN:/opt/rekoit directory" || true
              fi

              # Check /home files (separate partition — not overlay)
              [ -d /home/root/rekoit ] && echo "REMAIN:rekoit directory" || true
              [ -d /home/root/rekoit/bt-pairing ] && echo "REMAIN:bt-pairing backup directory" || true
              if [ -f /home/root/rekoit/install-state.conf ]; then
                . /home/root/rekoit/install-state.conf
                [ "\${INSTALL_HANGUL:-1}" = "0" ] || echo "REMAIN:install-state hangul flag"
                [ "\${INSTALL_BT:-1}" = "0" ] || echo "REMAIN:install-state bt flag"
              fi
              grep -q 'rekoit' /home/root/.bashrc 2>/dev/null && echo "REMAIN:.bashrc auto-recovery script" || true
              [ -f /dev/shm/hangul-libepaper.so ] && echo "REMAIN:libepaper tmpfs file" || true
              mount | grep -q ' /usr/lib/plugins/platforms/libepaper.so ' && echo "REMAIN:libepaper runtime mount" || true

              # Bluetooth verification (excluding bluetoothctl — risk of hanging when service is stopped)
              find /var/lib/bluetooth -mindepth 2 -maxdepth 2 -type d 2>/dev/null | awk -F/ '
                /^[0-9A-F:]{17}$/ && $(NF-1) != "cache" {print $NF}
              ' | while read ADDR; do
                echo "REMAIN:Bluetooth device status ($ADDR)"
              done

              if [ -n "$DIRECT" ]; then
                umount /mnt/verify_rootfs 2>/dev/null || true
              fi

              echo "VERIFY_DONE"
            `);
            verified = true;
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send("log", { line: `INFO: Waiting for SSH reconnection... (${attempt + 1}/8) - ${msg}` });
          }
        }

        if (verified && verifyOutput.includes("VERIFY_DONE")) {
          const remains = verifyOutput
            .split("\n")
            .filter((line) => line.startsWith("REMAIN:"))
            .map((line) => line.replace("REMAIN:", "").trim());
          const missing = verifyOutput
            .split("\n")
            .filter((line) => line.startsWith("MISSING:"))
            .map((line) => line.replace("MISSING:", "").trim());

          // Exclusion of font-related items when font preservation is selected
          const filtered = deleteFont
            ? remains
            : remains.filter((r) => !r.includes("Korean font"));

          if (filtered.length === 0) {
            send("log", { line: "OK: Complete verification finished — all items successfully removed" });
          } else {
            for (const item of filtered) {
              send("log", { line: `WARNING: Unremoved item — ${item}` });
            }
            send("log", { line: `WARNING: ${filtered.length} items were not completely removed` });
          }

          for (const item of missing) {
            send("log", { line: `WARNING: Preservation failed — ${item}` });
          }
          } else {
          send("log", { line: "WARNING: SSH reconnection failed — removal verification could not be performed" });
          }

          send("step", { step: 8, name: "Removal verification", status: "complete" });
        send("progress", { percent: 100, step: 8 });
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
