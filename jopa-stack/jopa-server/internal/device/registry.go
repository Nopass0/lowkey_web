// Пакет device реализует Registry — реестр устройств пользователей JOPA.
//
// Каждый раз, когда клиент успешно прошёл UDP-регистрацию (sub_token валиден),
// Registry.Register() создаёт или обновляет запись в коллекции "jopa_devices".
//
// Запись jopa_device содержит:
//   - subscription_id — ссылка на документ подписки в коллекции "subscriptions"
//   - sub_token       — токен подписки (для удобного поиска)
//   - device_id       — UUID устройства клиента
//   - platform        — "windows", "android", "ios", "linux"
//   - os_version      — версия ОС
//   - device_model    — имя компьютера или модель телефона
//   - client_version  — версия клиентского приложения Lowkey
//   - is_online       — true (обновляется в true при каждой регистрации)
//   - last_ip         — IP-адрес клиента (для мониторинга и безопасности)
//   - last_seen_at    — время последней активности (RFC3339)
//   - registered_at   — время первой регистрации (только при создании)
//
// Логика upsert:
//  1. Ищем документ по паре (subscription_id, device_id).
//  2. Если не найден — вставляем новый с generated UUID как _id.
//  3. Если найден — PATCH с обновлёнными полями (ip, last_seen, is_online, версии).
package device

import (
	"context"
	"time"

	voidorm "github.com/Nopass0/void_go"
	"github.com/google/uuid"

	"jopa-stack/jopa-server/internal/storage"
)

// RegisterInput содержит данные, которые приходят с UDP-пакета регистрации.
// Заполняется из protocol.RegisterRequest + IP-адреса входящего соединения.
type RegisterInput struct {
	SubToken      string `json:"sub_token"`    // токен активной подписки
	DeviceID      string `json:"device_id"`    // UUID устройства
	DeviceToken   string `json:"device_token"` // дополнительный токен устройства (опционально)
	Platform      string `json:"platform"`     // "windows", "android", "ios", "linux"
	OSVersion     string `json:"os_version"`   // версия ОС
	DeviceModel   string `json:"device_model"` // имя машины / модель телефона
	ClientVersion string `json:"client_version"` // версия клиента
	LastIP        string `json:"last_ip"`      // IP:port входящего UDP-пакета
}

// Registry умеет создавать и обновлять записи устройств в VoidDB.
type Registry struct {
	store *storage.Store
}

// New создаёт Registry с указанным хранилищем.
func New(store *storage.Store) *Registry {
	return &Registry{store: store}
}

// Register выполняет upsert записи устройства в коллекции "jopa_devices".
//
// Ошибки:
//   - Если sub_token не найден в коллекции "subscriptions" → ошибка (не должно
//     случаться, т.к. Gate уже проверил токен до вызова Register).
//   - Ошибки VoidDB логируются выше по стеку; Register возвращает их без паники.
func (r *Registry) Register(ctx context.Context, in RegisterInput) error {
	// Получаем ID подписки по токену (нужен для поиска существующего устройства).
	sub, err := r.store.FindOne(ctx, "subscriptions", voidorm.NewQuery().Where("token", voidorm.Eq, in.SubToken))
	if err != nil {
		return err
	}
	subID := r.store.AsString(sub, "_id")

	// Ищем существующую запись для пары (подписка, устройство).
	// Устройство может переключиться между подписками → ищем строго по паре.
	existing, err := r.store.FindOne(
		ctx,
		"jopa_devices",
		voidorm.NewQuery().
			Where("subscription_id", voidorm.Eq, subID).
			Where("device_id", voidorm.Eq, in.DeviceID),
	)

	// Поля для вставки / обновления (общие для insert и patch).
	doc := voidorm.Doc{
		"subscription_id": subID,
		"sub_token":       in.SubToken,
		"device_id":       in.DeviceID,
		"device_token":    in.DeviceToken,
		"platform":        in.Platform,
		"os_version":      in.OSVersion,
		"device_model":    in.DeviceModel,
		"client_version":  in.ClientVersion,
		"is_online":       true,                                  // всегда true при регистрации
		"last_ip":         in.LastIP,
		"last_seen_at":    time.Now().UTC().Format(time.RFC3339), // RFC3339 для совместимости с VoidDB
	}

	if err != nil {
		// Устройство не найдено → создаём новую запись.
		doc["id"] = uuid.NewString()
		doc["_id"] = doc["id"]
		doc["registered_at"] = time.Now().UTC().Format(time.RFC3339)
		_, err = r.store.Insert(ctx, "jopa_devices", doc)
		return err
	}

	// Устройство уже известно → обновляем только изменившиеся поля.
	// registered_at не трогаем — оно уже установлено при первой регистрации.
	_, err = r.store.Patch(ctx, "jopa_devices", r.store.AsString(existing, "_id"), doc)
	return err
}
