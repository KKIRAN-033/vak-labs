import { useState, useCallback } from "react";
import "./App.css";
import UploadPanel from "./components/UploadPanel";
import AnalysisPanel from "./components/AnalysisPanel";
import ChatPanel from "./components/ChatPanel";
import { TooltipProvider } from "./components/ui/tooltip";
import { Shield, Radio } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = "https://vak-labs.onrender.com";

function App() {
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchDatasets = useCallback(async () => {
    try {
      const res = await fetch(`${API}/datasets`);
      const data = await res.json();
      setDatasets(data);
    } catch (e) {
      console.error("Failed to fetch datasets:", e);
    }
  }, []);

  const fetchAnalysis = useCallback(async (datasetId = null) => {
    setLoading(true);
    try {
      const url = datasetId
        ? `${API}/analyze/${datasetId}`
        : `${API}/analyze`;
      const res = await fetch(url);
      const data = await res.json();
      setAnalysisData(data);
    } catch (e) {
      console.error("Failed to fetch analysis:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const onDatasetUploaded = useCallback(() => {
    fetchDatasets();
    fetchAnalysis();
  }, [fetchDatasets, fetchAnalysis]);

  const onSelectDataset = useCallback((ds) => {
    setSelectedDataset(ds);
    fetchAnalysis(ds?.id || null);
  }, [fetchAnalysis]);

  return (
    <TooltipProvider>
      <div className="h-screen w-full bg-background overflow-hidden flex flex-col" data-testid="app-root">
        {/* Header */}
        <header className="h-12 border-b border-border/60 bg-card/80 backdrop-blur-md flex items-center px-4 gap-3 shrink-0" data-testid="app-header">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <span className="text-sm font-semibold tracking-tight text-foreground">TELECOM FORENSICS</span>
          </div>
          <div className="h-4 w-px bg-border mx-1" />
          <span className="text-xs text-muted-foreground">Investigation Dashboard</span>
          <div className="ml-auto flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-muted-foreground font-mono">SYSTEM ONLINE</span>
          </div>
        </header>

        {/* Main Content - 3 Panel Layout */}
        <div className="flex flex-1 overflow-hidden">
          <UploadPanel
            datasets={datasets}
            selectedDataset={selectedDataset}
            onSelectDataset={onSelectDataset}
            onDatasetUploaded={onDatasetUploaded}
            fetchDatasets={fetchDatasets}
            apiUrl={API}
          />
          <AnalysisPanel
            analysisData={analysisData}
            selectedDataset={selectedDataset}
            loading={loading}
            apiUrl={API}
          />
          <ChatPanel
            apiUrl={API}
            selectedDataset={selectedDataset}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
