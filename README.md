# TransferPilot

TransferPilot is a **system-level file transfer dashboard** designed to safely move large sets of files and folders to external drives (SSDs, HDDs, USB devices) with full visibility, guard rails, and auditability.

Built with **Tauri (Rust)** + **React** + **Tailwind**, it provides native performance with a modern UI.

---

## Features

- Detect mounted volumes (including external SSDs)
- Add **multiple files and folders** to a transfer queue
- Preflight guard rails:
  - total file count
  - total bytes
  - available destination space
  - conflict handling policy
- Copy (default) or Move (copy-then-delete) across volumes safely
- Automatic destination organization by:
  - **transfer session date**
  - **file type**
- Live progress tracking and cancellation
- Transfer report summary
- Generated `manifest.json` containing metadata for every transferred item

---

## Destination Layout

Transfers are created under the selected destination volume:

```
<SelectedVolume>/Transfers/YYYY-MM-DD_HHMMSS/
```

Each transfer session contains:

```
Folders/
Images/
Videos/
Audio/
Documents/
Archives/
Code/
Other/
manifest.json
```

The `manifest.json` records:
- source path
- destination path
- file size
- timestamps
- transfer status

---

## Running on macOS (Unsigned Build)

> **Important:** This project builds an **unsigned** macOS application by default.
> macOS Gatekeeper will block unsigned apps unless you explicitly allow them.

### Prerequisites

- **Node.js 18+** (includes npm)
- **Rust toolchain (stable)**
- macOS (Apple Silicon or Intel)

Install Rust if needed:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart your terminal after installation.

---

### Development Run (Recommended for local use)

```bash
npm install
npm run tauri dev
```

This launches the app in development mode with hot reload.

---

### Build the macOS App

```bash
npm run tauri build
```

Build artifacts will be generated under:

```
src-tauri/target/release/bundle/
```

Including:
- `macos/TransferPilot.app`
- `dmg/TransferPilot_<version>_*.dmg`

---

### Opening an Unsigned App on Another Mac

If you share the app or DMG and macOS reports:

> “TransferPilot is damaged and can’t be opened”

The recipient must run:

```bash
sudo xattr -dr com.apple.quarantine "/Applications/TransferPilot.app"
```

Then open the app normally.

This is expected behavior for unsigned, unnotarized apps.

---

## Code Signing & Notarization (Optional)

For frictionless distribution to other machines:
- Sign with **Developer ID Application**
- Notarize with Apple
- Staple the notarization ticket

This repository intentionally does **not** include signed binaries.

---

## Tech Stack

- **Tauri 2.x**
- **Rust**
- **React**
- **Vite**
- **Tailwind CSS**

---

## Project Status

TransferPilot is under active development and intended as:
- a reliable personal utility
- a portfolio-grade system application
- a foundation for future signed distribution

---

## License

MIT (or update as appropriate)
