import { exec } from "child_process";
import fs from "fs";
import os from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

export const EXTRA_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/local/go/bin",
];

export type HostPlatformId = "macos" | "linux" | "wsl" | "unknown";
export type PackageManagerId =
  | "brew"
  | "apt-get"
  | "dnf"
  | "pacman"
  | "zypper"
  | "apk";

interface PackageManagerCandidate {
  id: PackageManagerId;
  label: string;
  paths: string[];
}

export interface HostPlatformInfo {
  id: HostPlatformId;
  label: string;
}

export interface ToolDefinition {
  name: string;
  command: string;
}

export interface ToolStatus extends ToolDefinition {
  installed: boolean;
}

export interface PackageManagerInfo {
  id: PackageManagerId | null;
  label: string;
  installed: boolean;
  canAutoInstall: boolean;
  needsPrivilegeEscalation: boolean;
  autoInstallHint?: string;
}

export const TOOL_DEFS: ToolDefinition[] = [
  { name: "ssh", command: "ssh" },
  { name: "scp", command: "scp" },
  { name: "sshpass", command: "sshpass" },
  { name: "zstd (for keyboard extraction)", command: "zstd" },
  { name: "go (for cross-compilation)", command: "go" },
  { name: "zig (for C cross-compilation)", command: "zig" },
];

