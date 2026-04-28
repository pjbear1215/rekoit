import { NextResponse } from "next/server";
import { spawn } from "child_process";

import {
  buildBulkInstallCommand,
  buildSingleToolInstallCommand,
  detectPackageManager,
  getHostPlatform,
  getPackageManagerActionLabel,
  getPackageManagerBootstrapHint,
  getToolStatuses,
} from "@/lib/remarkable/prerequisites";

async function getSnapshot() {
  const platform = getHostPlatform();
  const packageManager = await detectPackageManager();
  const tools = await getToolStatuses();
  const missingTools = tools.filter((tool) => !tool.installed);
  const allReady = missingTools.length === 0;

  return {
    tools,
    allReady,
    platform,
    packageManager: {
      label: packageManager.label,
      installed: packageManager.installed,
      canAutoInstall: packageManager.canAutoInstall,
      hint: allReady && !packageManager.installed
        ? "Required tools are already prepared."
        : packageManager.autoInstallHint,
      actionLabel: packageManager.installed ? null : getPackageManagerActionLabel(platform),
      bootstrapHint: getPackageManagerBootstrapHint(platform),
    },
    manualInstallCommand:
      missingTools.length > 0 && packageManager.id
        ? buildBulkInstallCommand(
            packageManager.id,
            missingTools.map((tool) => tool.command),
            true,
          )
        : "",
  };
}

// GET: Check status (for polling, returns quickly)
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await getSnapshot());
}

// POST: Helper actions
export async function POST(request: Request): Promise<NextResponse> {
  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { action } = body;

  if (action === "open-brew-install") {
    const platform = getHostPlatform();
    if (platform.id !== "macos") {
      return NextResponse.json({ error: "Only supported on macOS" }, { status: 400 });
    }
    try {
      const appleScript = [
        'tell application "Terminal"',
        "  activate",
        '  do script "/bin/bash -c \\"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\\""',
        "end tell",
      ].join("\n");

      await new Promise<void>((resolve, reject) => {
        const proc = spawn("osascript", ["-e", appleScript]);
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`osascript exit code ${code}`));
        });
        proc.on("error", reject);
      });
      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json(
        { error: "Unable to open Terminal" },
        { status: 500 },
      );
    }
  }

  if (action === "install-tools") {
    const packageManager = await detectPackageManager();
    if (!packageManager.id || !packageManager.installed) {
      return NextResponse.json(
        { error: "No package manager found for automatic installation" },
        { status: 400 },
      );
    }
    if (!packageManager.canAutoInstall) {
      return NextResponse.json(
        { error: "Automatic installation from browser is not possible as administrator privileges are required" },
        { status: 400 },
      );
    }

    const tools = await getToolStatuses();
    const results: Record<string, boolean> = {};
    for (const tool of tools) {
      if (tool.installed) {
        results[tool.command] = true;
        continue;
      }

      const command = buildSingleToolInstallCommand(packageManager.id, tool.command, false);
      if (!command) {
        results[tool.command] = false;
        continue;
      }

      try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        await execAsync(command, {
          timeout: 300000,
          env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin:/usr/local/go/bin` },
        });
        const refreshed = await getToolStatuses();
        results[tool.command] = refreshed.find((entry) => entry.command === tool.command)?.installed === true;
      } catch {
        results[tool.command] = false;
      }
    }

    return NextResponse.json({ results });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
