import { useState } from 'react';
import { apiClient } from '../../api/client';
import styles from './TaxReminderCard.module.css';

export default function TaxReminderCard({ upcomingTaxes = [], token, onRefresh }) {
  const [payingTaxId, setPayingTaxId] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const visibleTaxes = showAll ? upcomingTaxes : upcomingTaxes.slice(0, 3);
  const hasMore = upcomingTaxes.length > 3;
  const unpaidCount = upcomingTaxes.filter(t => !t.is_paid).length;

  const handleMarkPaid = async (tax) => {
    setPayingTaxId(tax.tax_id);
    try {
      const tokenStr = token || localStorage.getItem('auth_token') || '';
      const response = await apiClient.withAuth(tokenStr).post('/taxes/payments', {
        tax_id: tax.tax_id,
        period: tax.period,
      });
      if (response.ok) {
        onRefresh?.();
      }
    } catch {
      // ignore
    } finally {
      setPayingTaxId(null);
    }
  };

  const getDaysLabel = (daysLeft) => {
    if (daysLeft < 0) return `${Math.abs(daysLeft)} gün gecikmiş`;
    if (daysLeft === 0) return 'Bugün';
    if (daysLeft === 1) return 'Yarın';
    return `${daysLeft} gün kaldı`;
  };

  const getUrgencyClass = (daysLeft) => {
    if (daysLeft < 0) return styles.overdue;
    if (daysLeft <= 3) return styles.urgent;
    if (daysLeft <= 7) return styles.warning;
    return styles.normal;
  };

  if (upcomingTaxes.length === 0) {
    return (
      <div className={styles.wrapper}>
        <h2 className={styles.title}>Vergi Takvimi</h2>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>✅</span>
          <p>Yaklaşan vergi ödemeniz yok</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h2 className={styles.title}>Vergi Takvimi</h2>
        {unpaidCount > 0 && (
          <span className={styles.badge}>{unpaidCount}</span>
        )}
      </div>

      <div className={styles.list}>
        {visibleTaxes.map((tax) => (
          <div
            key={`${tax.tax_id}-${tax.period}`}
            className={`${styles.item} ${tax.is_paid ? styles.paid : getUrgencyClass(tax.days_left)}`}
          >
            <div className={styles.itemLeft}>
              <span className={styles.taxName}>{tax.tax_name}</span>
              <span className={styles.dueDate}>
                {new Date(tax.due_date).toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
            </div>

            <div className={styles.itemRight}>
              {tax.is_paid ? (
                <span className={styles.paidBadge}>✓ Ödendi</span>
              ) : (
                <>
                  <span className={`${styles.daysLabel} ${getUrgencyClass(tax.days_left)}`}>
                    {getDaysLabel(tax.days_left)}
                  </span>
                  <button
                    className={styles.paidButton}
                    onClick={() => handleMarkPaid(tax)}
                    disabled={payingTaxId === tax.tax_id}
                    title="Ödendi olarak işaretle"
                  >
                    {payingTaxId === tax.tax_id ? '...' : 'Ödendi'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasMore && !showAll && (
        <button className={styles.showMore} onClick={() => setShowAll(true)}>
          +{upcomingTaxes.length - 3} daha
        </button>
      )}
      {showAll && hasMore && (
        <button className={styles.showMore} onClick={() => setShowAll(false)}>
          Daha az göster
        </button>
      )}
    </div>
  );
}
