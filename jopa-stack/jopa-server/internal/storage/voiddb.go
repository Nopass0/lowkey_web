// Пакет storage — тонкая обёртка над VoidDB Go-клиентом (github.com/Nopass0/void_go).
//
// VoidDB — кастомная документная БД проекта Lowkey. Данные хранятся как JSON-документы
// в именованных «коллекциях» (аналог таблиц в SQL или коллекций в MongoDB).
//
// Все операции работают через HTTP REST API VoidDB. Клиент аутентифицируется
// JWT-токеном (VOIDDB_TOKEN). Если токен отсутствует или истёк, производится
// автоматический login по username/password и получение нового токена.
//
// Используемые коллекции:
//
//   users                    — аккаунты пользователей (login, passwordHash, balance, ...)
//   subscriptions            — подписки (token, userId, status, activeUntil, ...)
//   jopa_devices             — зарегистрированные устройства пользователей
//   jopa_sessions            — активные и завершённые TCP-туннели
//   jopa_user_protocol_stats — агрегированная статистика трафика по протоколу
//   jopa_connection_logs     — журнал событий каждого соединения (для аудита)
package storage

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	voidorm "github.com/Nopass0/void_go"

	"jopa-stack/jopa-server/internal/config"
)

// DatabaseName — имя базы данных в VoidDB, которую использует jopad.
const DatabaseName = "lowkey"

// ErrNotFound возвращается методами поиска, если документ не найден.
var ErrNotFound = errors.New("not found")

// Store содержит инициализированный VoidDB-клиент.
// Все методы принимают контекст с таймаутом — это защищает от зависания
// на медленных запросах к VoidDB.
type Store struct {
	client *voidorm.Client
}

// isTokenExpired проверяет, истёк ли JWT-токен.
//
// Токен декодируется без проверки подписи — нам важно только поле "exp".
// VoidDB сам отклонит поддельный токен при первом запросе.
// Функция возвращает true если:
//   - токен пустой
//   - токен не является валидным JWT (не три части, разделённые ".")
//   - поле exp не парсится
//   - до истечения осталось менее 60 секунд (предотвращаем race condition)
func isTokenExpired(token string) bool {
	if token == "" {
		return true
	}
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 {
		return true
	}
	// Payload (вторая часть) — Base64URL без паддинга; добавляем паддинг для декодирования.
	payload := parts[1]
	if rem := len(payload) % 4; rem != 0 {
		payload += strings.Repeat("=", 4-rem)
	}
	raw, err := base64.URLEncoding.DecodeString(payload)
	if err != nil {
		return true
	}
	var claims struct {
		Exp int64 `json:"exp"`
	}
	if err = json.Unmarshal(raw, &claims); err != nil {
		return true
	}
	// Считаем токен истёкшим если меньше 60 секунд до exp.
	return claims.Exp-60 <= time.Now().Unix()
}

// New создаёт Store, подключённый к VoidDB.
//
// Если VOIDDB_TOKEN задан и не истёк — используем его напрямую.
// Иначе выполняем login(username, password) для получения свежего токена.
// Такой подход позволяет серверу автоматически «вылечиться» после истечения токена
// без ручного редеплоя.
func New(cfg *config.Config) (*Store, error) {
	token := cfg.VoidDBToken
	if isTokenExpired(token) {
		// Токен истёк или не задан — принудительно используем login-путь.
		token = ""
	}

	client, err := voidorm.New(voidorm.Config{
		URL:   cfg.VoidDBURL,
		Token: token,
	})
	if err != nil {
		return nil, err
	}

	if token == "" {
		// Логинимся по username/password и получаем новый JWT.
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err = client.Login(ctx, cfg.VoidDBUsername, cfg.VoidDBPassword); err != nil {
			return nil, err
		}
	}

	return &Store{client: client}, nil
}

// col возвращает объект коллекции по имени.
// Все операции (Find, Insert, Patch) выполняются через этот объект.
func (s *Store) col(name string) *voidorm.Collection {
	return s.client.DB(DatabaseName).Collection(name)
}

// FindOne возвращает первый документ, удовлетворяющий запросу q.
// Возвращает ErrNotFound если документов нет.
//
// Пример использования:
//
//	doc, err := s.FindOne(ctx, "subscriptions",
//	    voidorm.NewQuery().Where("token", voidorm.Eq, subToken))
func (s *Store) FindOne(ctx context.Context, name string, q *voidorm.Query) (voidorm.Doc, error) {
	rows, err := s.col(name).Find(ctx, q.Limit(1))
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNotFound
	}
	return rows[0], nil
}

// FindMany возвращает все документы, соответствующие запросу q.
// Количество документов ограничивается через q.Limit(n).
func (s *Store) FindMany(ctx context.Context, name string, q *voidorm.Query) ([]voidorm.Doc, error) {
	return s.col(name).Find(ctx, q)
}

// Insert добавляет новый документ d в коллекцию name.
// Возвращает _id вставленного документа.
//
// Важно: VoidDB автоматически генерирует _id только если поле отсутствует.
// Если передать doc["_id"] = "some-uuid" — будет использоваться это значение.
func (s *Store) Insert(ctx context.Context, name string, d voidorm.Doc) (string, error) {
	return s.col(name).Insert(ctx, d)
}

// Patch обновляет поля существующего документа (частичное обновление, как PATCH в REST).
// id — значение поля _id документа.
// patch — только те поля, которые нужно обновить; остальные остаются без изменений.
func (s *Store) Patch(ctx context.Context, name, id string, patch voidorm.Doc) (voidorm.Doc, error) {
	return s.col(name).Patch(ctx, id, patch)
}

// AsString безопасно извлекает строковое поле из документа.
// Возвращает "" если ключ отсутствует, значение nil, или тип не string.
func (s *Store) AsString(doc voidorm.Doc, key string) string {
	v, ok := doc[key]
	if !ok || v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// AsBool безопасно извлекает булевое поле из документа.
// Возвращает false при любой ошибке (отсутствие ключа, nil, неверный тип).
func (s *Store) AsBool(doc voidorm.Doc, key string) bool {
	v, ok := doc[key]
	if !ok || v == nil {
		return false
	}
	b, _ := v.(bool)
	return b
}

// AsTime парсит строковое поле документа как RFC3339 время.
// Возвращает zero time.Time при ошибке или пустой строке.
func (s *Store) AsTime(doc voidorm.Doc, key string) time.Time {
	v := s.AsString(doc, key)
	if v == "" {
		return time.Time{}
	}
	t, _ := time.Parse(time.RFC3339, v)
	return t
}
