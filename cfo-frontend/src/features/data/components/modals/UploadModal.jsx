import { useState } from 'react';
import { uploadTransactions } from '../../api/transactionApi';
import { useModalStore } from '../../stores/modalStore';

/**
 * UploadModal
 * 
 * Modal for uploading transaction CSV files.
 * Uses Zustand store for state management.
 * 
 * Props:
 * - token: authentication token
 * - onSuccess: callback when upload is successful
 */
export default function UploadModal({ token, onSuccess }) {
  const { uploadModalOpen, closeUploadModal } = useModalStore();

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  if (!uploadModalOpen) return null;

  async function handleUpload() {
    if (!file) {
      setError('Lütfen bir dosya seçin');
      return;
    }

    setUploading(true);
    setError(null);
    setMessage('');

    try {
      const result = await uploadTransactions(file, token);
      setMessage(result.message || 'Dosya başarıyla yüklendi');
      setFile(null);
      onSuccess?.();

      // Close modal after 2 seconds
      setTimeout(() => {
        closeUploadModal();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Dosya yüklenemedi');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
      onClick={closeUploadModal}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '500px',
          boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '8px', fontSize: '18px', fontWeight: 700 }}>
          📤 CSV Dosyası Yükle
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
          İşlem kayıtlarını içeren CSV dosyasını yükleyiniz.
        </p>

        {error && (
          <div
            style={{
              background: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '16px',
              color: '#dc2626',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            style={{
              background: '#dcfce7',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '16px',
              color: '#16a34a',
              fontSize: '13px',
            }}
          >
            {message}
          </div>
        )}

        <div
          style={{
            border: '2px dashed #d1d5db',
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
            marginBottom: '16px',
            cursor: 'pointer',
            background: '#fafafa',
            transition: 'all 0.2s',
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.style.background = '#f3f4f6';
          }}
          onDragLeave={(e) => {
            e.currentTarget.style.background = '#fafafa';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.background = '#fafafa';
            if (e.dataTransfer.files[0]) {
              setFile(e.dataTransfer.files[0]);
              setError(null);
            }
          }}
        >
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              if (e.target.files[0]) {
                setFile(e.target.files[0]);
                setError(null);
              }
            }}
            style={{ display: 'none' }}
            id="file-input"
          />
          <label
            htmlFor="file-input"
            style={{
              cursor: 'pointer',
              display: 'block',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>
              Dosya seçin veya sürükleyip bırakın
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
              {file ? file.name : 'CSV formatı'}
            </p>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={closeUploadModal}
            disabled={uploading}
            style={{
              flex: 1,
              padding: '10px',
              border: '1px solid #d1d5db',
              background: 'white',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: uploading ? 'default' : 'pointer',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            İptal
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background:
                uploading || !file ? '#9ca3af' : '#2563eb',
              color: 'white',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: uploading || !file ? 'default' : 'pointer',
            }}
          >
            {uploading ? 'Yükleniyor...' : 'Yükle'}
          </button>
        </div>
      </div>
    </div>
  );
}
