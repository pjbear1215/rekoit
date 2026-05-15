post_update_daemon() {
    FONT_SRC="$BASEDIR/fonts/NotoSansCJKkr-Regular.otf"
    FONT_DST="/mnt/updated/usr/share/fonts/ttf/noto/NotoSansCJKkr-Regular.otf"
    if [ -f "$FONT_SRC" ]; then
        mkdir -p "$(dirname "$FONT_DST")"
        cp "$FONT_SRC" "$FONT_DST"
        echo "[$(date)] OK: Korean font" >> "$LOG"
    fi

    # Clean up old hangul-daemon from updated partition
    rm -f /mnt/updated/etc/systemd/system/hangul-daemon.service
    rm -f /mnt/updated/etc/systemd/system/multi-user.target.wants/hangul-daemon.service

    if [ -f "$BASEDIR/rekoit-daemon.service" ]; then
        mkdir -p /mnt/updated/etc/systemd/system/multi-user.target.wants
        cp "$BASEDIR/rekoit-daemon.service" /mnt/updated/etc/systemd/system/rekoit-daemon.service
        ln -sf /etc/systemd/system/rekoit-daemon.service /mnt/updated/etc/systemd/system/multi-user.target.wants/rekoit-daemon.service
        echo "[$(date)] OK: rekoit-daemon.service" >> "$LOG"
    fi
}
