import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import styles from './SettingsPage.module.css';

export default function SettingsPage({ currentName, onNameChange, token, onInitialBalanceSuccess, onError, onBack }) {
  const [activeSection, setActiveSection] = useState('profile');
  
  // Profile state
  const [name, setName] = useState(currentName || 'Kevin');
  const [message, setMessage] = useState('');

  // Balance state
  const [initialBalance, setInitialBalance] = useState('');
  const [balanceDate, setBalanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [balanceMessage, setBalanceMessage] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Paraşüt entegrasyon state'leri
  const [parasutClientId, setParasutClientId] = useState('');
  const [parasutClientSecret, setParasutClientSecret] = useState('');
  const [parasutEmail, setParasutEmail] = useState('');
  const [parasutPassword, setParasutPassword] = useState('');
  const [parasutCompanyId, setParasutCompanyId] = useState('');
  const [parasutStatus, setParasutStatus] = useState(null);
  const [parasutLoading, setParasutLoading] = useState(false);
  const [parasutMessage, setParasutMessage] = useState('');
  const [parasutStatusLoading, setParasutStatusLoading] = useState(false);

  useEffect(() => {
    setName(currentName || 'Kevin');
  }, [currentName]);

  // Paraşüt bağlantı durumunu kontrol et
  useEffect(() => {
    if (activeSection === 'integrations') {
      fetchParasutStatus();
    }
  }, [activeSection]);

  const fetchParasutStatus = async () => {
    setParasutStatusLoading(true);
    try {
      const tokenStr = token || localStorage.getItem('auth_token') || '';
      const response = await apiClient.withAuth(tokenStr).get('/parasut/status');
      if (response.ok) {
        const data = await response.json();
        setParasutStatus(data);
      }
    } catch {
      setParasutStatus({ is_connected: false });
    } finally {
      setParasutStatusLoading(false);
    }
  };

  const handleParasutConnect = async () => {
    if (!parasutClientId || !parasutClientSecret || !parasutEmail || !parasutPassword || !parasutCompanyId) {
      setParasutMessage('Tüm alanları doldurun');
      return;
    }

    setParasutLoading(true);
    setParasutMessage('');

    try {
      const tokenStr = token || localStorage.getItem('auth_token') || '';
      const response = await apiClient.withAuth(tokenStr).post('/parasut/connect', {
        client_id: parasutClientId,
        client_secret: parasutClientSecret,
        email: parasutEmail,
        password: parasutPassword,
        parasut_company_id: parasutCompanyId,
      });

      if (response.ok) {
        const data = await response.json();
        setParasutStatus(data);
        setParasutMessage('Paraşüt hesabı başarıyla bağlandı!');
        setParasutPassword('');
      } else {
        const error = await response.json().catch(() => ({}));
        setParasutMessage(error.detail || 'Bağlantı başarısız');
      }
    } catch (error) {
      setParasutMessage('Bağlantı hatası: ' + error.message);
    } finally {
      setParasutLoading(false);
    }
  };

  const handleParasutDisconnect = async () => {
    setParasutLoading(true);
    setParasutMessage('');

    try {
      const tokenStr = token || localStorage.getItem('auth_token') || '';
      const response = await apiClient.withAuth(tokenStr).delete('/parasut/disconnect');

      if (response.ok) {
        setParasutStatus({ is_connected: false });
        setParasutMessage('Paraşüt bağlantısı kesildi');
        setParasutClientId('');
        setParasutClientSecret('');
        setParasutEmail('');
        setParasutCompanyId('');
      }
    } catch (error) {
      setParasutMessage('Hata: ' + error.message);
    } finally {
      setParasutLoading(false);
    }
  };

  const handleSaveName = () => {
    if (!name.trim()) {
      setMessage('Adınız boş olamaz');
      return;
    }

    onNameChange?.(name);
    setMessage('Profil başarıyla güncellendi!');
    setTimeout(() => setMessage(''), 3000);
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
    } catch (error) {
      setBalanceMessage('Hata: ' + error.message);
      onError?.(error.message);
    } finally {
      setBalanceLoading(false);
    }
  };

  const sections = [
    { id: 'profile', label: 'Profil', icon: '👤' },
    { id: 'balance', label: 'Başlangıç Bakiyesi', icon: '💰' },
    { id: 'integrations', label: 'Entegrasyonlar', icon: '🔗' },
  ];

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button className={styles.backButton} onClick={onBack}>
            ← Geri
          </button>
          <h2 className={styles.sidebarTitle}>Ayarlar</h2>
        </div>

        <nav className={styles.sidebarNav}>
          {sections.map((section) => (
            <button
              key={section.id}
              className={`${styles.navItem} ${activeSection === section.id ? styles.navItemActive : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span className={styles.navIcon}>{section.icon}</span>
              <span className={styles.navLabel}>{section.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Content Area */}
      <main className={styles.content}>
        {/* Profile Section */}
        {activeSection === 'profile' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Profil Bilgileri</h2>
              <p className={styles.sectionDesc}>Hesap bilgilerinizi yönetin</p>
            </div>

            <div className={styles.card}>
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
                <div
                  className={styles.message}
                  style={{
                    color: message.includes('başarıyla') ? '#065f46' : '#dc2626',
                    backgroundColor: message.includes('başarıyla') ? '#d1fae5' : '#fee2e2',
                  }}
                >
                  {message}
                </div>
              )}

              <div className={styles.cardActions}>
                <button className={styles.saveButton} onClick={handleSaveName}>
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Balance Section */}
        {activeSection === 'balance' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Başlangıç Bakiyesi</h2>
              <p className={styles.sectionDesc}>Şirketinizin başlangıç bakiyesini ayarlayın</p>
            </div>

            <div className={styles.card}>
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
                    color: balanceMessage.includes('başarıyla') ? '#065f46' : '#dc2626',
                    backgroundColor: balanceMessage.includes('başarıyla') ? '#d1fae5' : '#fee2e2',
                  }}
                >
                  {balanceMessage}
                </div>
              )}

              <div className={styles.cardActions}>
                <button
                  className={styles.saveButton}
                  onClick={handleSaveBalance}
                  disabled={balanceLoading}
                >
                  {balanceLoading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Integrations Section */}
        {activeSection === 'integrations' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Entegrasyonlar</h2>
              <p className={styles.sectionDesc}>Harici servisleri bağlayarak verilerinizi senkronize edin</p>
            </div>

            {/* Paraşüt Card */}
            <div className={styles.card}>
              <div className={styles.integrationHeader}>
                <span className={styles.integrationLogo}>☁️</span>
                <div>
                  <h3 className={styles.integrationTitle}>Paraşüt</h3>
                  <p className={styles.integrationDesc}>Muhasebe yazılımınızdan fatura verilerini çekin</p>
                </div>
                {parasutStatus?.is_connected && (
                  <span className={styles.connectedBadge}>
                    <span className={styles.connectedDot}></span>
                    Bağlı
                  </span>
                )}
              </div>

              {parasutStatusLoading ? (
                <div className={styles.integrationLoading}>Durum kontrol ediliyor...</div>
              ) : parasutStatus?.is_connected ? (
                /* Bağlı durumda */
                <div>
                  <div className={styles.connectedInfo}>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>E-posta:</span>
                      <span className={styles.infoValue}>{parasutStatus.parasut_email}</span>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Firma No:</span>
                      <span className={styles.infoValue}>{parasutStatus.parasut_company_id}</span>
                    </div>
                  </div>

                  <button
                    className={styles.disconnectButton}
                    onClick={handleParasutDisconnect}
                    disabled={parasutLoading}
                  >
                    {parasutLoading ? 'İşleniyor...' : '🔌 Bağlantıyı Kes'}
                  </button>
                </div>
              ) : (
                /* Bağlı değil - form göster */
                <div>
                  <p className={styles.hint} style={{ marginBottom: '16px' }}>
                    Paraşüt API bilgilerinizi almak için Paraşüt destek ekibine başvurun: <strong>destek@parasut.com</strong>
                  </p>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Client ID</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={parasutClientId}
                        onChange={(e) => setParasutClientId(e.target.value)}
                        placeholder="Paraşüt API Client ID"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Client Secret</label>
                      <input
                        type="password"
                        className={styles.input}
                        value={parasutClientSecret}
                        onChange={(e) => setParasutClientSecret(e.target.value)}
                        placeholder="Paraşüt API Client Secret"
                      />
                    </div>
                  </div>

                  <hr className={styles.divider} />

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Paraşüt E-posta</label>
                      <input
                        type="email"
                        className={styles.input}
                        value={parasutEmail}
                        onChange={(e) => setParasutEmail(e.target.value)}
                        placeholder="ornek@sirket.com"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Paraşüt Şifre</label>
                      <input
                        type="password"
                        className={styles.input}
                        value={parasutPassword}
                        onChange={(e) => setParasutPassword(e.target.value)}
                        placeholder="Paraşüt şifreniz"
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Firma Numarası</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={parasutCompanyId}
                      onChange={(e) => setParasutCompanyId(e.target.value)}
                      placeholder="Paraşüt firma numaranız (ör: 12345)"
                      style={{ maxWidth: '300px' }}
                    />
                    <p className={styles.hint}>
                      Paraşüt panelinizdeki URL'den bulabilirsiniz: app.parasut.com/<strong>FIRMA_NO</strong>/...
                    </p>
                  </div>

                  <button
                    className={styles.connectButton}
                    onClick={handleParasutConnect}
                    disabled={parasutLoading}
                  >
                    {parasutLoading ? 'Bağlanıyor...' : '🔗 Paraşüt\'e Bağlan'}
                  </button>
                </div>
              )}

              {parasutMessage && (
                <div
                  className={styles.message}
                  style={{
                    color: parasutMessage.includes('başarıyla') ? '#065f46' : '#dc2626',
                    backgroundColor: parasutMessage.includes('başarıyla') ? '#d1fae5' : '#fee2e2',
                    marginTop: '16px',
                  }}
                >
                  {parasutMessage}
                </div>
              )}
            </div>

            {/* Placeholder for future integrations */}
            <div className={`${styles.card} ${styles.cardMuted}`}>
              <div className={styles.integrationHeader}>
                <span className={styles.integrationLogo} style={{ background: '#f3f4f6' }}>📦</span>
                <div>
                  <h3 className={styles.integrationTitle} style={{ color: 'var(--text-secondary)' }}>Daha fazlası yakında...</h3>
                  <p className={styles.integrationDesc}>Yeni entegrasyonlar üzerinde çalışıyoruz</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
