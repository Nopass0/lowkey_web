"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, Search } from "lucide-react";
import { AdminUserDomainStat } from "@/api/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function formatBytes(v: number) {
  if (!v || v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = v;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 || value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

type SortMode = "recent" | "visits" | "domain";

interface Props {
  domains: AdminUserDomainStat[];
}

const PAGE_SIZE = 20;

export function DomainStats({ domains }: Props) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, sortMode, domains.length]);

  const totalVisits = useMemo(
    () => domains.reduce((acc, item) => acc + item.visitCount, 0),
    [domains],
  );
  const totalBytes = useMemo(
    () => domains.reduce((acc, item) => acc + item.bytesTransferred, 0),
    [domains],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = query
      ? domains.filter((item) => item.domain.toLowerCase().includes(query))
      : domains.slice();

    items.sort((left, right) => {
      if (sortMode === "visits") {
        return right.visitCount - left.visitCount;
      }
      if (sortMode === "domain") {
        return left.domain.localeCompare(right.domain);
      }
      const leftTs = left.lastVisitAt ? new Date(left.lastVisitAt).getTime() : 0;
      const rightTs = right.lastVisitAt ? new Date(right.lastVisitAt).getTime() : 0;
      return rightTs - leftTs;
    });

    return items;
  }, [domains, search, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  if (!domains.length) {
    return null;
  }

  return (
    <div className="bg-card border border-border/60 rounded-[2.5rem] overflow-hidden">
      <div className="px-8 pt-8 pb-6 border-b border-border/40 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
              <Globe className="w-5 h-5 text-violet-400" />
              История доменов
            </h3>
            <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest mt-1">
              До {domains.length} доменов из VPN-истории пользователя
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm font-bold">
            <span className="text-muted-foreground">
              {domains.length.toLocaleString("ru-RU")} domains
            </span>
            <span className="text-muted-foreground">
              {totalVisits.toLocaleString("ru-RU")} visits
            </span>
            <span className="text-muted-foreground">{formatBytes(totalBytes)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              placeholder="Поиск по домену"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-muted/30 border-border/40 text-sm font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={sortMode === "recent" ? "default" : "outline"}
              onClick={() => setSortMode("recent")}
            >
              Recent
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sortMode === "visits" ? "default" : "outline"}
              onClick={() => setSortMode("visits")}
            >
              Visits
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sortMode === "domain" ? "default" : "outline"}
              onClick={() => setSortMode("domain")}
            >
              A-Z
            </Button>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border/30">
        {visible.map((item) => (
          <div
            key={`${item.domain}:${item.lastVisitAt ?? "none"}`}
            className="px-8 py-4 space-y-3 hover:bg-muted/20 transition-colors"
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={`https://${item.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-black truncate hover:text-violet-400 transition-colors"
                  >
                    {item.domain}
                  </a>
                  {item.lastNetwork && (
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      {item.lastNetwork}
                    </span>
                  )}
                  {item.lastPort != null && (
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      :{item.lastPort}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Last seen:{" "}
                    {item.lastVisitAt
                      ? new Date(item.lastVisitAt).toLocaleString("ru-RU")
                      : "unknown"}
                  </span>
                  <span>
                    First seen:{" "}
                    {item.firstVisitAt
                      ? new Date(item.firstVisitAt).toLocaleString("ru-RU")
                      : "unknown"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {item.lastRemoteAddr && <span>Remote: {item.lastRemoteAddr}</span>}
                  {item.lastServerIp && <span>Server: {item.lastServerIp}</span>}
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="text-lg font-black tabular-nums">
                    {item.visitCount.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    visits
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black tabular-nums">
                    {formatBytes(item.bytesTransferred)}
                  </div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    bytes
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-8 py-5 border-t border-border/30 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Page {currentPage} / {totalPages}
          {" · "}
          {filtered.length.toLocaleString("ru-RU")} records
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage <= 1}
          >
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setPage((value) => Math.min(totalPages, value + 1))
            }
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
