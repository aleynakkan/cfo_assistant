import AppShell from "../components/layout/AppShell";
import Greeting from "../components/dashboard/Greeting";
import CashHero from "../components/dashboard/CashHero";
import KPICards from "../components/dashboard/KPICards";
import MatchingPanel from "../components/dashboard/MatchingPanel";
import FixedCostCard from "../components/dashboard/FixedCostCard";
import CashForecastCard from "../components/dashboard/CashForecastCard";
import InsightsCard from "../components/dashboard/InsightsCard";

export default function Dashboard({
  estimatedCash,
  totalIncome,
  totalExpense,
  netCash,
  matchHealth,
  userName,
  token,
  onRefreshDashboard,
}) {
  return (
    <AppShell>
      <Greeting userName={userName} />
      <CashHero estimatedCash={estimatedCash} />
      <KPICards income={totalIncome} expense={totalExpense} net={netCash} />
      <MatchingPanel data={matchHealth} token={token} onMatchDeleted={onRefreshDashboard} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <FixedCostCard />
        <CashForecastCard estimatedCash={estimatedCash} />
        <InsightsCard />
      </div>
    </AppShell>
  );
}
