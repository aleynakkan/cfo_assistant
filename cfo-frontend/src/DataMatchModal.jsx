/**
 * MatchModal component for App.jsx
 * Shared matching modal with CSS token-based styling
 */

import { useEffect } from 'react';
import styles from './components/MatchModal.module.css';
import useFocusTrap from './hooks/useFocusTrap';

export function DataMatchModal({
  activePlanned,
  suggestions,
  suggestionsLoading,
  suggestionsError,
  selectedTx,
  setSelectedTx,
  matchAmount,
  setMatchAmount,
  matchSubmitting,
  matchMessage,
  onClose,
  onConfirm,
}) {
  const modalRef = useFocusTrap(true);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className={styles.nestedModalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-match-modal-title"
    >
      <div
        ref={modalRef}
        className={styles.nestedModal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h3 id="data-match-modal-title" className={styles.modalTitle}>
            Eşle — Planned #{activePlanned?.id}
          </h3>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Modalı kapat"
          >
            ×
          </button>
        </div>

        <div className={styles.modalInfo}>
          <div>
            <strong>Vade:</strong> {activePlanned?.due_date} •{' '}
            <strong>Yön:</strong> {activePlanned?.direction} •{' '}
            <strong>Kalan:</strong>{' '}
            {Number(
              activePlanned?.remaining_amount ?? activePlanned?.amount ?? 0
            ).toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            TL
          </div>
        </div>

        <div style={{ marginTop: '12px' }}>
          {suggestionsLoading && (
            <p className={styles.loadingState}>Öneriler yükleniyor...</p>
          )}
          {suggestionsError && (
            <p className={`${styles.message} ${styles.messageError}`}>
              Hata: {suggestionsError}
            </p>
          )}

          {!suggestionsLoading && !suggestionsError && (
            <>
              {suggestions.length === 0 ? (
                <p className={styles.emptyState}>
                  Öneri bulunamadı. (Tutar/tarih aralığında uygun işlem yok.)
                </p>
              ) : (
                <div className={styles.suggestionsContainer}>
                  <table className={styles.suggestionsTable}>
                    <thead>
                      <tr>
                        <th>Seç</th>
                        <th>Tarih</th>
                        <th>Açıklama</th>
                        <th>Tutar</th>
                        <th>Skor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((s) => (
                        <tr key={s.transaction_id}>
                          <td>
                            <input
                              type="radio"
                              name="txpick"
                              checked={
                                selectedTx?.transaction_id === s.transaction_id
                              }
                              onChange={() => {
                                setSelectedTx(s);
                                setMatchAmount(
                                  String(
                                    s.suggested_match_amount ?? s.amount ?? ''
                                  )
                                );
                              }}
                            />
                          </td>
                          <td>{s.date}</td>
                          <td>{s.description}</td>
                          <td>
                            {Number(s.amount).toLocaleString('tr-TR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            TL
                          </td>
                          <td>{s.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="data-match-amount" className={styles.inputLabel}>
            Eşleşme Tutarı
          </label>
          <input
            id="data-match-amount"
            type="number"
            step="0.01"
            value={matchAmount}
            onChange={(e) => setMatchAmount(e.target.value)}
            className={styles.inputField}
          />
        </div>

        <button
          type="button"
          onClick={onConfirm}
          disabled={matchSubmitting}
          className={styles.btnPrimary}
        >
          {matchSubmitting ? 'Eşleniyor...' : 'Onayla'}
        </button>

        {matchMessage && (
          <div className={`${styles.message} ${styles.messageSuccess}`}>
            {matchMessage}
          </div>
        )}
      </div>
    </div>
  );
}
