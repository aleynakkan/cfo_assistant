import { apiFetch, API_ENDPOINTS } from '../../../api/client';

export async function getPlannedItems(token) {
  return apiFetch(API_ENDPOINTS.PLANNED, {}, token);
}

export async function uploadPlannedItems(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch(API_ENDPOINTS.PLANNED_UPLOAD, {
    method: 'POST',
    body: formData,
  }, token);
}

export async function createPlannedItem(data, token) {
  return apiFetch(API_ENDPOINTS.PLANNED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, token);
}

export async function deletePlannedItem(plannedId, token) {
  return apiFetch(`${API_ENDPOINTS.PLANNED}/${plannedId}`, {
    method: 'DELETE',
  }, token);
}

export async function matchPlanned(plannedId, transactionId, amount, matchType, token) {
  return apiFetch(`${API_ENDPOINTS.PLANNED}/${plannedId}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transaction_id: transactionId,
      matched_amount: amount,
      match_type: matchType,
    }),
  }, token);
}

export async function getPlannedMatches(plannedId, token) {
  return apiFetch(`${API_ENDPOINTS.PLANNED}/${plannedId}/matches`, {}, token);
}

export async function getSuggestions(plannedId, token) {
  return apiFetch(`${API_ENDPOINTS.PLANNED}/${plannedId}/suggestions`, {}, token);
}
