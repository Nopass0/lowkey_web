import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Copy, Globe, Shield, Zap } from "lucide-react";
import { LandingFooter } from "@/components/landing-footer";
import styles from "./legacy.module.css";

type PublicMtproto = {
  enabled?: boolean;
  host?: string;
  port?: number;
  protocol?: string;
  tgLink?: string | null;
  shareLink?: string | null;
  botUsername?: string | null;
};

const fallbackProxy: Required<Pick<PublicMtproto, "host" | "port">> & {
  tgLink: string;
  shareLink: string;
} = {
  // Fallback only — normally the page fetches /api/servers/public/mtproto which
  // returns the live host/port/secret from mtproto_settings. Port 2444 matches
  // the hysteria-server mtproto_listen on the production node.
  host: "193.41.5.130",
  port: 2444,
  tgLink:
    "tg://proxy?server=193.41.5.130&port=2444&secret=ddb46d3009c13e0ee5fbea34005e3dd39f",
  shareLink:
    "https://t.me/proxy?server=193.41.5.130&port=2444&secret=ddb46d3009c13e0ee5fbea34005e3dd39f",
};

const pageTitle = "MTProto прокси lowkey для Telegram";
const pageDescription =
  "Актуальная публичная ссылка lowkey для подключения MTProto proxy в Telegram на телефоне или компьютере.";

const faqItems = [
  {
    question: "Что делает эта страница?",
    answer:
      "Открывает Telegram по готовой ссылке и предлагает добавить MTProto proxy без ручного ввода сервера, порта и ключа.",
  },
  {
    question: "На каких устройствах работает proxy?",
    answer:
      "Ссылка подходит для Telegram на Android, iPhone, iPad, macOS, Windows и Linux, если приложение поддерживает MTProto proxy.",
  },
  {
    question: "Это заменяет VLESS VPN?",
    answer:
      "Нет. MTProto помогает Telegram, а VLESS VPN нужен для полного туннеля трафика через VPN-клиент.",
  },
  {
    question: "Что делать, если Telegram не открылся?",
    answer:
      "Скопируйте ссылку ниже и откройте ее на устройстве, где установлен Telegram, либо вставьте host, port и secret вручную.",
  },
];

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/telegram-proxy" },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: "/telegram-proxy",
    siteName: "lowkey",
    locale: "ru_RU",
    type: "website",
  },
  robots: { index: true, follow: true },
};

async function getProxy() {
  const apiUrl = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "https://lowkey.su/api"
  ).replace(/\/$/, "");

  try {
    const response = await fetch(`${apiUrl}/servers/public/mtproto`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!response.ok) {
      throw new Error(`MTProto API returned ${response.status}`);
    }
    const data = (await response.json()) as PublicMtproto;
    if (data.enabled && data.tgLink && data.shareLink && data.host && data.port) {
      return data;
    }
  } catch (error) {
    console.error("[TelegramProxyPage] failed to load public MTProto settings", error);
  }

  return fallbackProxy;
}

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
          acceptedAnswer: { "@type": "Answer", text: item.answer },
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

export default async function TelegramProxyPage() {
  const proxy = await getProxy();
  const tgLink = proxy.tgLink || fallbackProxy.tgLink;
  const shareLink = proxy.shareLink || fallbackProxy.shareLink;
  const host = proxy.host || fallbackProxy.host;
  const port = proxy.port || fallbackProxy.port;

  return (
    <div className={`${styles.page} min-h-screen text-foreground`}>
      <SeoJsonLd />
      <main>
        <section className="px-4 pb-12 pt-8 md:px-8 md:pb-16 md:pt-12">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Link href="/" className="font-medium transition-colors hover:text-primary">
                lowkey
              </Link>
              <span>/</span>
              <span className="text-foreground">Telegram MTProto Proxy</span>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
              <div className="space-y-6">
                <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase text-primary">
                  Актуальная ссылка
                </div>
                <div className="space-y-4">
                  <h1>MTProto прокси lowkey для Telegram</h1>
                  <p className="max-w-3xl text-base leading-8 text-muted-foreground md:text-lg">
                    Нажмите кнопку, чтобы открыть Telegram и добавить рабочий proxy.
                    Страница берет настройки с сервера, поэтому после изменения в
                    админке здесь показывается актуальная ссылка.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <a
                    href={tgLink}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground"
                  >
                    Подключить в Telegram
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href={shareLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/40 px-6 py-3 text-base font-semibold text-foreground"
                  >
                    Открыть ссылку
                    <Copy className="h-4 w-4" />
                  </a>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      icon: <Zap className="h-4 w-4 text-primary" />,
                      title: "Быстро",
                      text: "Подключение в один клик без ручного ввода ключа.",
                    },
                    {
                      icon: <Globe className="h-4 w-4 text-primary" />,
                      title: "Актуально",
                      text: "Host, port и secret берутся из backend настроек.",
                    },
                    {
                      icon: <Shield className="h-4 w-4 text-primary" />,
                      title: "Совместимо",
                      text: "Работает в официальных клиентах Telegram с MTProto.",
                    },
                  ].map((item) => (
                    <article key={item.title} className="rounded-2xl border border-border/70 bg-background/35 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                        {item.icon}
                        {item.title}
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">{item.text}</p>
                    </article>
                  ))}
                </div>
              </div>

              <aside className="rounded-[28px] border border-border/70 bg-background/55 p-6 shadow-2xl shadow-black/20">
                <div className="mb-5 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                  Готово к подключению
                </div>
                <div className="space-y-5">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Host</div>
                    <div className="mt-2 text-lg font-semibold">{host}</div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">Port</div>
                      <div className="mt-2 text-lg font-semibold">{port}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">Protocol</div>
                      <div className="mt-2 text-lg font-semibold">MTProto</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-black/30 p-4">
                    <div className="mb-2 text-xs uppercase text-muted-foreground">
                      Прямая ссылка
                    </div>
                    <code className="block break-all text-xs leading-6 text-sky-200">
                      {shareLink}
                    </code>
                  </div>
                  <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                    {[
                      "Открывайте ссылку на устройстве, где установлен Telegram.",
                      "Для полного VPN используйте VLESS ссылку в личном кабинете.",
                      "После смены настроек в админке обновите страницу.",
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
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2">
            {faqItems.map((item) => (
              <article key={item.question} className="rounded-2xl border border-border/70 bg-background/35 p-6">
                <h2 className="text-lg font-semibold leading-7 text-foreground">
                  {item.question}
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
