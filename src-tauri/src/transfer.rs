use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
  collections::HashMap,
  fs,
  io::{Read, Write},
  path::{Path, PathBuf},
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
  },
  time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::{PickedItem, Preflight, TransferSummary};

/* ----------------------------------- Types ---------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
  pub id: String,
  pub kind: String, // "file" | "folder"
  pub path: String,
  pub size_bytes: Option<u64>,
  pub file_count: Option<u64>,
}

#[derive(Debug, Clone)]
struct FileEntry {
  src: PathBuf,
  // If it came from a folder pick, this is Some(<folder_basename>/<relative_path_inside_folder>)
  // If it came from a loose file pick, this is None
  folder_rel: Option<PathBuf>,
}

/* --------------------------------- Progress -------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
  pub phase: String, // "scanning" | "copying" | "verifying" | "done" | "cancelled" | "error"
  pub current_file: u64, // 1-based
  pub total_files: u64,
  pub current_path: String,
  pub bytes_done: u64,
  pub bytes_total: u64,
  pub percent: f64, // 0..=100
}

fn emit_progress(app: &AppHandle, p: &TransferProgress) {
  let _ = app.emit("transfer://progress", p.clone());
}

fn pct(bytes_done: u64, bytes_total: u64) -> f64 {
  if bytes_total == 0 {
    0.0
  } else {
    ((bytes_done as f64) / (bytes_total as f64) * 100.0).clamp(0.0, 100.0)
  }
}

/* ---------------------------------- Storage -------------------------------- */

pub fn avail_bytes_for_mount(mount_point: &str) -> Result<u64, String> {
  use std::process::Command;

  let out = Command::new("df")
    .arg("-k")
    .arg(mount_point)
    .output()
    .map_err(|e| format!("failed to run df: {e}"))?;

  let s = String::from_utf8_lossy(&out.stdout);
  let mut lines = s.lines();
  lines.next(); // header
  if let Some(line) = lines.next() {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() >= 4 {
      let avail_kb = parts[3].parse::<u64>().unwrap_or(0);
      return Ok(avail_kb * 1024);
    }
  }
  Ok(0)
}

/* ----------------------------- Local time helpers ---------------------------- */
/* Uses chrono because it's reliable cross-OS and doesn't require time crate local offset features. */

