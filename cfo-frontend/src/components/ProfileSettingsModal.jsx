import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import styles from './ProfileSettingsModal.module.css';

export default function ProfileSettingsModal({ isOpen, onClose, currentName, onNameChange, token, onInitialBalanceSuccess, onError }) {
  const [name, setName] = useState(currentName || 'Kevin');
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'balance'
  const [message, setMessage] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [balanceDate, setBalanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [balanceMessage, setBalanceMessage] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    setName(currentName || 'Kevin');
  }, [currentName]);

  const handleSaveName = () => {
    if (!name.trim()) {
      setMessage('Adınız boş olamaz');
      return;
    }

    onNameChange?.(name);
    setMessage('');
    onClose?.();
  };

  const handleSaveBalance = async () => {
    if (!initialBalance || parseFloat(initialBalance) === 0) {
      setBalanceMessage('Başlangıç bakiyesi gereklidir');
      return;
    }

    setBalanceLoading(true);
    setBalanceMessage('');

    try {
      const token_str = token || localStorage.getItem('auth_token') || '';

      await apiClient.withAuth(token_str).post('/company/initial-balance', {
        initial_balance: parseFloat(initialBalance),
        initial_balance_date: balanceDate,
      });
      setBalanceMessage('Başlangıç bakiyesi başarıyla kaydedildi!');
      onInitialBalanceSuccess?.();
      setTimeout(() => {
        onClose?.();
      }, 1500);
    } catch (error) {
      setBalanceMessage('Hata: ' + error.message);
      onError?.(error.message);
    } finally {
      setBalanceLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Ayarlar</h2>
          <button 
            className={styles.closeButton}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'profile' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            👤 Profil
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'balance' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('balance')}
          >
            💰 Başlangıç Bakiyesi
          </button>
        </div>

        <div className={styles.body}>
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Adınız</label>
                <input
                  type="text"
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Adınızı girin"
                />
              </div>

              {message && (
                <div className={styles.message} style={{ color: '#dc2626' }}>
                  {message}
                </div>
              )}
            </div>
          )}

          {/* Balance Tab */}
          {activeTab === 'balance' && (
            <div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Başlangıç Bakiyesi (TL)</label>
                <input
                  type="number"
                  className={styles.input}
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Tarih</label>
                <input
                  type="date"
                  className={styles.input}
                  value={balanceDate}
                  onChange={(e) => setBalanceDate(e.target.value)}
                />
              </div>

              {balanceMessage && (
                <div 
                  className={styles.message}
                  style={{ 
                    color: balanceMessage.includes('başarıyla') ? '#10b981' : '#dc2626'
                  }}
                >
                  {balanceMessage}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button 
            className={styles.cancelButton}
            onClick={onClose}
          >
            İptal
          </button>
          <button 
            className={styles.saveButton}
            onClick={activeTab === 'profile' ? handleSaveName : handleSaveBalance}
            disabled={balanceLoading}
          >
            {balanceLoading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
