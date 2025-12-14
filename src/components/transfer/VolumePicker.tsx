import * as React from "react";
import type { VolumeInfo } from "@/types/transfer";
import { Card, CardHeader, CardTitle, CardSubtle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

function fmtBytes(n?: number | null) {
  if (n === null || n === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let x = n;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function VolumePicker({
  volumes,
  selected,
  onSelect,
  onRefresh,
  loading,
}: {
  volumes: VolumeInfo[];
  selected: string;
  onSelect: (mount: string) => void;
  onRefresh: () => void;
  loading?: boolean;
}) {
  const selectedVol = React.useMemo(
    () => volumes.find((v) => v.mount_point === selected) ?? null,
    [volumes, selected]
  );

  const options = React.useMemo(
    () => [
      { label: "Select destination volume…", value: "" },
      ...volumes.map((v) => {
        const base =
          v.name && v.name !== v.mount_point
            ? `${v.name} (${v.mount_point})`
            : v.mount_point;

        const space = v.avail_bytes ? ` • ${fmtBytes(v.avail_bytes)} free` : "";
        return { label: `${base}${space}`, value: v.mount_point };
      }),
    ],
    [volumes]
  );

  return (
    <Card className="bg-white border-black/10 text-zinc-900 dark:bg-white/5 dark:border-white/10 dark:text-white">
      <CardHeader>
        <div>
          <CardTitle className="text-zinc-900 dark:text-white">
            Destination SSD / Volume
          </CardTitle>
          <CardSubtle className="text-zinc-600 dark:text-white/60">
            Pick where files will be copied or moved.
          </CardSubtle>
        </div>

        <Button
          variant="secondary"
          onClick={onRefresh}
          disabled={loading}
          className="bg-zinc-100 text-zinc-900 border border-black/10 hover:bg-zinc-200
                     dark:bg-white/10 dark:text-white dark:border-white/10 dark:hover:bg-white/15"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </CardHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <Select
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
            options={options}
          />
        </div>

        <div className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm
                        dark:border-white/10 dark:bg-white/5">
          <div className="text-xs text-zinc-500 dark:text-white/50">
            Selected mount
          </div>

          <div className="font-medium text-zinc-900 dark:text-white truncate">
            {selected || "None"}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-white/70">
            <div>
              <div className="text-zinc-500 dark:text-white/50">Available</div>
              <div className="font-medium text-zinc-900 dark:text-white">
                {fmtBytes(selectedVol?.avail_bytes)}
              </div>
            </div>

            <div>
              <div className="text-zinc-500 dark:text-white/50">Filesystem</div>
              <div className="font-medium text-zinc-900 dark:text-white">
                {selectedVol?.fs_type ?? "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}