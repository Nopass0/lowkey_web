import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";
import { ThemeListener } from "@/components/theme-listener";
import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://lowkey.su"),
  title: {
    default: "lowkey",
    template: "%s | lowkey",
  },
  description:
    "lowkey — сервис для защищенного соединения, стабильной работы онлайн-сервисов и оптимизации сетевых маршрутов.",
  applicationName: "lowkey",
  keywords: [
    "lowkey",
    "защищенное соединение",
    "безопасный интернет",
    "стабильное соединение",
    "оптимизация маршрутов",
    "vpn сервис",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "lowkey",
    description:
      "Защищенное соединение, стабильный доступ к сервисам и оптимизация интернет-маршрутов.",
    url: "/",
    siteName: "lowkey",
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "lowkey",
    description:
      "Защищенное соединение и оптимизация интернет-маршрутов для повседневной работы.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={notoSans.variable}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeListener />
        {children}
      </body>
    </html>
  );
}
