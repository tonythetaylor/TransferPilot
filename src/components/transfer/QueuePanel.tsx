import * as React from "react";
import type { QueueItem } from "@/types/transfer";
import { Card, CardHeader, CardTitle, CardSubtle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

function shortPath(p: string) {
  if (p.length <= 88) return p;
  return "…" + p.slice(-88);
}

export function QueuePanel({
  items,
  onClear,
  onAddFiles,
  onAddFolders,
  filter,
  onFilter,
  busy,
}: {
  items: QueueItem[];
  onClear: () => void;
  onAddFiles: () => void;
  onAddFolders: () => void;
  filter: string;
  onFilter: (v: string) => void;
  busy?: boolean;
}) {
  const pageSize = 8;

  const filtered = React.useMemo(() => {
    if (!filter) return items;
    const q = filter.toLowerCase();
    return items.filter((i) => i.path.toLowerCase().includes(q));
  }, [items, filter]);

  const [page, setPage] = React.useState(1);
  const [isDragging, setIsDragging] = React.useState(false);

  const totalPages = React.useMemo(() => {
    return Math.max(1, Math.ceil(filtered.length / pageSize));
  }, [filtered.length]);

  React.useEffect(() => setPage(1), [filter]);
  React.useEffect(
    () => setPage((p) => Math.min(Math.max(1, p), totalPages)),
    [totalPages]
  );

  const start = (page - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const showingFrom = filtered.length === 0 ? 0 : start + 1;
  const showingTo =
    filtered.length === 0 ? 0 : Math.min(start + pageSize, filtered.length);

const onDragEnter = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();

  if (busy) return;
  if (!e.dataTransfer?.types?.includes("Files")) return;

  setIsDragging(true);
};

const onDragOver = (e: React.DragEvent) => {
  e.preventDefault(); // required
};

const onDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();

  const rt = e.relatedTarget as Node | null;
  if (!rt || !e.currentTarget.contains(rt)) {
    setIsDragging(false);
  }
};

const onDrop = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(false);
};

  return (
    <Card
      className={[
        "relative flex flex-col md:h-full",
        "bg-white border-black/10 text-zinc-900",
        "dark:bg-white/5 dark:border-white/10 dark:text-white",
        "transition-all duration-150",
        isDragging && !busy
          ? "ring-2 ring-blue-500/60 shadow-lg shadow-blue-500/10"
          : "",
      ].join(" ")}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drop overlay */}
      {isDragging && !busy && (
        <div className="absolute inset-0 z-20 rounded-2xl border-2 border-dashed border-blue-500/60 bg-blue-500/10 backdrop-blur-sm">
          {/* subtle dim behind overlay */}
          <div className="absolute inset-0 rounded-2xl bg-white/10 dark:bg-black/10" />

          <div className="relative h-full w-full flex items-center justify-center p-6 text-center">
            <div
              className="rounded-xl border border-blue-500/20 bg-white/80 px-4 py-3 text-sm text-zinc-900 shadow-sm
                         dark:border-blue-400/20 dark:bg-zinc-950/70 dark:text-white"
            >
              <div className="font-medium">Drop to add</div>
              <div className="text-xs opacity-70">
                Files or folders will be added to the queue
              </div>
            </div>
          </div>
        </div>
      )}

      <CardHeader>
        <div>
          <CardTitle className="text-zinc-900 dark:text-white">
            Transfer Queue
          </CardTitle>
          <CardSubtle className="text-zinc-600 dark:text-white/60">
            Add multiple folders/files and process them in one run.
          </CardSubtle>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onAddFiles} disabled={busy}>
            Add Files
          </Button>
          <Button variant="secondary" onClick={onAddFolders} disabled={busy}>
            Add Folders
          </Button>
        </div>
      </CardHeader>

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 mb-3">
        <div className="flex-1">
          <Input
            placeholder="Filter paths…"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 justify-end">
          <Badge tone="neutral">{items.length} items</Badge>
          <Button
            variant="ghost"
            onClick={() => {
              onClear();
              setPage(1);
            }}
            disabled={items.length === 0 || busy}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-black/10 overflow-hidden dark:border-white/10">
        <div className="grid grid-cols-[120px_1fr] bg-zinc-50 text-zinc-600 text-xs px-3 py-2 dark:bg-white/5 dark:text-white/70">
          <div>Type</div>
          <div>Path</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-sm text-zinc-500 dark:text-white/50">
            No items yet. Click “Add Files” or “Add Folders”. You can also drag
            and drop here.
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-auto">
              {pageItems.map((i) => (
                <div
                  key={i.id}
                  className="grid grid-cols-[120px_1fr] gap-2 px-3 py-2 border-t border-black/10 dark:border-white/10"
                >
                  <div className="text-xs">
                    <Badge tone={i.kind === "folder" ? "good" : "neutral"}>
                      {i.kind}
                    </Badge>
                  </div>
                  <div className="font-mono text-xs text-zinc-800 truncate dark:text-white/80">
                    {shortPath(i.path)}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-3 py-2 border-t border-black/10 bg-zinc-50 dark:border-white/10 dark:bg-white/3">
              <div className="text-xs text-zinc-600 dark:text-white/60">
                Showing {showingFrom}-{showingTo} of {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={!canPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <div className="text-xs text-zinc-600 dark:text-white/70">
                  Page{" "}
                  <span className="text-zinc-900 dark:text-white">{page}</span>{" "}
                  / {totalPages}
                </div>
                <Button
                  variant="secondary"
                  disabled={!canNext}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
