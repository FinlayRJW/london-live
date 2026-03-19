import { Layout } from "./components/Layout.tsx";
import { useTransportGraph } from "./hooks/useTransportGraph.ts";
import { useScoreComputation } from "./hooks/useScoreComputation.ts";
import { registerAllFilters } from "./filters/index.ts";

registerAllFilters();

function App() {
  useTransportGraph();
  useScoreComputation();

  return <Layout />;
}

export default App;
