[Read in Korean (한국어)](./README.ko.md)

# <img src="src/app/rekoit.png" alt="rekoit logo" width="40" valign="middle"> rekoit: Remarkable Korean Input Toolkit

rekoit is a toolkit designed to enable Korean input using the Type Folio and Bluetooth keyboards on the reMarkable Paper Pro and Paper Pro Move. It is optimized to minimize CPU and battery consumption.

> **⚠️ Disclaimer**
> - This tool is not official software from reMarkable AS.
> - Modifying your device's software may lead to issues, data loss, or voided warranties. You assume all responsibility for any consequences.
> - Developers and contributors are not liable for any changes or damages to your device.

---

## 1. Key Features

### 1.1 Korean Input Support
- **Korean Display Support:** Configures Korean fonts on the system to ensure Korean text is displayed correctly without broken characters.
- **Support for Various Input Devices:** Supports Korean input on both the official Type Folio and external Bluetooth Low Energy (BLE) keyboards.
- **Performance Optimization:** Provides a fast typing experience comparable to English input.
- **Language Switching:** Supports switching between Korean and English using `Shift + Space` and the right `Alt` key.
- **Special Symbols and Shortcuts:** Full support for brackets (`[`, `]`), braces (`{`, `}`), backticks (`` ` ``), and tildes (`~`) regardless of the input mode. For the Type Folio, standard layout brackets and braces take precedence over the printed symbols (`´`, `` ` ``, `~`, `¨`). In addition to the physical `Grave` key on external keyboards, `Ctrl + Shift + [` (backtick `` ` ``) and `Ctrl + Shift + ]` (tilde `~`) shortcuts are available on all keyboards.
- **Key Mapping Optimization:** Offers a feature to swap the positions of the left `CapsLock` and `Ctrl` keys for more efficient typing.

### 1.2 Bluetooth Stack Extension and Optimization
- **Enhanced Connection Stability:** Complements and extends reMarkable's unfinished Bluetooth stack to ensure stable connections with modern devices supporting Bluetooth 4.0 or higher.
- **Intelligent Auto-Reconnection:** Uses IRK (Identity Resolving Key) based tracking logic to resolve reconnection issues with modern keyboards that periodically rotate their MAC addresses for security.
- **Resource Optimization:** Minimizes battery consumption through exponential backoff and device state detection. It completely stops checks when the device is in Sleep mode and resets the interval immediately upon wake-up to ensure fast reconnection.
- **Integrated Management:** Provides step-by-step support for device scanning, pairing, and connection logs via a web browser.

### 1.3 Seamless Environment Maintenance
- **Automatic Recovery:** Automatically detects firmware updates upon reboot and reconfigures the Korean input environment.
- **Persistent Settings:** User settings (key mapping, Bluetooth pairing, etc.) are maintained even after reboots.

### 1.4 Web-based Management
- Provides an intuitive web UI for installation, Bluetooth pairing, font uploads, and device diagnostics.

---

## 2. Supported Devices and System Impact

### 2.1 Supported Models
| Device | Codename | Status |
|------|----------|------|
| Paper Pro | Ferrari | Supported |
| Paper Pro Move | Chiappa | Supported |
| reMarkable 2 | - | Not Supported |

### 2.2 Warranty and Stability
- **No Binary Modification:** Does not directly modify or patch the `xochitl` binary, which is the core executable of the device.
- **Non-destructive System Extension:** Utilizes Linux Bind Mount technology. Instead of overwriting original files on the physical disk, it "overlays" files prepared in virtual memory (`tmpfs`).
- **Verified Safety:** No changes are made to the actual original file system, ensuring zero risk of physical damage. Removing the installation immediately releases these virtual connections, returning the device to its pure stock state without any recovery process.
- **Secure Persistence:** User settings and the Korean input environment are safely maintained through a dedicated service (`rekoit-restore`) that automatically reconstructs these virtual connections at boot. A factory reset will completely wipe this service and all configuration data.

---

## 3. Installation Guide

### 3.1 Host PC Preparation

Ensure the following tools are installed on your host PC (macOS / Linux / WSL):

- **Node.js:** Version 18 or higher
- **Required Tools:** `ssh`, `scp`, `sshpass`, `zstd`, `go`, `zig`
- **Package Managers:** macOS (`Homebrew`), Linux (`apt`, `dnf`, `pacman`, `zypper`, `apk`, etc.)

#### 💻 Environment Quick Guide
- **macOS:** The most recommended environment. If `Homebrew` is installed, the web app can automatically install the required tools.
- **Linux:** If a supported package manager is available and non-interactive `sudo` is possible, automatic installation will be attempted. Otherwise, use the manual installation commands provided.
- **WSL:** Same as Linux, but tools must be installed inside the WSL environment. Access the web UI by opening `http://localhost:3000` in your Windows browser.

