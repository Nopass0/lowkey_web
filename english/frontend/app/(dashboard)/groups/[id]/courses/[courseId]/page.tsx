"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, CheckCircle2, Circle, BookOpen, Loader2,
  ChevronRight, Play, Edit3, RefreshCw, Video
} from "lucide-react";
import { socialApi } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";

type Block = {
  id: string;
  courseId: string;
  type: string;
  title: string | null;
  content: any;
  orderIndex: number;
};

type Course = {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  emoji: string;
  color: string;
  level: string;
  blockCount: number;
  isPublished: boolean;
};

type Progress = {
  completedBlockIds: string[];
  percentComplete: number;
  testScores: any[];
};

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Начинающий",
  intermediate: "Средний",
  advanced: "Продвинутый",
};

// Simple markdown-like renderer (bold, italic, headers, lists)
function renderMarkdown(md: string): string {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-bold text-white mt-4 mb-2">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold text-white mt-4 mb-2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-white/80 italic">$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-white/70 text-sm">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/\n/g, "<br/>");
}

// Flip card component
function FlipCard({ card, idx }: { card: { front: string; back: string; example?: string }; idx: number }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      onClick={() => setFlipped(f => !f)}
      className="cursor-pointer"
      style={{ perspective: 600 }}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative h-28"
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center p-3"
          style={{ backfaceVisibility: "hidden" }}
        >
          <p className="text-white font-semibold text-base">{card.front}</p>
          <p className="text-white/30 text-xs mt-1">нажмите, чтобы перевернуть</p>
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex flex-col items-center justify-center p-3"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <p className="text-indigo-300 font-semibold text-base">{card.back}</p>
          {card.example && <p className="text-white/40 text-xs mt-1 text-center italic">{card.example}</p>}
        </div>
      </motion.div>
    </div>
  );
}

function TextBlock({ content }: { content: any }) {
  const html = renderMarkdown(content?.markdown || content?.text || "");
  return (
    <div
      className="text-white/70 text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${html}</p>` }}
    />
  );
}

