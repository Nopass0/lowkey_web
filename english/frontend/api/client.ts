import axios from "axios";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("english_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("english_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    apiClient.post("/auth/register", data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    apiClient.post("/auth/login", data).then((r) => r.data),
  me: () => apiClient.get("/auth/me").then((r) => r.data),
  update: (data: any) => apiClient.patch("/auth/me", data).then((r) => r.data),
  changePassword: (data: any) => apiClient.post("/auth/change-password", data).then((r) => r.data),
  linkTelegram: (data: any) => apiClient.post("/auth/link-telegram", data).then((r) => r.data),
  uploadAvatar: (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return apiClient.post("/auth/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
  },
};

// Cards & Decks
export const cardsApi = {
  getDecks: () => apiClient.get("/cards/decks").then((r) => r.data),
  createDeck: (data: any) => apiClient.post("/cards/decks", data).then((r) => r.data),
  updateDeck: (id: string, data: any) => apiClient.patch(`/cards/decks/${id}`, data).then((r) => r.data),
  deleteDeck: (id: string) => apiClient.delete(`/cards/decks/${id}`).then((r) => r.data),
  getCards: (params?: any) => apiClient.get("/cards", { params }).then((r) => r.data),
  getDueCards: (params?: any) => apiClient.get("/cards/due", { params }).then((r) => r.data),
  createCard: (data: any) => apiClient.post("/cards", data).then((r) => r.data),
  updateCard: (id: string, data: any) => apiClient.patch(`/cards/${id}`, data).then((r) => r.data),
  deleteCard: (id: string) => apiClient.delete(`/cards/${id}`).then((r) => r.data),
  uploadImage: (id: string, file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return apiClient.post(`/cards/${id}/upload-image`, fd, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
  },
  uploadDeckImage: (id: string, file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return apiClient.post(`/cards/decks/${id}/upload-image`, fd, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
  },
  generateByTopic: (data: any) => apiClient.post("/cards/generate-by-topic", data).then((r) => r.data),
  review: (data: { cardId: string; quality: number; sessionId?: string }) =>
    apiClient.post("/cards/review", data).then((r) => r.data),
  createSession: (data: any) => apiClient.post("/cards/sessions", data).then((r) => r.data),
  updateSession: (id: string, data: any) => apiClient.patch(`/cards/sessions/${id}`, data).then((r) => r.data),
  getSessions: () => apiClient.get("/cards/sessions").then((r) => r.data),
};

// AI
export const aiApi = {
  generateCard: (data: any) => apiClient.post("/ai/generate-card", data).then((r) => r.data),
  generateCardsBulk: (data: any) => apiClient.post("/ai/generate-cards-bulk", data).then((r) => r.data),
  associationGame: (data: any) => apiClient.post("/ai/association-game", data).then((r) => r.data),
  analyzePronunciation: (data: any) => apiClient.post("/ai/analyze-pronunciation", data).then((r) => r.data),
  analyzeWriting: (data: { text: string }) => apiClient.post("/ai/analyze-writing", data).then((r) => r.data),
  getDailyPlan: () => apiClient.get("/ai/daily-plan").then((r) => r.data),
};

// Recordings
export const recordingsApi = {
  getAll: (params?: any) => apiClient.get("/recordings", { params }).then((r) => r.data),
  upload: (formData: FormData) =>
    apiClient.post("/recordings/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data),
  update: (id: string, data: any) => apiClient.patch(`/recordings/${id}`, data).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/recordings/${id}`).then((r) => r.data),
  getStats: () => apiClient.get("/recordings/stats").then((r) => r.data),
};

// Games
export const gamesApi = {
  createSession: (data?: any) => apiClient.post("/games/session", data || {}).then((r) => r.data),
  updateSession: (id: string, data: any) => apiClient.patch(`/games/session/${id}`, data).then((r) => r.data),
  saveWord: (data: any) => apiClient.post("/games/save-word", data).then((r) => r.data),
  getLeaderboard: () => apiClient.get("/games/leaderboard").then((r) => r.data),
  getHistory: () => apiClient.get("/games/history").then((r) => r.data),
};

// Progress
export const progressApi = {
  getProgress: (params?: any) => apiClient.get("/progress", { params }).then((r) => r.data),
  getSummary: () => apiClient.get("/progress/summary").then((r) => r.data),
  getHeatmap: () => apiClient.get("/progress/heatmap").then((r) => r.data),
};

// Payments
export const paymentsApi = {
  getPlans: () => apiClient.get("/payments/plans").then((r) => r.data),
  subscribe: (planId: string) => apiClient.post("/payments/subscribe", { planId }).then((r) => r.data),
  getHistory: () => apiClient.get("/payments/history").then((r) => r.data),
  getSubscription: () => apiClient.get("/payments/subscription").then((r) => r.data),
};

// Grammar
export const grammarApi = {
  getTopics: () => apiClient.get("/grammar/topics").then((r) => r.data),
  getTopic: (slug: string) => apiClient.get(`/grammar/topics/${slug}`).then((r) => r.data),
  generateTests: (id: string) => apiClient.post(`/grammar/topics/${id}/generate-tests`).then((r) => r.data),
  submitTest: (id: string, answers: any) => apiClient.post(`/grammar/topics/${id}/submit`, { answers }).then((r) => r.data),
  getProgress: () => apiClient.get("/grammar/progress").then((r) => r.data),
  explain: (data: { text: string; question?: string }) => apiClient.post("/grammar/explain", data).then((r) => r.data),
};

// Quests
export const questsApi = {
  getAll: () => apiClient.get("/quests").then((r) => r.data),
  generate: (data?: { difficulty?: string; customTopics?: string[] }) => apiClient.post("/quests/generate", data || {}).then((r) => r.data),
  start: (id: string) => apiClient.post(`/quests/${id}/start`).then((r) => r.data),
  submit: (id: string, data: { attemptId: string; userResponse: string }) => apiClient.post(`/quests/${id}/submit`, data).then((r) => r.data),
  getHistory: () => apiClient.get("/quests/history").then((r) => r.data),
  getLeaderboard: () => apiClient.get("/quests/leaderboard").then((r) => r.data),
};

// Dictionary
export const dictionaryApi = {
  lookup: (word: string) => apiClient.get(`/dictionary/lookup/${encodeURIComponent(word)}`).then((r) => r.data),
  search: (q: string) => apiClient.get("/dictionary/search", { params: { q } }).then((r) => r.data),
  wordOfDay: () => apiClient.get("/dictionary/word-of-day").then((r) => r.data),
  saveCard: (data: { word: string; deckId?: string }) => apiClient.post("/dictionary/save-card", data).then((r) => r.data),
};

// Social / Leaderboard
export const socialApi = {
  getLeaderboard: (params?: { type?: string; limit?: number }) =>
    apiClient.get("/social/leaderboard", { params }).then(r => r.data),
  getProfile: (userId: string) =>
    apiClient.get(`/social/profile/${userId}`).then(r => r.data),
  createGroup: (data: any) => apiClient.post("/social/groups", data).then(r => r.data),
  getGroups: () => apiClient.get("/social/groups").then(r => r.data),
  getGroup: (id: string) => apiClient.get(`/social/groups/${id}`).then(r => r.data),
  joinGroup: (id: string, inviteCode: string) => apiClient.post(`/social/groups/${id}/join`, { inviteCode }).then(r => r.data),
  updateGroup: (id: string, data: any) => apiClient.patch(`/social/groups/${id}`, data).then(r => r.data),
  removeMember: (groupId: string, userId: string) => apiClient.delete(`/social/groups/${groupId}/members/${userId}`).then(r => r.data),
  regenerateInvite: (id: string) => apiClient.post(`/social/groups/${id}/regenerate-invite`).then(r => r.data),
  getCourses: (groupId: string) => apiClient.get(`/social/groups/${groupId}/courses`).then(r => r.data),
  createCourse: (groupId: string, data: any) => apiClient.post(`/social/groups/${groupId}/courses`, data).then(r => r.data),
  getCourse: (groupId: string, courseId: string) => apiClient.get(`/social/groups/${groupId}/courses/${courseId}`).then(r => r.data),
  updateCourse: (groupId: string, courseId: string, data: any) => apiClient.patch(`/social/groups/${groupId}/courses/${courseId}`, data).then(r => r.data),
  deleteCourse: (groupId: string, courseId: string) => apiClient.delete(`/social/groups/${groupId}/courses/${courseId}`).then(r => r.data),
  addBlock: (groupId: string, courseId: string, data: any) => apiClient.post(`/social/groups/${groupId}/courses/${courseId}/blocks`, data).then(r => r.data),
  updateBlock: (groupId: string, courseId: string, blockId: string, data: any) => apiClient.patch(`/social/groups/${groupId}/courses/${courseId}/blocks/${blockId}`, data).then(r => r.data),
  deleteBlock: (groupId: string, courseId: string, blockId: string) => apiClient.delete(`/social/groups/${groupId}/courses/${courseId}/blocks/${blockId}`).then(r => r.data),
  reorderBlocks: (groupId: string, courseId: string, order: any[]) => apiClient.post(`/social/groups/${groupId}/courses/${courseId}/blocks/reorder`, { order }).then(r => r.data),
  createTest: (groupId: string, courseId: string, data: any) => apiClient.post(`/social/groups/${groupId}/courses/${courseId}/tests`, data).then(r => r.data),
  getTest: (groupId: string, courseId: string, testId: string) => apiClient.get(`/social/groups/${groupId}/courses/${courseId}/tests/${testId}`).then(r => r.data),
  updateTest: (groupId: string, courseId: string, testId: string, data: any) => apiClient.patch(`/social/groups/${groupId}/courses/${courseId}/tests/${testId}`, data).then(r => r.data),
  deleteTest: (groupId: string, courseId: string, testId: string) => apiClient.delete(`/social/groups/${groupId}/courses/${courseId}/tests/${testId}`).then(r => r.data),
  submitTest: (groupId: string, courseId: string, testId: string, data: any) => apiClient.post(`/social/groups/${groupId}/courses/${courseId}/tests/${testId}/submit`, data).then(r => r.data),
  getTestResults: (groupId: string, courseId: string, testId: string) => apiClient.get(`/social/groups/${groupId}/courses/${courseId}/tests/${testId}/results`).then(r => r.data),
  getGroupProgress: (groupId: string) => apiClient.get(`/social/groups/${groupId}/progress`).then(r => r.data),
  markBlockComplete: (groupId: string, courseId: string, blockId: string) => apiClient.post(`/social/groups/${groupId}/courses/${courseId}/progress/mark-block`, { blockId }).then(r => r.data),
  aiGenerateBlocks: (groupId: string, courseId: string, data: any) => apiClient.post(`/social/groups/${groupId}/courses/${courseId}/ai-generate-blocks`, data).then(r => r.data),
};

// Admin
export const adminApi = {
  getStats: () => apiClient.get("/admin/stats").then((r) => r.data),
  getAiSettings: () => apiClient.get("/admin/ai-settings").then((r) => r.data),
  updateAiSettings: (data: any) => apiClient.patch("/admin/ai-settings", data).then((r) => r.data),
  getUsers: (params?: any) => apiClient.get("/admin/users", { params }).then((r) => r.data),
  getUser: (id: string) => apiClient.get(`/admin/users/${id}`).then((r) => r.data),
  updateUser: (id: string, data: any) => apiClient.patch(`/admin/users/${id}`, data).then((r) => r.data),
  getPlans: () => apiClient.get("/admin/plans").then((r) => r.data),
  createPlan: (data: any) => apiClient.post("/admin/plans", data).then((r) => r.data),
  updatePlan: (id: string, data: any) => apiClient.patch(`/admin/plans/${id}`, data).then((r) => r.data),
  getRevenue: (params?: any) => apiClient.get("/admin/revenue", { params }).then((r) => r.data),
  broadcast: (data: any) => apiClient.post("/admin/broadcast", data).then((r) => r.data),
};
