import * as React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import transferPilotIcon from "../assets/transferpilot-mark.png";

import type {
  QueueItem,
  VolumeInfo,
  Preflight,
  TransferSummary,
  // ✅ add this type in your types/transfer.ts to match the Rust payload
  TransferProgress,
} from "@/types/transfer";

import {
  addDroppedPaths,
  listVolumes,
  pickFiles,
  pickFolders,
  preflightScan,
  startTransfer,
  // ✅ you’ll add this to lib/tauri (snippet below)
  cancelTransfer,
} from "@/lib/tauri";

import { VolumePicker } from "@/components/transfer/VolumePicker";
import { QueuePanel } from "@/components/transfer/QueuePanel";
import { Card, CardHeader, CardTitle, CardSubtle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/** UI-only options */
type TransferOptions = {
  dest_mount_point: string;
  dest_root_dir_name?: string;
  move_instead_of_copy: boolean;
  group_by_date?: boolean;
  group_by_type?: boolean;
  preserve_folder_structure?: boolean;
};

function fmtBytes(n: number) {
  if (!Number.isFinite(n)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let x = n;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtMs(ms: number) {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export default function DashboardPage() {
  const [volumes, setVolumes] = React.useState<VolumeInfo[]>([]);
  const [destMount, setDestMount] = React.useState("");
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [filter, setFilter] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [transferMode, setTransferMode] = React.useState<"copy" | "move">(
    "copy"
  );
  const [preflight, setPreflight] = React.useState<Preflight | null>(null);
  const [latest, setLatest] = React.useState<TransferSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  // ✅ progress state
  const [progress, setProgress] = React.useState<TransferProgress | null>(null);
  const [isTransferring, setIsTransferring] = React.useState(false);

  const showToast = React.useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 1400);
  }, []);

  const destDisplay = destMount ? shortenPath(destMount, 40) : "Not selected";
  const destFull = destMount || "Not selected";

  const opts: TransferOptions = React.useMemo(
    () => ({
      dest_mount_point: destMount,
      dest_root_dir_name: "Transfers",
      move_instead_of_copy: transferMode === "move",
      group_by_date: true,
      group_by_type: true,
      // NOTE: Rust side is currently preserving under Files/ + Folders/
      // This flag can remain for future UX toggles.
      preserve_folder_structure: true,
    }),
    [destMount, transferMode]
  );

  const refreshVolumes = React.useCallback(async () => {
    try {
      setError(null);
      setBusy(true);
      setVolumes(await listVolumes());
    } catch (e: any) {
      setError(e?.toString?.() ?? "Failed to list volumes.");
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    refreshVolumes();
  }, [refreshVolumes]);

  const addItems = React.useCallback((items: QueueItem[]) => {
    setQueue((q) => {
      const existing = new Set(q.map((x) => x.path));
      const deduped = items.filter((x) => !existing.has(x.path));
      return [...q, ...deduped];
    });
    setPreflight(null);
  }, []);

  const onDropPaths = async (paths: string[]) => {
    try {
      setBusy(true);
      setError(null);
      const newItems = await addDroppedPaths(paths);
      addItems(newItems);
    } catch (e: any) {
      setError(e?.toString?.() ?? "Failed to add dropped items.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: null | (() => void) = null;

    (async () => {
      unlisten = await win.onDragDropEvent(async (e) => {
        if (e.payload.type === "drop") {
          const paths = e.payload.paths ?? [];
          if (!paths.length) return;
          await onDropPaths(paths);
        }
      });
    })();

    return () => {
      unlisten?.();
    };
  }, [onDropPaths]);

  // ✅ Listen to transfer progress events from Rust
  React.useEffect(() => {
    let unlisten: null | (() => void) = null;

    (async () => {
      unlisten = await listen<TransferProgress>(
        "transfer://progress",
        (evt) => {
          const p = evt.payload;
          setProgress(p);

          if (
            p.phase === "copying" ||
            p.phase === "verifying" ||
            p.phase === "scanning"
          ) {
            setIsTransferring(true);
          }

          if (
            p.phase === "done" ||
            p.phase === "cancelled" ||
            p.phase === "error"
          ) {
            setIsTransferring(false);
          }
        }
      );
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  const onAddFiles = async () => {
    try {
      setBusy(true);
      setError(null);
      addItems(await pickFiles());
    } catch (e: any) {
      setError(e?.toString?.() ?? "Failed to pick files.");
    } finally {
      setBusy(false);
    }
  };

  const onAddFolders = async () => {
    try {
      setBusy(true);
      setError(null);
      addItems(await pickFolders());
    } catch (e: any) {
      setError(e?.toString?.() ?? "Failed to pick folders.");
    } finally {
      setBusy(false);
    }
  };

  const onClear = () => {
    setQueue([]);
    setPreflight(null);
    setFilter("");
    setProgress(null);
    setLatest(null);
  };

  const canPreflight = Boolean(destMount && queue.length > 0);

  const runPreflight = async () => {
    if (!canPreflight) return;
    try {
      setBusy(true);
      setError(null);
      const res = await preflightScan(queue, destMount);
      setPreflight(res);
    } catch (e: any) {
      setError(e?.toString?.() ?? "Preflight failed.");
    } finally {
      setBusy(false);
    }
  };

  const runTransfer = async () => {
    if (!preflight?.will_fit || queue.length === 0 || isTransferring) return;
    try {
      setBusy(true);
      setError(null);
      setLatest(null);
      setProgress(null);
      setIsTransferring(true);

      // NOTE: startTransfer can remain "await" even if Rust emits progress during the run.
      const s = await startTransfer(queue, opts);

      setLatest(s);
      setQueue([]);
      setPreflight(null);
      setFilter("");
    } catch (e: any) {
      setError(e?.toString?.() ?? "Transfer failed.");
    } finally {
      setBusy(false);
      // If Rust didn't emit final phase for some reason, unlock UI anyway
      setIsTransferring(false);
    }
  };

  const onCancelTransfer = async () => {
    try {
      await cancelTransfer();
      showToast("Cancel requested");
    } catch (e: any) {
      showToast("Cancel failed");
      setError(e?.toString?.() ?? "Cancel failed.");
    }
  };

  const copyToClipboard = React.useCallback(
    async (text: string, msg = "Copied") => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(msg);
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          showToast(msg);
        } catch {
          showToast("Copy failed");
        }
      }
    },
    [showToast]
  );

  function shortenPath(path: string, max = 40) {
    if (!path) return "";
    if (path.length <= max) return path;

    const parts = path.split("/").filter(Boolean);

    if (path.startsWith("/Volumes/") && parts.length >= 2) {
      return `…/Volumes/${parts[1]}`;
    }

    return `…/${parts.slice(-2).join("/")}`;
  }

  function Toast({ message, show }: { message: string; show: boolean }) {
    if (!show) return null;
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <div
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 shadow-md
                      dark:border-white/10 dark:bg-zinc-900 dark:text-white"
        >
          {message}
        </div>
      </div>
    );
  }

  // derived progress UI
  const pct =
    progress?.percent ??
    (progress?.bytes_total
      ? (progress.bytes_done / progress.bytes_total) * 100
      : 0);

  const pct01 = clamp01((pct ?? 0) / 100);

  const progressLabel =
    progress?.phase === "verifying"
      ? "Verifying…"
      : progress?.phase === "scanning"
      ? "Scanning…"
      : progress?.phase === "cancelled"
      ? "Cancelled"
      : progress?.phase === "done"
      ? "Done"
      : progress?.phase === "error"
      ? "Error"
      : isTransferring
      ? "Transferring…"
      : "Idle";

  return (
    <div
      className="
        min-h-dvh min-w- overflow-y-auto
        md:h-dvh md:overflow-hidden
        p-6
        bg-zinc-50 text-zinc-900
        dark:bg-linear-to-b dark:from-zinc-950 dark:to-black dark:text-white
      "
    >
      <Toast message={toast ?? ""} show={Boolean(toast)} />
      <div className="max-w-6xl mx-auto space-y-4 md:h-full md:flex md:flex-col md:overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <img
              src={transferPilotIcon}
              alt="TransferPilot"
              className="mt-0.5 h-16 w-16 opacity-90"
            />

            <div>
              <div className="text-2xl font-semibold leading-tight">
                TransferPilot
              </div>
              <div className="text-zinc-600 dark:text-white/60">
                Select folders/files and transfer to an external SSD with an
                audit summary.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="neutral">{queue.length} queued</Badge>
            <ThemeToggle />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        <VolumePicker
          volumes={volumes}
          selected={destMount}
          onSelect={(m) => {
            setDestMount(m);
            setPreflight(null);
          }}
          onRefresh={refreshVolumes}
          loading={busy || isTransferring}
        />

        <div className="space-y-4 md:flex-1 md:min-h-0 md:flex md:flex-col">
          <div className="md:flex-1 md:min-h-0">
            <QueuePanel
              items={queue}
              onClear={onClear}
              onAddFiles={onAddFiles}
              onAddFolders={onAddFolders}
              filter={filter}
              onFilter={setFilter}
              busy={busy || isTransferring}
            />
          </div>

          {/* Guardrails (now includes compact Transfer Mode + Progress + Cancel) */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Guardrails</CardTitle>
                <CardSubtle>
                  Preflight confirms counts, types, and size. Transfer only
                  enabled when it fits.
                </CardSubtle>
              </div>

              <div className="flex items-center gap-2">
                {/* compact transfer mode toggle */}
                <div className="flex rounded-xl border border-black/10 bg-black/3 p-1 dark:border-white/10 dark:bg-white/5">
                  <button
                    onClick={() => {
                      setTransferMode("copy");
                      setPreflight(null);
                    }}
                    disabled={busy || isTransferring}
                    className={[
                      "px-3 py-1.5 text-xs rounded-lg transition",
                      transferMode === "copy"
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white"
                        : "text-zinc-700 hover:bg-black/6 dark:text-white/70 dark:hover:bg-white/10",
                    ].join(" ")}
                    title="Copy"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => {
                      setTransferMode("move");
                      setPreflight(null);
                    }}
                    disabled={busy || isTransferring}
                    className={[
                      "px-3 py-1.5 text-xs rounded-lg transition",
                      transferMode === "move"
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white"
                        : "text-zinc-700 hover:bg-black/6 dark:text-white/70 dark:hover:bg-white/10",
                    ].join(" ")}
                    title="Move"
                  >
                    Move
                  </button>
                </div>

                <Button
                  variant="secondary"
                  onClick={runPreflight}
                  disabled={!canPreflight || busy || isTransferring}
                >
                  {busy ? "Working…" : "Preflight"}
                </Button>

                {!isTransferring ? (
                  <Button
                    variant="primary"
                    onClick={runTransfer}
                    disabled={
                      !preflight?.will_fit || busy || queue.length === 0
                    }
                  >
                    Start Transfer
                  </Button>
                ) : (
                  <Button variant="danger" onClick={onCancelTransfer}>
                    Cancel
                  </Button>
                )}
              </div>
            </CardHeader>

            {/* progress bar lives here */}
            <div className="px-4 pb-4">
              <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-white/60">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-800 dark:text-white/80">
                    {progressLabel}
                  </span>
                  {progress?.current_file && progress?.total_files ? (
                    <span className="font-mono">
                      {progress.current_file}/{progress.total_files}
                    </span>
                  ) : null}
                </div>

                <div className="font-mono">
                  {progress?.bytes_total ? (
                    <>
                      {fmtBytes(progress.bytes_done)} /{" "}
                      {fmtBytes(progress.bytes_total)}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>

              <div className="mt-2 h-3 rounded-full border border-black/10 bg-black/3 overflow-hidden dark:border-white/10 dark:bg-white/5">
                <div
                  className="h-full bg-blue-500/70 dark:bg-blue-400/70 transition-[width] duration-150"
                  style={{ width: `${Math.round(pct01 * 100)}%` }}
                />
              </div>

              <div className="mt-2 text-xs text-zinc-600 dark:text-white/60 truncate">
                {progress?.current_path ? (
                  <>
                    <span className="text-zinc-500 dark:text-white/50">
                      Current:
                    </span>{" "}
                    <span className="font-mono">{progress.current_path}</span>
                  </>
                ) : (
                  <span className="text-zinc-500 dark:text-white/50">
                    {isTransferring ? "Preparing…" : "No active transfer"}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat
                  label="Destination"
                  value={destDisplay}
                  rawTitle={destFull}
                  onClick={
                    destMount
                      ? () =>
                          copyToClipboard(destMount, "Copied destination path")
                      : undefined
                  }
                />

                <Stat
                  label="Preflight"
                  value={
                    preflight
                      ? preflight.will_fit
                        ? "Ready"
                        : "Blocked"
                      : "Not run"
                  }
                />

                <Stat
                  label="Files"
                  value={preflight ? String(preflight.total_files) : "—"}
                />
                <Stat
                  label="Size"
                  value={preflight ? fmtBytes(preflight.total_bytes) : "—"}
                />
              </div>

              {preflight && !preflight.will_fit ? (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
                  Destination has {fmtBytes(preflight.dest_avail_bytes)}{" "}
                  available, but queue is {fmtBytes(preflight.total_bytes)}.
                </div>
              ) : null}
            </div>
          </Card>

          {/* Latest Transfer Summary */}
          {latest && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Latest Transfer Summary</CardTitle>
                  <CardSubtle>Session output and totals</CardSubtle>
                </div>
                <Badge tone="good">{latest.total_files} files</Badge>
              </CardHeader>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Duration" value={fmtMs(latest.duration_ms)} />
                <Stat label="Copied" value={String(latest.copied_files)} />
                <Stat label="Moved" value={String(latest.moved_files)} />
                <Stat label="Errors" value={String(latest.error_files)} />
              </div>

              <div className="mt-3 text-sm text-zinc-700 dark:text-white/70 space-y-1">
                <div>
                  <span className="text-zinc-500 dark:text-white/50">
                    Started:
                  </span>{" "}
                  <span className="font-mono">{latest.started_at}</span>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-white/50">
                    Finished:
                  </span>{" "}
                  <span className="font-mono">{latest.finished_at}</span>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-white/50">
                    Output directory:
                  </span>{" "}
                  <span className="font-mono">{latest.output_session_dir}</span>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-white/50">
                    Total bytes:
                  </span>{" "}
                  <span className="font-mono">
                    {fmtBytes(latest.total_bytes)}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  rawTitle,
  onClick,
}: {
  label: string;
  value: string;
  rawTitle?: string;
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick);

  return (
    <div
      className={[
        "rounded-xl border border-black/10 bg-black/3 p-3",
        "dark:border-white/10 dark:bg-white/5",
        "min-w-0",
        clickable
          ? "cursor-pointer hover:bg-black/6 dark:hover:bg-white/10"
          : "",
      ].join(" ")}
      title={rawTitle ?? value}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
    >
      <div className="text-xs text-zinc-600 dark:text-white/60">{label}</div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}
