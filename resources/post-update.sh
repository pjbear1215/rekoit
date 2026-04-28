#!/bin/sh
# rekoit-post-update: Automatically inject REKOIT runtime right after firmware update (before reboot)
# Called with SWUpdate -p option

LOG="/home/root/rekoit/post-update.log"
echo "[$(date)] post-update.sh started" >> "$LOG"

BASEDIR="/home/root/rekoit"
STATE_FILE="$BASEDIR/install-state.conf"
INSTALL_HANGUL=0
INSTALL_BT=0
if [ -f "$STATE_FILE" ]; then
    . "$STATE_FILE"
fi

CURRENT=$(mount | grep " / " | head -n 1 | awk '{print $1}')
case "$CURRENT" in
    /dev/mmcblk0p2) UPDATED=/dev/mmcblk0p3 ;;
    /dev/mmcblk0p3) UPDATED=/dev/mmcblk0p2 ;;
    *) echo "[$(date)] Partition detection failed: $CURRENT" >> "$LOG"; exit 0 ;;
esac

echo "[$(date)] Updated partition: $UPDATED" >> "$LOG"

mkdir -p /mnt/updated
umount /mnt/updated 2>/dev/null || true
mount -o rw "$UPDATED" /mnt/updated 2>/dev/null || mount "$UPDATED" /mnt/updated 2>/dev/null || true
mount -o remount,rw /mnt/updated 2>/dev/null || true
if [ ! -d /mnt/updated/etc ]; then
    echo "[$(date)] Mount failed" >> "$LOG"
    exit 0
fi
if mount | grep " /mnt/updated " | grep -q "(ro,"; then
    echo "[$(date)] Updated partition mounted as read-only" >> "$LOG"
    umount /mnt/updated 2>/dev/null || true
    exit 0
fi

if [ "$INSTALL_HANGUL" = "1" ]; then
    . "$BASEDIR/post-update-hangul.sh"
    post_update_hangul
fi
if [ "$INSTALL_BT" = "1" ]; then
    . "$BASEDIR/post-update-bt.sh"
    post_update_bt
fi

if [ -f "$BASEDIR/rekoit-restore.service" ]; then
    mkdir -p /mnt/updated/etc/systemd/system/multi-user.target.wants
    cp "$BASEDIR/rekoit-restore.service" /mnt/updated/etc/systemd/system/rekoit-restore.service
    ln -sf /etc/systemd/system/rekoit-restore.service /mnt/updated/etc/systemd/system/multi-user.target.wants/rekoit-restore.service
    echo "[$(date)] OK: rekoit-restore.service" >> "$LOG"
fi

mkdir -p /mnt/updated/etc/swupdate/conf.d
cat > /mnt/updated/etc/swupdate/conf.d/99-rekoit-postupdate << 'CONFD_EOF'
# REKOIT post-update hook (auto-replicated)
SWUPDATE_ARGS+=" -p /home/root/rekoit/post-update.sh"
CONFD_EOF
echo "[$(date)] OK: conf.d self-replication" >> "$LOG"

if [ "$INSTALL_BT" = "1" ] && [ -f /opt/rekoit/factory-guard.sh ]; then
    mkdir -p /mnt/updated/opt/rekoit
    cp /opt/rekoit/factory-guard.sh /mnt/updated/opt/rekoit/factory-guard.sh
    chmod +x /mnt/updated/opt/rekoit/factory-guard.sh
    cat > /mnt/updated/etc/systemd/system/rekoit-factory-guard.service << 'FGUARD_EOF'
[Unit]
Description=REKOIT Factory Reset Guard
After=home.mount
Wants=home.mount
Before=xochitl.service

[Service]
Type=oneshot
ExecStart=/opt/rekoit/factory-guard.sh
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
FGUARD_EOF
    ln -sf /etc/systemd/system/rekoit-factory-guard.service /mnt/updated/etc/systemd/system/multi-user.target.wants/rekoit-factory-guard.service
    echo "[$(date)] OK: factory-guard replication" >> "$LOG"
fi

sync
umount /mnt/updated 2>/dev/null || true

echo "[$(date)] post-update.sh completed" >> "$LOG"
