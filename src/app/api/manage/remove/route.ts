import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { buildBluetoothKeyboardCleanupScript } from "@/lib/bluetooth/bluetoothCleanup.js";

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

async function detect(ip: string, password: string): Promise<{ hangul: boolean; bt: boolean }> {
  const output = await runSsh(ip, password, `
    if [ -f /home/root/rekoit/install-state.conf ]; then
      . /home/root/rekoit/install-state.conf
      echo "STATE_HANGUL=\${INSTALL_HANGUL:-}"
      echo "STATE_BT=\${INSTALL_BT:-0}"
    else
      echo "STATE_HANGUL="
      echo "STATE_BT=0"
    fi
    HANGUL_SERVICE_LINK=$(readlink /etc/systemd/system/hangul-daemon.service 2>/dev/null || true)
    if [ -e /etc/systemd/system/hangul-daemon.service ] && [ "$HANGUL_SERVICE_LINK" != "/dev/null" ]; then
      echo "HANGUL=yes"
    else
      echo "HANGUL=no"
    fi
    if [ -f /etc/modules-load.d/btnxpuart.conf ]; then
      echo "BT=yes"
    else
      echo "BT=no"
    fi
  `);
  return {
    hangul: output.includes("HANGUL=yes"),
    bt: output.includes("BT=yes"),
  };
}

