# Changelog

All notable changes to this project are documented in this file.

## [0.9.1] - 2026-04-22

### 🛠️ Improvements & Bug Fixes
- **Enhanced Persistence on OverlayFS:** Solved the issue where `/etc` changes were lost after reboot on devices with volatile partitions (e.g., reMarkable Paper Pro) by installing services directly into the persistent `/usr/lib/systemd/system`.
- **Improved Boot Reliability:** Added explicit `/home` mount dependencies to the restore service, ensuring recovery scripts are fully accessible before execution.
- **Bluetooth Recovery Fix:** Implemented automatic re-recreation of the Bluetooth kernel module configuration (`btnxpuart.conf`) during restore, ensuring correct UI status detection after reboot.
- **Optimized Recovery Cycle:** Streamlined the root partition remounting logic to minimize write operations and system impact during the boot process.
- **A/B Partition Synchronization:** Improved the firmware update safety by injecting recovery services directly into the inactive rootfs during installation.
- **Path Consistency:** Unified Hangul font paths across all system components (installation, restoration, and verification).

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
