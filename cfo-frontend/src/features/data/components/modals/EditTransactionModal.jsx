import { useState } from 'react';
import { updateTransactionCategory } from '../../api/transactionApi';
import { useModalStore } from '../../stores/modalStore';

/**
 * EditTransactionModal
 * 
 * Modal for editing transaction details (category).
 * Uses Zustand store for state management.
 * 
 * Props:
 * - token: authentication token
 * - categories: array of available categories
 * - onSuccess: callback when edit is successful
 */
export default function EditTransactionModal({
  token,
  categories,
  onSuccess,
}) {
  const {
    editTransactionModalOpen,
    selectedTransaction,
    closeEditTransactionModal,
  } = useModalStore();

  const [category, setCategory] = useState(
    selectedTransaction?.category || ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!editTransactionModalOpen || !selectedTransaction) return null;

  async function handleSave() {
    if (!category) {
      setError('Lütfen bir kategori seçin');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateTransactionCategory(selectedTransaction.id, category, token);
      onSuccess?.();
      closeEditTransactionModal();
    } catch (err) {
      setError(err.message || 'Kategori güncellenemedi');
      console.error('Edit transaction error:', err);
    } finally {
      setSaving(false);
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
      onClick={closeEditTransactionModal}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '400px',
          boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '8px', fontSize: '18px', fontWeight: 700 }}>
          ✏️ İşlemi Düzenle
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
          İşlemin kategorisini değiştirebilirsiniz.
        </p>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: 600,
              display: 'block',
              marginBottom: '4px',
            }}
          >
            İşlem: {selectedTransaction.description}
          </label>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 8px 0' }}>
            Tutar: {Number(selectedTransaction.amount || 0).toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            TL
          </p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              fontSize: '13px',
              fontWeight: 600,
              display: 'block',
              marginBottom: '4px',
            }}
          >
            Kategori
          </label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setError(null);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${error ? '#ef4444' : '#d1d5db'}`,
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Seç...</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {error && (
            <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
              {error}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={closeEditTransactionModal}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px',
              border: '1px solid #d1d5db',
              background: 'white',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: saving ? '#9ca3af' : '#2563eb',
              color: 'white',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