const PACKAGE_MANAGERS: PackageManagerCandidate[] = [
  { id: "brew", label: "Homebrew", paths: ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"] },
  { id: "apt-get", label: "APT", paths: ["/usr/bin/apt-get", "/bin/apt-get"] },
  { id: "dnf", label: "DNF", paths: ["/usr/bin/dnf", "/bin/dnf"] },
  { id: "pacman", label: "pacman", paths: ["/usr/bin/pacman", "/bin/pacman"] },
  { id: "zypper", label: "zypper", paths: ["/usr/bin/zypper", "/bin/zypper"] },
  { id: "apk", label: "apk", paths: ["/sbin/apk", "/usr/sbin/apk", "/bin/apk"] },
];

const TOOL_PACKAGE_MAP: Record<PackageManagerId, Record<string, string>> = {
  brew: {
    ssh: "openssh",
    scp: "openssh",
    sshpass: "hudochenkov/sshpass/sshpass",
    zstd: "zstd",
    go: "go",
    zig: "zig",
  },
  "apt-get": {
    ssh: "openssh-client",
    scp: "openssh-client",
    sshpass: "sshpass",
    zstd: "zstd",
    go: "golang-go",
    zig: "zig",
  },
  dnf: {
    ssh: "openssh-clients",
    scp: "openssh-clients",
    sshpass: "sshpass",
    zstd: "zstd",
    go: "golang",
    zig: "zig",
  },
  pacman: {
    ssh: "openssh",
    scp: "openssh",
    sshpass: "sshpass",
    zstd: "zstd",
    go: "go",
    zig: "zig",
  },
  zypper: {
    ssh: "openssh-clients",
    scp: "openssh-clients",
    sshpass: "sshpass",
    zstd: "zstd",
    go: "go",
    zig: "zig",
  },
  apk: {
    ssh: "openssh-client",
    scp: "openssh-client",
    sshpass: "sshpass",
    zstd: "zstd",
    go: "go",
    zig: "zig",
  },
};

function isWslRuntime(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return true;
  }
  try {
    return fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

export function getHostPlatform(): HostPlatformInfo {
  const platform = os.platform();
  if (platform === "darwin") {
    return { id: "macos", label: "macOS" };
  }
  if (platform === "linux") {
    if (isWslRuntime()) {
      return { id: "wsl", label: "WSL" };
    }
    return { id: "linux", label: "Linux" };
  }
  return { id: "unknown", label: platform };
}

export function getExtendedPath(): string {
  return `${process.env.PATH}:${EXTRA_BIN_DIRS.join(":")}`;
}

async function findCommandPath(command: string, fallbackPaths: string[] = []): Promise<string | null> {
  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const { stdout } = await execAsync(`which ${command}`, {
      env: { ...process.env, PATH: getExtendedPath() },
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function isToolInstalled(command: string): Promise<boolean> {
  return Boolean(await findCommandPath(command));
}

function isRunningAsRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

async function hasPasswordlessSudo(): Promise<boolean> {
  if (isRunningAsRoot()) {
    return true;
  }
  try {
    await execAsync("sudo -n true", {
      env: { ...process.env, PATH: getExtendedPath() },
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function detectPackageManager(): Promise<PackageManagerInfo> {
  const host = getHostPlatform();
  const candidates =
    host.id === "macos"
      ? PACKAGE_MANAGERS.filter((candidate) => candidate.id === "brew")
      : PACKAGE_MANAGERS.filter((candidate) => candidate.id !== "brew");

  for (const candidate of candidates) {
    const binaryPath = await findCommandPath(candidate.id, candidate.paths);
    if (!binaryPath) continue;

    const needsPrivilegeEscalation = candidate.id !== "brew" && !isRunningAsRoot();
    const canAutoInstall = candidate.id === "brew"
      ? true
      : await hasPasswordlessSudo();

    return {
      id: candidate.id,
      label: candidate.label,
      installed: true,
      canAutoInstall,
      needsPrivilegeEscalation,
      autoInstallHint: candidate.id === "brew"
        ? "Installation can proceed directly in the browser."
        : canAutoInstall
          ? "Package manager and passwordless sudo privileges are available; automatic installation can proceed."
          : "Administrator privileges are required; you must execute terminal commands manually instead of automatic installation.",
    };
  }

  return {
    id: null,
    label: host.id === "macos" ? "Homebrew" : "Package Manager",
    installed: false,
    canAutoInstall: false,
    needsPrivilegeEscalation: false,
    autoInstallHint: host.id === "macos"
      ? "Please install Homebrew and check again."
      : "Supported package manager not found. You must install the required tools manually.",
  };
}

function getToolPackageName(managerId: PackageManagerId, toolCommand: string): string | null {
  return TOOL_PACKAGE_MAP[managerId][toolCommand] ?? null;
}

function dedupePackages(packages: string[]): string[] {
  return [...new Set(packages.filter(Boolean))];
}

function getCommandPrefix(managerId: PackageManagerId, interactiveSudo: boolean): string {
  if (managerId === "brew" || isRunningAsRoot()) {
    return "";
  }
  return interactiveSudo ? "sudo " : "sudo -n ";
}

export function buildBulkInstallCommand(
  managerId: PackageManagerId,
  toolCommands: string[],
  interactiveSudo = true,
): string {
  const packages = dedupePackages(
    toolCommands
      .map((toolCommand) => getToolPackageName(managerId, toolCommand))
      .filter((value): value is string => Boolean(value)),
  );
  const prefix = getCommandPrefix(managerId, interactiveSudo);

  switch (managerId) {
    case "brew":
      return `brew install ${packages.join(" ")}`;
    case "apt-get":
      return `${prefix}apt-get update && ${prefix}apt-get install -y ${packages.join(" ")}`;
    case "dnf":
      return `${prefix}dnf install -y ${packages.join(" ")}`;
    case "pacman":
      return `${prefix}pacman -Sy --noconfirm ${packages.join(" ")}`;
    case "zypper":
      return `${prefix}zypper install -y ${packages.join(" ")}`;
    case "apk":
      return `${prefix}apk add ${packages.join(" ")}`;
  }
}

export function buildSingleToolInstallCommand(
  managerId: PackageManagerId,
  toolCommand: string,
  interactiveSudo = false,
): string | null {
  const packageName = getToolPackageName(managerId, toolCommand);
  if (!packageName) return null;
  return buildBulkInstallCommand(managerId, [toolCommand], interactiveSudo);
}

export function getPackageManagerBootstrapHint(platform: HostPlatformInfo): string {
  if (platform.id === "macos") {
    return "Automatic installation of required tools cannot proceed without Homebrew.";
  }
  return "Supported package manager not found. Please install sshpass, zstd, go, and zig manually and check again.";
}

export function getPackageManagerActionLabel(platform: HostPlatformInfo): string | null {
  return platform.id === "macos" ? "Install Homebrew" : null;
}

export async function getToolStatuses(): Promise<ToolStatus[]> {
  const tools: ToolStatus[] = [];
  for (const def of TOOL_DEFS) {
    tools.push({
      ...def,
      installed: await isToolInstalled(def.command),
    });
  }
  return tools;
}
