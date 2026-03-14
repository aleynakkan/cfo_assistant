import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import styles from './NotificationDropdown.module.css';

export default function NotificationDropdown({ token, notifications = [], unreadCount = 0, onRefresh }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Click outside to close
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkRead = async (id) => {
    try {
      const tokenStr = token || localStorage.getItem('auth_token') || '';
      await apiClient.withAuth(tokenStr).patch(`/notifications/${id}/read`);
      onRefresh?.();
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const tokenStr = token || localStorage.getItem('auth_token') || '';
      await apiClient.withAuth(tokenStr).patch('/notifications/read-all');
      onRefresh?.();
    } catch {
      // ignore
    }
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) return 'Az önce';
    if (diffMin < 60) return `${diffMin} dk önce`;
    if (diffHour < 24) return `${diffHour} saat önce`;
    if (diffDay < 7) return `${diffDay} gün önce`;
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  return (
    <div className={styles.wrapper} ref={dropdownRef}>
      <button
        className={styles.bellButton}
        onClick={() => setOpen(!open)}
        title="Bildirimler"
      >
        🔔
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Bildirimler</span>
            {unreadCount > 0 && (
              <button className={styles.markAllRead} onClick={handleMarkAllRead}>
                Tümünü okundu yap
              </button>
            )}
          </div>

          <div className={styles.dropdownList}>
            {notifications.length === 0 ? (
              <div className={styles.emptyState}>
                Bildiriminiz yok
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`${styles.notifItem} ${!n.is_read ? styles.unread : ''}`}
                  onClick={() => !n.is_read && handleMarkRead(n.id)}
                >
                  <div className={styles.notifIcon}>
                    {n.type === 'tax_reminder' ? '📋' : '🔔'}
                  </div>
                  <div className={styles.notifContent}>
                    <span className={styles.notifTitle}>{n.title}</span>
                    <span className={styles.notifMessage}>{n.message}</span>
                    <span className={styles.notifTime}>{formatTime(n.created_at)}</span>
                  </div>
                  {!n.is_read && <div className={styles.unreadDot} />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
