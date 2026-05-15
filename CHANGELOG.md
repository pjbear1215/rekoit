# Changelog

All notable changes to this project are documented in this file.

## [0.9.6] - 2026-05-15

### 🚀 Introducing rekoit-daemon & Performance Breakthrough
- **Renamed to rekoit-daemon**: Fully rebranded the internal input engine from `hangul-daemon` to `rekoit-daemon`. This structural change prepares the toolkit for future multi-language extensibility while unifying the project's identity.
- **Static High-Frequency Cache**: Implemented a linguistic-driven static cache that permanently maps the top 20 most frequent Korean characters (이, 는, 다, 의, 가, 을, 에, 하, 거, 기, 고, 어, 한, 도, 를, 지, 있, 나, 만, 데) to dedicated hardware slots. This results in **instant, native-speed typing** for the vast majority of Korean text, with zero layout patching overhead.
- **Simplified Cache Management**: Replaced the complex LRU (Least Recently Used) algorithm with a streamlined Round-Robin dynamic pool for long-tail characters. This significantly reduces CPU overhead and improves predictability.

### ⌨️ Bulletproof Shortcuts & Stability
- **Full Shortcut Key Protection**: Permanently excluded all common shortcut keys (`A, B, C, F, I, N, O, V, W, X, Y, Z`) and their shifted variants from the patching pool. Shortcuts like `Ctrl+C`, `Ctrl+V`, and `Ctrl+A` now work natively 100% of the time without requiring dynamic layout restoration.
- **Stuck Key Prevention**: Implemented a physical key tracking system that guarantees the OS always receives 'KeyUp' events for bypassed keys. This fixes the major bug where keys like 'C' or 'V' would stay "stuck" if the Ctrl key was released first.
- **Native Selection Anchor Fix**: Resolved the issue where adding `Ctrl` to a `Shift+Arrow` selection would drop the selection anchor. By skipping redundant synthetic keystrokes during character finalization, the OS text engine remains completely stable.
- **Zero-Jitter Commit Logic**: Optimized the character commit process to skip redundant `Backspace + Character` sequences when the screen preview already matches the final character, ensuring zero UI jitter during rapid typing.

### 🛠️ Maintenance & Compatibility
- **Comprehensive Cleanup**: Updated all installation, restoration, and management scripts to ensure a clean transition from older `hangul-daemon` versions. Legacy service files and binaries are automatically detected and removed during updates.

## [0.9.5] - 2026-04-28

### 🌍 Bilingual Setup and Management UI
- **Dual-language UI Implementation**: Introduced a custom, lightweight internationalization system supporting both English (EN) and Korean (KO) for the entire installation and management process.
- **Auto Language Detection**: The application now automatically detects the user's browser language preference to provide the most relevant experience by default.
- **Language Switcher**: Added an elegant language toggle in the header, allowing users to switch between English and Korean at any time.
- **Globalized Documentation**: Provided a new English-first `README.md` and a dedicated `README.ko.md` for Korean users.
- **Improved Terminology**: Standardized on **"Korean Input Engine"** across the entire UI and documentation to better reflect its technical function.
- **Clean Codebase**: Translated internal comments, log messages, and UI fragments into English to improve maintainability for international contributors.

### ⌨️ Enhanced Bluetooth Compatibility
- **Classic Bluetooth Support**: Removed device discovery filters to support both Classic and LE (Low Energy) Bluetooth keyboards, broadening hardware compatibility for external input devices.

## [0.9.4] - 2026-04-25

