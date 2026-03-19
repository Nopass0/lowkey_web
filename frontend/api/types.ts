/**
 * @fileoverview All API request/response interfaces for the lowkey frontend.
 * Every endpoint consumed by a hook is typed here.
 * Import from this file in hooks — never re-declare types in hook files.
 */

// ─────────────────────────────────────────────
// Generic wrappers
// ─────────────────────────────────────────────

/** Standard API error shape returned by the server */
export interface ApiError {
  /** HTTP status code */
  status: number;
  /** Human-readable error message */
  message: string;
  /** Optional machine-readable error code */
  code?: string;
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─────────────────────────────────────────────
// Auth — POST /auth/*
// ─────────────────────────────────────────────

/** POST /auth/login */
export interface LoginRequest {
  login: string;
  password: string;
}

/** POST /auth/register */
export interface RegisterRequest {
  login: string;
  password: string;
  /** Optional referral code from another user */
  referralCode?: string;
}

/** POST /auth/admin/request-code — sends OTP to admin via Telegram */
export interface AdminCodeRequest {
  login: string;
}

/** POST /auth/admin/verify-code — verifies OTP, returns admin token */
export interface AdminVerifyRequest {
  login: string;
  code: string;
}

/** Response for all successful auth endpoints (login, register, verify) */
export type AuthResponse =
  | {
      token: string;
      user: AuthUser;
    }
  | {
      requireOtp: true;
      message: string;
    };

/** Authenticated user embedded in auth responses */
export interface AuthUser {
  id: string;
  login: string;
  avatarHash: string;
  isAdmin: boolean;
}

// ─────────────────────────────────────────────
// User profile — GET /user/*
// ─────────────────────────────────────────────

/** Current subscription details */
export interface Subscription {
  planId: string;
  planName: string;
  /** ISO date string */
  activeUntil: string;
  isLifetime: boolean;
}

export interface UserVpnAccess {
  serverIp: string;
  location: string;
  protocols: string[];
  vlessLink: string | null;
}

export interface UserProfile {
  id: string;
  login: string;
  avatarHash: string;
  balance: number;
  referralBalance: number;
  hideAiMenu: boolean;
  subscription: Subscription | null;
  joinedAt: string;
  telegramId: string | null;
  telegramLinkCode: string | null;
  referralRate: number;
  vpnAccess: UserVpnAccess | null;
}

/** Single transaction in history */
export interface Transaction {
  id: string;
  /** "topup" | "subscription" | "referral_earning" | "withdrawal" */
  type: "topup" | "subscription" | "referral_earning" | "withdrawal";
  amount: number;
  title: string;
  createdAt: string;
}

// ─────────────────────────────────────────────
// Billing — POST/GET /payments/* and /subscriptions/*
// ─────────────────────────────────────────────

/** POST /payments/create */
export interface PaymentCreateRequest {
  /** Amount in RUB */
  amount: number;
}

/** POST /payments/create response */
export interface PaymentCreateResponse {
  paymentId: string;
  /** Full SBP QR code image URL */
  qrUrl: string;
  /** Raw SBP payment URL for deep-link */
  sbpUrl: string;
  /** ISO expiry datetime */
  expiresAt: string;
}

/** GET /payments/:id/status */
export interface PaymentStatusResponse {
  paymentId: string;
  /** "pending" | "success" | "failed" | "expired" */
  status: "pending" | "success" | "failed" | "expired";
  amount: number;
}

/** POST /subscriptions/purchase */
export interface SubscriptionPurchaseRequest {
  planId: string;
  /** "monthly" | "3months" | "6months" | "yearly" */
  period: string;
}

/** POST /subscriptions/purchase response */
export interface SubscriptionPurchaseResponse {
  subscription: Subscription;
  newBalance: number;
}

/** Available subscription plan from GET /subscriptions/plans */
export interface SubscriptionPlan {
  id: string;
  name: string;
  prices: Record<string, number>; // period -> price in RUB
  features: string[];
  isPopular?: boolean;
  promoActive?: boolean;
  promoPrice?: number | null;
  promoLabel?: string | null;
}

/** Saved payment method (card) */
export interface PaymentMethod {
  id: string;
  yokassaMethodId: string;
  type: string;
  title: string;
  cardLast4: string | null;
  cardBrand: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  isDefault: boolean;
  createdAt: string;
}

/** POST /yokassa/topup response */
export interface YKTopupResponse {
  paymentId: string;
  yokassaPaymentId: string;
  status: string;
  confirmationUrl: string | null;
  amount: number;
}

/** POST /yokassa/link-card response */
export interface YKLinkCardResponse {
  paymentId: string;
  yokassaPaymentId: string;
  confirmationUrl: string | null;
}

/** GET /yokassa/payments/:id/status */
export interface YKPaymentStatusResponse {
  paymentId: string;
  status: "pending" | "success" | "failed" | "expired";
  amount: number;
}

/** POST /yokassa/subscribe-promo response */
export interface YKPromoSubscribeResponse {
  paymentId: string;
  yokassaPaymentId: string;
  confirmationUrl: string | null;
  promoAmount: number;
  promoLabel: string | null;
}

// ─────────────────────────────────────────────
// Devices — GET/PATCH /user/devices/*
// ─────────────────────────────────────────────

/** Single connected device */
export interface Device {
  id: string;
  name: string;
  os: string;
  version: string;
  lastIp: string;
  isOnline: boolean;
  /** Current download speed in KB/s, null if offline */
  speedKbps: number | null;
  isBlocked: boolean;
  lastSeenAt: string;
}

/** GET /user/devices/status — lightweight update for long-polling */
export interface DeviceStatusItem {
  id: string;
  isOnline: boolean;
  speedKbps: number | null;
}

/** PATCH /user/devices/:id/block */
export interface BlockDeviceRequest {
  isBlocked: boolean;
}

// ─────────────────────────────────────────────
// Promo — POST/GET /user/promo/*
// ─────────────────────────────────────────────

/** POST /user/promo/activate */
export interface PromoActivateRequest {
  code: string;
}

/** POST /user/promo/activate response */
export interface PromoActivateResponse {
  success: boolean;
  message: string;
  /** Human-readable description of the reward */
  rewardDescription: string;
  newBalance?: number;
}

/** Single item in GET /user/promo/history */
export interface PromoHistoryItem {
  id: string;
  code: string;
  description: string;
  activatedAt: string;
}

// ─────────────────────────────────────────────
// Referral — GET/POST /user/referral/*
// ─────────────────────────────────────────────

/** GET /user/referral */
export interface ReferralInfo {
  code: string;
  link: string;
  balance: number;
  rate: number;
  totalEarned: number;
}

/** Single referral entry */
export interface ReferralItem {
  id: string;
  /** Partially masked login, e.g. "ivan***" */
  maskedLogin: string;
  joinedAt: string;
  earned: number;
  planName: string | null;
}

/** POST /user/referral/withdrawals */
export interface WithdrawalCreateRequest {
  amount: number;
  /** Card number or phone number */
  target: string;
  bank: string;
}

/** Single withdrawal entry */
export interface WithdrawalItem {
  id: string;
  amount: number;
  target: string;
  bank: string;
  /** "pending" | "approved" | "rejected" */
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface AiPublicPlan {
  slug: string;
  title: string;
  price: number;
  monthlyTokens?: number;
}

export interface AiTokenPack {
  slug: string;
  amount: number;
  price: number;
}

export interface AiPublicConfig {
  defaultModel: string;
  freeMonthlyTokens: number;
  plans: AiPublicPlan[];
  tokenPack: AiTokenPack;
}

export interface AiConversationListItem {
  id: string;
  title: string;
  model: string | null;
  updatedAt: string;
  lastMessage: string | null;
}

export interface AiQuotaState {
  includedLimit: number;
  usedIncluded: number;
  includedRemaining: number;
  purchasedTokens: number;
  totalAvailable: number;
}

export interface AiSubscriptionState {
  tier: string;
  title: string;
  activeUntil: string;
  monthlyTokenLimit: number;
  monthlyTokensUsed: number;
}

export interface AiUserState {
  quota: AiQuotaState;
  subscription: AiSubscriptionState | null;
  settings: {
    defaultModel: string;
    localModel?: string;
    freeMonthlyTokens: number;
    aiPlanPrice: number;
    maxPlanPrice: number;
    comboPlanPrice: number;
    tokenPackPrice: number;
    tokenPackSize: number;
  };
  conversations: AiConversationListItem[];
}

export interface AiFileItem {
  id: string;
  fileName: string;
  mimeType: string;
  blobUrl: string;
  kind: string;
  createdAt?: string;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string | null;
  attachments?: unknown;
  artifacts?: unknown;
  toolEvents?: unknown;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  createdAt: string;
}

export interface AiConversationDetail {
  id: string;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AiChatMessage[];
  files: AiFileItem[];
}

export interface AiChatResponse {
  conversationId: string;
  reply: AiChatMessage;
  artifacts: AiFileItem[];
}

export interface AiAdminSettings {
  openRouterApiKey: string | null;
  defaultModel: string;
  localModel: string;
  localBaseUrl: string;
  freeMonthlyTokens: number;
  aiPlanMonthlyTokens: number;
  maxPlanMonthlyTokens: number;
  aiPlanPrice: number;
  maxPlanPrice: number;
  comboPlanPrice: number;
  tokenPackSize: number;
  tokenPackPrice: number;
  systemPrompt: string | null;
  maxContextMessages: number;
  enableReasoning: boolean;
}

export interface AiAdminAnalytics {
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    users: number;
    activeSubscriptions: number;
  };
  users: Array<{
    userId: string;
    login: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    messages: number;
  }>;
  recentUsage: Array<{
    id: string;
    userId: string;
    login: string;
    model: string;
    provider: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    createdAt: string;
  }>;
}

// ─────────────────────────────────────────────
// Downloads — GET /downloads/*
// ─────────────────────────────────────────────

/** GET /downloads/releases — latest release per platform */
export interface AppRelease {
  id: string;
  /** "android" | "ios" | "windows" */
  platform: "android" | "ios" | "windows";
  version: string;
  changelog: string;
  downloadUrl: string;
  fileSizeMb: number;
  downloadCount: number;
  isLatest: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────
// Admin — Users
// ─────────────────────────────────────────────

/** GET /admin/users item */
export interface AdminUser {
  id: string;
  login: string;
  balance: number;
  referralBalance: number;
  isBanned: boolean;
  hideAiMenu: boolean;
  plan: string | null;
  activeUntil: string | null;
  joinedAt: string;
  deviceCount: number;
}

/** PATCH /admin/users/:id/subscription */
export interface AdminUpdateSubscriptionRequest {
  plan: string | null;
  activeUntil: string | null;
}

export interface AdminUserFilters {
  search?: string;
  isBanned?: boolean;
  hasSubscription?: boolean;
  hideAiMenu?: boolean;
  plan?: string;
}

// ─────────────────────────────────────────────
// Admin — Promo codes
// ─────────────────────────────────────────────

/** Promo condition type keys */
export type PromoConditionKey =
  | "new_users_only"
  | "min_topup"
  | "date_range"
  | "max_activations"
  | "no_active_sub"
  | "specific_plan";

/** Promo effect type keys */
export type PromoEffectKey =
  | "add_balance"
  | "add_ref_balance"
  | "plan_discount_pct"
  | "plan_discount_fixed"
  | "free_days"
  | "upgrade_plan"
  | "double_next_topup"
  | "extra_devices"
  | "generate_gift_code";

export interface PromoCondition {
  key: PromoConditionKey;
  value?: string;
  value2?: string;
}

export interface PromoEffect {
  key: PromoEffectKey;
  value?: string;
}

/** GET /admin/promo item */
export interface AdminPromoCode {
  id: string;
  code: string;
  conditions: PromoCondition[];
  effects: PromoEffect[];
  activations: number;
  maxActivations: number | null;
  lastActivatedAt: string | null;
  totalEffectSummary: string;
  createdAt: string;
}

/** POST /admin/promo or PATCH /admin/promo/:id */
export interface AdminPromoUpsertRequest {
  code: string;
  conditions: PromoCondition[];
  effects: PromoEffect[];
}

/** GET /admin/promo/:id/stats */
export interface AdminPromoStats {
  activations: number;
  uniqueUsers: number;
  totalBalanceAwarded: number;
  activationsByDay: { date: string; count: number }[];
}

// ─────────────────────────────────────────────
// Admin — Withdrawals
// ─────────────────────────────────────────────

/** GET /admin/withdrawals item */
export interface AdminWithdrawal {
  id: string;
  userLogin: string;
  userId: string;
  amount: number;
  target: string;
  bank: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  processedAt: string | null;
}

// ─────────────────────────────────────────────
// Admin — Finance analytics
// ─────────────────────────────────────────────

/** Single day/month data point */
export interface FinanceDataPoint {
  date: string;
  topups: number;
  subscriptions: number;
  refPaid: number;
  financeWithdrawals: number;
  acquiringFee: number;
  taxAmount: number;
  netProfit: number;
  newUsers: number;
  totalUsers: number;
}

/** GET /admin/finance/stats */
export interface FinanceStats {
  range: {
    startDate: string;
    endDate: string;
    groupBy: "day" | "month";
  };
  settings: {
    taxRate: number;
    acquiringFeeRate: number;
  };
  points: FinanceDataPoint[];
  totals: {
    topups: number;
    subscriptions: number;
    refPaid: number;
    financeWithdrawals: number;
    acquiringFee: number;
    taxAmount: number;
    netProfit: number;
    users: number;
    totalUsers: number;
    revenue: number;
  };
}

/** GET /admin/finance/balance */
export interface FinanceBalance {
  currentBalance: number;
  pendingWithdrawals: number;
  refHoldReserve: number;
  totalBusinessWithdrawals: number;
  acquiringFees: number;
  taxAmount: number;
  profitBeforeTax: number;
  availableProfit: number;
  taxRate: number;
  acquiringFeeRate: number;
}

/** GET/PATCH /admin/finance/settings */
export interface FinanceSettings {
  taxRate: number;
  acquiringFeeRate: number;
  updatedAt: string;
}

/** POST /admin/finance/settings */
export interface FinanceSettingsUpdateRequest {
  taxRate: number;
  acquiringFeeRate: number;
}

/** GET /admin/finance/withdrawals */
export interface FinanceBusinessWithdrawal {
  id: string;
  title: string;
  note: string | null;
  amount: number;
  withdrawalDate: string;
  createdAt: string;
  createdBy: {
    id: string;
    login: string;
  } | null;
}

/** POST /admin/finance/withdrawals */
export interface FinanceBusinessWithdrawalCreateRequest {
  title: string;
  note?: string;
  amount: number;
  withdrawalDate: string;
}

// ─────────────────────────────────────────────
// Admin — Server status
// ─────────────────────────────────────────────

/** GET /admin/server/status */
export interface ServerStatus {
  status: "online" | "degraded" | "offline";
  uptimePct: number;
  activeConnections: number;
  bandwidthGbps: number;
  latencyMs: number;
  uptimeSince: string;
}

/** Single incident in GET /admin/server/incidents */
export interface ServerIncident {
  id: string;
  severity: "low" | "medium" | "high";
  description: string;
  occurredAt: string;
  resolvedAt: string | null;
}

// ─────────────────────────────────────────────
// Admin — App releases (management)
// ─────────────────────────────────────────────

/** GET /admin/apps/releases item */
export interface AdminAppRelease {
  id: string;
  platform: "android" | "windows";
  version: string;
  changelog: string;
  downloadUrl: string;
  fileSizeMb: number;
  downloadCount: number;
  isLatest: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────
// Admin — User Details & Stats
// ─────────────────────────────────────────────

export interface AdminUserDailyStats {
  date: string;
  referrals: number;
  referralEarnings: number;
  topups: number;
}

export interface AdminUserStatsResponse {
  user: AdminUser & { referralCount: number };
  dailyStats: AdminUserDailyStats[];
  transactions: Transaction[];
}

export interface AdminMailingRecipient {
  id: string;
  login: string;
  telegramId: string | null;
  isBanned: boolean;
  joinedAt: string;
}

export interface AdminMailingItem {
  id: string;
  title: string;
  message: string;
  buttonText: string | null;
  buttonUrl: string | null;
  targetType: "all" | "selected";
  selectedUserIds: string[];
  status: "scheduled" | "processing" | "sent" | "failed";
  scheduledAt: string;
  processingAt: string | null;
  sentAt: string | null;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    login: string;
  } | null;
}

export interface AdminCreateMailingRequest {
  title: string;
  message: string;
  buttonText?: string;
  buttonUrl?: string;
  targetType: "all" | "selected";
  selectedUserIds: string[];
  scheduledAt: string;
}
