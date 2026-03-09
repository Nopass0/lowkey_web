"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "motion/react";
import { Check, Copy } from "lucide-react";

interface AiMarkdownProps {
  content: string;
}

// ─── Code block with copy button ─────────────────────────────────────────────
function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="group relative my-4 overflow-hidden rounded-2xl border border-border/40 bg-zinc-950">
      {/* Header bar */}
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
      {/* Code content */}
      <div className="overflow-x-auto p-4">
        <code className="font-mono text-[13px] leading-6 text-zinc-200 whitespace-pre">
          {children}
        </code>
      </div>
    </div>
  );
}

// ─── Main markdown component ──────────────────────────────────────────────────
export function AiMarkdown({ content }: AiMarkdownProps) {
  return (
    <div className="max-w-none text-sm leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Headings ────────────────────────────────────────────────────────
          h1: ({ children }) => (
            <h1 className="mb-4 mt-6 text-xl font-black tracking-tight first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-5 text-lg font-bold tracking-tight first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h3>
          ),

          // ── Paragraph ───────────────────────────────────────────────────────
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 leading-7">{children}</p>
          ),

          // ── Lists ───────────────────────────────────────────────────────────
          ul: ({ children }) => (
            <ul className="mb-3 space-y-1 [&>li]:flex [&>li]:gap-2 [&>li]:before:mt-1.5 [&>li]:before:text-primary/60 [&>li]:before:content-['•'] [&>li]:before:shrink-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 space-y-1 list-decimal list-inside marker:text-primary/60">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-7"><span>{children}</span></li>
          ),

          // ── Blockquote ──────────────────────────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-primary/50 pl-4 text-muted-foreground italic">
              {children}
            </blockquote>
          ),

          // ── Table ───────────────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="my-4 overflow-hidden rounded-xl border border-border/60 shadow-sm">
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
            const isBlock = !!match || (className ?? "").includes("language-");
            const content = String(children).replace(/\n$/, "");

            // Check if it's inline (no newlines, short)
            const isInline = !className && !content.includes("\n");

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
              <CodeBlock language={match?.[1]}>{content}</CodeBlock>
            );
          },

          // Suppress the pre wrapper since CodeBlock handles it
          pre: ({ children }) => <>{children}</>,

          // ── Horizontal rule ─────────────────────────────────────────────────
          hr: () => <hr className="my-4 border-border/40" />,

          // ── Links ───────────────────────────────────────────────────────────
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
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
