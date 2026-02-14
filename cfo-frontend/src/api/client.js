// API client wrapper - centralized fetch logic
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Main API client with comprehensive HTTP methods
export const apiClient = {
  baseURL: API_BASE,

  async get(path, options = {}) {
    return fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  },

  async post(path, data, options = {}) {
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify(data),
      ...options,
    });
  },

  async put(path, data, options = {}) {
    return fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify(data),
      ...options,
    });
  },

  async delete(path, options = {}) {
    return fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  },

  withAuth(token) {
    return {
      get: (path, options = {}) => this.get(path, {
        ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers }
      }),
      post: (path, data, options = {}) => this.post(path, data, {
        ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers }
      }),
      put: (path, data, options = {}) => this.put(path, data, {
        ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers }
      }),
      delete: (path, options = {}) => this.delete(path, {
        ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers }
      }),
    };
  },
};

export async function apiFetch(path, options = {}, token) {
  const headers = options.headers ? { ...options.headers } : {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  console.log("apiFetch Debug - Request:", {
    url: `${API_BASE}${path}`,
    options: options,
    headers: headers
  });

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  console.log("apiFetch Debug - Response:", {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    contentType: response.headers.get('content-type')
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.log("apiFetch Debug - Error response:", error);
    
    // Auth error handling
    if (response.status === 401 || response.status === 403) {
      console.log("Auth error detected - clearing token");
      localStorage.removeItem("auth_token");
      // Notify parent to re-render
      window.location.reload();
      return;
    }
    
    throw new Error(error.detail || "API request failed");
  }

  const responseData = await response.json();
  console.log("apiFetch Debug - Response data:", responseData);
  return responseData;
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
