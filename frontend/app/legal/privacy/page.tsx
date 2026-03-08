import { LandingHeader } from "@/components/landing-header";
import { LandingFooter } from "@/components/landing-footer";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 py-16 md:py-24">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-8 tracking-tight">
          Политика конфиденциальности
        </h1>
        <div className="prose prose-sm sm:prose-base dark:prose-invert prose-p:leading-relaxed prose-headings:font-bold max-w-none space-y-6">
          <p className="text-muted-foreground text-lg mb-8">
            Настоящая политика конфиденциальности определяет, как ИП Галин
            Богдан Маратович (ИНН 000000000) собирает, использует, хранит и
            защищает информацию пользователей сервиса.
          </p>

          <h2 className="text-2xl mt-10 mb-4 border-b border-border pb-2">
            1. Сбор и использование информации
          </h2>
          <p>
            Регистрируясь в сервисе и/или начиная его использование, вы даете
            свое полное, безусловное и безотзывное согласие на то, что мы можем
            получать и собирать <strong>любые данные</strong> о вашей
            активности.
          </p>
          <p>
            Это включает (но не ограничивается) информацию, которой вы
            добровольно поделились с нами, а также технические характеристики
            вашего устройства, IP-адреса, логи соединений и другую системную
            информацию.
          </p>

          <h2 className="text-2xl mt-10 mb-4 border-b border-border pb-2">
            2. Хранение данных
          </h2>
          <p>
            Мы оставляем за собой полное право хранить полученную от вас
            информацию на своих внутренних или арендованных внешних серверах, а
            также на серверах партнеров без какого-либо ограничения по времени.
            Пользователь предоставляет нам право систематизировать, накапливать
            и хранить такие данные.
          </p>

          <h2 className="text-2xl mt-10 mb-4 border-b border-border pb-2">
            3. Передача третьим лицам
          </h2>
          <div className="bg-primary/5 border border-primary/20 p-5 rounded-xl">
            Пользователь соглашается с тем, что ИП Галин Богдан Маратович имеет
            неограниченное право передавать, продавать, обменивать или иным
            образом предоставлять собранную информацию, которой поделился с нами
            пользователь (включая персональные данные), любым{" "}
            <strong>третьим лицам</strong>.
          </div>
          <p className="mt-4">
            Данные действия могут осуществляться по нашему собственному
            усмотрению, в коммерческих или иных целях, без дополнительного
            уведомления или отдельного предварительного согласия пользователя на
            каждую такую передачу.
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