async function removeBt(ip: string, password: string, otherStillInstalled: boolean): Promise<string[]> {
  const logs: string[] = [];

  // Stop reconnection helper services first; bluetooth.service will be stopped after cleanup.
  await runSsh(ip, password, `
    systemctl stop rekoit-bt-agent.service 2>/dev/null || true
    systemctl disable rekoit-bt-agent.service 2>/dev/null || true
    systemctl stop rekoit-bt-wake-reconnect.service 2>/dev/null || true
    systemctl disable rekoit-bt-wake-reconnect.service 2>/dev/null || true
    systemctl stop rekoit-factory-guard.service 2>/dev/null || true
    systemctl disable rekoit-factory-guard.service 2>/dev/null || true
    systemctl daemon-reload
  `);
  logs.push("OK: Bluetooth helper services stopped");

  const btCleanupResult = await runSsh(ip, password, buildBluetoothKeyboardCleanupScript());
  const removedCountMatch = btCleanupResult.match(/BT_KEYBOARD_REMOVED_COUNT=(\d+)/);
  const removedCount = removedCountMatch ? Number.parseInt(removedCountMatch[1], 10) : 0;
  logs.push(`OK: Bluetooth keyboard pairings cleaned up (${removedCount} devices)`);

  // Revert only BT-specific traces
  const result = await runSsh(ip, password, `
    mount -o remount,rw / || { echo "FAIL:remount"; exit 0; }
    rm -f /etc/modules-load.d/btnxpuart.conf
    rm -f /etc/systemd/system/rekoit-factory-guard.service
    rm -f /etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service
    rm -f /opt/rekoit/factory-guard.sh
    rmdir /opt/rekoit 2>/dev/null || true
    rm -f /etc/systemd/system/bluetooth.service.d/wait-for-hci.conf
    rmdir /etc/systemd/system/bluetooth.service.d 2>/dev/null || true
    sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
    sed -i '/^Privacy = off$/d' /etc/bluetooth/main.conf 2>/dev/null || true
    sed -i '/^FastConnectable = true$/d' /etc/bluetooth/main.conf 2>/dev/null || true
    STATE_FILE="/home/root/rekoit/install-state.conf"
    if [ -f "$STATE_FILE" ]; then
      sed -i 's/^INSTALL_BT=.*/INSTALL_BT=0/' "$STATE_FILE" 2>/dev/null || true
      sed -i 's/^BT_DEVICE_ADDRESS=.*/BT_DEVICE_ADDRESS=/' "$STATE_FILE" 2>/dev/null || true
      if grep -q '^BLUETOOTH_POWER_ON=' "$STATE_FILE" 2>/dev/null; then
        sed -i 's/^BLUETOOTH_POWER_ON=.*/BLUETOOTH_POWER_ON=0/' "$STATE_FILE" 2>/dev/null || true
      else
        printf '\nBLUETOOTH_POWER_ON=0\n' >> "$STATE_FILE"
      fi
      if grep -q '^INSTALL_HANGUL=' "$STATE_FILE" 2>/dev/null; then
        sed -i 's/^INSTALL_HANGUL=.*/INSTALL_HANGUL=${otherStillInstalled ? "1" : "0"}/' "$STATE_FILE" 2>/dev/null || true
      fi
    fi
    echo "BT_REMOVE_OK"
  `);
  if (result.includes("FAIL:remount")) {
    logs.push("WARNING: rootfs remount failed");
  } else {
    logs.push("OK: Bluetooth runtime settings reverted");
  }

  await runSsh(ip, password, `
    rm -rf /home/root/rekoit/bt-pairing 2>/dev/null || true
    rm -f /home/root/rekoit/install-bt.sh
    rm -f /home/root/rekoit/restore-bt.sh
    rm -f /home/root/rekoit/post-update-bt.sh
    rm -f /home/root/rekoit/bt-wake-reconnect.sh
    rm -f /home/root/rekoit/rekoit-bt-wake-reconnect.service
    find /home/root/rekoit -type d -empty -delete 2>/dev/null || true
  `);
  logs.push("OK: REKOIT Bluetooth-related files cleaned up");

  if (!otherStillInstalled) {
    await runSsh(ip, password, `
      rm -f /etc/systemd/system/rekoit-restore.service
      rm -f /etc/systemd/system/rekoit-bt-agent.service
      rm -f /etc/systemd/system/rekoit-bt-wake-reconnect.service
      rm -f /etc/systemd/system/multi-user.target.wants/rekoit-restore.service
      rm -f /etc/systemd/system/multi-user.target.wants/rekoit-bt-agent.service
      rm -f /etc/systemd/system/multi-user.target.wants/rekoit-bt-wake-reconnect.service
      rm -f /etc/swupdate/conf.d/99-rekoit-postupdate
    logs.push("OK: BT-only REKOIT common recovery paths removed");
    }

    // Inactive partition cleanup
    await runSsh(ip, password, `
    CURRENT=$(mount | grep ' / ' | head -n 1 | awk '{print $1}')
    case "$CURRENT" in
    ...
      /dev/mmcblk0p2) INACTIVE=/dev/mmcblk0p3 ;;
      /dev/mmcblk0p3) INACTIVE=/dev/mmcblk0p2 ;;
      *) INACTIVE="" ;;
    esac
    if [ -n "$INACTIVE" ]; then
      mkdir -p /mnt/inactive
      mount -o rw "$INACTIVE" /mnt/inactive 2>/dev/null || true
      if [ -d /mnt/inactive/etc ]; then
        rm -f /mnt/inactive/etc/modules-load.d/btnxpuart.conf
        rm -f /mnt/inactive/etc/systemd/system/rekoit-factory-guard.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service
        rm -rf /mnt/inactive/opt/rekoit 2>/dev/null || true
        rm -f /mnt/inactive/etc/systemd/system/bluetooth.service.d/wait-for-hci.conf
        rmdir /mnt/inactive/etc/systemd/system/bluetooth.service.d 2>/dev/null || true
        ${otherStillInstalled ? "" : `
        rm -f /mnt/inactive/etc/systemd/system/rekoit-restore.service
        rm -f /mnt/inactive/etc/systemd/system/rekoit-bt-agent.service
        rm -f /mnt/inactive/etc/systemd/system/rekoit-bt-wake-reconnect.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-restore.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-bt-agent.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-bt-wake-reconnect.service
        rm -f /mnt/inactive/etc/swupdate/conf.d/99-rekoit-postupdate
        `}
        sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /mnt/inactive/usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
        sed -i '/^Privacy = off$/d' /mnt/inactive/etc/bluetooth/main.conf 2>/dev/null || true
        sed -i '/^FastConnectable = true$/d' /mnt/inactive/etc/bluetooth/main.conf 2>/dev/null || true
        sync
      fi
      umount /mnt/inactive 2>/dev/null || true
    fi
  `);
  logs.push("OK: Inactive partition BT traces removed");

  if (!otherStillInstalled) {
    await cleanupCommon(ip, password, logs);
  }

  await runSsh(ip, password, "systemctl daemon-reload");
  logs.push("OK: systemctl daemon-reload");

  await runSsh(ip, password, `
    systemctl stop bluetooth.service 2>/dev/null || true
  `);
  logs.push("OK: bluetooth.service final shutdown");

  return logs;
}
async function removeHangul(ip: string, password: string, otherStillInstalled: boolean): Promise<string[]> {
  const logs: string[] = [];

  // 1. Stop and disable all related services (single session)
  await runSsh(ip, password, `
    systemctl stop xochitl 2>/dev/null || true
