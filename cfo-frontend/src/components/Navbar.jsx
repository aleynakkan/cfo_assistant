import styles from './Navbar.module.css';
import { useState } from 'react';
import aiHeadIcon from '../assets/image_head_seyfo.svg';

export default function Navbar({ view, setView, onLogout, onInitialBalance, onProfileSettings, onAiChatToggle, userName = 'Kevin' }) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const userInitial = userName?.charAt(0)?.toUpperCase() || 'K';

  return (
    <nav className={styles.navbar}>
      {/* Left: Logo */}
      <div className={styles.logo}>
        <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
          <rect x="2" y="2" width="8" height="10" fill="#dc0005" rx="2" />
          <rect x="12" y="2" width="8" height="10" fill="#ef3b2c" rx="2" />
          <rect x="2" y="14" width="8" height="10" fill="#e7000b" rx="2" />
          <rect x="12" y="14" width="8" height="10" fill="#cb181d" rx="2" />
        </svg>
        <span className={styles.logoText}>seyfo</span>
      </div>

      {/* Right: Actions */}
      <div className={styles.actions}>
        <button 
          className={view === 'dashboard' ? styles.redButton : styles.outlineButton}
          onClick={() => setView('dashboard')}
        >
          <span>📊</span> Dashboard
        </button>
        
        <button 
          className={view === 'data' ? styles.redButton : styles.outlineButton}
          onClick={() => setView('data')}
        >
          <span>📁</span> Veri Yönetimi
        </button>

        <div className={styles.divider} />

        <button className={styles.iconButton}>
          <span>🔔</span>
        </button>

        <button 
          className={styles.iconButton} 
          onClick={() => onAiChatToggle?.()}
          title="Yapay Zeka Asistanı"
          style={{ padding: "2px" }}
        >
          <img 
            src={aiHeadIcon}
            alt="AI Assistant"
            style={{ width: "24px", height: "24px", borderRadius: "50%", objectFit: "cover" }}
          />
        </button>

        {/* Profile Dropdown */}
        <div className={styles.profileWrapper}>
          <div 
            className={styles.profile}
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <div className={styles.avatar}>{userInitial}</div>
            <span className={styles.profileName}>{userName}</span>
            <span className={styles.profileDropdown}>▼</span>
          </div>
          
          {showProfileMenu && (
            <div className={styles.profileMenu}>
              <button 
                className={styles.menuItem}
                onClick={() => {
                  setShowProfileMenu(false);
                  onProfileSettings?.();
                }}
              >
                👤 Profil Ayarları
              </button>
              <div className={styles.menuDivider} />
              <button 
                className={styles.menuItem}
                onClick={() => {
                  setShowProfileMenu(false);
                  onLogout?.();
                }}
              >
                🚪 Çıkış Yap
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