function GrammarBlock({ content }: { content: any }) {
  return (
    <div className="space-y-3">
      {content?.explanation && (
        <p className="text-white/70 text-sm leading-relaxed">{content.explanation}</p>
      )}
      {content?.rules?.length > 0 && (
        <div>
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wide mb-2">Правила</p>
          <div className="space-y-2">
            {content.rules.map((r: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-xl p-3">
                <p className="text-white/80 text-sm font-medium">{r.rule}</p>
                {r.example && <p className="text-indigo-400 text-xs mt-1 italic">{r.example}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {content?.examples?.length > 0 && (
        <div>
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wide mb-2">Примеры</p>
          <div className="space-y-2">
            {content.examples.map((ex: any, i: number) => (
              <div key={i} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
                <div className="flex-1">
                  <p className="text-white/80 text-sm">{ex.en}</p>
                  <p className="text-white/40 text-xs mt-0.5">{ex.ru}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CardsBlock({ content }: { content: any }) {
  const cards: any[] = content?.cards || [];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {cards.map((card: any, i: number) => (
        <FlipCard key={i} card={card} idx={i} />
      ))}
    </div>
  );
}

function VideoBlock({ content }: { content: any }) {
  const url = content?.url || "";
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
  const videoId = match?.[1];
  if (!videoId) return <p className="text-white/40 text-sm">Неверная ссылка на видео</p>;
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function BlockContent({ block, groupId, courseId, onTestStart }: { block: Block; groupId: string; courseId: string; onTestStart: (testId: string) => void }) {
  if (block.type === "text") return <TextBlock content={block.content} />;
  if (block.type === "grammar") return <GrammarBlock content={block.content} />;
  if (block.type === "cards") return <CardsBlock content={block.content} />;
  if (block.type === "video") return <VideoBlock content={block.content} />;
  if (block.type === "test") {
    const testId = block.content?.testId;
    return (
      <div className="text-center py-4">
        <p className="text-white/60 text-sm mb-3">{block.content?.description || "Пройдите тест, чтобы проверить знания"}</p>
        {testId ? (
          <Link href={`/groups/${groupId}/courses/${courseId}/tests/${testId}`}>
            <button className="btn-gradient px-6 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center gap-2 mx-auto">
              <Play className="w-4 h-4" />
              Начать тест
            </button>
          </Link>
        ) : (
          <p className="text-white/30 text-xs">Тест не привязан</p>
        )}
      </div>
    );
  }
  return <p className="text-white/40 text-sm">Тип блока: {block.type}</p>;
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  text: "Текст",
  grammar: "Грамматика",
  cards: "Карточки",
  test: "Тест",
  video: "Видео",
};

export default function CourseViewPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const groupId = params.id as string;
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingBlock, setMarkingBlock] = useState<string | null>(null);
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      socialApi.getCourse(groupId, courseId),
      socialApi.getGroup(groupId),
    ]).then(([courseData, groupData]) => {
      setCourse(courseData.course);
      setBlocks(courseData.blocks || []);
      setProgress(courseData.progress);
      setMyRole(groupData.myRole || null);
    }).catch(() => toast.error("Ошибка загрузки курса"))
      .finally(() => setLoading(false));
  }, [groupId, courseId]);

  const completedIds: string[] = progress?.completedBlockIds || [];
  const pct = course?.blockCount ? Math.round((completedIds.length / course.blockCount) * 100) : 0;

  const markComplete = async (blockId: string) => {
    if (completedIds.includes(blockId)) return;
    setMarkingBlock(blockId);
    try {
      const updated = await socialApi.markBlockComplete(groupId, courseId, blockId);
      setProgress(updated);
      toast.success("Блок отмечен как пройденный");
    } catch { toast.error("Ошибка"); }
    finally { setMarkingBlock(null); }
  };

  const isTeacher = myRole === "owner" || myRole === "teacher";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-60">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!course) return <div className="text-center text-white/50 py-20">Курс не найден</div>;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Назад
      </button>

      {/* Course header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5 mb-5 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${course.color}55, ${course.color}22)` }}
      >
        <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(circle at 80% 50%, ${course.color}, transparent 60%)` }} />
        <div className="relative flex items-center gap-4">
          <span className="text-4xl">{course.emoji}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{course.title}</h1>
              {isTeacher && (
                <Link href={`/groups/${groupId}/courses/${courseId}/edit`}>
                  <button className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                    <Edit3 className="w-3.5 h-3.5 text-white/70" />
                  </button>
                </Link>
              )}
            </div>
            {course.description && <p className="text-white/60 text-sm mt-0.5">{course.description}</p>}
            <p className="text-white/40 text-xs mt-1">{LEVEL_LABELS[course.level] || course.level} • {course.blockCount} блоков</p>
          </div>
        </div>

        {/* Progress bar */}
        {course.blockCount > 0 && (
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-xs text-white/50 mb-1">
              <span>Прогресс</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                className="h-full bg-white rounded-full"
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* Blocks */}
      <div className="space-y-3">
        {blocks.length === 0 && (
          <div className="text-center py-12 text-white/40">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Блоков пока нет</p>
          </div>
        )}

        {blocks.map((block, i) => {
          const isCompleted = completedIds.includes(block.id);
          const isOpen = openBlockId === block.id;
          return (
            <motion.div
              key={block.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn("glass-card rounded-2xl overflow-hidden", isCompleted && "border border-emerald-500/20")}
            >
              {/* Block header */}
              <button
                onClick={() => setOpenBlockId(isOpen ? null : block.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Circle className="w-5 h-5 text-white/20" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-white text-sm font-medium">{block.title || BLOCK_TYPE_LABELS[block.type] || block.type}</p>
                  <p className="text-white/40 text-xs">{BLOCK_TYPE_LABELS[block.type] || block.type}</p>
                </div>
                <motion.div
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </motion.div>
              </button>

              {/* Block content */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 border-t border-white/5">
                      <div className="pt-4">
                        <BlockContent
                          block={block}
                          groupId={groupId}
                          courseId={courseId}
                          onTestStart={() => {}}
                        />
                        {block.type !== "test" && (
                          <div className="flex justify-end mt-4">
                            <button
                              onClick={() => markComplete(block.id)}
                              disabled={isCompleted || markingBlock === block.id}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                isCompleted
                                  ? "bg-emerald-500/20 text-emerald-400 cursor-default"
                                  : "bg-white/10 hover:bg-white/15 text-white/70"
                              )}
                            >
                              {markingBlock === block.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : isCompleted ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                              {isCompleted ? "Пройдено" : "Отметить пройденным"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