#### Manual Tool Installation Examples
```bash
# macOS
brew install hudochenkov/sshpass/sshpass zstd go zig

# Debian / Ubuntu / WSL
sudo apt-get update && sudo apt-get install -y openssh-client sshpass zstd golang-go
sudo snap install zig --classic --beta
```

### 3.2 Device Preparation and Recommended Installation

1. **Delete Existing ko-remark (Required):** If you are already using the [ko-remark](https://github.com/bncedgb-glitch/ko-remark) (by bncedgb-glitch) project, you **must** perform a "Full Uninstall" of ko-remark or a "Factory Reset" **before installing rekoit**.
2. **Recommended Installation Options:**
   - **Type Folio Only:** Installing only the "Korean Input Engine" is sufficient.
   - **With External Keyboard:** It is strongly recommended to include the "Bluetooth Helper" in your installation.
3. **Reinstallation and Recovery:** While using rekoit, you can reinstall at any time to update settings or recover a damaged environment without removing the existing installation.
4. **Enable Developer Mode:** Go to `Settings > General settings > Software > Advanced > Developer mode` and set it to `Enabled`.
5. **Check SSH Password:** Find your device's password in `Settings > Help > Copyrights and licenses > General Information > GPLv3 Compliance`.
6. **Disable Lock Screen:** It is recommended to temporarily disable your passcode as restarts may occur during installation.
7. **Connection:** Connect via USB-C cable (Default IP: `10.11.99.1`). For wireless connections, you might need to run the `rm-ssh-over-wlan on` command on the device.

### 3.3 Installation Steps via Web UI

1. **Run Web App:** Run `npm install` and then `npm run dev` in the source root.
2. **Step 1. Information Input:** Enter the IP address and SSH password and verify the connection.
3. **Step 2. Prerequisites:** Check the installation status of required tools on the host PC and install them if necessary.
4. **Step 3. Device Verification:** Final check of the device connection and model support.
5. **Step 4. Menu Selection:** Choose whether to install the Korean Input Engine and Bluetooth Helper. (Existing users select "Device Management")
6. **Step 5. Execute Installation:** The installation will proceed, followed by the Bluetooth pairing stage.

---

## 4. Management and Uninstallation

### 4.1 Uninstallation via Web UI
1. Select `Device Management` in `Step 4. Menu Selection` of the web app.
2. Select the desired item (Full Uninstall, Partial Removal, etc.) in the `Recovery and Removal` section at the bottom.
3. **Actions performed during Full Uninstall:**
   - Stops the `hangul-daemon` service and removes runtime files.
   - Cleans up Bluetooth services and pairing data.
   - Unmounts system libraries (`libepaper.so`).
   - Removes post-update hooks for firmware update compatibility.

### 4.2 Uninstallation via Factory Reset
Performing a factory reset from the device settings will delete all traces of installation, runtime services, and pairing data. You will need to check the newly generated SSH password if you connect via SSH after a reset.

---

## 5. Maintenance and Updates

### 5.1 Firmware Update Compatibility
rekoit is designed to recover automatically after a firmware update. When the device reboots after an update, the `rekoit-restore` service detects it and reconstructs the environment. If automatic recovery fails, please run the installation again via the web app.

---

## 6. Troubleshooting

- **SSH Connection Failure:** Double-check the USB cable, developer mode status, and the SSH password (case-sensitive).
- **Bluetooth Device Not Found:** Ensure your keyboard supports Bluetooth Low Energy (BLE). Older "Classic" Bluetooth models will not be discovered.
- **Package Installation Error:** If `sshpass` or `zstd` fails to install, refer to [Section 3.1](#31-host-pc-preparation) for manual installation.
- **Bluetooth Passkey Not Appearing:** Put the keyboard back into pairing mode or delete existing pairing info in "Device Management" and try again.

---

## 7. License and Credits

### 7.1 License
This project is distributed under the **MIT** License.

### 7.2 Credits & Acknowledgments
This project is an improved version based on the ideas and prototypes of the [ko-remark](https://github.com/bncedgb-glitch/ko-remark) (by bncedgb-glitch) project. It has been redesigned for stability and polished for production use. We express our deep gratitude to the original author for the creative inspiration.
