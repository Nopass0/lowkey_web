import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Globe, Shield, Zap } from "lucide-react";
import { LandingFooter } from "@/components/landing-footer";
import styles from "./legacy.module.css";

const TG_PROXY_LINK =
  "tg://proxy?server=s1.lowkey.su&port=8443&secret=dd1cc273b362e8d906c0d94213ef7087cf";
const TG_PROXY_SHARE_LINK =
  "https://t.me/proxy?server=s1.lowkey.su&port=8443&secret=dd1cc273b362e8d906c0d94213ef7087cf";

const pageTitle =
  "MTProto прокси для Telegram и SMM: включить VPN, ускоритель интернета и белый интернет";
const pageDescription =
  "Публичная страница lowkey для быстрого подключения MTProto proxy в Telegram. Подходит для SMM, когда Telegram не работает, нужен белый интернет, быстрый доступ к мессенджеру и кнопка подключения в одно нажатие.";

const faqItems = [
  {
    question: "Что делает эта кнопка?",
    answer:
      "Кнопка открывает Telegram по прямой ссылке tg://proxy и предлагает сразу добавить MTProto proxy без ручного ввода адреса, порта и ключа.",
  },
  {
    question: "Когда это полезно?",
    answer:
      "Страница подходит, когда Telegram не работает, сообщения грузятся медленно, не открываются медиа, нужен более стабильный доступ или быстрый способ включить прокси без отдельной настройки VPN-клиента.",
  },
  {
    question: "Это ускоритель интернета?",
    answer:
      "Для Telegram и связанных с ним соединений это работает как ускоритель интернета: маршрут становится стабильнее, отклик ниже, а доступ к мессенджеру и каналам надёжнее.",
  },
  {
    question: "Что значит белый интернет?",
    answer:
      "На практике это означает более прямой и стабильный доступ к привычным сервисам без типичных сетевых ограничений и с меньшим количеством сбоев при подключении к Telegram.",
  },
  {
    question: "Нужно ли что-то настраивать вручную?",
    answer:
      "Нет. Основной сценарий рассчитан на одно нажатие. Если приложение Telegram уже установлено, достаточно открыть ссылку и подтвердить добавление proxy.",
  },
  {
    question: "Покажется ли sponsor channel?",
    answer:
      "Да, после подключения Telegram может показывать sponsor channel или sponsor bot, если для прокси настроен официальный adTag от @MTProxybot.",
  },
];

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  keywords: [
    "mtproto proxy telegram",
    "telegram proxy",
    "telegram не работает",
    "включить vpn telegram",
    "ускоритель интернета",
    "белый интернет",
    "прокси для телеграм",
    "mtproto lowkey",
    "telegram vpn",
    "подключить прокси telegram",
    "SMM telegram proxy",
    "СММ telegram proxy",
    "прокси для СММ telegram",
  ],
  alternates: {
    canonical: "/telegram-proxy",
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: "/telegram-proxy",
    siteName: "lowkey",
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
};

function SeoJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: pageTitle,
        description: pageDescription,
        url: "https://lowkey.su/telegram-proxy",
      },
      {
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function TelegramProxyPage() {
  return (
    <div className={`${styles.page} min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.22),_transparent_38%),linear-gradient(180deg,_rgba(9,9,11,1)_0%,_rgba(10,10,14,1)_46%,_rgba(7,7,10,1)_100%)] text-foreground`}>
      <SeoJsonLd />

      <main>
        <section className="px-4 pb-12 pt-8 md:px-8 md:pb-16 md:pt-12">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Link
                href="/"
                className="font-medium transition-colors hover:text-primary"
              >
                lowkey
              </Link>
              <span>/</span>
              <span className="text-foreground">Telegram MTProto Proxy</span>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
              <div className="space-y-6">
                <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
                  Публичная страница подключения
                </div>

                <div className="space-y-4">
                  <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight text-balance md:text-6xl">
                    MTProto прокси для Telegram, когда Telegram не работает и
                    нужен белый интернет
                  </h1>
                  <p className="max-w-3xl text-base leading-8 text-muted-foreground md:text-lg">
                    Эта публичная страница создана для быстрого подключения
                    Telegram proxy в одно нажатие. Подходит, если Telegram
                    открывается медленно, сообщения отправляются с задержкой,
                    не грузятся каналы, нужен стабильный маршрут и быстрый
                    доступ к мессенджеру без долгой ручной настройки.
                  </p>
                  <p className="max-w-3xl text-base leading-8 text-muted-foreground md:text-lg">
                    Для многих пользователей это одновременно и прокси для
                    Telegram, и ускоритель интернета для повседневной работы,
                    и способ получить более прямой, белый интернет для
                    привычных сервисов.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <a
                    href={TG_PROXY_LINK}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-[0_16px_40px_rgba(37,99,235,0.35)] transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
                  >
                    Включить VPN
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href={TG_PROXY_SHARE_LINK}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-border/70 bg-background/40 px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-background/70"
                  >
                    Открыть через Telegram
                  </a>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Zap className="h-4 w-4 text-primary" />
                      Ускоритель интернета
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Более стабильный маршрут для Telegram, каналов, медиа и
                      быстрых переключений между чатами.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Globe className="h-4 w-4 text-primary" />
                      Белый интернет
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Меньше сбоев и сетевых ограничений, когда нужен ровный и
                      привычный доступ к сервисам.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Shield className="h-4 w-4 text-primary" />
                      Быстрое подключение
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Без ручного ввода адреса, порта и ключа: Telegram
                      открывается сразу по готовой ссылке.
                    </p>
                  </div>
                </div>
              </div>

              <aside className="rounded-[28px] border border-border/70 bg-background/55 p-6 shadow-2xl shadow-black/20 backdrop-blur">
                <div className="mb-5 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                  Готово к подключению
                </div>
                <div className="space-y-5">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Host
                    </div>
                    <div className="mt-2 text-lg font-semibold">s1.lowkey.su</div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        Port
                      </div>
                      <div className="mt-2 text-lg font-semibold">8443</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        Protocol
                      </div>
                      <div className="mt-2 text-lg font-semibold">MTProto</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-black/30 p-4">
                    <div className="mb-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Прямая ссылка
                    </div>
                    <code className="block break-all text-xs leading-6 text-sky-200">
                      {TG_PROXY_LINK}
                    </code>
                  </div>

                  <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                    {[
                      "Работает без отдельного перехода в личный кабинет.",
                      "Подходит для Android, iPhone, iPad, macOS и Windows с установленным Telegram.",
                      "После подключения в Telegram может отображаться sponsor channel внизу списка чатов.",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="px-4 py-12 md:px-8 md:py-16">
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
            {[
              {
                title: "Telegram не работает",
                text: "Если Telegram долго подключается, не открывает чаты, не отправляет сообщения или не загружает медиа, эта страница помогает быстро включить MTProto proxy без лишних шагов.",
              },
              {
                title: "Прокси как быстрый вход",
                text: "MTProto удобен как быстрый старт: открыл ссылку, подтвердил подключение и сразу получил рабочий маршрут для Telegram.",
              },
              {
                title: "Трафик для VPN и оффера",
                text: "Страница рассчитана на поисковый трафик по запросам про Telegram proxy, белый интернет, ускоритель интернета и подключение VPN в одно нажатие.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-[24px] border border-border/70 bg-background/35 p-6"
              >
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="px-4 py-12 md:px-8 md:py-16">
          <div className="mx-auto max-w-6xl rounded-[28px] border border-border/70 bg-background/40 p-6 md:p-8">
            <div className="max-w-3xl">
              <div className="text-xs font-medium uppercase tracking-[0.24em] text-primary">
                Как подключить
              </div>
              <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
                Понятный сценарий подключения для Telegram, SMM и обычных
                пользователей
              </h2>
              <p className="mt-4 text-base leading-8 text-muted-foreground">
                Страница специально сделана простой и понятной для поискового
                трафика: минимум шагов, прямой CTA, чёткое объяснение, зачем
                нужен proxy и как он помогает, если Telegram не работает или
                нужен стабильный доступ.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                "1. Нажмите кнопку «Включить VPN» и откройте Telegram.",
                "2. Подтвердите добавление MTProto proxy в приложении.",
                "3. Используйте Telegram с более стабильным и быстрым маршрутом.",
              ].map((step) => (
                <div
                  key={step}
                  className="rounded-2xl border border-border/70 bg-black/20 p-5 text-sm font-medium leading-7"
                >
                  {step}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 md:px-8 md:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 max-w-2xl">
              <div className="text-xs font-medium uppercase tracking-[0.24em] text-primary">
                FAQ
              </div>
              <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
                Частые вопросы про Telegram proxy, VPN и белый интернет
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {faqItems.map((item) => (
                <article
                  key={item.question}
                  className="rounded-2xl border border-border/70 bg-background/35 p-6"
                >
                  <h3 className="text-lg font-semibold leading-7 text-foreground">
                    {item.question}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {item.answer}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 pt-4 md:px-8">
          <div className="mx-auto max-w-6xl rounded-[28px] border border-primary/30 bg-primary/10 p-8 text-center">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              Нужен быстрый доступ к Telegram прямо сейчас?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
              Откройте готовую ссылку, подтвердите подключение и включите
              MTProto proxy без ручной настройки. Это самый быстрый путь для
              пользователя, который пришёл из поиска и хочет сразу включить
              рабочий маршрут.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={TG_PROXY_LINK}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-[0_16px_40px_rgba(37,99,235,0.35)] transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
              >
                Включить VPN
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/me"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-border/70 bg-background/60 px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-background"
              >
                Личный кабинет
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
