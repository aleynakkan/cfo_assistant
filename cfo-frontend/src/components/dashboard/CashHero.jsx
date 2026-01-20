import styles from "./CashHero.module.css";

export default function CashHero({ estimatedCash }) {
  return (
    <div className={styles.hero}>
      <div className={styles.content}>
        <div className={styles.label}>Tahmini Nakit Pozisyonu</div>
        <div className={styles.amount}>
          {Number(estimatedCash || 0).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
          <span>₺</span>
        </div>
      </div>
    </div>
  );
}