### ✨ New Features & Improvements
- **Unified Special Key Support**: Enhanced the input stack to support brackets (`[`, `]`), braces (`{`, `}`), and grave/tilde (`` ` ``, `~`) keys across both Korean and English modes.
- **Improved Bluetooth Keyboard Compatibility**: Added full support for the physical `Grave` key on standard Bluetooth keyboards, bypassing reMarkable's native Type Folio-centric limitations.
- **Type Folio Optimized Shortcuts**: Implemented ergonomic shortcuts for Type Folio users: `Ctrl+Shift+[` for backtick (`` ` ``) and `Ctrl+Shift+]` for tilde (`~`), while prioritizing standard bracket input on physical keys.
- **Cross-Mode Consistency**: Ensured consistent special character output across all input modes by neutralizing virtual keyboard Shift-state interference.
- **Enhanced UI Guidance**: Updated the installation success screen with clear visual guides for new shortcuts and symbol mappings.

## [0.9.3] - 2026-04-24

### 🛠️ Critical Connectivity Fix
- **Fixed IRK Extraction Bug**: Resolved an issue where Bluetooth Identity Resolving Keys (IRK) were not extracted during pairing due to a case-sensitivity mismatch in MAC address paths. This fix ensures reliable auto-reconnection for keyboards using rotating random addresses (RPA).

## [0.9.2] - 2026-04-22

### 🛠️ Stabilization & Connectivity Fixes
- **Refined Bluetooth Recovery**: Fixed the race condition with system UI (xochitl) by restoring proper service ordering and implementing a 10-second persistent power-on loop.
- **Async Recovery Model**: Optimized `restore.sh` to handle heavy tasks in the background, preventing boot hangs while ensuring all components are eventually restored.
- **Enhanced UI Persistence**: Fixed a bug where Bluetooth status was incorrectly detected in the dashboard after reboot on OverlayFS devices.
- **Improved Removal Path**: Strengthened the uninstallation logic to thoroughly clean up persistent services and symlinks from all system partitions.
- **Updated Completion Guidance**: Modernized the installation success page with real-time Bluetooth device lists and accurate hardware keyboard shortcuts (Shift+Space / Right Alt).

## [0.9.1] - 2026-04-22

### 🛠️ Improvements & Bug Fixes
- **Enhanced Persistence on OverlayFS:** Solved the issue where `/etc` changes were lost after reboot on devices with volatile partitions (e.g., reMarkable Paper Pro) by installing services directly into the persistent `/usr/lib/systemd/system`.
- **Improved Boot Reliability:** Added explicit `/home` mount dependencies to the restore service, ensuring recovery scripts are fully accessible before execution.
- **Bluetooth Recovery Fix:** Implemented automatic re-recreation of the Bluetooth kernel module configuration (`btnxpuart.conf`) during restore, ensuring correct UI status detection after reboot.
- **Optimized Recovery Cycle:** Streamlined the root partition remounting logic to minimize write operations and system impact during the boot process.
- **A/B Partition Synchronization:** Improved the firmware update safety by injecting recovery services directly into the inactive rootfs during installation.
- **Path Consistency**: Unified Hangul font paths across all system components (installation, restoration, and verification).

## [0.9.0] - 2026-04-21

### 🚀 Introducing REKOIT
REKOIT is a professional Korean input and Bluetooth management toolkit for reMarkable devices, built with a focus on system stability, performance, and a seamless user experience.

### ✨ Key Features
- **High-Performance Typing Experience:**
  - Specialized Hangul input daemon with **delayed commit** and adaptive preview logic for a fast, responsive experience equivalent to native English input.
  - **System-wide Hangul Display:** Configures system fonts to ensure correct Hangul character rendering across all system menus and documents.
  - **Persistent Keyboard Mapping:** Native support for swapping **CapsLock** and **LeftCtrl** keys within the input stack for an ergonomic typing experience.
- **Intelligent Bluetooth Stack Extension:**
  - **Native Stack Enhancement:** Technologically extends the incomplete reMarkable Bluetooth stack to ensure stable connectivity with modern Bluetooth 4.0+ devices.
  - **Smart Reconnection Engine:** Extracts **Identity Resolving Keys (IRK)** during pairing to accurately track and identify keyboards that periodically rotate their addresses for security.
  - **Dynamic System Updates:** Automatically updates system data with newly detected addresses, guiding the native stack to achieve seamless reconnection without manual re-pairing.
  - **Optimized Resource Management:** Implements **Exponential Backoff** logic (10s to 300s) to minimize impact. Polling is completely suspended when the device is inactive/suspended, with an immediate refresh on Wake-up for instant connectivity.
  - **Unified Management Dashboard:** Provides real-time status indicators, pairing logs, and secure removal logic that clears associated system data and IRKs.
- **Comprehensive Platform Support:** Full support for **macOS**, **Linux**, and **WSL** (Windows Subsystem for Linux), including automatic dependency detection and guided setup.
- **Safety-First Installation:**
  - Built-in technical transparency guides explaining the non-destructive nature of the toolkit.
  - Mandatory environment checks to ensure a safe and successful setup process.

### 🛡️ Technical Excellence & Reliability
- **Non-Destructive Architecture:** Utilizes **Bind Mounts** and `tmpfs` to patch system libraries in memory, ensuring the physical root filesystem remains completely untouched and pristine.
- **Robust Persistence:** Features a dedicated `rekoit-restore` systemd service that automatically reconstructs the environment after OS updates or reboots.
- **Clean System Integrity:** Operates without modifying standard shell configuration files (`.bashrc`, `.profile`), maintaining a standard and predictable system environment.
- **Atomic Asset Management:** Smart installation logic that dynamically handles fonts and binaries to keep the setup process lightweight and reliable.
- **Self-Healing Design:** Supports re-installing over existing setups to easily update configurations or restore functionality without a full uninstall.
