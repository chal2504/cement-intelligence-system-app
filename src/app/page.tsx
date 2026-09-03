import { getAllEditions, getLatestEdition, getDailyPulse } from "@/lib/dataLoader";
import Dashboard from "./Dashboard";

// La app se reconstruye en cada push (edicion semanal o pulso diario),
// asi que el pulso mas reciente se lee al construir.
export const dynamic = "force-static";

export const metadata = {
  title: "Cement Intelligence System · Edición semanal",
  description: "Dashboard interactivo semanal de inteligencia del sector cementero del Caribe.",
};

export default function Home() {
  const allEditions = getAllEditions();
  const latestEdition = getLatestEdition();
  const dailyPulse = getDailyPulse();

  if (!latestEdition) {
    return (
      <div style={{ padding: "40px", textAlign: "center", fontFamily: "system-ui" }}>
        <h2>No weekly editions data found.</h2>
        <p>Please check your data/editions folder.</p>
      </div>
    );
  }

  return <Dashboard allEditions={allEditions} latestEdition={latestEdition} dailyPulse={dailyPulse} />;
}
