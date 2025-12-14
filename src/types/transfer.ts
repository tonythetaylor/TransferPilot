export type VolumeInfo = {
  name: string;
  mount_point: string;
  fs_type?: string | null;
  total_bytes: number;
  avail_bytes: number;
  removable?: boolean | null;
};

export type QueueItem = {
  id: string;
  kind: "file" | "folder";
  path: string;
  size_bytes?: number | null;
  file_count?: number | null;
};

// This matches Rust Preflight
export type Preflight = {
  total_files: number;
  total_folders: number;
  total_bytes: number;
  dest_avail_bytes: number;
  will_fit: boolean;
  by_category: Record<string, number>;
  by_extension: Record<string, number>;
};

export type TransferOptions = {
  dest_mount_point: string;
  dest_root_dir_name?: string; // default: Transfers
  move_instead_of_copy?: boolean; // default: false
  group_by_date?: boolean; // default: true
  group_by_type?: boolean; // default: true
  preserve_folder_structure?: boolean; // default: false
};

// This matches Rust TransferSummary
export type TransferSummary = {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  total_files: number;
  total_bytes: number;
  copied_files: number;
  moved_files: number;
  skipped_files: number;
  error_files: number;
  output_session_dir: string;
};

export type TransferProgress = {
  phase: "scanning" | "copying" | "verifying" | "done" | "cancelled" | "error";
  current_file: number;   // 1-based
  total_files: number;
  current_path: string;
  bytes_done: number;
  bytes_total: number;
  percent: number;        // 0..=100
};

export type PickedItem = {
  kind: "file" | "folder";
  path: string;
};

export type CopyMode = "copy" | "move";
export type ConflictPolicy = "rename" | "overwrite" | "skip";
export type VerifyMode = "none" | "size" | "sha256";