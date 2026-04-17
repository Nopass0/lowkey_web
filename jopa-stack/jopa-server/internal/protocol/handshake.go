// Пакет protocol определяет формат UDP-рукопожатия JOPA.
//
// При первом подключении клиент отправляет на UDP-порт :9100 JSON-пакет
// с типом "register". Сервер проверяет sub_token через Gate, регистрирует
// устройство и отвечает JSON-пакетом с PSK-ключом и временем истечения.
//
// Формат RegisterRequest (клиент → сервер):
//
//	{
//	  "type":         "register",
//	  "sub_token":    "sub_XXXXXXXXXXXX",   // токен активной подписки пользователя
//	  "device_id":    "uuid-v4",            // уникальный ID устройства клиента
//	  "device_token": "...",                // дополнительный токен устройства (опционально)
//	  "device": {
//	    "platform":       "windows",
//	    "os_version":     "11",
//	    "device_model":   "DESKTOP-ABC123",
//	    "client_version": "1.4.0",
//	    "hardware_id":    "sha256-хэш-железа"
//	  }
//	}
//
// Формат RegisterResponse (сервер → клиент):
//
//	{
//	  "type":         "registered",
//	  "status":       "ok" | "expired" | "error",
//	  "psk":          "base64:hex-32-байта",  // Pre-Shared Key для сессии
//	  "expires_at":   "2026-12-31T23:59:59Z", // когда истекает подписка
//	  "redirect_url": "https://...",          // только при status="expired"
//	  "message":      "...",                  // текст ошибки при status="error"
//	}
package protocol

import (
	"encoding/json"
	"errors"
)

// DeviceInfo содержит метаданные устройства, отправляемые при регистрации.
// Используется для аудита и отображения в админ-панели.
type DeviceInfo struct {
	Platform      string `json:"platform"`       // "windows", "android", "ios", "linux"
	OSVersion     string `json:"os_version"`     // версия ОС
	DeviceModel   string `json:"device_model"`   // имя машины или модель телефона
	ClientVersion string `json:"client_version"` // версия приложения Lowkey
	HardwareID    string `json:"hardware_id"`    // хэш железа для идентификации устройства
}

// RegisterRequest — структура UDP-пакета регистрации от клиента.
type RegisterRequest struct {
	Type      string     `json:"type"`         // всегда "register"
	SubToken  string     `json:"sub_token"`    // токен подписки (обязательный)
	DeviceID  string     `json:"device_id"`    // UUID устройства (обязательный)
	DeviceTok string     `json:"device_token"` // опциональный токен устройства
	Device    DeviceInfo `json:"device"`       // метаданные устройства
}

// RegisterResponse — JSON-ответ сервера на UDP-пакет регистрации.
type RegisterResponse struct {
	Type        string `json:"type"`                   // всегда "registered"
	Status      string `json:"status"`                 // "ok", "expired", "error"
	PSK         string `json:"psk,omitempty"`          // Pre-Shared Key, только при status="ok"
	RedirectURL string `json:"redirect_url,omitempty"` // только при status="expired"
	ExpiresAt   string `json:"expires_at,omitempty"`   // ISO 8601, только при status="ok"
	Message     string `json:"message,omitempty"`      // сообщение об ошибке
}

// DecodeRegister десериализует сырые байты UDP-пакета в RegisterRequest.
// Возвращает ошибку если JSON невалиден или обязательные поля (type, sub_token) отсутствуют.
func DecodeRegister(data []byte) (RegisterRequest, error) {
	var req RegisterRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return req, err
	}
	// Минимальная валидация: без type и sub_token запрос бессмысленен.
	if req.Type == "" || req.SubToken == "" {
		return req, errors.New("invalid register payload")
	}
	return req, nil
}

// EncodeResponse сериализует RegisterResponse в байты для отправки клиенту по UDP.
// Ошибка маршалинга игнорируется (структура всегда валидна).
func EncodeResponse(resp RegisterResponse) []byte {
	b, _ := json.Marshal(resp)
	return b
}
