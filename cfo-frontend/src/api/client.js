// API client wrapper - centralized fetch logic
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function apiFetch(path, options = {}, token) {
  const headers = options.headers ? { ...options.headers } : {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "API request failed");
  }

  return response.json();
}

export const API_ENDPOINTS = {
  // Dashboard
  DASHBOARD_SUMMARY: '/dashboard/summary',
  CATEGORY_SUMMARY: '/dashboard/category-summary',
  FORECAST: '/dashboard/forecast',
  CATEGORY_FORECAST: '/dashboard/category-forecast',
  INSIGHTS: '/dashboard/insights',
  EXCEPTIONS: '/dashboard/exceptions',

  // Transactions
  TRANSACTIONS: '/transactions',
  TRANSACTIONS_UPLOAD: '/transactions/upload-csv',

  // Planned
  PLANNED: '/planned',
  PLANNED_UPLOAD: '/planned/upload-csv',

  // Bank uploads
  AKBANK_UPLOAD: '/bank/akbank/upload',
  ENPARA_UPLOAD: '/bank/enpara/upload',
  YAPIKREDI_UPLOAD: '/bank/yapikredi/upload',

  // AI
  AI_QUERY: '/ai/query',
};

export const API_BASE_URL = API_BASE;
