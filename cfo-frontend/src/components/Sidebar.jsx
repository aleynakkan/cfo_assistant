import styles from './Sidebar.module.css';

export default function Sidebar({ view, setView, onLogout }) {
  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logoSection}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="2" y="2" width="8" height="10" fill="#dc0005" rx="2" />
          <rect x="12" y="2" width="8" height="10" fill="#ef3b2c" rx="2" />
          <rect x="2" y="14" width="8" height="10" fill="#e7000b" rx="2" />
          <rect x="12" y="14" width="8" height="10" fill="#cb181d" rx="2" />
        </svg>
        <span className={styles.logoText}>seyfo</span>
      </div>

      {/* Navigation Buttons */}
      <div className={styles.navButtons}>
        <button 
          className={`${styles.navButton} ${view === 'dashboard' ? styles.active : ''}`}
          onClick={() => setView('dashboard')}
          title="Dashboard"
        >
          <span className={styles.icon}>📊</span>
          <span className={styles.label}>Dashboard</span>
        </button>

        <button 
          className={`${styles.navButton}`}
          title="Seyfo AI"
        >
          <span className={styles.icon}>🤖</span>
          <span className={styles.label}>Seyfo AI</span>
        </button>

        <button 
          className={`${styles.navButton} ${view === 'data' ? styles.active : ''}`}
          onClick={() => setView('data')}
          title="Veri Yönetimi"
        >
          <span className={styles.icon}>📁</span>
          <span className={styles.label}>Veri Yönetimi</span>
        </button>

        <button 
          className={`${styles.navButton} ${view === 'counterparties' ? styles.active : ''}`}
          onClick={() => setView('counterparties')}
          title="Cari Hesaplar"
        >
          <span className={styles.icon}>👥</span>
          <span className={styles.label}>Cariler</span>
        </button>
      </div>

      {/* Divider */}
      <div className={styles.divider} />

      {/* Profile Section */}
      <div className={styles.profileSection}>
        <div className={styles.profileItem}>
          <div className={styles.avatar}>K</div>
          <span className={styles.profileName}>Kevin</span>
          <span className={styles.caret}>▼</span>
        </div>
      </div>
    </aside>
  );
}