fn day_stamp_local() -> String {
  // e.g. 2025-12-13
  chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn time_stamp_local() -> String {
  // e.g. 185354 (HHMMSS)
  chrono::Local::now().format("%H%M%S").to_string()
}

fn now_local_rfc3339() -> String {
  chrono::Local::now().to_rfc3339()
}

/* --------------------------------- Categorize -------------------------------- */

fn category_for(path: &Path) -> (String, String) {
  let ext = path
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or("")
    .to_lowercase();

  let mime = mime_guess::from_ext(&ext).first_or_octet_stream();

  let cat = if mime.type_() == mime_guess::mime::IMAGE {
    "Images"
  } else if mime.type_() == mime_guess::mime::VIDEO {
    "Videos"
  } else if mime.type_() == mime_guess::mime::AUDIO {
    "Audio"
  } else if [
    "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md", "rtf", "csv", "json",
  ]
  .contains(&ext.as_str())
  {
    "Documents"
  } else if ["zip", "7z", "rar", "tar", "gz", "bz2"].contains(&ext.as_str()) {
    "Archives"
  } else if [
    "js", "ts", "tsx", "jsx", "py", "go", "java", "kt", "rs", "c", "cpp", "h", "hpp", "cs", "rb",
    "php", "sh", "yaml", "yml", "toml",
  ]
  .contains(&ext.as_str())
  {
    "Code"
  } else {
    "Other"
  };

  (
    cat.to_string(),
    if ext.is_empty() {
      "noext".to_string()
    } else {
      ext
    },
  )
}

/* ---------------------------------- Scanning -------------------------------- */

fn scan_entries(items: &[PickedItem]) -> Result<Vec<FileEntry>, String> {
  let mut out: Vec<FileEntry> = vec![];

  for it in items {
    let p = PathBuf::from(&it.path);

    if it.kind == "file" {
      if p.is_file() {
        out.push(FileEntry {
          src: p,
          folder_rel: None,
        });
      }
      continue;
    }

    // folder
    if p.is_dir() {
      let folder_base = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Folder")
        .to_string();

      for e in WalkDir::new(&p).into_iter().filter_map(|e| e.ok()) {
        if e.file_type().is_file() {
          let full = e.path().to_path_buf();
          let rel_inside = full.strip_prefix(&p).unwrap_or(&full);
          let rel = PathBuf::from(&folder_base).join(rel_inside);

          out.push(FileEntry {
            src: full,
            folder_rel: Some(rel),
          });
        }
      }
    }
  }

  Ok(out)
}

pub fn preflight_scan(items: Vec<PickedItem>, dest_mount_point: String) -> Result<Preflight, String> {
  let entries = scan_entries(&items)?;

  let mut total_bytes: u64 = 0;
  let mut by_category: HashMap<String, u64> = HashMap::new();
  let mut by_extension: HashMap<String, u64> = HashMap::new();

  for ent in &entries {
    let meta = fs::metadata(&ent.src).map_err(|e| format!("metadata error: {e}"))?;
    total_bytes = total_bytes.saturating_add(meta.len());

    let (cat, ext) = category_for(&ent.src);
    *by_category.entry(cat).or_insert(0) += 1;
    *by_extension.entry(format!(".{ext}")).or_insert(0) += 1;
  }

  let dest_avail = crate::transfer::avail_bytes_for_mount(&dest_mount_point).unwrap_or(0);

  Ok(Preflight {
    total_files: entries.len() as u64,
    total_folders: items.iter().filter(|x| x.kind == "folder").count() as u64,
    total_bytes,
    dest_avail_bytes: dest_avail,
    will_fit: dest_avail >= total_bytes,
    by_category,
    by_extension,
  })
}

/* -------------------------------- File helpers ------------------------------- */

fn ensure_dir(p: &Path) -> Result<(), String> {
  fs::create_dir_all(p).map_err(|e| format!("mkdir error: {e}"))
}

fn unique_dest_path(dest: &Path) -> PathBuf {
  if !dest.exists() {
    return dest.to_path_buf();
  }
  let stem = dest.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
  let ext = dest.extension().and_then(|s| s.to_str()).unwrap_or("");
  let parent = dest.parent().unwrap_or_else(|| Path::new("."));
  for i in 1..=9999 {
    let name = if ext.is_empty() {
      format!("{stem} ({i})")
    } else {
      format!("{stem} ({i}).{ext}")
    };
    let candidate = parent.join(name);
    if !candidate.exists() {
      return candidate;
    }
  }
  dest.to_path_buf()
}

fn copy_file_streamed(
  src: &Path,
  dst: &Path,
  cancel: &Arc<AtomicBool>,
  bytes_done: &mut u64,
  bytes_total: u64,
  app: &AppHandle,
  current_file: u64,
  total_files: u64,
) -> Result<(), String> {
  if let Some(parent) = dst.parent() {
    ensure_dir(parent)?;
  }

  let mut in_f = fs::File::open(src).map_err(|e| format!("open src error: {e}"))?;
  let mut out_f = fs::File::create(dst).map_err(|e| format!("create dst error: {e}"))?;

  let mut buf = vec![0u8; 1024 * 1024];
  let mut last_emit = Instant::now();

  loop {
    if cancel.load(Ordering::SeqCst) {
      return Err("cancelled".to_string());
    }

    let n = in_f.read(&mut buf).map_err(|e| format!("read error: {e}"))?;
    if n == 0 {
      break;
    }

    out_f.write_all(&buf[..n]).map_err(|e| format!("write error: {e}"))?;
    *bytes_done = bytes_done.saturating_add(n as u64);

    // throttle emits to ~8/sec
    if last_emit.elapsed() >= Duration::from_millis(120) {
      emit_progress(
        app,
        &TransferProgress {
          phase: "copying".to_string(),
          current_file,
          total_files,
          current_path: src.to_string_lossy().to_string(),
          bytes_done: *bytes_done,
          bytes_total,
          percent: pct(*bytes_done, bytes_total),
        },
      );
      last_emit = Instant::now();
    }
  }

  out_f.sync_all().ok();
  Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
  let mut f = fs::File::open(path).map_err(|e| format!("open error: {e}"))?;
  let mut hasher = Sha256::new();
  let mut buf = [0u8; 1024 * 1024];
  loop {
    let n = f.read(&mut buf).map_err(|e| format!("read error: {e}"))?;
    if n == 0 {
      break;
    }
    hasher.update(&buf[..n]);
  }
  Ok(hex::encode(hasher.finalize()))
}

/* --------------------------------- Manifest --------------------------------- */

#[derive(Debug, Serialize)]
struct ManifestItem {
  source: String,
  dest: String,
  category: String,
  ext: String,
  bytes: u64,
  status: String, // copied|moved|skipped|error|cancelled
  error: Option<String>,
}

/* --------------------------------- Transfer --------------------------------- */

pub async fn start_transfer(
  app: tauri::AppHandle,
  items: Vec<PickedItem>,
  dest_mount_point: String,
  copy_mode: String,
  conflict_policy: String,
  verify_mode: String,
  cancel: Arc<AtomicBool>,
) -> Result<TransferSummary, String> {
  let started_at = now_local_rfc3339();
  let start = Instant::now();

  emit_progress(
    &app,
    &TransferProgress {
      phase: "scanning".to_string(),
      current_file: 0,
      total_files: 0,
      current_path: "".to_string(),
      bytes_done: 0,
      bytes_total: 0,
      percent: 0.0,
    },
  );

  let entries = scan_entries(&items)?;

  // precompute total_bytes
  let mut total_bytes: u64 = 0;
  for ent in &entries {
    let meta = fs::metadata(&ent.src).map_err(|e| format!("metadata error: {e}"))?;
    total_bytes = total_bytes.saturating_add(meta.len());
  }

  // Folder layout: Transfers/YYYY-MM-DD/HHMMSS/
  let day = day_stamp_local();
  let run = time_stamp_local();

  let transfers_root = PathBuf::from(&dest_mount_point).join("Transfers");
  let day_dir = transfers_root.join(&day);
  let session_dir = day_dir.join(&run);

  ensure_dir(&session_dir)?;

  // Write Transfers/README.txt once
  let readme_path = transfers_root.join("README.txt");
  if !readme_path.exists() {
    let contents = "\
TransferPilot output

Folder layout:
  Transfers/<YYYY-MM-DD>/<HHMMSS>/
    - Files/      (loose files you added directly)
    - Folders/    (folder picks; preserves the folder tree)
    - manifest.json

Pointers:
  Transfers/_latest.txt -> most recent run folder
  Transfers/<YYYY-MM-DD>/_latest.txt -> most recent run for that day
";
    let _ = fs::write(&readme_path, contents);
  }

  // Latest pointers
  fs::write(
    transfers_root.join("_latest.txt"),
    session_dir.to_string_lossy().to_string(),
  )
  .map_err(|e| format!("latest write error: {e}"))?;
  fs::write(
    day_dir.join("_latest.txt"),
    session_dir.to_string_lossy().to_string(),
  )
  .map_err(|e| format!("day latest write error: {e}"))?;

  let total_files = entries.len() as u64;

  // initial “copying” emit so bar appears instantly
  emit_progress(
    &app,
    &TransferProgress {
      phase: "copying".to_string(),
      current_file: 0,
      total_files,
      current_path: "".to_string(),
      bytes_done: 0,
      bytes_total: total_bytes,
      percent: 0.0,
    },
  );

  let mut manifest: Vec<ManifestItem> = vec![];

  let mut copied_files = 0u64;
  let mut moved_files = 0u64;
  let mut skipped_files = 0u64;
  let mut error_files = 0u64;

  let mut bytes_done: u64 = 0;

  for (i, ent) in entries.into_iter().enumerate() {
    let current_file = (i as u64) + 1;

    if cancel.load(Ordering::SeqCst) {
      emit_progress(
        &app,
        &TransferProgress {
          phase: "cancelled".to_string(),
          current_file,
          total_files,
          current_path: ent.src.to_string_lossy().to_string(),
          bytes_done,
          bytes_total: total_bytes,
          percent: pct(bytes_done, total_bytes),
        },
      );
      break;
    }

    let meta = fs::metadata(&ent.src).map_err(|e| format!("metadata error: {e}"))?;
    let bytes = meta.len();
    let (cat, ext) = category_for(&ent.src);

    // Destination keeps folder trees together
    // - Loose files: Transfers/<day>/<run>/Files/<filename>
    // - Folder picks: Transfers/<day>/<run>/Folders/<TopFolder>/<relative>
    let dst_rel = if let Some(rel) = ent.folder_rel.clone() {
      PathBuf::from("Folders").join(rel)
    } else {
      let file_name = ent
        .src
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
      PathBuf::from("Files").join(file_name)
    };

    let mut dst = session_dir.join(&dst_rel);

    // Conflict handling
    if dst.exists() {
      match conflict_policy.as_str() {
        "overwrite" => {}
        "skip" => {
          skipped_files += 1;
          manifest.push(ManifestItem {
            source: ent.src.to_string_lossy().to_string(),
            dest: dst.to_string_lossy().to_string(),
            category: cat,
            ext,
            bytes,
            status: "skipped".to_string(),
            error: None,
          });
          continue;
        }
        _ => {
          dst = unique_dest_path(&dst);
        }
      }
    }

    // emit start-of-file so UI updates immediately
    emit_progress(
      &app,
      &TransferProgress {
        phase: "copying".to_string(),
        current_file,
        total_files,
        current_path: ent.src.to_string_lossy().to_string(),
        bytes_done,
        bytes_total: total_bytes,
        percent: pct(bytes_done, total_bytes),
      },
    );

    // Copy streamed (cancel-aware)
    let mut status = "copied".to_string();
    let mut err: Option<String> = None;

    match copy_file_streamed(
      &ent.src,
      &dst,
      &cancel,
      &mut bytes_done,
      total_bytes,
      &app,
      current_file,
      total_files,
    ) {
      Ok(_) => {}
      Err(e) => {
        if e == "cancelled" {
          manifest.push(ManifestItem {
            source: ent.src.to_string_lossy().to_string(),
            dest: dst.to_string_lossy().to_string(),
            category: cat,
            ext,
            bytes,
            status: "cancelled".to_string(),
            error: None,
          });
          emit_progress(
            &app,
            &TransferProgress {
              phase: "cancelled".to_string(),
              current_file,
              total_files,
              current_path: ent.src.to_string_lossy().to_string(),
              bytes_done,
              bytes_total: total_bytes,
              percent: pct(bytes_done, total_bytes),
            },
          );
          break;
        } else {
          err = Some(e);
        }
      }
    }

    // Verify + move cleanup
    if err.is_none() {
      if verify_mode == "size" {
        let dst_meta = fs::metadata(&dst).map_err(|e| format!("dst metadata error: {e}"))?;
        if dst_meta.len() != meta.len() {
          err = Some("verify failed: size mismatch".to_string());
        }
      } else if verify_mode == "sha256" {
        emit_progress(
          &app,
          &TransferProgress {
            phase: "verifying".to_string(),
            current_file,
            total_files,
            current_path: ent.src.to_string_lossy().to_string(),
            bytes_done,
            bytes_total: total_bytes,
            percent: pct(bytes_done, total_bytes),
          },
        );

        let a = sha256_file(&ent.src)?;
        let b = sha256_file(&dst)?;
        if a != b {
          err = Some("verify failed: sha256 mismatch".to_string());
        }
      }

      if err.is_none() && copy_mode == "move" {
        if let Err(e) = fs::remove_file(&ent.src) {
          err = Some(format!("move cleanup failed: {e}"));
        } else {
          status = "moved".to_string();
        }
      }
    }

    // Record manifest row
    if let Some(e) = err.clone() {
      error_files += 1;
      manifest.push(ManifestItem {
        source: ent.src.to_string_lossy().to_string(),
        dest: dst.to_string_lossy().to_string(),
        category: cat,
        ext,
        bytes,
        status: "error".to_string(),
        error: Some(e),
      });
    } else {
      if copy_mode == "move" {
        moved_files += 1;
      } else {
        copied_files += 1;
      }
      manifest.push(ManifestItem {
        source: ent.src.to_string_lossy().to_string(),
        dest: dst.to_string_lossy().to_string(),
        category: cat,
        ext,
        bytes,
        status,
        error: None,
      });
    }

    // end-of-file emit (ensures UI catches up)
    emit_progress(
      &app,
      &TransferProgress {
        phase: "copying".to_string(),
        current_file,
        total_files,
        current_path: "".to_string(),
        bytes_done,
        bytes_total: total_bytes,
        percent: pct(bytes_done, total_bytes),
      },
    );
  }

  // Write manifest
  let manifest_path = session_dir.join("manifest.json");
  let manifest_json =
    serde_json::to_string_pretty(&manifest).map_err(|e| format!("manifest json error: {e}"))?;
  fs::write(&manifest_path, manifest_json).map_err(|e| format!("manifest write error: {e}"))?;

  let finished_at = now_local_rfc3339();
  let duration_ms = start.elapsed().as_millis() as u64;

  // Final emit
  let final_phase = if cancel.load(Ordering::SeqCst) {
    "cancelled"
  } else {
    "done"
  };

  emit_progress(
    &app,
    &TransferProgress {
      phase: final_phase.to_string(),
      current_file: total_files,
      total_files,
      current_path: session_dir.to_string_lossy().to_string(),
      bytes_done,
      bytes_total: total_bytes,
      percent: if final_phase == "done" { 100.0 } else { pct(bytes_done, total_bytes) },
    },
  );

  Ok(TransferSummary {
    started_at,
    finished_at,
    duration_ms,
    total_files: copied_files + moved_files + skipped_files + error_files,
    total_bytes,
    copied_files,
    moved_files,
    skipped_files,
    error_files,
    output_session_dir: session_dir.to_string_lossy().to_string(),
  })
}