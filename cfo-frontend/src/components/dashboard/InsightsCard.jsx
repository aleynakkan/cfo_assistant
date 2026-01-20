import styles from "./InsightsCard.module.css";

export default function InsightsCard() {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>Önemli Bulgular</h3>
      <div className={styles.placeholder}>Insights burada gelecek</div>
    </div>
  );
}
