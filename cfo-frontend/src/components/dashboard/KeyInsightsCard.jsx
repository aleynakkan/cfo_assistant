import { useState, useEffect } from "react";
import styles from "./KeyInsightsCard.module.css";

const WARNING_ICON_URL = "https://www.figma.com/api/mcp/asset/e8587674-d44f-4161-beac-2130b958d5a5";

export default function KeyInsightsCard({ chartData = [], onDataRefresh = null }) {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fallback mock veri
  const mockInsights = [
    {
      title: "Yaklaşan Planli Nakit (7 Gün)",
      description: "7 gün içinde 21.674627 TL ödeme ve 0.00 TL tahsilat görünüyor"
    },
    {
      title: "Vadesi Geçmiş Kalemler",
      description: "2 adet yapılmamış eşleşme vadesini geçti. Dikkat gerekli!"
    },
    {
      title: "Yaklaşan 14 Gün",
      description: "Önümüzdeki 14 gün içinde 5 adet eşleşme yapılması gerekiyor"
    }
  ];

  // Bakiyesi 0'a ulaşan tarihi bulma fonksiyonu
  const findZeroBalanceDate = (data) => {
    if (!data || data.length === 0) return null;
    
    for (const point of data) {
      if (point.value <= 0) {
        // Hafta bilgisini tarihe dönüştür (yaklaşık hesap)
        const weekNumber = parseInt(point.name.match(/\d+/)?.[0] || "0");
        if (weekNumber > 0) {
          const today = new Date();
          const targetDate = new Date(today);
          targetDate.setDate(targetDate.getDate() + weekNumber * 7);
          return targetDate.toLocaleDateString("tr-TR", { 
            year: "numeric", 
            month: "long", 
            day: "numeric" 
          });
        }
      }
    }
    return null;
  };

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("auth_token") || "";
        
        let fetchedInsights = [];
        
        // API'dan eski bulguları çek
        if (token) {
          const headers = { "Authorization": `Bearer ${token}` };
          const response = await fetch(
            "http://localhost:8000/dashboard/insights",
            { headers }
          );

          if (response.ok) {
            const data = await response.json();
            // Backend format: { insights: [...] }
            const formattedInsights = data.insights?.map(item => ({
              title: item.title,
              description: item.message
            })) || [];
            fetchedInsights = formattedInsights;
          }
        }
        
        // 0 bakiye olan tarihi bulma
        const zeroDate = findZeroBalanceDate(chartData);
        const zeroInsight = zeroDate ? {
          title: "Nakit Bitme Riski",
          description: `Nakit pozisyonunuz ${zeroDate}'da 0'a ulaşacak. Likidite planlaması yapın.`
        } : null;
        
        // 0 bakiye insight'ını ekle (varsa)
        const allInsights = zeroInsight 
          ? [zeroInsight, ...fetchedInsights]
          : fetchedInsights;
        
        setInsights(allInsights.length > 0 ? allInsights : mockInsights);
      } catch (error) {
        console.error("Insights fetch error:", error);
        
        // 0 bakiye insight'ını ekle, varsa
        const zeroDate = findZeroBalanceDate(chartData);
        const zeroInsight = zeroDate ? {
          title: "Nakit Bitme Riski",
          description: `Nakit pozisyonunuz ${zeroDate}'da 0'a ulaşacak. Likidite planlaması yapın.`
        } : null;
        
        setInsights(zeroInsight ? [zeroInsight, ...mockInsights] : mockInsights);
      } finally {
        setLoading(false);
      }
    };

    // chartData veya onDataRefresh trigger değişirse refetch et
    fetchInsights();
  }, [chartData, onDataRefresh]);

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>Önemli Bulgular</h3>

      <div className={styles.insightsList}>
        {loading ? (
          <div className={styles.loadingMessage}>Yükleniyor...</div>
        ) : insights.length > 0 ? (
          insights.map((insight, index) => (
            <div key={index} className={styles.insightItem}>
              <div className={styles.iconContainer}>
                <img
                  src={WARNING_ICON_URL}
                  alt="warning"
                  className={styles.warningIcon}
                />
              </div>
              <div className={styles.content}>
                <h4 className={styles.insightTitle}>{insight.title}</h4>
                <p className={styles.insightDescription}>{insight.description}</p>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyMessage}>Bulgu bulunamadı</div>
        )}
      </div>
    </div>
  );
}
