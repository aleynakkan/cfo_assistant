import styles from "./Greeting.module.css";

export default function Greeting({ userName = "Kevin" }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Günaydın" : hour < 18 ? "İyi öğlenler" : "İyi akşamlar";

  return (
    <div className={styles.greeting}>
      <div>
        <h1>{greeting}, {userName} 👋</h1>
        <p>Nakit akışınız ve gelir-gider durumunuz bir bakışta</p>
      </div>
      <select className={styles.filter}>
        <option>Tüm zamanlar</option>
        <option>Son 30 gün</option>
        <option>Bu ay</option>
      </select>
    </div>
  );
}
