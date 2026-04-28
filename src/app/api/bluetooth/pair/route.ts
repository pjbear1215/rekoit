import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { getSshSessionFromRequest } from "@/lib/server/sshSession";
import {
  buildBluetoothCleanupScript,
  buildBluetoothPairSessionScript,
  classifyBluetoothJournalIssue,
  extractLatestMatchingDeviceAddress,
  extractDisplayedPasskey,
  isBluetoothReadyStatus,
  parseBluetoothInfoStatus,
  shouldTreatPairingAttemptAsSuccess,
  sanitizeBluetoothLine,
} from "@/lib/bluetooth/bluetoothPairing.js";

function persistBluetoothPowerState(
  session: { ip: string; password: string },
  value: "0" | "1",
): Promise<void> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      SSHPASS: session.password,
      PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`,
    };
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
        "ConnectTimeout=20",
        `root@${session.ip}`,
        `
STATE_FILE="/home/root/rekoit/install-state.conf"
if [ -f "$STATE_FILE" ]; then
  if grep -q '^BLUETOOTH_POWER_ON=' "$STATE_FILE" 2>/dev/null; then
    sed -i 's/^BLUETOOTH_POWER_ON=.*/BLUETOOTH_POWER_ON=${value}/' "$STATE_FILE" 2>/dev/null || true
  else
    printf '\nBLUETOOTH_POWER_ON=${value}\n' >> "$STATE_FILE"
  fi
fi
        `,
      ],
      { env },
    );
    proc.on("close", () => resolve());
    proc.on("error", () => resolve());
  });
}

function persistBluetoothDeviceDetails(
  session: { ip: string; password: string },
  address: string,
  name: string,
  irk: string = "",
): Promise<void> {
  if (!/^[0-9A-Fa-f:]+$/.test(address)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      SSHPASS: session.password,
      PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`,
    };
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
        "ConnectTimeout=20",
        `root@${session.ip}`,
        `
STATE_FILE="/home/root/rekoit/install-state.conf"
mkdir -p /home/root/rekoit
INSTALL_HANGUL=0
INSTALL_BT=0
BLUETOOTH_POWER_ON=0
SWAP_LEFT_CTRL_CAPSLOCK=0
BT_DEVICE_ADDRESS=""
BT_DEVICE_NAME=""
BT_DEVICE_IRK=""
KEYBOARD_LOCALES=""
if [ -f "$STATE_FILE" ]; then
  . "$STATE_FILE"
fi
BT_DEVICE_ADDRESS="${address}"
BT_DEVICE_NAME="${name.replace(/"/g, '\\"')}"
BT_DEVICE_IRK="${irk}"
printf 'INSTALL_HANGUL=%s\nINSTALL_BT=%s\nBLUETOOTH_POWER_ON=%s\nSWAP_LEFT_CTRL_CAPSLOCK=%s\nBT_DEVICE_ADDRESS="%s"\nBT_DEVICE_NAME="%s"\nBT_DEVICE_IRK="%s"\nKEYBOARD_LOCALES="%s"\n' "\${INSTALL_HANGUL:-0}" "\${INSTALL_BT:-0}" "\${BLUETOOTH_POWER_ON:-0}" "\${SWAP_LEFT_CTRL_CAPSLOCK:-0}" "$BT_DEVICE_ADDRESS" "$BT_DEVICE_NAME" "$BT_DEVICE_IRK" "\${KEYBOARD_LOCALES:-}" > "$STATE_FILE"
        `,
      ],
      { env },
    );
    proc.on("close", () => resolve());
    proc.on("error", () => resolve());
  });
}

