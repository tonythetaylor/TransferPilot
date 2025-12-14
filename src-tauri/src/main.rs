#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod transfer;

use serde::{Deserialize, Serialize};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tauri::{State};

#[derive(Clone)]
struct CancelFlag(Arc<AtomicBool>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeInfo {
  pub name: String,
  pub mount_point: String,
  pub fs_type: Option<String>,
  pub total_bytes: u64,
  pub avail_bytes: u64,
  pub removable: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PickedItem {
  pub kind: String, // "file" | "folder"
  pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preflight {
  pub total_files: u64,
  pub total_folders: u64,
  pub total_bytes: u64,
  pub dest_avail_bytes: u64,
  pub will_fit: bool,
  pub by_category: std::collections::HashMap<String, u64>,
  pub by_extension: std::collections::HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferSummary {
  pub started_at: String,
  pub finished_at: String,
  pub duration_ms: u64,
  pub total_files: u64,
  pub total_bytes: u64,
  pub copied_files: u64,
  pub moved_files: u64,
  pub skipped_files: u64,
  pub error_files: u64,
  pub output_session_dir: String,
}

#[tauri::command]
fn cancel_transfer(flag: State<CancelFlag>) {
  flag.0.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn list_volumes() -> Result<Vec<VolumeInfo>, String> {
  use std::process::Command;

  // macOS/Linux: df -k gives 1K blocks, parse mount points + available
  let out = Command::new("df")
    .arg("-k")
    .output()
    .map_err(|e| format!("failed to run df: {e}"))?;

  let s = String::from_utf8_lossy(&out.stdout);
  let mut vols: Vec<VolumeInfo> = vec![];

  for (i, line) in s.lines().enumerate() {
    if i == 0 { continue; } // header
    // Typical df line: Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on
    // We care about Available and Mounted on; mount point is the last column(s)
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 6 { continue; }

    // Heuristic: available is usually column 3 or 4 depending; on macOS it's 3rd index = "Available"
    // Example: parts[0]=Filesystem parts[1]=1024-blocks parts[2]=Used parts[3]=Available parts[4]=Capacity ... parts[last]=Mounted
    let avail_kb = parts.get(3).and_then(|x| x.parse::<u64>().ok()).unwrap_or(0);
    let mount_point = parts.last().unwrap_or(&"").to_string();

    if mount_point.is_empty() { continue; }

    vols.push(VolumeInfo {
      name: mount_point.clone(),
      mount_point,
      fs_type: None,
      total_bytes: 0,
      avail_bytes: avail_kb * 1024,
      removable: None,
    });
  }

  Ok(vols)
}

#[tauri::command]
async fn pick_files(app: tauri::AppHandle) -> Result<Vec<transfer::QueueItem>, String> {
  use tauri_plugin_dialog::DialogExt;
  use tokio::sync::oneshot;

  let (tx, rx) = oneshot::channel();

  app.dialog()
    .file()
    .set_title("Add files")
    .pick_files(move |paths| {
      let _ = tx.send(paths);
    });

  let picked = rx.await.map_err(|e| format!("dialog receive error: {e}"))?;

  let mut out = vec![];
  if let Some(paths) = picked {
    for p in paths {
      out.push(transfer::QueueItem {
        id: uuid::Uuid::new_v4().to_string(),
        kind: "file".to_string(),
        path: p.to_string(),
        size_bytes: None,
        file_count: None,
      });
    }
  }
  Ok(out)
}

#[tauri::command]
async fn pick_folders(app: tauri::AppHandle) -> Result<Vec<transfer::QueueItem>, String> {
  use tauri_plugin_dialog::DialogExt;
  use tokio::sync::oneshot;

  let (tx, rx) = oneshot::channel();

  app.dialog()
    .file()
    .set_title("Add folders")
    .pick_folders(move |paths| {
      let _ = tx.send(paths);
    });

  let picked = rx.await.map_err(|e| format!("dialog receive error: {e}"))?;

  let mut out = vec![];
  if let Some(paths) = picked {
    for p in paths {
      out.push(transfer::QueueItem {
        id: uuid::Uuid::new_v4().to_string(),
        kind: "folder".to_string(),
        path: p.to_string(),
        size_bytes: None,
        file_count: None,
      });
    }
  }
  Ok(out)
}

#[tauri::command]
fn preflight_scan(items: Vec<PickedItem>, dest_mount_point: String) -> Result<Preflight, String> {
  transfer::preflight_scan(items, dest_mount_point)
}

#[tauri::command]
async fn start_transfer(
  app: tauri::AppHandle,
  items: Vec<PickedItem>,
  dest_mount_point: String,
  copy_mode: String,
  conflict_policy: String,
  verify_mode: String,
  flag: State<'_, CancelFlag>,
) -> Result<TransferSummary, String> {
  flag.0.store(false, Ordering::SeqCst);
  transfer::start_transfer(app, items, dest_mount_point, copy_mode, conflict_policy, verify_mode, flag.0.clone()).await
}

#[tauri::command]
fn add_dropped_paths(paths: Vec<String>) -> Result<Vec<transfer::QueueItem>, String> {
  use std::path::Path;

  let mut out: Vec<transfer::QueueItem> = vec![];

  for p in paths {
    if p.trim().is_empty() { continue; }
    let path = Path::new(&p);

    let kind = if path.is_dir() {
      "folder"
    } else {
      "file"
    };

    out.push(transfer::QueueItem {
      id: uuid::Uuid::new_v4().to_string(),
      kind: kind.to_string(),
      path: p,
      size_bytes: None,
      file_count: None,
    });
  }

  Ok(out)
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .manage(CancelFlag(Arc::new(AtomicBool::new(false))))
    .invoke_handler(tauri::generate_handler![
      list_volumes,
      pick_files,
      pick_folders,
      preflight_scan,
      start_transfer,
      cancel_transfer,
      add_dropped_paths
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
