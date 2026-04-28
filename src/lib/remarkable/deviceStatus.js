export function deriveRuntimeState({
  hasHangulRuntime,
  hasBtConfig,
}) {
  if (hasHangulRuntime && hasBtConfig) return "hangul_bt";
  if (hasHangulRuntime) return "hangul";
  if (hasBtConfig) return "bt";
  return "clean";
}

export function getRuntimeStateLabel(runtimeState) {
  switch (runtimeState) {
    case "hangul":
      return "Input Engine Installed";
    case "bt":
      return "Bluetooth Installed";
    case "hangul_bt":
      return "Input Engine + Bluetooth Installed";
    default:
      return "Stock State";
  }
}

export function getSafetyStatus({
  connected,
  supported = true,
  runtimeState,
}) {
  if (!connected) {
    return {
      tone: "neutral",
      label: "Connection Required",
      description: "Verifying USB connection and SSH password will reveal device status.",
    };
  }

  if (!supported) {
    return {
      tone: "danger",
      label: "Unsupported Device",
      description: "Only Paper Pro models are supported.",
    };
  }

  return {
    tone: "safe",
    label: "Low Warranty Impact",
      description: runtimeState === "clean"
      ? "Device is currently in stock state."
      : runtimeState === "hangul_bt"
        ? "Both Input Engine and Bluetooth Helper are currently installed."
        : runtimeState === "bt"
          ? "Only Bluetooth Helper is currently installed."
          : "Only Input Engine runtime is currently installed.",
  };
}

export function getRecommendedAction({
  connected,
  supported = true,
  runtimeState,
}) {
  if (!connected) {
    return {
      id: "connect",
      title: "Check Device Connection",
      description: "Verify USB connection and SSH password first.",
      href: "/",
    };
  }

  if (!supported) {
    return {
      id: "unsupported",
      title: "Verify Supported Device",
      description: "Double-check if your model is supported.",
      href: "/",
    };
  }

  if (runtimeState === "clean") {
    return {
      id: "safe-install",
      title: "Start Secure Installation",
      description: "Begin Input Engine installation. Bluetooth Helper can also be prepared if needed.",
      href: "/install",
    };
  }

  if (runtimeState === "bt" || runtimeState === "hangul_bt") {
    return {
      id: "check-keyboard",
      title: "Verify Keyboard Connection",
      description: runtimeState === "bt"
        ? "Verify Bluetooth keyboard connection and input."
        : "Installation complete. Verify input on Type Folio or Bluetooth keyboard.",
      href: "/bluetooth",
    };
  }

  return {
      id: "open-manage",
      title: "Check Installation Status",
      description: "Input Engine runtime is currently installed. You can modify settings or run diagnostics.",
    href: "/manage",
  };
}

export function buildFailureRoutines({
  connected,
  checks,
}) {
  if (!connected) {
    return [
      {
        id: "usb-connection",
        title: "Check USB Connection",
        steps: [
          "Reconnect the USB cable.",
          "Ensure Developer mode and SSH are enabled on the device.",
          "Re-enter the SSH password in the settings screen.",
        ],
      },
    ];
  }

  const routines = [];
  const failingChecks = new Set(checks.filter((check) => !check.pass).map((check) => check.id));

  if (failingChecks.has("bt-config")) {
    routines.push({
      id: "bt-recovery",
      title: "Bluetooth Recovery Routine",
      steps: [
        "Turn Bluetooth off and back on for both the device and the keyboard.",
        "Put the keyboard into pairing mode and reconnect.",
        "If problems persist, perform a full uninstall and reinstall BT components only.",
      ],
    });
  }

  if (failingChecks.has("hangul-daemon")) {
    routines.push({
      id: "hangul-runtime",
      title: "Input Engine Runtime Recovery",
      steps: [
        "Restart the device once.",
        "Restart the daemon using `systemctl restart hangul-daemon`.",
        "If problems persist, run the installation again.",
      ],
    });
  }

  if (failingChecks.has("inactive-slot")) {
    routines.push({
      id: "update-recovery",
      title: "Re-prepare Update Slot",
      steps: [
        "Run the installation again in the current state.",
        "Before updating firmware, verify 'Update Slot Ready' in the device status card.",
      ],
    });
  }

  if (routines.length === 0) {
    routines.push({
      id: "default-check",
      title: "Next Steps",
      steps: [
        "Follow the recommended action card to proceed.",
        "Verify actual input in the installed input path.",
        "If issues occur, refresh the status card before attempting an uninstallation.",
      ],
    });
  }

  return routines;
}

export function buildOperationTimeline({
  connected,
  runtimeState,
  checks,
}) {
  const passing = new Set(checks.filter((check) => check.pass).map((check) => check.id));

  return [
    {
      id: "connection",
      label: "Connection",
      status: connected ? "done" : "pending",
      detail: connected ? "USB/SSH Verified" : "Pre-connection",
    },
    {
      id: "runtime",
      label: "Current State",
      status: connected ? "done" : "pending",
      detail: getRuntimeStateLabel(runtimeState),
    },
    {
      id: "reboot",
      label: "Boot Persistence",
      status: passing.has("reboot-ready") ? "done" : "pending",
      detail: passing.has("reboot-ready") ? "Active runtime ready" : "Check required",
    },
    {
      id: "update",
      label: "Update Slot",
      status: passing.has("inactive-slot") ? "done" : "pending",
      detail: passing.has("inactive-slot") ? "Inactive slot ready" : "Re-preparation required",
    },
    {
      id: "factory",
      label: "Reset Cleanup",
      status: runtimeState === "clean" || runtimeState === "hangul" || passing.has("factory-guard") ? "done" : "pending",
      detail: runtimeState === "hangul"
        ? "No guard required for current configuration"
        : passing.has("factory-guard") || runtimeState === "clean"
          ? "Cleanup path ready"
          : "Guard check required",
    },
  ];
}