function extractBluetoothIrk(
  session: { ip: string; password: string },
  address: string,
): Promise<string> {
  return new Promise(async (resolve) => {
    const env = {
      ...process.env,
      SSHPASS: session.password,
      PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`,
    };

    // Try multiple times as BlueZ might be slow writing to disk
    for (let i = 0; i < 5; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1000));

      const proc = spawn(
        "sshpass",
        [
          "-e",
          "ssh",
          "-o", "StrictHostKeyChecking=no",
          "-o", "UserKnownHostsFile=/dev/null",
          "-o", "ConnectTimeout=10",
          `root@${session.ip}`,
          `cat /var/lib/bluetooth/*/${address.toUpperCase()}/info 2>/dev/null | grep -A1 '\\[IdentityResolvingKey\\]' | grep 'Key=' | cut -d= -f2 | head -n 1`,
        ],
        { env },
      );
      
      let output = "";
      await new Promise<void>((res) => {
        proc.stdout.on("data", (data: Buffer) => { output += data.toString(); });
        proc.on("close", () => res());
        proc.on("error", () => res());
      });

      const key = output.trim();
      if (key) {
        resolve(key);
        return;
      }
    }
    resolve("");
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const address = searchParams.get("address") ?? "";
  const name = (searchParams.get("name") ?? "").replace(/[^a-zA-Z0-9\s-]/g, "");
  const timeoutParam = searchParams.get("timeout");
  const scanTimeout = timeoutParam ? parseInt(timeoutParam, 10) : 15;
  const session = getSshSessionFromRequest(request);

  if (!session || !address) {
    return new Response("Invalid parameters", { status: 400 });
  }

  if (!/^[0-9A-Fa-f:]+$/.test(address)) {
    return new Response("Invalid BT address", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: Record<string, unknown>): void => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      try {
        send("status", { message: "Preparing for pairing..." });

        const env = { ...process.env, SSHPASS: session.password, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` };

        // [MODIFIED] Force fresh pairing session even if device seems paired.
        // This ensures the user can re-pair when switching channels or fixing connection issues.
        let resolvedAddress = address;

        const pairScript = buildBluetoothPairSessionScript({ address, name, scanTimeout });
        const localScriptPath = path.join(os.tmpdir(), `rekoit-pair-${Date.now()}.sh`);
        const remoteScriptPath = `/tmp/rekoit-pair-${Date.now()}.sh`;
        await fs.writeFile(localScriptPath, pairScript, "utf8");

        await new Promise<void>((resolve, reject) => {
          const scpProc = spawn(
            "sshpass",
            [
              "-e",
              "scp",
              "-o",
              "StrictHostKeyChecking=no",
              "-o",
              "UserKnownHostsFile=/dev/null",
              localScriptPath,
              `root@${session.ip}:${remoteScriptPath}`,
            ],
            { env },
          );
          let stderr = "";
          scpProc.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
          scpProc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr.trim() || `scp exit ${code}`));
          });
          scpProc.on("error", reject);
        });

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
            `root@${session.ip}`,
            `sh ${remoteScriptPath}; rm -f ${remoteScriptPath}`,
          ],
          { env },
        );

        let passkeySent = false;
        let pairResultSent = false;
        let pairStarted = false;
        let persistPowerOnAfterProcess = false;

        const handleChunk = (data: Buffer, source: "stdout" | "stderr"): void => {
          const output = data.toString();
          const lines = output.split("\n");
          for (const line of lines) {
            const stripped = sanitizeBluetoothLine(line);
            if (!stripped) continue;

            if (
              source === "stderr" &&
              (stripped.includes("Permanently added") ||
                stripped.startsWith("Connection to "))
            ) {
              continue;
            }

            // Handle LOG| prefix from shell script
            if (stripped.startsWith("LOG|")) {
              const msg = stripped.replace("LOG|", "").trim();
              send("log", { line: `INFO: ${msg}` });
              
              // Map specific logs to user-friendly status messages
              if (msg.includes("Cleaning up")) send("status", { message: "Cleaning up system environment..." });
              if (msg.includes("Deleting existing connection")) send("status", { message: "Deleting existing connection info..." });
              if (msg.includes("interactive Bluetooth agent")) send("status", { message: "Running pairing agent..." });
              if (msg.includes("Searching for device")) send("status", { message: "Searching for device..." });
              if (msg.includes("Waiting for pairing response")) send("status", { message: "Waiting for keyboard response..." });
              if (msg.includes("successful")) send("status", { message: "Connection successful! Wrapping up..." });
              
              continue;
            }

            // High-level progress logs
            if (stripped.includes("INTERACTIVE_START")) {
              send("log", { line: "--- Starting interactive pairing session ---" });
            } else if (stripped.startsWith("CMD>")) {
              const cmd = stripped.replace("CMD>", "").trim();
              send("log", { line: `EXEC: bluetoothctl ${cmd}` });
              continue;
            }

            // Enhanced diagnostic logging
            if (
              stripped &&
              !stripped.includes("AUTO_SENT_YES") &&
              !stripped.startsWith("[NEW] Controller") &&
              !stripped.startsWith("[CHG] Controller")
            ) {
              const displayLine = stripped.startsWith("[") ? `BTCTL: ${stripped}` : `INFO: ${stripped}`;
              send("log", { line: displayLine });
            }

            if (!pairResultSent && stripped.includes("DEVICE_NOT_FOUND")) {
              pairResultSent = true;
              const msg = `Device (${address}) not found. Ensure your keyboard is still in pairing mode.`;
              send("log", { line: `ERROR: ${msg}` });
              send("paired", { success: false });
            }

            if (stripped.includes("Attempting to pair")) {
              pairStarted = true;
              send("log", { line: "INFO: Starting pairing procedure..." });
              send("waiting_passkey", {
                message: "Requesting pairing...",
              });
            }

            if (stripped.startsWith("PAIRED_ADDR:")) {
              const pairedAddress = stripped.replace("PAIRED_ADDR:", "").trim();
              if (pairedAddress) {
                resolvedAddress = pairedAddress;
                send("log", { line: `INFO: Target address confirmed (${resolvedAddress})` });
              }
            }

            // Passkey detection
            if (!passkeySent) {
              const displayedPasskey = extractDisplayedPasskey(stripped);
              if (displayedPasskey) {
                passkeySent = true;
                send("log", { line: `PASSKEY: ${displayedPasskey} generated` });
                send("passkey", {
                  passkey: displayedPasskey,
                  message: `Type ${displayedPasskey} on your keyboard and press Enter`,
                });
              }
            }

            // Pairing success
            if (!pairResultSent) {
              if (
                stripped.includes("PAIR_SUCCESS") ||
                stripped.includes("Pairing successful")
              ) {
                pairResultSent = true;
                persistPowerOnAfterProcess = true;
                void (async () => {
                  const irk = await extractBluetoothIrk(session, resolvedAddress);
                  if (irk) send("log", { line: "INFO: IRK extraction complete" });
                  await persistBluetoothDeviceDetails(session, resolvedAddress, name, irk);
                })();
                send("log", { line: "SUCCESS: Pairing and connection successful" });
                send("paired", { success: true, address: resolvedAddress });
              } else if (stripped.includes("PAIR_PARTIAL")) {
                send("log", { line: "WARN: Paired but connection is incomplete. Try again or wake your keyboard." });
              }
            }

            // Pairing failure judgment (changed to be more conservative)
            if (!pairResultSent && pairStarted) {
              if (
                stripped.includes("PAIR_FAILED") ||
                (stripped.includes("Failed to pair") && !stripped.includes("InProgress") && !stripped.includes("not found")) ||
                stripped.includes("Authentication Failed") ||
                stripped.includes("Authentication Rejected") ||
                stripped.includes("AuthenticationCanceled")
                // 'Paired: no' is excluded (may be in a waiting state)
              ) {
                pairResultSent = true;
                let failMsg = "Pairing failed";
                if (stripped.includes("Authentication Failed")) failMsg = "Authentication failed (potential passkey entry error)";
                if (stripped.includes("Authentication Rejected")) failMsg = "Pairing rejected by device";
                if (stripped.includes("AuthenticationCanceled")) failMsg = "Pairing cancelled";

                send("log", { line: `ERROR: ${failMsg}` });
                send("paired", { success: false });
              }
            }
          }
        };

        proc.stdout.on("data", (data: Buffer) => {
          handleChunk(data, "stdout");
        });

        proc.stderr.on("data", (data: Buffer) => {
          handleChunk(data, "stderr");
        });

        let procTimeout: ReturnType<typeof setTimeout> | null = null;
        await new Promise<void>((resolve) => {
          proc.on("close", (code) => {
            send("log", { line: `PAIR_PROC_CLOSED: ${code ?? "null"}` });
            if (procTimeout) clearTimeout(procTimeout);
            resolve();
          });
          procTimeout = setTimeout(() => {
            send("log", { line: "PAIR_PROC_TIMEOUT" });
            proc.kill();
            resolve();
          }, 120000);
        });

        if (!pairResultSent) {
          const infoProc = spawn(
            "sshpass",
            [
              "-e",
              "ssh",
              "-o",
              "StrictHostKeyChecking=no",
              "-o",
              "UserKnownHostsFile=/dev/null",
              "-o",
              "ConnectTimeout=20",
              `root@${session.ip}`,
              `bluetoothctl info ${address} 2>/dev/null || true`,
            ],
            { env },
          );
          let infoOutput = "";
          await new Promise<void>((resolve) => {
            infoProc.stdout.on("data", (data: Buffer) => {
              infoOutput += data.toString();
            });
            infoProc.on("close", () => resolve());
            infoProc.on("error", () => resolve());
          });

          const infoStatus = parseBluetoothInfoStatus(infoOutput);
          let finalInfoStatus = infoStatus;

          if (!(finalInfoStatus.paired || finalInfoStatus.bonded || finalInfoStatus.trusted) && name) {
            const devicesProc = spawn(
              "sshpass",
              [
                "-e",
                "ssh",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "UserKnownHostsFile=/dev/null",
                "-o",
                "ConnectTimeout=20",
                `root@${session.ip}`,
                "bluetoothctl devices || true",
              ],
              { env },
            );
            let devicesOutput = "";
            await new Promise<void>((resolve) => {
              devicesProc.stdout.on("data", (data: Buffer) => {
                devicesOutput += data.toString();
              });
              devicesProc.on("close", () => resolve());
              devicesProc.on("error", () => resolve());
            });

            const latestAddress = extractLatestMatchingDeviceAddress(devicesOutput, name);
            if (latestAddress && latestAddress !== address) {
              const latestInfoProc = spawn(
                "sshpass",
                [
                  "-e",
                  "ssh",
                  "-o",
                  "StrictHostKeyChecking=no",
                  "-o",
                  "UserKnownHostsFile=/dev/null",
                  "-o",
                  "ConnectTimeout=20",
                  `root@${session.ip}`,
                  `bluetoothctl info ${latestAddress} 2>/dev/null || true`,
                ],
                { env },
              );
              let latestInfoOutput = "";
              await new Promise<void>((resolve) => {
                latestInfoProc.stdout?.on("data", (data: Buffer) => {
                  latestInfoOutput += data.toString();
                });
                latestInfoProc.on("close", () => resolve());
                latestInfoProc.on("error", () => resolve());
              });
              finalInfoStatus = parseBluetoothInfoStatus(latestInfoOutput);
            }
          }

        if (shouldTreatPairingAttemptAsSuccess(finalInfoStatus)) {
          if (name) {
            const devicesProc = spawn(
              "sshpass",
              [
                "-e",
                "ssh",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "UserKnownHostsFile=/dev/null",
                "-o",
                "ConnectTimeout=20",
                `root@${session.ip}`,
                "bluetoothctl devices || true",
              ],
              { env },
            );
            let devicesOutput = "";
            await new Promise<void>((resolve) => {
              devicesProc.stdout.on("data", (data: Buffer) => {
                devicesOutput += data.toString();
              });
              devicesProc.on("close", () => resolve());
              devicesProc.on("error", () => resolve());
            });
            const latestAddress = extractLatestMatchingDeviceAddress(devicesOutput, name);
            if (latestAddress) {
              resolvedAddress = latestAddress;
            }
          }
          await persistBluetoothPowerState(session, "1");
          const irk = await extractBluetoothIrk(session, resolvedAddress);
          await persistBluetoothDeviceDetails(session, resolvedAddress, name, irk);
          pairResultSent = true;
          send("paired", { success: true, address: resolvedAddress });
        } else {
          const journalProc = spawn(
            "sshpass",
            [
              "-e",
              "ssh",
              "-o",
              "StrictHostKeyChecking=no",
              "-o",
              "UserKnownHostsFile=/dev/null",
              "-o",
              "ConnectTimeout=20",
              `root@${session.ip}`,
              `journalctl -u bluetooth --no-pager -n 80 | grep '${address}' || true`,
            ],
            { env },
          );
          let journalOutput = "";
          await new Promise<void>((resolve) => {
            journalProc.stdout.on("data", (data: Buffer) => {
              journalOutput += data.toString();
            });
            journalProc.on("close", () => resolve());
            journalProc.on("error", () => resolve());
          });

          const journalIssue = classifyBluetoothJournalIssue(journalOutput);
          if (journalIssue === "hog_accept_failed") {
            send("error", {
              message: "The selected profile failed to accept the input profile. Try a different Bluetooth profile on the same keyboard.",
            });
          }
        }
      }

      if (persistPowerOnAfterProcess) {
        await persistBluetoothPowerState(session, "1");
        // Give BlueZ time to write the info file
        await new Promise((r) => setTimeout(r, 1000));
        const irk = await extractBluetoothIrk(session, resolvedAddress);
        await persistBluetoothDeviceDetails(session, resolvedAddress, name, irk);
      }

      send("complete", {});
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      send("error", { message: msg });
    } finally {
      closed = true;
      // Ensure sentinel file deletion and service start upon pairing process termination
      const cleanupCmd = `
        rm -f /tmp/rekoit-setup-active /tmp/rekoit-pair-*.sh
        ${buildBluetoothCleanupScript()}
        systemctl start rekoit-bt-wake-reconnect.service 2>/dev/null || true
      `;

      const cleanupProc = spawn(
        "sshpass",
        [
          "-e",
          "ssh",
          "-o",
          "StrictHostKeyChecking=no",
          "-o",
          "UserKnownHostsFile=/dev/null",
          "-o",
          "ConnectTimeout=20",
          `root@${session.ip}`,
          cleanupCmd,
        ],
        { env: { ...process.env, SSHPASS: session.password } },
      );
      cleanupProc.on("close", () => {
        try { controller.close(); } catch {}
      });
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
