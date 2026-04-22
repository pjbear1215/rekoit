#!/bin/sh
# rekoit-restore: re-apply REKOIT runtime after firmware update / reboot
# /home/root/rekoit/ survives firmware updates; system dirs do not

set -e

# 이미 복구되어 데몬이 작동 중이라면 즉시 종료 (로그인 시 부하 최소화)
if systemctl is-active hangul-daemon.service >/dev/null 2>&1; then
    exit 0
fi

LOG="/home/root/rekoit/restore.log"
echo "[$(date)] restore.sh 시작 (필요에 의한 실행)" >> "$LOG"

mount -o remount,rw / 2>/dev/null || true

BASEDIR="/home/root/rekoit"
STATE_FILE="$BASEDIR/install-state.conf"
FONT_SRC="$BASEDIR/fonts/NotoSansCJKkr-Regular.otf"
FONT_DST="/home/root/.local/share/fonts/rekoit/NotoSansCJKkr-Regular.otf"
SERVICE_SRC="$BASEDIR/hangul-daemon.service"
LIBEPAPER="/usr/lib/plugins/platforms/libepaper.so"
LIBEPAPER_TMPFS="/dev/shm/hangul-libepaper.so"
LIBEPAPER_BACKUP="$BASEDIR/backup/libepaper.so.original"
LIBEPAPER_NEW_BACKUP="$BASEDIR/backup/libepaper.so.latest"
CHANGED=0

INSTALL_BT=0
INSTALL_HANGUL=0
BLUETOOTH_POWER_ON=0
if [ -f "$STATE_FILE" ]; then
    . "$STATE_FILE"
fi

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
        if ! umount "$mounted_target" 2>/dev/null; then
            echo "[RESTORE] failed to unmount existing libepaper mount: $mounted_target" >&2
            return 1
        fi
    done
    return 0
}

ensure_tmpfs_libepaper() {
    src=""
    if [ -f "$LIBEPAPER_BACKUP" ]; then
        src="$LIBEPAPER_BACKUP"
    elif [ -f "$LIBEPAPER" ]; then
        src="$LIBEPAPER"
    fi

    if [ -z "$src" ]; then
        return 0
    fi

    unmount_libepaper_mounts

    rm -f "$LIBEPAPER_TMPFS"
    cp "$src" "$LIBEPAPER_TMPFS"
    if [ ! -f "$LIBEPAPER_TMPFS" ]; then
        echo "[RESTORE] tmpfs source missing after copy: $LIBEPAPER_TMPFS" >&2
        return 1
    fi
    if [ ! -f "$LIBEPAPER" ]; then
        echo "[RESTORE] bind mount target missing: $LIBEPAPER" >&2
        return 1
    fi
    mount -o bind "$LIBEPAPER_TMPFS" "$LIBEPAPER"
    echo "[RESTORE] tmpfs-backed libepaper mounted"
}

if [ -f "$LIBEPAPER" ] && [ -f "$LIBEPAPER_BACKUP" ]; then
    CURRENT_MD5=$(md5sum "$LIBEPAPER" | cut -d' ' -f1)
    BACKUP_MD5=$(md5sum "$LIBEPAPER_BACKUP" | cut -d' ' -f1)
    if [ "$CURRENT_MD5" != "$BACKUP_MD5" ]; then
        # 펌웨어 업데이트 감지됨: 기존 백업을 최신으로 교체
        mv "$LIBEPAPER_BACKUP" "$BASEDIR/backup/libepaper.so.old-$(date +%Y%m%d)" 2>/dev/null || true
        cp "$LIBEPAPER" "$LIBEPAPER_BACKUP"
        echo "[RESTORE] 펌웨어 업데이트 감지: libepaper.so 백업을 최신 버전으로 갱신 완료"
    fi
fi

if [ "$INSTALL_HANGUL" = "1" ]; then
    . "$BASEDIR/restore-hangul.sh"
    restore_hangul_runtime || true
fi
if [ "$INSTALL_BT" = "1" ]; then
    # 블루투스 복구는 시간이 걸리므로 백그라운드 실행
    (
        . "$BASEDIR/restore-bt.sh"
        restore_bt_runtime || true
    ) >/dev/null 2>&1 &
fi

# 펌웨어 업데이트 상황일 경우 (현재 서비스 링크 등이 유실되었을 수 있으므로) 필요한 패치 재적용
# /usr/lib/systemd/system/rekoit-restore.service는 이미 영구적이므로 여기서 다시 복사할 필요 없음

if [ "$CHANGED" -eq 1 ]; then
    systemctl daemon-reload
fi

# 모든 복구 작업 완료 후 다시 읽기 전용으로 원복 (시스템 안정성)
mount -o remount,ro / 2>/dev/null || true

echo "[$(date)] restore.sh 완료 (changed=$CHANGED)" >> "$LOG"

exit 0
