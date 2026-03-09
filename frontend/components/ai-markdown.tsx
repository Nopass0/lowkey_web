"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { motion, AnimatePresence } from "motion/react";
import { Check, Copy } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// KaTeX CSS
import "katex/dist/katex.min.css";

// ─── Chart colours ────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

// ─── Inline chart renderer ────────────────────────────────────────────────────

interface ChartSpec {
  type: "bar" | "line" | "area" | "pie";
  title?: string;
  data: Array<Record<string, string | number>>;
  xKey?: string;
  yKeys?: string[];
}

function AiChart({ spec }: { spec: ChartSpec }) {
  const { type, title, data } = spec;
  const keys = spec.yKeys ?? Object.keys(data[0] ?? {}).filter((k) => k !== spec.xKey);
  const xKey = spec.xKey ?? Object.keys(data[0] ?? {})[0] ?? "name";

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-border/50 bg-muted/20 p-4">
      {title && (
        <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      )}
      <ResponsiveContainer width="100%" height={260}>
        {type === "bar" ? (
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={40} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        ) : type === "area" ? (
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <defs>
              {keys.map((k, i) => (
                <linearGradient key={k} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={40} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {keys.map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={`url(#grad-${i})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        ) : type === "pie" ? (
          <PieChart>
            <Pie
              data={data}
              dataKey={keys[0] ?? "value"}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={({ name, percent }) =>
                `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        ) : (
          /* default: line */
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={40} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {keys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── Code block with copy button ─────────────────────────────────────────────

function CodeBlock({
  language,
  children,
}: {
  language?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  // Try to parse as chart spec
  if (language === "json" || language === "chart") {
    try {
      const parsed = JSON.parse(children) as ChartSpec;
      if (
        parsed &&
        typeof parsed === "object" &&
        "type" in parsed &&
        "data" in parsed &&
        Array.isArray(parsed.data)
      ) {
        return <AiChart spec={parsed} />;
      }
    } catch {}
  }

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="group relative my-4 overflow-hidden rounded-2xl border border-border/40 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
        >
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                className="flex items-center gap-1 text-green-400"
              >
                <Check className="h-3 w-3" />
                Скопировано
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                className="flex items-center gap-1"
              >
                <Copy className="h-3 w-3" />
                Скопировать
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
      <div className="overflow-x-auto p-4">
        <code className="whitespace-pre font-mono text-[13px] leading-6 text-zinc-200">
          {children}
        </code>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AiMarkdownProps {
  content: string;
}

// ─── Main markdown component ──────────────────────────────────────────────────

export function AiMarkdown({ content }: AiMarkdownProps) {
  return (
    <div className="max-w-none text-sm leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // ── Headings ────────────────────────────────────────────────────────
          h1: ({ children }) => (
            <h1 className="mb-4 mt-6 text-xl font-black tracking-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-5 text-lg font-bold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">
              {children}
            </h3>
          ),

          // ── Paragraph ───────────────────────────────────────────────────────
          p: ({ children }) => (
            <p className="mb-3 leading-7 last:mb-0">{children}</p>
          ),

          // ── Lists ───────────────────────────────────────────────────────────
          ul: ({ children }) => (
            <ul className="mb-3 space-y-1 pl-4 [&>li]:list-disc [&>li]:marker:text-primary/60">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 marker:text-primary/60">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-7">{children}</li>
          ),

          // ── Blockquote ──────────────────────────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-primary/50 pl-4 italic text-muted-foreground">
              {children}
            </blockquote>
          ),

          // ── Table (centered) ─────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="mx-auto my-4 overflow-hidden rounded-xl border border-border/60 shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">{children}</table>
              </div>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/40">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="transition-colors hover:bg-muted/20">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 align-top text-sm">{children}</td>
          ),

          // ── Code ────────────────────────────────────────────────────────────
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className ?? "");
            const rawContent = String(children).replace(/\n$/, "");
            const isInline = !className && !rawContent.includes("\n");

            if (isInline) {
              return (
                <code
                  {...props}
                  className="rounded-md border border-border/40 bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={match?.[1]}>{rawContent}</CodeBlock>
            );
          },

          // Suppress the default <pre> wrapper since CodeBlock handles it
          pre: ({ children }) => <>{children}</>,

          // ── Horizontal rule ──────────────────────────────────────────────────
          hr: () => <hr className="my-4 border-border/40" />,

          // ── Links ───────────────────────────────────────────────────────────
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
            >
              {children}
            </a>
          ),

          // ── Strong / Em ─────────────────────────────────────────────────────
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-muted-foreground">{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
