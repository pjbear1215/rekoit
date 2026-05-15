restore_daemon_runtime() {
    ensure_tmpfs_libepaper

    if [ -f "$FONT_SRC" ] && [ ! -f "$FONT_DST" ]; then
        mkdir -p "$(dirname "$FONT_DST")"
        cp "$FONT_SRC" "$FONT_DST"
        CHANGED=1
    fi
    if [ -f "$FONT_DST" ]; then
        fc-cache -f 2>/dev/null || true
    fi

    # Clean up old hangul-daemon if it exists
    if [ -f "/etc/systemd/system/hangul-daemon.service" ]; then
        systemctl stop hangul-daemon.service 2>/dev/null || true
        systemctl disable hangul-daemon.service 2>/dev/null || true
        rm -f /etc/systemd/system/hangul-daemon.service
        rm -f /etc/systemd/system/multi-user.target.wants/hangul-daemon.service
        CHANGED=1
    fi

    if [ -f "$SERVICE_SRC" ] && [ ! -f "/etc/systemd/system/rekoit-daemon.service" ]; then
        cp "$SERVICE_SRC" /etc/systemd/system/rekoit-daemon.service
        systemctl daemon-reload
        systemctl enable rekoit-daemon.service 2>/dev/null || true
        systemctl start rekoit-daemon.service 2>/dev/null || true
        CHANGED=1
    fi
}
