// Пакет subscription реализует Gate — «охранника» подписок.
//
// Gate проверяет, активна ли подписка пользователя по его sub_token.
// Каждый раз, когда клиент открывает новый TCP-туннель или отправляет
// UDP-регистрацию, Gate.Check() вызывается для авторизации.
//
// Чтобы не нагружать VoidDB при каждом пакете/соединении, Gate кэширует
// результат проверки на SubCacheSeconds секунд (по умолчанию 300 = 5 минут).
// Это значит, что после отзыва подписки у пользователя ещё до 5 минут
// будет доступ. Для повышения точности уменьшите JOPA_SUB_CACHE_SECONDS.
//
// Схема проверки подписки:
//
//  1. Проверяем in-memory кэш. Если запись свежая — возвращаем её.
//  2. Иначе идём в VoidDB: ищем документ в коллекции "subscriptions" по полю token.
//  3. Если документ не найден → StatusNone (доступ запрещён).
//  4. Читаем поля status и expires_at / activeUntil.
//  5. Если статус active/trial и срок истёк → меняем на StatusExpired.
//  6. Сохраняем решение в кэш и возвращаем его.
package subscription

import (
	"context"
	"sync"
	"time"

	voidorm "github.com/Nopass0/void_go"

	"jopa-stack/jopa-server/internal/storage"
)

// Status — тип состояния подписки.
type Status string

const (
	// StatusActive — подписка активна и не просрочена.
	StatusActive Status = "active"
	// StatusExpired — подписка была активна, но срок истёк.
	StatusExpired Status = "expired"
	// StatusSuspended — подписка приостановлена администратором.
	StatusSuspended Status = "suspended"
	// StatusTrial — пробный период (приравнивается к active в проверках доступа).
	StatusTrial Status = "trial"
	// StatusNone — токен не найден в базе данных.
	StatusNone Status = "none"
)

// Decision — результат проверки подписки, который Gate возвращает вызывающему коду.
// Вызывающий код должен пропустить трафик только при Status == StatusActive || StatusTrial.
type Decision struct {
	Status      Status    `json:"status"`
	ExpiresAt   time.Time `json:"expires_at"` // когда истекает подписка
	RedirectURL string    `json:"redirect_url,omitempty"` // куда слать пользователя при истечении
	PlanID      string    `json:"plan_id,omitempty"`      // тарифный план
}

// cacheEntry — одна запись в кэше: решение + момент истечения кэша.
type cacheEntry struct {
	decision Decision
	until    time.Time // время, после которого запись считается устаревшей
}

// Gate хранит in-memory кэш решений и умеет обращаться к VoidDB за свежими данными.
// Потокобезопасен: cacheLock защищает map от конкурентного доступа из горутин relay-сервера.
type Gate struct {
	store     *storage.Store
	redirect  string        // URL редиректа при истёкшей подписке
	cacheTTL  time.Duration // TTL каждой записи кэша
	cacheLock sync.RWMutex
	cache     map[string]cacheEntry // ключ — sub_token
}

// NewGate создаёт Gate с указанным хранилищем, URL редиректа и TTL кэша.
func NewGate(store *storage.Store, redirect string, cacheTTL time.Duration) *Gate {
	return &Gate{
		store:    store,
		redirect: redirect,
		cacheTTL: cacheTTL,
		cache:    make(map[string]cacheEntry),
	}
}

// Check проверяет, активна ли подписка с данным sub_token.
//
// Алгоритм:
//  1. RLock → смотрим кэш. Если свежо → возвращаем без обращения к БД.
//  2. Иначе запрашиваем документ из коллекции "subscriptions".
//  3. Парсим статус и expires_at. Если время вышло — ставим StatusExpired.
//  4. Кладём в кэш с TTL и возвращаем.
//
// ctx должен содержать разумный таймаут (обычно 8 сек от входящего соединения).
func (g *Gate) Check(ctx context.Context, subToken string) Decision {
	now := time.Now().UTC()

	// ── Шаг 1: Проверка кэша ──────────────────────────────────────
	g.cacheLock.RLock()
	cached, ok := g.cache[subToken]
	g.cacheLock.RUnlock()
	if ok && now.Before(cached.until) {
		// Кэш актуален — возвращаем без похода в БД.
		return cached.decision
	}

	// ── Шаг 2: Запрос к VoidDB ────────────────────────────────────
	doc, err := g.store.FindOne(ctx, "subscriptions", voidorm.NewQuery().Where("token", voidorm.Eq, subToken))
	if err != nil {
		// Документ не найден или ошибка сети → доступ запрещён.
		return g.setCache(subToken, Decision{Status: StatusNone, RedirectURL: g.redirect})
	}

	// ── Шаг 3: Разбор статуса и срока действия ────────────────────
	status := Status(g.store.AsString(doc, "status"))
	if status == "" {
		// Старые документы без поля status считаются активными.
		status = StatusActive
	}

	// Поддерживаем оба исторических имени поля: expires_at и activeUntil.
	expiresAt := g.store.AsTime(doc, "expires_at")
	if expiresAt.IsZero() {
		expiresAt = g.store.AsTime(doc, "activeUntil")
	}

	// Если статус active/trial, но срок уже прошёл — помечаем как expired.
	if (status == StatusActive || status == StatusTrial) && !expiresAt.IsZero() && now.After(expiresAt) {
		status = StatusExpired
	}

	// ── Шаг 4: Формируем Decision ─────────────────────────────────
	decision := Decision{
		Status:      status,
		ExpiresAt:   expiresAt,
		PlanID:      g.store.AsString(doc, "plan_id"),
		RedirectURL: "",
	}
	// plan_id хранится в двух вариантах написания (исторически).
	if decision.PlanID == "" {
		decision.PlanID = g.store.AsString(doc, "planId")
	}
	// Только при неактивной подписке добавляем URL редиректа,
	// чтобы клиент мог показать страницу продления.
	if status != StatusActive && status != StatusTrial {
		decision.RedirectURL = g.redirect
	}

	return g.setCache(subToken, decision)
}

// setCache сохраняет решение в кэш и возвращает его.
// Используем Lock (не RLock), т.к. модифицируем map.
func (g *Gate) setCache(subToken string, d Decision) Decision {
	g.cacheLock.Lock()
	g.cache[subToken] = cacheEntry{decision: d, until: time.Now().Add(g.cacheTTL)}
	g.cacheLock.Unlock()
	return d
}
