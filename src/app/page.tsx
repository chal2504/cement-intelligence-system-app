import { getAllEditions, getLatestEdition } from "@/lib/dataLoader";
import Dashboard from "./Dashboard";

export const metadata = {
  title: "Cement Intelligence System · Edición semanal",
  description: "Dashboard interactivo semanal de inteligencia del sector cementero del Caribe.",
};

export default function Home() {
  const allEditions = getAllEditions();
  const latestEdition = getLatestEdition();

  if (!latestEdition) {
    return (
      <div style={{ padding: "40px", textAlign: "center", fontFamily: "system-ui" }}>
        <h2>No weekly editions data found.</h2>
        <p>Please check your data/editions folder.</p>
      </div>
    );
  }

  return <Dashboard allEditions={allEditions} latestEdition={latestEdition} />;
}
