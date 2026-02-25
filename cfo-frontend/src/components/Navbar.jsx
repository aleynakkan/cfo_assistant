import styles from './Navbar.module.css';
import { useState } from 'react';
import aiHeadIcon from '../assets/image_head_seyfo.svg';
import logoName from '../assets/logo-name.svg';
import cariler_icon from '../assets/cariler_icon.svg';
import dashboard_icon from '../assets/dashboard_icon.svg';
import notifications_icon from '../assets/notifications_icon.svg';
import veriyonetimi_icon from '../assets/veriyonetimi_icon.svg';

export default function Navbar({ view, setView, onLogout, onInitialBalance, onProfileSettings, onAiChatToggle, userName = 'Kevin' }) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const userInitial = userName?.charAt(0)?.toUpperCase() || 'K';

  return (
    <nav className={styles.navbar}>
      {/* Left: Logo */}
      <div className={styles.logo}>
        <img 
          src={logoName} 
          alt="Seyfo Logo" 
        />
      </div>

      {/* Right: Actions */}
      <div className={styles.actions}>
        <button 
          className={view === 'dashboard' ? styles.redButton : styles.outlineButton}
          onClick={() => setView('dashboard')}
        >
          <img src={dashboard_icon} alt="Dashboard" style={{ width: '18px', height: '18px' }} /> <span>Dashboard</span>
        </button>
        
        <button 
          className={view === 'data' ? styles.redButton : styles.outlineButton}
          onClick={() => setView('data')}
        >
          <img src={veriyonetimi_icon} alt="Veri Yönetimi" style={{ width: '18px', height: '18px' }} /> <span>Veri Yönetimi</span>
        </button>

                <button 
          className={view === 'counterparties' ? styles.redButton : styles.outlineButton}
          onClick={() => setView('counterparties')}
        >
          <img src={cariler_icon} alt="Cariler" style={{ width: '18px', height: '18px' }} /> <span>Cariler</span>
        </button>

        <div className={styles.divider} />

        <button className={styles.iconButton}>
          <img src={notifications_icon} alt="Notifications" style={{ width: '20px', height: '20px' }} />
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
            <span className={styles.profileLabel}>Profil</span>             
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
