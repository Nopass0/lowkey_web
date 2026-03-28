"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import { AdminUserDomainStat } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 12;

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

interface Props {
  domains: AdminUserDomainStat[];
  title?: string;
  subtitle?: string;
  emptyText?: string;
}

export function CurrentDomainStats({
  domains,
  title = "Сайты сейчас",
  subtitle = "Активность за последние 2 минуты",
  emptyText = "Сейчас нет доменов с новой VPN-активностью.",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    if (domains.length <= PAGE_SIZE) {
      setExpanded(false);
    }
  }, [domains.length]);

  const totalPages = Math.max(1, Math.ceil(domains.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const visibleDomains = useMemo(() => {
    if (!expanded) {
      return domains.slice(0, PAGE_SIZE);
    }
    const start = (currentPage - 1) * PAGE_SIZE;
    return domains.slice(start, start + PAGE_SIZE);
  }, [currentPage, domains, expanded]);

  return (
    <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            {title}
          </h3>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
            {subtitle}
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Auto refresh every 15s
        </div>
        <Badge variant="outline" className="rounded-full">
          {domains.length} active
        </Badge>
      </div>

      {domains.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border/70 px-5 py-8 text-sm italic text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleDomains.map((site) => (
            <div
              key={`${site.domain}:${site.lastVisitAt ?? "none"}`}
              className="rounded-[1.5rem] border border-border/50 px-5 py-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="font-black truncate">{site.domain}</div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>
                    {site.lastVisitAt
                      ? new Date(site.lastVisitAt).toLocaleString("ru-RU")
                      : "Нет времени"}
                  </span>
                  {site.lastNetwork && <span>{site.lastNetwork}</span>}
                  {site.lastPort != null && <span>:{site.lastPort}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-black tabular-nums">
                  {site.visitCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(site.bytesTransferred)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {domains.length > PAGE_SIZE && (
        <div className="flex flex-col gap-3 border-t border-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Свернуть" : `Показать все (${domains.length})`}
          </Button>
          {expanded && totalPages > 1 && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Страница {currentPage} / {totalPages}
              </p>
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
          )}
        </div>
      )}
    </div>
  );
}
