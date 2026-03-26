import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { ScrollArea } from "./components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { Progress } from "./components/ui/progress";
import {
  UploadCloud,
  FileText,
  PhoneCall,
  Globe,
  Radio,
  Trash2,
  Sparkles,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

const TYPE_ICONS = {
  CDR: PhoneCall,
  IPDR: Globe,
  TOWER: Radio,
};

const TYPE_COLORS = {
  CDR: "text-blue-400",
  IPDR: "text-emerald-400",
  TOWER: "text-amber-400",
};

export default function UploadPanel({
  datasets,
  selectedDataset,
  onSelectDataset,
  onDatasetUploaded,
  fetchDatasets,
  apiUrl,
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [generatingSamples, setGeneratingSamples] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = useCallback(
    async (file) => {
      if (!file) return;
      if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        setError("Only Excel files (.xlsx) are supported");
        return;
      }
      setError(null);
      setUploading(true);
      setUploadProgress(20);

      const formData = new FormData();
      formData.append("file", file);

      try {
        setUploadProgress(50);
        const res = await fetch(`${apiUrl}/upload`, {
          method: "POST",
          body: formData,
        });
        setUploadProgress(80);

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Upload failed");
        }

        setUploadProgress(100);
        onDatasetUploaded();
      } catch (e) {
        setError(e.message);
      } finally {
        setTimeout(() => {
          setUploading(false);
          setUploadProgress(0);
        }, 500);
      }
    },
    [apiUrl, onDatasetUploaded]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      handleUpload(file);
    },
    [handleUpload]
  );

  const handleDelete = useCallback(
    async (e, id) => {
      e.stopPropagation();
      try {
        await fetch(`${apiUrl}/datasets/${id}`, { method: "DELETE" });
        if (selectedDataset?.id === id) onSelectDataset(null);
        fetchDatasets();
        onDatasetUploaded();
      } catch (err) {
        console.error("Delete failed:", err);
      }
    },
    [apiUrl, selectedDataset, onSelectDataset, fetchDatasets, onDatasetUploaded]
  );

  const generateSamples = useCallback(async () => {
    setGeneratingSamples(true);
    try {
      const res = await fetch(`${apiUrl}/generate-samples`, { method: "POST" });
      if (res.ok) onDatasetUploaded();
    } catch (e) {
      setError("Failed to generate samples");
    } finally {
      setGeneratingSamples(false);
    }
  }, [apiUrl, onDatasetUploaded]);

  return (
    <aside
      className="w-64 border-r border-border/60 bg-card/40 flex flex-col shrink-0"
      data-testid="upload-panel"
    >
      {/* Upload Zone */}
      <div className="p-3 border-b border-border/40">
        <div
          className={`relative border border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 ${
            dragOver
              ? "dropzone-active border-primary bg-primary/5"
              : "border-border/60 hover:border-muted-foreground/40"
          }`}
          data-testid="upload-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            data-testid="file-input"
            onChange={(e) => handleUpload(e.target.files[0])}
          />
          <UploadCloud className="h-6 w-6 mx-auto mb-2 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-xs text-muted-foreground">
            Drop .xlsx file or <span className="text-primary">browse</span>
          </p>
        </div>

        {uploading && (
          <div className="mt-2" data-testid="upload-progress">
            <Progress value={uploadProgress} className="h-1" />
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              Processing...
            </p>
          </div>
        )}

        {error && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive" data-testid="upload-error">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Dataset List */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Datasets ({datasets.length})
          </span>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 pb-2">
            {datasets.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8 px-2">
                No datasets uploaded yet
              </p>
            )}
            {datasets.map((ds) => {
              const Icon = TYPE_ICONS[ds.dataset_type] || FileText;
              const isSelected = selectedDataset?.id === ds.id;
              return (
                <button
                  key={ds.id}
                  className={`w-full text-left rounded-md px-2.5 py-2 transition-all duration-150 group flex items-start gap-2 ${
                    isSelected
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-secondary/60 border border-transparent"
                  }`}
                  data-testid={`dataset-item-${ds.id}`}
                  onClick={() => onSelectDataset(isSelected ? null : ds)}
                >
                  <Icon
                    className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${TYPE_COLORS[ds.dataset_type] || "text-muted-foreground"}`}
                    strokeWidth={1.5}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-foreground">
                      {ds.filename}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1 py-0 h-4"
                      >
                        {ds.dataset_type}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {ds.record_count} rows
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                          data-testid={`delete-dataset-${ds.id}`}
                          onClick={(e) => handleDelete(e, ds.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Delete dataset</TooltipContent>
                    </Tooltip>
                    {isSelected && (
                      <ChevronRight className="h-3 w-3 text-primary" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Generate Samples */}
      <div className="p-3 border-t border-border/40">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs gap-1.5"
          data-testid="generate-samples-btn"
          onClick={generateSamples}
          disabled={generatingSamples}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {generatingSamples ? "Generating..." : "Load Sample Data"}
        </Button>
      </div>
    </aside>
  );
}