...
    systemctl stop hangul-daemon 2>/dev/null || true
    systemctl disable hangul-daemon 2>/dev/null || true
    ${otherStillInstalled ? "" : `
    systemctl stop rekoit-restore 2>/dev/null || true
    systemctl stop rekoit-factory-guard 2>/dev/null || true
    systemctl disable rekoit-restore 2>/dev/null || true
    systemctl disable rekoit-factory-guard 2>/dev/null || true
    `}
    systemctl daemon-reload
  `);
  logs.push("OK: Input Engine runtime services stopped and disabled");

  // 2. remount + rootfs file removal (single session)
  const mainResult = await runSsh(ip, password, `
    RESULTS=""
    mount -o remount,rw / || { echo "FAIL:remount"; exit 0; }

    LIBEPAPER="/usr/lib/plugins/platforms/libepaper.so"
    LIBEPAPER_TMPFS="/dev/shm/hangul-libepaper.so"
    
    # Direct bind mount unmount (loop)
    while grep -q " $LIBEPAPER " /proc/mounts 2>/dev/null; do
      umount -l "$LIBEPAPER" 2>/dev/null || umount "$LIBEPAPER" 2>/dev/null || break
      sleep 0.5
    done
    # Unmount all mount points based on tmpfs source (loop)
    while mount | grep -q "$LIBEPAPER_TMPFS"; do
      TARGET=$(mount | awk -v src="$LIBEPAPER_TMPFS" '$1==src {print $3; exit}')
      [ -n "$TARGET" ] || break
      umount -l "$TARGET" 2>/dev/null || umount "$TARGET" 2>/dev/null || break
      sleep 0.5
    done
    // Restore libepaper original (unmounting is enough)
    rm -f "$LIBEPAPER_TMPFS"

    # Remove service files
    rm -f /etc/systemd/system/hangul-daemon.service
    rm -f /etc/systemd/system/multi-user.target.wants/hangul-daemon.service
    ${otherStillInstalled ? "" : `
    rm -f /etc/systemd/system/rekoit-restore.service
    rm -f /etc/systemd/system/rekoit-factory-guard.service
    rm -f /etc/systemd/system/multi-user.target.wants/rekoit-restore.service
    rm -f /etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service
    `}

    # Preserve fonts (do not delete)
    # rm -f /usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf
    # fc-cache -f 2>/dev/null || true

    # factory-guard, swupdate hook removal
    ${otherStillInstalled ? "" : `
    rm -f /etc/swupdate/conf.d/99-rekoit-postupdate
    rm -f /opt/rekoit/factory-guard.sh
    rmdir /opt/rekoit 2>/dev/null || true
    `}

    ${otherStillInstalled ? "" : `
    # Revert bluetooth
    sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
    sed -i '/^Privacy = off$/d' /etc/bluetooth/main.conf 2>/dev/null || true
    sed -i '/^FastConnectable = true$/d' /etc/bluetooth/main.conf 2>/dev/null || true
    `}

    STATE_FILE="/home/root/rekoit/install-state.conf"
    if [ -f "$STATE_FILE" ]; then
      if grep -q '^INSTALL_HANGUL=' "$STATE_FILE" 2>/dev/null; then
        sed -i 's/^INSTALL_HANGUL=.*/INSTALL_HANGUL=0/' "$STATE_FILE" 2>/dev/null || true
      else
        printf '\nINSTALL_HANGUL=0\n' >> "$STATE_FILE"
      fi
    fi

    echo "$RESULTS ROOTFS_DONE"
  `);

  if (mainResult.includes("FAIL:remount")) {
    logs.push("ERROR: rootfs remount failed — cannot remove");
    return logs;
  }
  logs.push(`OK: Input Engine runtime and libepaper cleaned up (fonts preserved)${otherStillInstalled ? "" : ", REKOIT guard removed"}`);

  await runSsh(ip, password, `
    rm -f /home/root/rekoit/install-hangul.sh
    rm -f /home/root/rekoit/restore-hangul.sh
    rm -f /home/root/rekoit/post-update-hangul.sh
    rm -f /home/root/rekoit/hangul-daemon
    rm -f /home/root/rekoit/hangul-daemon.service
    # Fonts are preserved and not deleted.
    rm -f /home/root/rekoit/backup/libepaper.so.original
    rm -f /home/root/rekoit/backup/libepaper.so.latest
    rm -f /home/root/rekoit/backup/font_existed
    find /home/root/rekoit -type d -empty -delete 2>/dev/null || true
  `);
  logs.push("OK: REKOIT Input Engine related files cleaned up (fonts preserved)");

  // 3. Inactive partition cleanup
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
      if [ -d /mnt/inactive/usr ]; then
        ${otherStillInstalled ? "" : `
        rm -f /mnt/inactive/opt/rekoit/factory-guard.sh
        rmdir /mnt/inactive/opt/rekoit 2>/dev/null || true
        `}
        # Also preserve fonts on the inactive partition.
        ${otherStillInstalled ? "" : `rm -f /mnt/inactive/etc/swupdate/conf.d/99-rekoit-postupdate`}
        rm -f /mnt/inactive/etc/systemd/system/hangul-daemon.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/hangul-daemon.service
        ${otherStillInstalled ? "" : `
        rm -f /mnt/inactive/etc/systemd/system/rekoit-restore.service
        rm -f /mnt/inactive/etc/systemd/system/rekoit-factory-guard.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-restore.service
        rm -f /mnt/inactive/etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service
        `}
        ${otherStillInstalled ? "" : `
        sed -i 's|^##*ConditionPathIsDirectory=/sys/class/bluetooth|ConditionPathIsDirectory=/sys/class/bluetooth|' /mnt/inactive/usr/lib/systemd/system/bluetooth.service 2>/dev/null || true
        sed -i '/^Privacy = off$/d' /mnt/inactive/etc/bluetooth/main.conf 2>/dev/null || true
        sed -i '/^FastConnectable = true$/d' /mnt/inactive/etc/bluetooth/main.conf 2>/dev/null || true
        `}
        sync
      fi
      umount /mnt/inactive 2>/dev/null || true
    fi
  `);
  logs.push("OK: Inactive partition Input Engine runtime traces cleaned up");

  // 4. If BT is also missing, clean up common files as well
  if (!otherStillInstalled) {
    await cleanupCommon(ip, password, logs);
  }

  // 5. daemon-reload + restart xochitl
  await runSsh(ip, password, "systemctl daemon-reload && systemctl restart xochitl 2>/dev/null || true");
  logs.push("OK: xochitl restarted");

  if (!otherStillInstalled) {
    await runSsh(ip, password, `
      systemctl stop bluetooth.service 2>/dev/null || true
    `);
    logs.push("OK: bluetooth.service stopped");
  } else {
    logs.push("OK: Bluetooth runtime preserved");
  }

  // 6. Final verification
  const verify = await runSsh(ip, password, `
    FAIL=""
    [ -f /usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf ] && FAIL="$FAIL font_exists"
    ${otherStillInstalled ? "" : `[ -d /opt/rekoit ] && FAIL="$FAIL opt_exists"`}
    ${otherStillInstalled ? `
    [ -f /home/root/rekoit/install-hangul.sh ] && FAIL="$FAIL install_hangul_exists"
    [ -f /home/root/rekoit/restore-hangul.sh ] && FAIL="$FAIL restore_hangul_exists"
    [ -f /home/root/rekoit/post-update-hangul.sh ] && FAIL="$FAIL post_update_hangul_exists"
    [ -f /home/root/rekoit/hangul-daemon ] && FAIL="$FAIL hangul_daemon_exists"
    [ -f /home/root/rekoit/hangul-daemon.service ] && FAIL="$FAIL hangul_service_exists"
    [ -f /home/root/rekoit/fonts/NotoSansCJKkr-Regular.otf ] && FAIL="$FAIL hangul_font_backup_exists"
    [ -f /home/root/rekoit/backup/libepaper.so.original ] && FAIL="$FAIL libepaper_backup_exists"
    [ -f /home/root/rekoit/backup/libepaper.so.latest ] && FAIL="$FAIL libepaper_latest_exists"
    [ -f /home/root/rekoit/backup/font_existed ] && FAIL="$FAIL font_marker_exists"
    ` : `[ -d /home/root/rekoit ] && FAIL="$FAIL rekoit_home_exists"`}
    [ -f /dev/shm/hangul-libepaper.so ] && FAIL="$FAIL libepaper_tmpfs_exists"
    mount | grep -q ' /usr/lib/plugins/platforms/libepaper.so ' && FAIL="$FAIL libepaper_bind_mount_exists"
    ${otherStillInstalled ? "" : `[ -f /etc/swupdate/conf.d/99-rekoit-postupdate ] && FAIL="$FAIL swupdate_hook_exists"`}
    if [ -z "$FAIL" ]; then echo "VERIFY_OK"; else echo "VERIFY_FAIL:$FAIL"; fi
  `);
  const verifyTrimmed = verify.trim();
  if (verifyTrimmed === "VERIFY_OK") {
    logs.push("OK: Removal verified");
  } else {
    logs.push(`WARNING: Some items were not removed — ${verifyTrimmed}`);
  }

  return logs;
}

