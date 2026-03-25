import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  BarChart3,
  Users,
  Moon,
  AlertTriangle,
  Network,
  Clock,
  MapPin,
  Loader2,
  FileText,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/60 p-3 flex items-start gap-3">
      <div className={`p-1.5 rounded-md bg-secondary/80 ${color}`}>
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold font-mono text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SuspiciousCard({ suspect, index }) {
  const severityColors = {
    HIGH: "bg-red-500/10 text-red-400 border-red-500/20",
    MEDIUM: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    LOW: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return (
    <div
      className={`rounded-lg border p-3 animate-fade-in ${suspect.severity === "HIGH" ? "pulse-alert" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
      data-testid={`suspect-card-${index}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-xs font-medium text-foreground truncate max-w-[200px]">
          {suspect.entity}
        </span>
        <Badge className={`text-[9px] px-1.5 py-0 ${severityColors[suspect.severity] || ""}`}>
          {suspect.severity}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{suspect.reason}</p>
    </div>
  );
}

export default function AnalysisPanel({ analysisData, selectedDataset, loading, apiUrl }) {
  const [preview, setPreview] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (selectedDataset?.id) {
      fetch(`${apiUrl}/datasets/${selectedDataset.id}`)
        .then((r) => r.json())
        .then((data) => setPreview(data))
        .catch(() => setPreview(null));
    } else {
      setPreview(null);
    }
  }, [selectedDataset, apiUrl]);

  const analysis = analysisData?.analysis || {};
  const suspicious = analysisData?.suspicious || [];
  const totalRecords = analysisData?.total_records || analysisData?.record_count || 0;

  const topPairsChart = useMemo(() => {
    return (analysis.top_pairs || []).slice(0, 6).map((p, i) => ({
      name: `${p.pair[0].slice(-4)}-${p.pair[1].slice(-4)}`,
      count: p.count,
      full: `${p.pair[0]} <-> ${p.pair[1]}`,
    }));
  }, [analysis.top_pairs]);

  const timelineData = useMemo(() => {
    return (analysis.timeline || []).map((t) => ({
      hour: `${String(t.hour).padStart(2, "0")}:00`,
      count: t.count,
    }));
  }, [analysis.timeline]);

  const entityPieData = useMemo(() => {
    return (analysis.top_entities || []).slice(0, 6).map((e) => ({
      name: e.entity.length > 10 ? `...${e.entity.slice(-8)}` : e.entity,
      value: e.count,
      full: e.entity,
    }));
  }, [analysis.top_entities]);

  // Empty state
  if (!analysisData && !loading) {
    return (
      <main className="flex-1 flex items-center justify-center forensic-grid" data-testid="analysis-panel-empty">
        <div className="text-center space-y-3 max-w-xs">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/40" strokeWidth={1} />
          <p className="text-sm text-muted-foreground">
            Upload a telecom dataset or load sample data to begin analysis
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden forensic-grid" data-testid="analysis-panel">
      {/* Tab Bar */}
      <div className="border-b border-border/40 px-4 pt-2">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8 bg-secondary/50">
            <TabsTrigger value="overview" className="text-xs h-6 px-3" data-testid="tab-overview">
              <BarChart3 className="h-3 w-3 mr-1.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="suspicious" className="text-xs h-6 px-3" data-testid="tab-suspicious">
              <AlertTriangle className="h-3 w-3 mr-1.5" /> Suspicious
              {suspicious.length > 0 && (
                <span className="ml-1.5 bg-red-500/20 text-red-400 text-[9px] px-1 rounded">
                  {suspicious.length}
                </span>
              )}
            </TabsTrigger>
            {preview && (
              <TabsTrigger value="preview" className="text-xs h-6 px-3" data-testid="tab-preview">
                <FileText className="h-3 w-3 mr-1.5" /> Data Preview
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center" data-testid="analysis-loading">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!loading && (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="stats-grid">
                  <StatCard
                    icon={FileText}
                    label="Total Records"
                    value={totalRecords.toLocaleString()}
                    sub={analysisData?.dataset_type || ""}
                    color="text-primary"
                  />
                  <StatCard
                    icon={Users}
                    label="Active Entities"
                    value={(analysis.top_entities || []).length}
                    sub="Tracked"
                    color="text-emerald-400"
                  />
                  <StatCard
                    icon={Moon}
                    label="Night Activity"
                    value={`${analysis.night_activity?.percentage || 0}%`}
                    sub={`${analysis.night_activity?.count || 0} records`}
                    color="text-amber-400"
                  />
                  <StatCard
                    icon={AlertTriangle}
                    label="Suspects"
                    value={suspicious.length}
                    sub={suspicious.filter((s) => s.severity === "HIGH").length + " high severity"}
                    color="text-red-400"
                  />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Timeline Chart */}
                  {timelineData.length > 0 && (
                    <Card className="border-border/40 bg-card/60" data-testid="timeline-chart">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-primary" /> Activity Timeline
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={timelineData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 16%)" />
                            <XAxis
                              dataKey="hour"
                              tick={{ fontSize: 9, fill: "hsl(240 5% 65%)" }}
                              interval={2}
                              axisLine={{ stroke: "hsl(240 4% 16%)" }}
                            />
                            <YAxis
                              tick={{ fontSize: 9, fill: "hsl(240 5% 65%)" }}
                              axisLine={{ stroke: "hsl(240 4% 16%)" }}
                            />
                            <RechartsTooltip
                              contentStyle={{
                                background: "hsl(240 5% 8%)",
                                border: "1px solid hsl(240 4% 16%)",
                                borderRadius: "6px",
                                fontSize: "11px",
                                color: "hsl(0 0% 98%)",
                              }}
                            />
                            <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Top Entities Pie */}
                  {entityPieData.length > 0 && (
                    <Card className="border-border/40 bg-card/60" data-testid="entities-chart">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-emerald-400" /> Top Entities
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie
                              data={entityPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={70}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {entityPieData.map((_, idx) => (
                                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip
                              formatter={(val, name, props) => [val, props.payload.full || name]}
                              contentStyle={{
                                background: "hsl(240 5% 8%)",
                                border: "1px solid hsl(240 4% 16%)",
                                borderRadius: "6px",
                                fontSize: "11px",
                                color: "hsl(0 0% 98%)",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Top Communication Pairs */}
                {topPairsChart.length > 0 && (
                  <Card className="border-border/40 bg-card/60" data-testid="top-pairs-chart">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-xs flex items-center gap-1.5">
                        <Network className="h-3.5 w-3.5 text-primary" /> Top Communication Pairs
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={topPairsChart} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 16%)" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 9, fill: "hsl(240 5% 65%)" }}
                            axisLine={{ stroke: "hsl(240 4% 16%)" }}
                          />
                          <YAxis
                            dataKey="name"
                            type="category"
                            width={80}
                            tick={{ fontSize: 9, fill: "hsl(240 5% 65%)", fontFamily: "JetBrains Mono" }}
                            axisLine={{ stroke: "hsl(240 4% 16%)" }}
                          />
                          <RechartsTooltip
                            formatter={(val, name, props) => [val, props.payload.full]}
                            contentStyle={{
                              background: "hsl(240 5% 8%)",
                              border: "1px solid hsl(240 4% 16%)",
                              borderRadius: "6px",
                              fontSize: "11px",
                              color: "hsl(0 0% 98%)",
                            }}
                          />
                          <Bar dataKey="count" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Unique Connections Table */}
                {(analysis.unique_connections || []).length > 0 && (
                  <Card className="border-border/40 bg-card/60" data-testid="connections-table">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-xs flex items-center gap-1.5">
                        <Network className="h-3.5 w-3.5 text-cyan-400" /> Unique Connections
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Entity</TableHead>
                            <TableHead className="text-[10px] text-right">Unique Contacts</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(analysis.unique_connections || []).slice(0, 8).map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs py-1.5">{c.entity}</TableCell>
                              <TableCell className="text-right font-mono text-xs py-1.5">
                                {c.unique_contacts}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* Movement Patterns */}
                {(analysis.movement_patterns || []).length > 0 && (
                  <Card className="border-border/40 bg-card/60" data-testid="movement-card">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-xs flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-amber-400" /> Movement Patterns
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Entity</TableHead>
                            <TableHead className="text-[10px] text-right">Towers Visited</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(analysis.movement_patterns || []).map((m, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs py-1.5">{m.entity}</TableCell>
                              <TableCell className="text-right font-mono text-xs py-1.5">
                                {m.towers_visited}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Suspicious Tab */}
            {activeTab === "suspicious" && (
              <div className="space-y-3" data-testid="suspicious-list">
                {suspicious.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No suspicious activity detected</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {suspicious.length} flagged entities
                      </span>
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                        {suspicious.filter((s) => s.severity === "HIGH").length} HIGH
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-400">
                        {suspicious.filter((s) => s.severity === "MEDIUM").length} MEDIUM
                      </Badge>
                    </div>
                    {suspicious.map((s, i) => (
                      <SuspiciousCard key={i} suspect={s} index={i} />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Data Preview Tab */}
            {activeTab === "preview" && preview && (
              <Card className="border-border/40 bg-card/60" data-testid="data-preview-table">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs">{preview.filename}</CardTitle>
                    <Badge variant="secondary" className="text-[9px]">
                      {preview.dataset_type} - {preview.record_count} rows
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {(preview.columns || []).map((col) => (
                            <TableHead key={col} className="text-[10px] whitespace-nowrap font-mono">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(preview.raw_preview || []).slice(0, 30).map((row, i) => (
                          <TableRow key={i}>
                            {(preview.columns || []).map((col) => (
                              <TableCell
                                key={col}
                                className="text-[11px] font-mono whitespace-nowrap py-1.5 max-w-[150px] truncate"
                              >
                                {row[col] || "-"}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      )}
    </main>
  );
}
