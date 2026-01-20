import { apiFetch, API_ENDPOINTS } from '../../../api/client';

export async function uploadAkbankFile(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch(API_ENDPOINTS.AKBANK_UPLOAD, {
    method: 'POST',
    body: formData,
  }, token);
}

export async function uploadEnparaFile(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch(API_ENDPOINTS.ENPARA_UPLOAD, {
    method: 'POST',
    body: formData,
  }, token);
}

export async function uploadYapikrediFile(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch(API_ENDPOINTS.YAPIKREDI_UPLOAD, {
    method: 'POST',
    body: formData,
  }, token);
}
