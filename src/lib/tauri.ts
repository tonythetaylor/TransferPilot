import { invoke } from "@tauri-apps/api/core";
import type {
  VolumeInfo,
  QueueItem,
  Preflight,
  TransferSummary,
  TransferOptions,
} from "@/types/transfer";

type PickedItem = { kind: "file" | "folder"; path: string };
type CopyMode = "copy" | "move";
type ConflictPolicy = "rename" | "overwrite" | "skip";
type VerifyMode = "none" | "size" | "sha256";

export async function listVolumes(): Promise<VolumeInfo[]> {
  return await invoke("list_volumes");
}

export async function pickFiles(): Promise<QueueItem[]> {
  return await invoke("pick_files");
}

export async function pickFolders(): Promise<QueueItem[]> {
  return await invoke("pick_folders");
}

function toPicked(items: QueueItem[]): PickedItem[] {
  return items.map((i) => ({ kind: i.kind, path: i.path }));
}

/**
 * Rust: preflight_scan(items: Vec<PickedItem>, dest_mount_point: String)
 * Tauri args: { items, destMountPoint }
 */
export async function preflightScan(
  items: QueueItem[],
  destMountPoint: string
): Promise<Preflight> {
  return await invoke("preflight_scan", {
    items: toPicked(items),
    destMountPoint,
  });
}

/**
 * Rust: start_transfer(app, items: Vec<PickedItem>, dest_mount_point: String, copy_mode: String, conflict_policy: String, verify_mode: String, ...)
 * Tauri args: { items, destMountPoint, copyMode, conflictPolicy, verifyMode }
 */
export async function startTransfer(
  items: QueueItem[],
  opts: TransferOptions,
  config?: {
    conflictPolicy?: ConflictPolicy;
    verifyMode?: VerifyMode;
  }
): Promise<TransferSummary> {
  const copyMode: CopyMode = opts.move_instead_of_copy ? "move" : "copy";

  return await invoke("start_transfer", {
    items: toPicked(items),
    destMountPoint: opts.dest_mount_point,
    copyMode,
    conflictPolicy: config?.conflictPolicy ?? "rename",
    verifyMode: config?.verifyMode ?? "size",
  });
}

export async function cancelTransfer(): Promise<void> {
  return await invoke("cancel_transfer");
}

export async function addDroppedPaths(paths: string[]): Promise<QueueItem[]> {
  return invoke<QueueItem[]>("add_dropped_paths", { paths });
}