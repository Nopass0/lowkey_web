// Пакет config загружает и хранит всю конфигурацию jopad.
//
// Значения читаются из переменных окружения. Если запущен с файлом .env
// (через godotenv), он загружается автоматически при старте.
//
// Переменные окружения и их назначение:
//
//   JOPA_UDP_ADDR          — адрес UDP-сервера регистрации устройств (default ":9100")
//   JOPA_RELAY_ADDR        — адрес TCP relay-сервера туннелирования (default ":9101")
//   JOPA_HTTP_ADDR         — адрес HTTP API бутстрапа и управления (default ":9109")
//   JOPA_PUBLIC_IP         — публичный IP сервера (отдаётся клиенту при бутстрапе)
//   JOPA_PUBLIC_HOSTNAME   — публичный hostname (для bootstrap-ответа клиенту)
//   JOPA_SITE_URL          — URL сайта Lowkey (для редиректа при истёкшей подписке)
//   VOIDDB_URL             — адрес VoidDB (default "http://localhost:7700")
//   VOIDDB_TOKEN           — JWT-токен для VoidDB; если истёк — используется login/pass
//   VOIDDB_USERNAME        — логин VoidDB (default "admin")
//   VOIDDB_PASSWORD        — пароль VoidDB (default "admin")
//   JOPA_REDIRECT_URL      — URL перенаправления при истёкшей подписке
//   JOPA_ADMIN_KEY         — секретный ключ для защищённых /api/v1/admin/* маршрутов
//   JOPA_GRACE_HOURS       — кол-во часов льготного периода после истечения подписки
//   JOPA_SUB_CACHE_SECONDS — TTL кэша результатов проверки sub_token в секундах (default 300)
package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config содержит всю конфигурацию сервера, собранную при старте.
type Config struct {
	// Сетевые адреса трёх серверов
	UDPAddr   string // UDP-сервер: регистрация устройств
	RelayAddr string // TCP relay: туннелирование пользовательского трафика
	HTTPAddr  string // HTTP API: бутстрап, управление подписками

	// Публичные реквизиты сервера (отдаются клиенту в ответе bootstrap)
	PublicIP       string
	PublicHostname string
	SiteURL        string

	// Параметры подключения к VoidDB
	VoidDBURL      string
	VoidDBToken    string // JWT; при истечении автоматически используется login/pass
	VoidDBUsername string
	VoidDBPassword string

	// Поведение при истёкшей подписке
	RedirectURL string // куда редиректить пользователя с истёкшей подпиской

	// Безопасность
	AdminKey string // X-Admin-Key заголовок для admin-эндпоинтов

	// Тонкая настройка
	GraceHours      int // льготный период после истечения подписки (часы)
	SubCacheSeconds int // как долго кэшировать результат проверки sub_token
}

// Load читает конфигурацию из окружения.
// Файл .env загружается автоматически (если существует рядом с бинарником).
// Для production-окружения переменные лучше задавать напрямую в PM2 ecosystem
// или через systemd EnvironmentFile — без .env файла на диске.
func Load() *Config {
	// godotenv.Load() не возвращает ошибку если .env не найден — просто ничего не делает.
	_ = godotenv.Load()
	return &Config{
		UDPAddr:         getenv("JOPA_UDP_ADDR", ":9100"),
		RelayAddr:       getenv("JOPA_RELAY_ADDR", ":9101"),
		HTTPAddr:        getenv("JOPA_HTTP_ADDR", ":9109"),
		PublicIP:        getenv("JOPA_PUBLIC_IP", ""),
		PublicHostname:  getenv("JOPA_PUBLIC_HOSTNAME", ""),
		SiteURL:         getenv("JOPA_SITE_URL", "https://lowkey.su"),
		VoidDBURL:       getenv("VOIDDB_URL", "http://localhost:7700"),
		VoidDBToken:     getenv("VOIDDB_TOKEN", ""),
		VoidDBUsername:  getenv("VOIDDB_USERNAME", "admin"),
		VoidDBPassword:  getenv("VOIDDB_PASSWORD", "admin"),
		RedirectURL:     getenv("JOPA_REDIRECT_URL", "https://pay.myvpn.com/renew"),
		AdminKey:        getenv("JOPA_ADMIN_KEY", "jopa-admin-key"),
		GraceHours:      getenvInt("JOPA_GRACE_HOURS", 24),
		SubCacheSeconds: getenvInt("JOPA_SUB_CACHE_SECONDS", 300),
	}
}

// getenv возвращает значение переменной окружения key.
// Если переменная не задана или пуста — возвращает fallback.
func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// getenvInt парсит целочисленную переменную окружения.
// При отсутствии переменной или ошибке парсинга возвращает fallback.
func getenvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
