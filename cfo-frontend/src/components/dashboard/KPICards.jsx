import styles from "./KPICards.module.css";

export default function KPICards({ income, expense, net }) {
  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <div className={styles.label}>Toplam Gelir</div>
        <div className={styles.value}>
          {Number(income || 0).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <div className={styles.unit}>TL</div>
      </div>

      <div className={styles.card}>
        <div className={styles.label}>Toplam Gider</div>
        <div className={styles.value}>
          {Number(expense || 0).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <div className={styles.unit}>TL</div>
      </div>

      <div className={styles.card}>
        <div className={styles.label}>Net Nakit Akışı</div>
        <div className={`${styles.value} ${net >= 0 ? styles.positive : styles.negative}`}>
          {Number(net || 0).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <div className={styles.unit}>TL</div>
      </div>
    </div>
  );
}
