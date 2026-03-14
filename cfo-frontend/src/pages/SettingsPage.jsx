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

  // Şifre değiştir state'leri
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Vergi ayarları state'leri
  const [allTaxes, setAllTaxes] = useState([]);
  const [taxConfigs, setTaxConfigs] = useState({});
  const [taxMessage, setTaxMessage] = useState('');
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxFetchLoading, setTaxFetchLoading] = useState(false);

  useEffect(() => {
    setName(currentName || 'Kevin');
  }, [currentName]);

  // Paraşüt bağlantı durumunu kontrol et
  useEffect(() => {
    if (activeSection === 'integrations') {
      fetchParasutStatus();
    }
    if (activeSection === 'taxes') {
      fetchTaxData();
    }
  }, [activeSection]);

  const fetchTaxData = async () => {
    setTaxFetchLoading(true);
    try {
      const tokenStr = token || localStorage.getItem('auth_token') || '';
      const [taxesRes, configRes] = await Promise.all([
        apiClient.withAuth(tokenStr).get('/taxes/'),
        apiClient.withAuth(tokenStr).get('/taxes/my'),
      ]);
      if (taxesRes.ok) {
        const taxes = await taxesRes.json();
        setAllTaxes(taxes);
      }
      if (configRes.ok) {
        const configs = await configRes.json();
        const map = {};
        configs.forEach(c => {
          map[c.tax_id] = {
            active: c.active,
            frequency: c.frequency,
            due_day: c.due_day,
            due_month: c.due_month,
          };
        });
        setTaxConfigs(map);
      }
    } catch {
      // ignore
    } finally {
      setTaxFetchLoading(false);
    }
  };

  const handleTaxToggle = (taxId) => {
    setTaxConfigs(prev => ({
      ...prev,
      [taxId]: {
        ...(prev[taxId] || { frequency: 'monthly', due_day: 26, due_month: null }),
        active: !(prev[taxId]?.active),
      },
    }));
  };

  const handleTaxFieldChange = (taxId, field, value) => {
    setTaxConfigs(prev => ({
      ...prev,
      [taxId]: {
        ...(prev[taxId] || { active: false, frequency: 'monthly', due_day: 26, due_month: null }),
        [field]: value,
      },
    }));
  };

  const handleSaveTaxConfig = async () => {
    setTaxLoading(true);
    setTaxMessage('');
    try {
      const tokenStr = token || localStorage.getItem('auth_token') || '';
      const configs = allTaxes.map(tax => ({
        tax_id: tax.id,
        active: taxConfigs[tax.id]?.active || false,
        frequency: taxConfigs[tax.id]?.frequency || 'monthly',
        due_day: parseInt(taxConfigs[tax.id]?.due_day) || 26,
        due_month: taxConfigs[tax.id]?.due_month ? parseInt(taxConfigs[tax.id].due_month) : null,
      }));
      const response = await apiClient.withAuth(tokenStr).post('/taxes/my', { taxes: configs });
      if (response.ok) {
        setTaxMessage('Vergi ayarları başarıyla kaydedildi!');
      } else {
        const error = await response.json().catch(() => ({}));
        setTaxMessage(error.detail || 'Kaydetme başarısız');
      }
    } catch (error) {
      setTaxMessage('Hata: ' + error.message);
    } finally {
      setTaxLoading(false);
    }
  };

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

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordMessage('Tüm alanları doldurun');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage('Yeni şifre en az 6 karakter olmalıdır');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('Yeni şifreler eşleşmiyor');
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage('');

    try {
      const tokenStr = token || localStorage.getItem('auth_token') || '';
      const response = await apiClient.withAuth(tokenStr).post('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });

      if (response.ok) {
        setPasswordMessage('Şifreniz başarıyla güncellendi!');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const error = await response.json().catch(() => ({}));
        setPasswordMessage(error.detail || 'Şifre değiştirme başarısız');
      }
    } catch (error) {
      setPasswordMessage('Hata: ' + error.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const sections = [
    { id: 'profile', label: 'Profil', icon: '👤' },
    { id: 'balance', label: 'Başlangıç Bakiyesi', icon: '💰' },
    { id: 'password', label: 'Şifre Değiştir', icon: '🔒' },
    { id: 'taxes', label: 'Vergi Ayarları', icon: '📋' },
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

        {/* Password Section */}
        {activeSection === 'password' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Şifre Değiştir</h2>
              <p className={styles.sectionDesc}>Hesap şifrenizi güncelleyin</p>
            </div>

            <div className={styles.card}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Mevcut Şifre</label>
                <input
                  type="password"
                  className={styles.input}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Mevcut şifrenizi girin"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Yeni Şifre</label>
                <input
                  type="password"
                  className={styles.input}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Yeni şifrenizi girin"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Yeni Şifre (Tekrar)</label>
                <input
                  type="password"
                  className={styles.input}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Yeni şifrenizi tekrar girin"
                />
              </div>

              {passwordMessage && (
                <div
                  className={styles.message}
                  style={{
                    color: passwordMessage.includes('başarıyla') ? '#065f46' : '#dc2626',
                    backgroundColor: passwordMessage.includes('başarıyla') ? '#d1fae5' : '#fee2e2',
                  }}
                >
                  {passwordMessage}
                </div>
              )}

              <div className={styles.cardActions}>
                <button
                  className={styles.saveButton}
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                >
                  {passwordLoading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tax Settings Section */}
        {activeSection === 'taxes' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Vergi Hatırlatma Ayarları</h2>
              <p className={styles.sectionDesc}>Takip etmek istediğiniz vergi türlerini seçin ve vade günlerini belirleyin</p>
            </div>

            {taxFetchLoading ? (
              <div className={styles.card}>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Yükleniyor...</p>
              </div>
            ) : (
              <>
                {allTaxes.map(tax => {
                  const cfg = taxConfigs[tax.id] || { active: false, frequency: 'monthly', due_day: 26, due_month: null };
                  return (
                    <div key={tax.id} className={styles.card} style={{ marginBottom: '12px' }}>
                      <div className={styles.taxRow}>
                        <label className={styles.taxToggle}>
                          <input
                            type="checkbox"
                            checked={cfg.active}
                            onChange={() => handleTaxToggle(tax.id)}
                            className={styles.taxCheckbox}
                          />
                          <span className={styles.taxName}>{tax.name}</span>
                        </label>

                        {cfg.active && (
                          <div className={styles.taxFields}>
                            <div className={styles.taxField}>
                              <label className={styles.taxFieldLabel}>Sıklık</label>
                              <select
                                className={styles.taxSelect}
                                value={cfg.frequency}
                                onChange={(e) => handleTaxFieldChange(tax.id, 'frequency', e.target.value)}
                              >
                                <option value="monthly">Aylık</option>
                                <option value="quarterly">3 Aylık</option>
                                <option value="yearly">Yıllık</option>
                              </select>
                            </div>

                            <div className={styles.taxField}>
                              <label className={styles.taxFieldLabel}>Vade Günü</label>
                              <input
                                type="number"
                                className={styles.taxInput}
                                value={cfg.due_day}
                                onChange={(e) => handleTaxFieldChange(tax.id, 'due_day', e.target.value)}
                                min={1}
                                max={31}
                              />
                            </div>

                            {cfg.frequency === 'yearly' && (
                              <div className={styles.taxField}>
                                <label className={styles.taxFieldLabel}>Vade Ayı</label>
                                <select
                                  className={styles.taxSelect}
                                  value={cfg.due_month || 4}
                                  onChange={(e) => handleTaxFieldChange(tax.id, 'due_month', e.target.value)}
                                >
                                  <option value={1}>Ocak</option>
                                  <option value={2}>Şubat</option>
                                  <option value={3}>Mart</option>
                                  <option value={4}>Nisan</option>
                                  <option value={5}>Mayıs</option>
                                  <option value={6}>Haziran</option>
                                  <option value={7}>Temmuz</option>
                                  <option value={8}>Ağustos</option>
                                  <option value={9}>Eylül</option>
                                  <option value={10}>Ekim</option>
                                  <option value={11}>Kasım</option>
                                  <option value={12}>Aralık</option>
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {taxMessage && (
                  <div
                    className={styles.message}
                    style={{
                      color: taxMessage.includes('başarıyla') ? '#065f46' : '#dc2626',
                      backgroundColor: taxMessage.includes('başarıyla') ? '#d1fae5' : '#fee2e2',
                      marginBottom: '12px',
                    }}
                  >
                    {taxMessage}
                  </div>
                )}

                <div className={styles.cardActions}>
                  <button
                    className={styles.saveButton}
                    onClick={handleSaveTaxConfig}
                    disabled={taxLoading}
                  >
                    {taxLoading ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </div>
              </>
            )}
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
