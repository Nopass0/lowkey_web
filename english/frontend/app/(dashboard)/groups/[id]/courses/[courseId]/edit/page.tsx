"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Type, BookOpen,
  CreditCard, ClipboardList, Video, Loader2, Save, Sparkles,
  ChevronDown, Eye, EyeOff, X, Check, AlertCircle
} from "lucide-react";
import { socialApi } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type Block = {
  id: string;
  type: string;
  title: string | null;
  content: any;
  orderIndex: number;
};

type Course = {
  id: string;
  title: string;
  emoji: string;
  color: string;
  level: string;
  isPublished: boolean;
  description: string | null;
  estimatedMinutes: number;
};

const BLOCK_TYPES = [
  { type: "text", label: "Текст", icon: Type, desc: "Markdown текст" },
  { type: "grammar", label: "Грамматика", icon: BookOpen, desc: "Объяснение + примеры" },
  { type: "cards", label: "Карточки", icon: CreditCard, desc: "Слова и переводы" },
  { type: "test", label: "Тест", icon: ClipboardList, desc: "Вопросы и ответы" },
  { type: "video", label: "Видео", icon: Video, desc: "YouTube ссылка" },
];

const LEVELS = [
  { value: "beginner", label: "Начинающий" },
  { value: "intermediate", label: "Средний" },
  { value: "advanced", label: "Продвинутый" },
];

const QUESTION_TYPES = [
  { value: "single_choice", label: "Один вариант" },
  { value: "multiple_choice", label: "Несколько вариантов" },
  { value: "fill_blank", label: "Заполнить пробел" },
  { value: "text_input", label: "Текстовый ответ" },
  { value: "match", label: "Соответствие" },
  { value: "order", label: "Порядок" },
];

const CARD_TEMPLATES = [
  {
    id: "greetings",
    label: "Greetings",
    cards: [
      { front: "hello", back: "привет", example: "Hello, how are you?" },
      { front: "good morning", back: "доброе утро", example: "Good morning, class." },
      { front: "see you later", back: "увидимся позже", example: "See you later after work." },
      { front: "nice to meet you", back: "приятно познакомиться", example: "Nice to meet you, Anna." },
    ],
  },
  {
    id: "travel",
    label: "Travel",
    cards: [
      { front: "ticket", back: "билет", example: "I bought a train ticket." },
      { front: "hotel", back: "отель", example: "Our hotel is near the station." },
      { front: "passport", back: "паспорт", example: "Keep your passport with you." },
      { front: "boarding gate", back: "выход на посадку", example: "The boarding gate is open now." },
    ],
  },
  {
    id: "study",
    label: "Study",
    cards: [
      { front: "homework", back: "домашнее задание", example: "Did you finish your homework?" },
      { front: "exam", back: "экзамен", example: "The exam starts at ten." },
      { front: "notebook", back: "тетрадь", example: "Write it in your notebook." },
      { front: "explain", back: "объяснять", example: "Can you explain this rule?" },
    ],
  },
  {
    id: "grammar",
    label: "Grammar",
    cards: [
      { front: "noun", back: "существительное", example: "A noun names a person or thing." },
      { front: "verb", back: "глагол", example: "A verb shows an action." },
      { front: "adjective", back: "прилагательное", example: "An adjective describes a noun." },
      { front: "tense", back: "время", example: "Choose the correct tense." },
    ],
  },
];

// ---- Block Editors ----

function TextEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  return (
    <div>
      <label className="text-white/60 text-xs mb-1.5 block">Содержимое (Markdown)</label>
      <textarea
        value={content?.markdown || content?.text || ""}
        onChange={e => onChange({ ...content, markdown: e.target.value })}
        rows={10}
        placeholder="## Заголовок&#10;&#10;Введите текст урока..."
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500 resize-none font-mono"
      />
    </div>
  );
}

function GrammarEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const rules = content?.rules || [];
  const examples = content?.examples || [];

  const updateRule = (i: number, field: string, val: string) => {
    const updated = [...rules];
    updated[i] = { ...updated[i], [field]: val };
    onChange({ ...content, rules: updated });
  };

  const updateExample = (i: number, field: string, val: string) => {
    const updated = [...examples];
    updated[i] = { ...updated[i], [field]: val };
    onChange({ ...content, examples: updated });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-white/60 text-xs mb-1.5 block">Объяснение</label>
        <textarea
          value={content?.explanation || ""}
          onChange={e => onChange({ ...content, explanation: e.target.value })}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500 resize-none"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-white/60 text-xs">Правила</label>
          <button onClick={() => onChange({ ...content, rules: [...rules, { rule: "", example: "" }] })} className="text-indigo-400 text-xs hover:text-indigo-300">
            + Добавить
          </button>
        </div>
        <div className="space-y-2">
          {rules.map((r: any, i: number) => (
            <div key={i} className="flex gap-2">
              <div className="flex-1 space-y-1">
                <input
                  value={r.rule || ""}
                  onChange={e => updateRule(i, "rule", e.target.value)}
                  placeholder="Правило"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
                <input
                  value={r.example || ""}
                  onChange={e => updateRule(i, "example", e.target.value)}
                  placeholder="Пример"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-indigo-300 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button onClick={() => onChange({ ...content, rules: rules.filter((_: any, j: number) => j !== i) })} className="text-white/20 hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-white/60 text-xs">Примеры (EN / RU)</label>
          <button onClick={() => onChange({ ...content, examples: [...examples, { en: "", ru: "" }] })} className="text-indigo-400 text-xs hover:text-indigo-300">
            + Добавить
          </button>
        </div>
        <div className="space-y-2">
          {examples.map((ex: any, i: number) => (
            <div key={i} className="flex gap-2">
              <div className="flex-1 space-y-1">
                <input
                  value={ex.en || ""}
                  onChange={e => updateExample(i, "en", e.target.value)}
                  placeholder="English"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
                <input
                  value={ex.ru || ""}
                  onChange={e => updateExample(i, "ru", e.target.value)}
                  placeholder="Перевод"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/60 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button onClick={() => onChange({ ...content, examples: examples.filter((_: any, j: number) => j !== i) })} className="text-white/20 hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CardsEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const cards = content?.cards || [];

  const updateCard = (i: number, field: string, val: string) => {
    const updated = [...cards];
    updated[i] = { ...updated[i], [field]: val };
    onChange({ ...content, cards: updated });
  };

  const applyTemplate = (templateId: string) => {
    const template = CARD_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;

    onChange({
      ...content,
      cards: [
        ...cards,
        ...template.cards.map((card) => ({ ...card })),
      ],
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-white/60 text-xs">Карточки</label>
        <button
          onClick={() => onChange({ ...content, cards: [...cards, { front: "", back: "", example: "" }] })}
          className="text-indigo-400 text-xs hover:text-indigo-300"
        >
          + Добавить
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {CARD_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => applyTemplate(template.id)}
            className="px-2.5 py-1 rounded-full bg-white/5 text-white/60 text-[11px] hover:bg-white/10 hover:text-white transition-colors"
          >
            {template.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {cards.map((card: any, i: number) => (
          <div key={i} className="bg-white/5 rounded-xl p-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={card.front || ""}
                onChange={e => updateCard(i, "front", e.target.value)}
                placeholder="Слово (EN)"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
              <input
                value={card.back || ""}
                onChange={e => updateCard(i, "back", e.target.value)}
                placeholder="Перевод (RU)"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/70 text-sm focus:outline-none focus:border-indigo-500"
              />
              <button onClick={() => onChange({ ...content, cards: cards.filter((_: any, j: number) => j !== i) })} className="text-white/20 hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={card.example || ""}
              onChange={e => updateCard(i, "example", e.target.value)}
              placeholder="Пример использования (необязательно)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/50 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        ))}
        {cards.length === 0 && (
          <p className="text-white/30 text-xs text-center py-4">Добавьте карточки</p>
        )}
      </div>
    </div>
  );
}

function QuestionEditor({ question, onChange, onRemove }: { question: any; onChange: (q: any) => void; onRemove: () => void }) {
  const type = question.type || "single_choice";
  const options: string[] = question.options || [];

  return (
    <div className="bg-white/5 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <input
            value={question.question || ""}
            onChange={e => onChange({ ...question, question: e.target.value })}
            placeholder="Вопрос"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
          <select
            value={type}
            onChange={e => onChange({ ...question, type: e.target.value, options: [], correctAnswer: "" })}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
          >
            {QUESTION_TYPES.map(qt => <option key={qt.value} value={qt.value}>{qt.label}</option>)}
          </select>
        </div>
        <button onClick={onRemove} className="text-white/20 hover:text-red-400 transition-colors mt-1">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {(type === "single_choice" || type === "multiple_choice") && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-white/40 text-xs">Варианты ответа</label>
            <button
              onClick={() => onChange({ ...question, options: [...options, ""] })}
              className="text-indigo-400 text-xs"
            >
              + Вариант
            </button>
          </div>
          {options.map((opt: string, oi: number) => (
            <div key={oi} className="flex gap-2 items-center">
              <input
                type={type === "multiple_choice" ? "checkbox" : "radio"}
                checked={type === "multiple_choice"
                  ? (Array.isArray(question.correctAnswer) ? question.correctAnswer.includes(opt) : false)
                  : question.correctAnswer === opt}
                onChange={() => {
                  if (type === "multiple_choice") {
                    const ca: string[] = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
                    const next = ca.includes(opt) ? ca.filter(x => x !== opt) : [...ca, opt];
                    onChange({ ...question, correctAnswer: next });
                  } else {
                    onChange({ ...question, correctAnswer: opt });
                  }
                }}
                className="accent-indigo-500 mt-0.5"
              />
              <input
                value={opt}
                onChange={e => {
                  const updated = [...options];
                  updated[oi] = e.target.value;
                  onChange({ ...question, options: updated });
                }}
                placeholder={`Вариант ${oi + 1}`}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
              />
              <button onClick={() => onChange({ ...question, options: options.filter((_, j) => j !== oi) })} className="text-white/20 hover:text-red-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <p className="text-white/30 text-xs">{type === "multiple_choice" ? "Отметьте правильные варианты" : "Отметьте правильный вариант"}</p>
        </div>
      )}

      {(type === "fill_blank" || type === "text_input") && (
        <div>
          <label className="text-white/40 text-xs mb-1 block">Правильный ответ</label>
          <input
            value={question.correctAnswer || ""}
            onChange={e => onChange({ ...question, correctAnswer: e.target.value })}
            placeholder="Правильный ответ"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
      )}

      {(type === "match" || type === "order") && (
        <div>
          <label className="text-white/40 text-xs mb-1 block">Правильный порядок/совпадение (JSON массив)</label>
          <input
            value={Array.isArray(question.correctAnswer) ? JSON.stringify(question.correctAnswer) : (question.correctAnswer || "[]")}
            onChange={e => {
              try {
                const parsed = JSON.parse(e.target.value);
                onChange({ ...question, correctAnswer: parsed });
              } catch {
                onChange({ ...question, correctAnswer: e.target.value });
              }
            }}
            placeholder='["item1", "item2"]'
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>
      )}
    </div>
  );
}

function TestEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const questions = content?.questions || [];

  const addQuestion = () => {
    const q = {
      id: Math.random().toString(36).slice(2),
      type: "single_choice",
      question: "",
      options: [],
      correctAnswer: "",
    };
    onChange({ ...content, questions: [...questions, q] });
  };

  const updateQuestion = (i: number, q: any) => {
    const updated = [...questions];
    updated[i] = q;
    onChange({ ...content, questions: updated });
  };

  const removeQuestion = (i: number) => {
    onChange({ ...content, questions: questions.filter((_: any, j: number) => j !== i) });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-white/60 text-xs mb-1.5 block">Проходной балл (%)</label>
          <input
            type="number"
            value={content?.passingScore || 70}
            onChange={e => onChange({ ...content, passingScore: parseInt(e.target.value) || 70 })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="text-white/60 text-xs mb-1.5 block">Лимит (секунд)</label>
          <input
            type="number"
            value={content?.timeLimitSeconds || ""}
            onChange={e => onChange({ ...content, timeLimitSeconds: e.target.value ? parseInt(e.target.value) : null })}
            placeholder="Без лимита"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-white/60 text-xs">Вопросы ({questions.length})</label>
          <button onClick={addQuestion} className="text-indigo-400 text-xs hover:text-indigo-300">
            + Вопрос
          </button>
        </div>
        <div className="space-y-3">
          {questions.map((q: any, i: number) => (
            <QuestionEditor
              key={q.id || i}
              question={q}
              onChange={updated => updateQuestion(i, updated)}
              onRemove={() => removeQuestion(i)}
            />
          ))}
          {questions.length === 0 && (
            <p className="text-white/30 text-xs text-center py-4">Добавьте вопросы</p>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  return (
    <div>
      <label className="text-white/60 text-xs mb-1.5 block">YouTube URL</label>
      <input
        value={content?.url || ""}
        onChange={e => onChange({ ...content, url: e.target.value })}
        placeholder="https://www.youtube.com/watch?v=..."
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
      />
    </div>
  );
}

function BlockEditorPanel({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-white/60 text-xs mb-1.5 block">Заголовок блока</label>
        <input
          value={block.title || ""}
          onChange={e => onChange({ ...block, title: e.target.value })}
          placeholder="Заголовок (необязательно)"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {block.type === "text" && <TextEditor content={block.content} onChange={c => onChange({ ...block, content: c })} />}
      {block.type === "grammar" && <GrammarEditor content={block.content} onChange={c => onChange({ ...block, content: c })} />}
      {block.type === "cards" && <CardsEditor content={block.content} onChange={c => onChange({ ...block, content: c })} />}
      {block.type === "test" && <TestEditor content={block.content} onChange={c => onChange({ ...block, content: c })} />}
      {block.type === "video" && <VideoEditor content={block.content} onChange={c => onChange({ ...block, content: c })} />}
    </div>
  );
}

export default function CourseEditPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const groupId = params.id as string;
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courseLevel, setCourseLevel] = useState("beginner");
  const [courseEmoji, setCourseEmoji] = useState("📖");
  const [courseColor, setCourseColor] = useState("#6366f1");
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);
  const [published, setPublished] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    socialApi.getCourse(groupId, courseId)
      .then(async (data) => {
        setCourse(data.course);
        setCourseTitle(data.course.title);
        setCourseDescription(data.course.description || "");
        setCourseLevel(data.course.level || "beginner");
        setCourseEmoji(data.course.emoji || "📖");
        setCourseColor(data.course.color || "#6366f1");
        setEstimatedMinutes(data.course.estimatedMinutes || 0);
        setPublished(data.course.isPublished);
        const sorted = (data.blocks || []).sort((a: Block, b: Block) => a.orderIndex - b.orderIndex);
        const hydratedBlocks = await Promise.all(
          sorted.map(async (block: Block) => {
            if (block.type !== "test" || !block.content?.testId) {
              return block;
            }

            try {
              const test = await socialApi.getTest(groupId, courseId, block.content.testId);
              return {
                ...block,
                title: block.title || test.title,
                content: {
                  ...block.content,
                  description: test.description || block.content?.description || "",
                  timeLimitSeconds: test.timeLimitSeconds ?? block.content?.timeLimitSeconds ?? null,
                  passingScore: test.passingScore ?? block.content?.passingScore ?? 70,
                  questions: test.questions || block.content?.questions || [],
                  testId: test.id,
                },
              };
            } catch {
              return block;
            }
          })
        );
        setBlocks(hydratedBlocks);
        if (hydratedBlocks.length > 0) setSelectedBlockId(hydratedBlocks[0].id);
      })
      .catch(() => toast.error("Ошибка загрузки курса"))
      .finally(() => setLoading(false));
  }, [groupId, courseId]);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;

  const buildTestPayload = (block: Block) => ({
    title: block.title?.trim() || `${courseTitle || "Course"} test`,
    description: block.content?.description || null,
    blockId: block.id,
    timeLimitSeconds: block.content?.timeLimitSeconds || null,
    passingScore: block.content?.passingScore || 70,
    questions: block.content?.questions || [],
  });

  const saveBlock = async (block: Block) => {
    setSaving(block.id);
    try {
      let nextBlock = block;

      if (block.type === "test") {
        const payload = buildTestPayload(block);
        const savedTest = block.content?.testId
          ? await socialApi.updateTest(groupId, courseId, block.content.testId, payload)
          : await socialApi.createTest(groupId, courseId, payload);

        nextBlock = {
          ...block,
          content: {
            ...block.content,
            testId: savedTest.id,
            description: savedTest.description || block.content?.description || "",
            timeLimitSeconds: savedTest.timeLimitSeconds ?? block.content?.timeLimitSeconds ?? null,
            passingScore: savedTest.passingScore ?? block.content?.passingScore ?? 70,
            questions: savedTest.questions || block.content?.questions || [],
          },
        };

        setBlocks(prev => prev.map(current => current.id === block.id ? nextBlock : current));
      }

      await socialApi.updateBlock(groupId, courseId, block.id, {
        title: nextBlock.title,
        content: nextBlock.content,
        type: nextBlock.type,
        orderIndex: nextBlock.orderIndex,
      });
      toast.success("Сохранено");
    } catch { toast.error("Ошибка сохранения"); }
    finally { setSaving(null); }
  };

  const saveCourse = async () => {
    if (!course) return;
    setSaving("course");
    try {
      await socialApi.updateCourse(groupId, courseId, {
        title: courseTitle,
        description: courseDescription || null,
        emoji: courseEmoji || "📖",
        color: courseColor || "#6366f1",
        level: courseLevel,
        estimatedMinutes,
        isPublished: published,
      });
      setCourse(c => c ? {
        ...c,
        title: courseTitle,
        description: courseDescription || null,
        emoji: courseEmoji || "📖",
        color: courseColor || "#6366f1",
        level: courseLevel,
        estimatedMinutes,
        isPublished: published,
      } : c);
      toast.success("Курс обновлён");
    } catch { toast.error("Ошибка"); }
    finally { setSaving(null); }
  };

  const addBlock = async (type: string) => {
    setShowTypeModal(false);
    const defaultContent: Record<string, any> = {
      text: { markdown: "" },
      grammar: { explanation: "", rules: [], examples: [] },
      cards: { cards: [] },
      test: { questions: [], description: "", passingScore: 70, timeLimitSeconds: null, testId: null },
      video: { url: "" },
    };
    try {
      const block = await socialApi.addBlock(groupId, courseId, {
        type,
        title: null,
        content: defaultContent[type] || {},
        orderIndex: blocks.length,
      });
      setBlocks(prev => [...prev, block]);
      setSelectedBlockId(block.id);
    } catch { toast.error("Ошибка добавления блока"); }
  };

  const deleteBlock = async (blockId: string) => {
    if (!confirm("Удалить блок?")) return;
    try {
      const block = blocks.find(item => item.id === blockId);
      if (block?.type === "test" && block.content?.testId) {
        await socialApi.deleteTest(groupId, courseId, block.content.testId);
      }
      await socialApi.deleteBlock(groupId, courseId, blockId);
      const newBlocks = blocks.filter(b => b.id !== blockId);
      setBlocks(newBlocks);
      if (selectedBlockId === blockId) {
        setSelectedBlockId(newBlocks[0]?.id || null);
      }
      toast.success("Блок удалён");
    } catch { toast.error("Ошибка удаления"); }
  };

  const handleBlockChange = (updated: Block) => {
    setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
  };

  const aiGenerate = async () => {
    if (!user?.isPremium) { toast.error("Функция доступна только для Premium"); return; }
    setAiLoading(true);
    try {
      const { blocks: newBlocks } = await socialApi.aiGenerateBlocks(groupId, courseId, { count: 3 });
      setBlocks(prev => [...prev, ...newBlocks]);
      toast.success(`Создано ${newBlocks.length} блоков`);
    } catch { toast.error("Ошибка AI генерации"); }
    finally { setAiLoading(false); }
  };

  const BLOCK_TYPE_ICONS: Record<string, React.ElementType> = {
    text: Type,
    grammar: BookOpen,
    cards: CreditCard,
    test: ClipboardList,
    video: Video,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-60">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!course) return <div className="text-center text-white/50 py-20">Курс не найден</div>;

  return (
    <>
      <div className="max-w-5xl mx-auto">
        {/* Back */}
        <button onClick={() => router.back()} className="flex items-center gap-1 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Назад к курсу
        </button>

        {/* Toolbar */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3"
        >
          <input
            value={courseTitle}
            onChange={e => setCourseTitle(e.target.value)}
            className="flex-1 min-w-[200px] bg-transparent text-white font-semibold text-lg focus:outline-none placeholder:text-white/30"
            placeholder="Название курса"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPublished(p => !p)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                published ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/50"
              )}
            >
              {published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {published ? "Опубликован" : "Черновик"}
            </button>
            <button
              onClick={aiGenerate}
              disabled={aiLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/20 text-violet-400 text-sm hover:bg-violet-500/30 transition-colors disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              AI
            </button>
            <button
              onClick={saveCourse}
              disabled={saving === "course"}
              className="flex items-center gap-2 px-4 py-2 rounded-xl btn-gradient text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving === "course" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Сохранить
            </button>
          </div>
        </motion.div>

        <div className="flex gap-5">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="glass-card rounded-2xl p-4 mb-4 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  value={courseEmoji}
                  onChange={e => setCourseEmoji(e.target.value || "📖")}
                  maxLength={2}
                  className="w-14 h-12 rounded-xl bg-white/5 border border-white/10 text-center text-2xl focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="color"
                  value={courseColor}
                  onChange={e => setCourseColor(e.target.value)}
                  className="h-12 w-full rounded-xl bg-white/5 border border-white/10 p-1 cursor-pointer"
                />
              </div>

              <select
                value={courseLevel}
                onChange={e => setCourseLevel(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {LEVELS.map(level => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>

              <input
                type="number"
                min={0}
                value={estimatedMinutes}
                onChange={e => setEstimatedMinutes(parseInt(e.target.value, 10) || 0)}
                placeholder="Minutes"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
              />

              <textarea
                value={courseDescription}
                onChange={e => setCourseDescription(e.target.value)}
                rows={4}
                placeholder="Course description"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-white/60 text-xs font-semibold">Блоки ({blocks.length})</span>
                <button
                  onClick={() => setShowTypeModal(true)}
                  className="p-1 rounded-lg hover:bg-white/10 text-indigo-400"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {blocks.length === 0 ? (
                <div className="p-4 text-center text-white/30 text-xs">
                  Нажмите + чтобы добавить блок
                </div>
              ) : (
                <div>
                  {blocks.map((block, i) => {
                    const Icon = BLOCK_TYPE_ICONS[block.type] || Type;
                    const isSelected = selectedBlockId === block.id;
                    return (
                      <div
                        key={block.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors border-b border-white/5 last:border-0 group",
                          isSelected ? "bg-indigo-500/20" : "hover:bg-white/5"
                        )}
                        onClick={() => setSelectedBlockId(block.id)}
                      >
                        <GripVertical className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                        <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", isSelected ? "text-indigo-400" : "text-white/40")} />
                        <span className={cn("text-xs flex-1 truncate", isSelected ? "text-white" : "text-white/60")}>
                          {block.title || `Блок ${i + 1}`}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); deleteBlock(block.id); }}
                          className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Editor panel */}
          <div className="flex-1 min-w-0">
            {selectedBlock ? (
              <motion.div
                key={selectedBlock.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card rounded-2xl p-5"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const Icon = BLOCK_TYPE_ICONS[selectedBlock.type] || Type;
                      return <Icon className="w-4 h-4 text-indigo-400" />;
                    })()}
                    <span className="text-white/60 text-sm">
                      {BLOCK_TYPES.find(bt => bt.type === selectedBlock.type)?.label || selectedBlock.type}
                    </span>
                  </div>
                  <button
                    onClick={() => saveBlock(selectedBlock)}
                    disabled={saving === selectedBlock.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 text-indigo-400 text-sm hover:bg-indigo-500/30 transition-colors disabled:opacity-50"
                  >
                    {saving === selectedBlock.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Сохранить блок
                  </button>
                </div>
                <BlockEditorPanel
                  block={selectedBlock}
                  onChange={handleBlockChange}
                />
              </motion.div>
            ) : (
              <div className="glass-card rounded-2xl p-12 text-center text-white/30">
                <Type className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>Выберите блок для редактирования</p>
                <button
                  onClick={() => setShowTypeModal(true)}
                  className="mt-4 text-indigo-400 text-sm hover:text-indigo-300"
                >
                  Добавить первый блок
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add block type modal */}
      <AnimatePresence>
        {showTypeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-2xl w-full max-w-sm p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">Тип блока</h2>
                <button onClick={() => setShowTypeModal(false)} className="p-1 rounded-lg hover:bg-white/10">
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>
              <div className="space-y-2">
                {BLOCK_TYPES.map(({ type, label, icon: Icon, desc }) => (
                  <button
                    key={type}
                    onClick={() => addBlock(type)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{label}</p>
                      <p className="text-white/40 text-xs">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