async function cleanupCommon(ip: string, password: string, logs: string[]): Promise<void> {
  // .bashrc cleanup
  logs.push("OK: Login REKOIT auto-recovery script removed");

  // Complete removal of REKOIT directory
  await runSsh(ip, password, `
    find /home/root/rekoit -type f -delete 2>/dev/null || true
    find /home/root/rekoit -type d -empty -delete 2>/dev/null || true
    rm -rf /home/root/rekoit 2>/dev/null || true
  `);
  logs.push("OK: REKOIT directory completely removed");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { ip, password, target } = body as { ip: string; password: string; target: string };

    if (!ip || !password || !target) {
      return NextResponse.json({ success: false, error: "ip, password, and target are required" }, { status: 400 });
    }

    if (!/^[\d.]+$/.test(ip)) {
      return NextResponse.json({ success: false, error: "Invalid IP" }, { status: 400 });
    }

    const normalizedTarget = target === "onscreen" ? "hangul" : target;

    if (normalizedTarget !== "bt" && normalizedTarget !== "hangul" && normalizedTarget !== "font") {
      return NextResponse.json({ success: false, error: "target must be bt, hangul, or font" }, { status: 400 });
    }

    // Detect current installation state
    const detected = await detect(ip, password);

    if (normalizedTarget === "bt" && !detected.bt) {
      return NextResponse.json({ success: false, error: "Bluetooth installation to remove not detected" });
    }

    if (normalizedTarget === "hangul" && !detected.hangul) {
      return NextResponse.json({ success: false, error: "Input Engine components to remove not detected" });
    }

    let logs: string[] = [];
    if (normalizedTarget === "bt") {
      logs = await removeBt(ip, password, detected.hangul);
    } else if (normalizedTarget === "hangul") {
      logs = await removeHangul(ip, password, detected.bt);
    } else if (normalizedTarget === "font") {
      logs = await removeOnlyFont(ip, password);
    }

    return NextResponse.json({ success: true, logs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

async function removeOnlyFont(ip: string, password: string): Promise<string[]> {
  const logs: string[] = [];
  await runSsh(ip, password, `
    # Delete new path (user data area)
    rm -rf /home/root/.local/share/fonts/rekoit 2>/dev/null || true
    
    # Delete old path (system area - legacy user support)
    rm -f /usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf 2>/dev/null || true
    
    fc-cache -f 2>/dev/null || true
  `);
  logs.push("OK: Korean fonts cleaned up (checked both old and new paths)");
  logs.push("OK: Font cache updated");
  return logs;
}
