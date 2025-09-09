import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "../config/api";

type MetricPoint = {
  step?: number;
  epoch?: number;
  ts?: number;
  loss?: number;
  avr_loss?: number;
  lr?: number;
  grad_norm?: number | null;
};

interface Props {
  outputName: string;
  onSourceChange?: (source: "tensorboard" | "csv" | "none") => void;
}

type ChartOptions = {
  smooth: number;
  windowSize: number;
  lockLossRange: boolean;
  showDebug: boolean;
};

const defaultOptions: ChartOptions = {
  smooth: 50,
  windowSize: 512,
  lockLossRange: false,
  showDebug: false,
};

export default function MetricsChartEnhanced({ outputName, onSourceChange }: Props) {
  const [data, setData] = useState<MetricPoint[]>([]);
  const [source, setSource] = useState<"tensorboard" | "csv" | "none">("none");
  const [sourceMode, setSourceMode] = useState<"auto" | "tb" | "csv">("auto");
  const [options, setOptions] = useState<ChartOptions>(defaultOptions);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  
  // Fetch initial data
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const url = apiUrl(
          `/api/metrics/recent?name=${encodeURIComponent(outputName)}&limit=512${
            sourceMode === "tb" ? "&source=tb" : sourceMode === "csv" ? "&source=csv" : ""
          }`
        );
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        const newSource = result.source as "tensorboard" | "csv" | "none";
        
        setSource(newSource);
        onSourceChange?.(newSource);
        
        if (Array.isArray(result.items)) {
          setData(result.items);
        }
        
        setError(null);
      } catch (err) {
        console.error("Failed to fetch initial metrics:", err);
        setError("Failed to load metrics");
      }
    };
    
    fetchInitial();
  }, [outputName, sourceMode, onSourceChange]);
  
  // Setup SSE streaming
  useEffect(() => {
    const cleanup = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
    
    const connect = () => {
      cleanup();
      
      const url = apiUrl(
        `/api/metrics/stream?name=${encodeURIComponent(outputName)}${
          sourceMode === "tb" ? "&source=tb" : sourceMode === "csv" ? "&source=csv" : ""
        }`
      );
      
      const es = new EventSource(url);
      esRef.current = es;
      
      es.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };
      
      es.onmessage = (event) => {
        try {
          const point = JSON.parse(event.data);
          
          // Skip heartbeat messages
          if (point.heartbeat) return;
          
          // Handle error messages
          if (point.error) {
            setError(point.error);
            return;
          }
          
          // Handle TB unavailable
          if (point.tb_unavailable && sourceMode === "auto") {
            setSourceMode("csv");
            return;
          }
          
          // Add valid data point
          if (typeof point.loss === "number" || typeof point.avr_loss === "number") {
            setData(prev => {
              const next = [...prev, point];
              // Keep buffer size reasonable
              return next.length > 2048 ? next.slice(-1536) : next;
            });
          }
        } catch (err) {
          console.error("Failed to parse SSE message:", err);
        }
      };
      
      es.onerror = () => {
        setIsConnected(false);
        cleanup();
        
        // Exponential backoff reconnection
        const attempt = ++reconnectAttempts.current;
        const delay = Math.min(30000, 1000 * Math.pow(2, attempt - 1));
        
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };
    
    connect();
    
    return cleanup;
  }, [outputName, sourceMode]);
  
  // Process data for visualization
  const processedData = useMemo(() => {
    const points: Array<{ x: number; loss: number; lr?: number }> = [];
    let xCounter = 0;
    
    for (const d of data) {
      const loss = d.loss ?? d.avr_loss;
      if (typeof loss !== "number" || !isFinite(loss)) continue;
      
      // Determine x-axis value (prefer step, then epoch, then timestamp, then index)
      let x: number;
      if (typeof d.step === "number") {
        x = d.step;
      } else if (typeof d.epoch === "number") {
        x = d.epoch * 1000; // Scale epochs for visibility
      } else if (typeof d.ts === "number") {
        x = d.ts;
      } else {
        x = xCounter++;
      }
      
      points.push({
        x,
        loss,
        lr: typeof d.lr === "number" ? d.lr : undefined,
      });
    }
    
    // Apply window size
    const windowed = options.windowSize > 0 
      ? points.slice(-options.windowSize)
      : points;
    
    // Apply smoothing to loss values
    const smoothed = options.smooth > 1 
      ? applySmoothing(windowed, options.smooth)
      : windowed;
    
    return smoothed;
  }, [data, options]);
  
  // Apply moving average smoothing
  function applySmoothing(
    points: Array<{ x: number; loss: number; lr?: number }>,
    windowSize: number
  ): Array<{ x: number; loss: number; smoothedLoss: number; lr?: number }> {
    const result = [];
    const window: number[] = [];
    
    for (const point of points) {
      window.push(point.loss);
      if (window.length > windowSize) {
        window.shift();
      }
      
      const smoothedLoss = window.reduce((a, b) => a + b, 0) / window.length;
      
      result.push({
        ...point,
        smoothedLoss,
      });
    }
    
    return result;
  }
  
  // Calculate axis ranges
  const { xRange, lossRange, lrRange } = useMemo(() => {
    if (processedData.length === 0) {
      return {
        xRange: [0, 1],
        lossRange: [0, 1],
        lrRange: [0, 1],
      };
    }
    
    const xValues = processedData.map(p => p.x);
    const lossValues = processedData.map(p => p.smoothedLoss ?? p.loss);
    const lrValues = processedData.filter(p => p.lr !== undefined).map(p => p.lr!);
    
    const xRange = [Math.min(...xValues), Math.max(...xValues)];
    
    const lossRange = options.lockLossRange 
      ? [0, 1]
      : [
          Math.min(...lossValues) * 0.95,
          Math.max(...lossValues) * 1.05,
        ];
    
    const lrRange = lrValues.length > 0
      ? [
          Math.min(...lrValues) * 0.95,
          Math.max(...lrValues) * 1.05,
        ]
      : [0, 1];
    
    return { xRange, lossRange, lrRange };
  }, [processedData, options.lockLossRange]);
  
  // Chart dimensions
  const width = 800;
  const height = 200;
  const padding = 40;
  
  // Scale functions
  const scaleX = (x: number) => {
    const [min, max] = xRange;
    return padding + ((x - min) / (max - min || 1)) * (width - 2 * padding);
  };
  
  const scaleLoss = (y: number) => {
    const [min, max] = lossRange;
    return height - padding - ((y - min) / (max - min || 1)) * (height - 2 * padding);
  };
  
  const scaleLR = (y: number) => {
    const [min, max] = lrRange;
    return height - padding - ((y - min) / (max - min || 1)) * (height - 2 * padding);
  };
  
  // Generate SVG path
  const generatePath = (
    points: Array<{ x: number; y: number }>,
    scaleY: (y: number) => number
  ): string => {
    if (points.length === 0) return "";
    
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.x)} ${scaleY(p.y)}`)
      .join(" ");
  };
  
  const lossPath = generatePath(
    processedData.map(p => ({ x: p.x, y: p.loss })),
    scaleLoss
  );
  
  const smoothedPath = generatePath(
    processedData.map(p => ({ x: p.x, y: p.smoothedLoss ?? p.loss })),
    scaleLoss
  );
  
  const lrPath = generatePath(
    processedData.filter(p => p.lr !== undefined).map(p => ({ x: p.x, y: p.lr! })),
    scaleLR
  );
  
  // Export functions
  const exportCSV = () => {
    const headers = ["step", "loss", "lr"];
    const rows = processedData.map(p => [p.x, p.loss, p.lr ?? ""]);
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${outputName}_metrics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="w-full">
      {/* Controls */}
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Source:</span>
            <select
              value={sourceMode}
              onChange={(e) => setSourceMode(e.target.value as any)}
              className="bg-black/40 border border-zinc-800 rounded px-2 py-1"
            >
              <option value="auto">Auto</option>
              <option value="tb">TensorBoard</option>
              <option value="csv">CSV</option>
            </select>
            {source !== "none" && (
              <span className={`px-2 py-1 rounded border ${
                source === "tensorboard" 
                  ? "border-purple-500 text-purple-300" 
                  : "border-zinc-600 text-zinc-300"
              }`}>
                {source === "tensorboard" ? "TB" : "CSV"}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-zinc-400">Smooth:</label>
            <input
              type="number"
              value={options.smooth}
              onChange={(e) => setOptions(prev => ({ 
                ...prev, 
                smooth: Math.max(1, parseInt(e.target.value) || 1) 
              }))}
              className="w-16 bg-black/40 border border-zinc-800 rounded px-2 py-1"
              min={1}
              max={100}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-zinc-400">Window:</label>
            <input
              type="number"
              value={options.windowSize}
              onChange={(e) => setOptions(prev => ({ 
                ...prev, 
                windowSize: Math.max(0, parseInt(e.target.value) || 0) 
              }))}
              className="w-20 bg-black/40 border border-zinc-800 rounded px-2 py-1"
              min={0}
              step={100}
            />
          </div>
          
          <label className="flex items-center gap-2 text-zinc-400">
            <input
              type="checkbox"
              checked={options.lockLossRange}
              onChange={(e) => setOptions(prev => ({ 
                ...prev, 
                lockLossRange: e.target.checked 
              }))}
            />
            Lock Loss [0,1]
          </label>
        </div>
        
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="flex items-center gap-1 text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
          
          <button
            onClick={exportCSV}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded"
          >
            Export CSV
          </button>
        </div>
      </div>
      
      {/* Error display */}
      {error && (
        <div className="mb-2 p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-400">
          {error}
        </div>
      )}
      
      {/* Chart */}
      {processedData.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center border border-zinc-800 rounded bg-black/40">
          <span className="text-zinc-500">Waiting for metrics...</span>
        </div>
      ) : (
        <svg width={width} height={height} className="border border-zinc-800 rounded bg-black/40">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = padding + pct * (height - 2 * padding);
            return (
              <line
                key={`h-${pct}`}
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="#27272a"
                strokeDasharray="2 4"
              />
            );
          })}
          
          {/* Raw loss line */}
          <path
            d={lossPath}
            fill="none"
            stroke="#22c55e"
            strokeWidth={1}
            opacity={0.3}
          />
          
          {/* Smoothed loss line */}
          <path
            d={smoothedPath}
            fill="none"
            stroke="#16a34a"
            strokeWidth={2}
          />
          
          {/* Learning rate line */}
          {lrPath && (
            <path
              d={lrPath}
              fill="none"
              stroke="#a855f7"
              strokeWidth={1.5}
              opacity={0.8}
            />
          )}
          
          {/* Axes */}
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="#52525b"
          />
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="#52525b"
          />
          
          {/* Labels */}
          <text x={padding} y={padding - 5} fill="#a1a1aa" fontSize={11}>
            Loss: [{lossRange[0].toFixed(4)}, {lossRange[1].toFixed(4)}]
          </text>
          
          <text x={width - padding} y={padding - 5} fill="#a1a1aa" fontSize={11} textAnchor="end">
            LR: [{lrRange[0].toExponential(1)}, {lrRange[1].toExponential(1)}]
          </text>
          
          <text x={width / 2} y={height - 5} fill="#a1a1aa" fontSize={11} textAnchor="middle">
            Steps: {Math.floor(xRange[0])} - {Math.floor(xRange[1])}
          </text>
        </svg>
      )}
      
      {/* Debug info */}
      {options.showDebug && (
        <div className="mt-2 p-2 bg-black/60 border border-zinc-800 rounded text-xs font-mono">
          <div>Points: {processedData.length}</div>
          <div>Source: {source}</div>
          <div>Connected: {isConnected ? "Yes" : "No"}</div>
          <div>Reconnect attempts: {reconnectAttempts.current}</div>
        </div>
      )}
      
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-green-600" />
          Loss
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-green-700" />
          Loss (smoothed)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-purple-500" />
          Learning Rate
        </span>
      </div>
    </div>
  );
}