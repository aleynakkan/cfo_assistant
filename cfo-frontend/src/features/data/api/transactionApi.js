import { apiFetch, API_ENDPOINTS } from '../../../api/client';

export async function uploadTransactions(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch(API_ENDPOINTS.TRANSACTIONS_UPLOAD, {
    method: 'POST',
    body: formData,
  }, token);
}

export async function getTransactions(token) {
  return apiFetch(API_ENDPOINTS.TRANSACTIONS, {}, token);
}

export async function deleteTransaction(txId, token) {
  return apiFetch(`${API_ENDPOINTS.TRANSACTIONS}/${txId}`, {
    method: 'DELETE',
  }, token);
}

export async function updateTransactionCategory(txId, category, token) {
  return apiFetch(`${API_ENDPOINTS.TRANSACTIONS}/${txId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  }, token);
}
