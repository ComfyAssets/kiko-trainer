import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "../config/api";

type Point = {
  ts?: number;
  step?: number;
  epoch?: number;
  loss?: number;
  avr_loss?: number;
  lr?: number;
  grad_norm?: number | null;
};

type Props = {
  outputName: string;
  onSourceChange?: (src: "tensorboard" | "csv" | "none") => void;
};

type XKind = "step" | "epoch" | "ts" | "idx";

type DebugCounters = {
  totalIncoming: number;
  kept: number;
  droppedNoY: number;
  droppedNoXAndNoSynthetic: number;
  zeroXCount: number;
  zeroYCount: number;
  nanXCount: number;
  nanYCount: number;
  dupXCount: number;
  negativeXCount: number;
  xKinds: Record<XKind, number>;
};

// function download(filename: string, text: string) { // unused
//   const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement("a");
//   a.href = url;
//   a.download = filename;
//   document.body.appendChild(a);
//   a.click();
//   document.body.removeChild(a);
//   URL.revokeObjectURL(url);
// }

// function toCSV(rows: Record<string, any>[]) { // unused
//   if (!rows.length) return "";
//   const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
//   const header = keys.join(",");
//   const lines = rows.map((r) =>
//     keys.map((k) => JSON.stringify(r[k] ?? "")).join(","),
//   );
//   return [header, ...lines].join("\n");
// }

export default function MetricsChart({ outputName, onSourceChange }: Props) {
  const [data, setData] = useState<Point[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const [smooth, setSmooth] = useState<number>(50);
  const [windowSize, setWindowSize] = useState<number>(512);
  const [useZoom, setUseZoom] = useState<boolean>(false);
  const [zoomSpanPct] = useState<number>(100); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [zoomStartPct] = useState<number>(0); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [srcMode, setSrcMode] = useState<"auto" | "tb" | "csv">("auto");
  const [srcActive, setSrcActive] = useState<"tensorboard" | "csv" | "none">(
    "none",
  );
  const [lockLoss01, setLockLoss01] = useState<boolean>(false); // optional fixed 0–1 scale

  const lrMapRef = useRef<Record<number, number>>({});
  const lastLrRef = useRef<number | undefined>(undefined);
  const lastHeartbeatRef = useRef<number>(Date.now());

  // backoff for SSE
  const backoffRef = useRef<{ attempt: number }>({ attempt: 0 });
  const resetBackoff = () => {
    backoffRef.current.attempt = 0;
  };
  const scheduleReconnect = (why: string) => {
    const attempt = ++backoffRef.current.attempt;
    const base = Math.min(20000, 500 * Math.pow(2, attempt - 1));
    const jitter = Math.random() * 250;
    const delay = base + jitter;
    if (reconnectTimerRef.current)
      window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = window.setTimeout(
      () => setSseBuster((v) => v + 1),
      delay,
    ) as unknown as number;
    console.debug(
      `[SSE] reconnect in ${Math.round(delay)}ms (attempt ${attempt}) – ${why}`,
    );
  };

  // forces EventSource rebuild
  const [sseBuster, setSseBuster] = useState(0);

  const recentUrl = apiUrl(
    `/api/metrics/recent?name=${encodeURIComponent(outputName)}&limit=512${srcMode === "tb" ? "&source=tb" : srcMode === "csv" ? "&source=csv" : ""}`,
  );
  const sseUrl = apiUrl(
    `/api/metrics/stream?name=${encodeURIComponent(outputName)}${srcMode === "tb" ? "&source=tb" : srcMode === "csv" ? "&source=csv" : ""}&_=${sseBuster}`,
  );

  // -------- Initial recent pull (with debug) --------
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        console.debug("[fetch recent] GET", recentUrl);
        const r = await fetch(recentUrl, { signal: ac.signal });
        const j = await r.json();
        const src = (j?.source as string) || "none";
        const norm =
          src === "tensorboard"
            ? "tensorboard"
            : src === "csv"
              ? "csv"
              : "none";
        if (!cancelled) {
          setSrcActive(norm);
          onSourceChange && onSourceChange(norm);
        }
        let items: Point[] = Array.isArray(j?.items) ? j.items : [];
        console.debug("[fetch recent] source=", norm, "items=", items.length);

        if (norm === "tensorboard") {
          try {
            const csvUrl = apiUrl(
              `/api/metrics/recent?name=${encodeURIComponent(outputName)}&limit=1024&source=csv`,
            );
            console.debug("[fetch recent CSV for LR join] GET", csvUrl);
            const rc = await fetch(csvUrl, { signal: ac.signal });
            const jc = await rc.json();
            if (Array.isArray(jc?.items)) {
              const map: Record<number, number> = {};
              for (const p of jc.items as any[]) {
                if (typeof p.step === "number" && typeof p.lr === "number")
                  map[p.step] = p.lr;
              }
              lrMapRef.current = map;
              items = items.map((p: any) => ({
                ...p,
                lr: typeof p.lr === "number" ? p.lr : map[p.step],
              }));
              console.debug("[LR join] csv steps=", Object.keys(map).length);
            }
          } catch (e) {
            console.debug("[LR join] error", e);
          }
        }

        if (!cancelled && items.length > 0) {
          setData(items);
          console.debug("[fetch recent] setData items=", items.length);
        }

        if (
          (!Array.isArray(j?.items) || j.items.length === 0) &&
          srcMode === "auto" &&
          norm === "tensorboard"
        ) {
          if (!cancelled) {
            console.debug(
              "[fetch recent] TB empty; auto-switching srcMode -> csv",
            );
            setSrcMode("csv");
          }
        }
      } catch (e) {
        console.debug("[fetch recent] error", e);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [recentUrl, outputName, onSourceChange, srcMode]);

  // -------- SSE with reconnect + heartbeat (with debug) --------
  useEffect(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch {}
      esRef.current = null;
    }

    console.debug("[SSE] open", sseUrl);
    const es = new EventSource(sseUrl);
    esRef.current = es;
    resetBackoff();
    lastHeartbeatRef.current = Date.now();

    es.onopen = () => console.debug("[SSE] onopen");

    es.onmessage = (ev) => {
      if (!ev.data || ev.data === "ping" || ev.data === "💓") {
        lastHeartbeatRef.current = Date.now();
        return;
      }
      try {
        const obj = JSON.parse(ev.data);
        if (Math.random() < 0.02) {
          console.debug("[SSE] sample message:", obj);
        }

        if (obj && obj.tb_unavailable === true) {
          if (srcMode !== "csv") {
            console.debug("[SSE] tb_unavailable -> switching to csv");
            setSrcMode("csv");
            setSrcActive("csv");
          }
          return;
        }
        // LR forward fill/join for stream
        if (obj && (typeof obj.lr !== "number" || isNaN(obj.lr))) {
          if (
            typeof obj.step === "number" &&
            typeof lrMapRef.current[obj.step] === "number"
          ) {
            obj.lr = lrMapRef.current[obj.step];
          } else if (typeof lastLrRef.current === "number") {
            obj.lr = lastLrRef.current;
          }
        }
        if (typeof obj.lr === "number") lastLrRef.current = obj.lr;

        const hasAnyX =
          typeof obj.step === "number" ||
          typeof obj.epoch === "number" ||
          typeof obj.ts === "number";
        const hasAnyY =
          typeof obj.loss === "number" || typeof obj.avr_loss === "number";
        if (!hasAnyX && !hasAnyY) {
          // console.debug("[SSE] drop: no x and no y", obj);
          return;
        }

        setData((prev) => {
          const next = [...prev, obj];
          if (next.length > 4096)
            console.debug("[data] trimming buffer", next.length, "->", 2048);
          return next.slice(Math.max(0, next.length - 2048));
        });
        lastHeartbeatRef.current = Date.now();
      } catch (e) {
        console.debug("[SSE] parse error", e);
      }
    };

    es.onerror = () => {
      console.debug("[SSE] onerror");
      try {
        es.close();
      } catch {}
      esRef.current = null;
      scheduleReconnect("error event");
    };

    const hb = window.setInterval(() => {
      const delta = Date.now() - lastHeartbeatRef.current;
      if (delta > 20000) {
        console.debug("[SSE] heartbeat timeout; rebuilding");
        try {
          es.close();
        } catch {}
        esRef.current = null;
        window.clearInterval(hb);
        scheduleReconnect("heartbeat timeout");
      }
    }, 5000);

    const onVis = () => {
      if (document.visibilityState === "visible") setSseBuster((v) => v + 1);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(hb);
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      try {
        es.close();
      } catch {}
      esRef.current = null;
    };
  }, [sseUrl, srcMode]);

  // -------- Stable X + Debug accounting --------
  const analyzed = useMemo(() => {
    const counters: DebugCounters = {
      totalIncoming: data.length,
      kept: 0,
      droppedNoY: 0,
      droppedNoXAndNoSynthetic: 0,
      zeroXCount: 0,
      zeroYCount: 0,
      nanXCount: 0,
      nanYCount: 0,
      dupXCount: 0,
      negativeXCount: 0,
      xKinds: { step: 0, epoch: 0, ts: 0, idx: 0 },
    };
    let lastLr: number | undefined;
    let xCounter = 0;
    let lastXVal: number | undefined = undefined;
    const out: Array<Point & { x: number; xKind: XKind }> = [];
    for (const d of data) {
      const y =
        typeof d.loss === "number"
          ? d.loss
          : typeof d.avr_loss === "number"
            ? d.avr_loss
            : undefined;
      if (typeof y !== "number" || Number.isNaN(y)) {
        counters.droppedNoY++;
        continue;
      }
      if (y === 0) counters.zeroYCount++;
      if (Number.isNaN(y)) counters.nanYCount++;

      let x: number | undefined, xKind: XKind;
      if (typeof d.step === "number") {
        x = d.step;
        xKind = "step";
      } else if (typeof d.epoch === "number") {
        x = d.epoch;
        xKind = "epoch";
      } else if (typeof d.ts === "number") {
        x = d.ts;
        xKind = "ts";
      } else {
        x = ++xCounter;
        xKind = "idx";
      }

      if (x === 0) counters.zeroXCount++;
      if (typeof x !== "number" || Number.isNaN(x)) {
        counters.nanXCount++;
        continue;
      }
      if (x < 0) counters.negativeXCount++;
      if (lastXVal !== undefined && x === lastXVal) {
        counters.dupXCount++;
        x = x + 1e-9;
      }
      lastXVal = x;
      counters.xKinds[xKind]++;

      if (typeof d.lr === "number") lastLr = d.lr;
      const merged: Point & { x: number; xKind: XKind } = {
        ...d,
        lr: typeof d.lr === "number" ? d.lr : lastLr,
        x,
        xKind,
      };
      out.push(merged);
      counters.kept++;
    }
    const minX = out.length ? out[0].x : 0;
    const maxX = out.length ? out[out.length - 1].x : 1;
    const yVals = out.map((p) => (p.loss ?? p.avr_loss) as number);
    const minY = yVals.length ? Math.min(...yVals) : 0;
    const maxY = yVals.length ? Math.max(...yVals) : 1;
    return { series: out, counters, minX, maxX, minY, maxY };
  }, [data]);

  const xKindLabel = useMemo(() => {
    const c = analyzed.counters.xKinds;
    const entries = Object.entries(c).sort((a, b) => b[1] - a[1]);
    return (entries[0]?.[0] ?? "step").toUpperCase();
  }, [analyzed.counters.xKinds]);

  // visible slice
  const displayed = useMemo(() => {
    const src = analyzed.series;
    if (useZoom && src.length > 0) {
      const n = src.length;
      const span = Math.max(5, Math.min(100, zoomSpanPct));
      const start = Math.max(0, Math.min(100 - span, zoomStartPct));
      const i0 = Math.floor((start / 100) * n);
      const i1 = Math.min(n, i0 + Math.max(10, Math.floor((span / 100) * n)));
      return src.slice(i0, i1);
    }
    return windowSize > 0 ? src.slice(-windowSize) : src;
  }, [analyzed.series, useZoom, zoomSpanPct, zoomStartPct, windowSize]);

  const pointsLoss = useMemo(
    () =>
      displayed.map((d) => ({ x: d.x, y: (d.loss ?? d.avr_loss) as number })),
    [displayed],
  );
  const pointsLr = useMemo(
    () =>
      displayed.map((d) => ({
        x: d.x,
        y: (typeof d.lr === "number" ? d.lr : 0) as number,
      })),
    [displayed],
  );

  // clamp smoothing to avoid flattening tiny windows
  const effSmooth = useMemo(() => {
    if (!smooth || smooth <= 1) return 0;
    return Math.min(smooth, Math.max(1, Math.floor(pointsLoss.length / 2)));
  }, [smooth, pointsLoss.length]);

  const pointsLossSmoothed = useMemo(() => {
    if (!effSmooth) return pointsLoss;
    const out: { x: number; y: number }[] = [];
    let acc = 0;
    const q: number[] = [];
    for (let i = 0; i < pointsLoss.length; i++) {
      const v = Number(pointsLoss[i].y) || 0;
      q.push(v);
      acc += v;
      if (q.length > effSmooth) acc -= q.shift() as number;
      out.push({ x: pointsLoss[i].x, y: acc / q.length });
    }
    return out;
  }, [pointsLoss, effSmooth]);

  // chart dims
  const width = 800;
  const height = 200;
  const padding = 32;

  // -------- Proper axis scaling (NO forced [0,1]) --------
  const axisFrom = (vals: number[], padPct = 0.05) => {
    if (!vals.length) return { min: 0, max: 1 };
    let min = Math.min(...vals.filter((v) => Number.isFinite(v)));
    let max = Math.max(...vals.filter((v) => Number.isFinite(v)));
    if (!Number.isFinite(min) || !Number.isFinite(max))
      return { min: 0, max: 1 };
    if (min === max) {
      const bump = Math.max(Math.abs(min || 1) * 0.05, 1e-6);
      return { min: min - bump, max: max + bump };
    }
    const range = max - min;
    return { min: min - range * padPct, max: max + range * padPct };
  };

  const [minX, maxX] = pointsLoss.length
    ? [pointsLoss[0].x, pointsLoss[pointsLoss.length - 1].x]
    : [0, 1];

  // Loss axis: either autoscale or lock to 0–1 if requested
  const lossBasis = effSmooth ? pointsLossSmoothed : pointsLoss;
  const lossVals = lossBasis.map((p) => p.y);
  const lossAxis = lockLoss01 ? { min: 0, max: 1 } : axisFrom(lossVals, 0.05);

  // LR axis: autoscale with padding; if constant, add tiny bump so it renders visibly
  const lrValsOnly = pointsLr.map((p) => p.y);
  const lrAxis = axisFrom(lrValsOnly, 0.05);

  const sx = (x: number) =>
    padding +
    (maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * (width - padding * 2));
  const syL = (y: number) =>
    height -
    padding -
    ((y - lossAxis.min) / (lossAxis.max - lossAxis.min || 1)) *
      (height - padding * 2);
  const syR = (y: number) =>
    height -
    padding -
    ((y - lrAxis.min) / (lrAxis.max - lrAxis.min || 1)) *
      (height - padding * 2);

  const pathFrom = (
    pts: { x: number; y: number }[],
    sy: (y: number) => number,
  ) => {
    if (pts.length === 0) return "";
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`)
      .join(" ");
  };


  return (
    <div className="w-full overflow-auto">
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
        <div className="flex items-center gap-3">
          <span>
            <span
              className="inline-block w-3 h-1.5 align-middle mr-1"
              style={{ background: "#22c55e" }}
            />
            Loss
          </span>
          <span>
            <span
              className="inline-block w-3 h-1.5 align-middle mr-1"
              style={{ background: "#16a34a" }}
            />
            Loss (smoothed)
          </span>
          <span>
            <span
              className="inline-block w-3 h-1.5 align-middle mr-1"
              style={{ background: "#a855f7" }}
            />
            LR
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label title="Metrics source">Source</label>
          <select
            value={srcMode}
            onChange={(e) => setSrcMode(e.target.value as any)}
            className="bg-black/40 border border-zinc-800 rounded px-2 py-0.5 text-zinc-200"
          >
            <option value="auto">Auto</option>
            <option value="tb">TensorBoard</option>
            <option value="csv">CSV</option>
          </select>
          {srcActive !== "none" && (
            <span
              className={`ml-1 px-2 py-0.5 rounded border ${srcActive === "tensorboard" ? "border-purple-500 text-purple-300" : "border-zinc-700 text-zinc-300"}`}
            >
              {srcActive === "tensorboard" ? "TB" : "CSV"}
            </span>
          )}
          <div className="flex items-center gap-2">
            <label title="Moving average window (steps). 0 = off">Smooth</label>
            <input
              type="number"
              value={smooth}
              onChange={(e) =>
                setSmooth(Math.max(0, Number(e.target.value) || 0))
              }
              min={0}
              step={10}
              className="w-16 bg-black/40 border border-zinc-800 rounded px-2 py-0.5 text-zinc-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <label title="How many most recent points to show">Window</label>
            <input
              type="number"
              value={windowSize}
              onChange={(e) =>
                setWindowSize(Math.max(0, Number(e.target.value) || 0))
              }
              min={0}
              step={64}
              className="w-20 bg-black/40 border border-zinc-800 rounded px-2 py-0.5 text-zinc-200"
            />
          </div>
          <div className="flex items-center gap-3">
            <label title="Enable zoom/brush over full history">Zoom</label>
            <input
              type="checkbox"
              checked={useZoom}
              onChange={(e) => setUseZoom(e.target.checked)}
            />
            <label title="Lock loss axis to 0–1 for comparability">
              Lock Loss 0–1
            </label>
            <input
              type="checkbox"
              checked={lockLoss01}
              onChange={(e) => setLockLoss01(e.target.checked)}
            />
          </div>

        </div>
      </div>


      {displayed.length === 0 && (
        <div className="w-full h-32 flex items-center justify-center text-xs text-zinc-400 border border-zinc-800 rounded bg-black/40 mb-2">
          Waiting for metrics…
        </div>
      )}

      <svg width={width} height={height} className="block">
        <rect x={0} y={0} width={width} height={height} fill="#0a0a0a" />
        {/* Grid lines */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = padding + (i * (height - padding * 2)) / 4;
          return (
            <line
              key={`h${i}`}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="#2a2a2a"
              strokeDasharray="2 4"
            />
          );
        })}
        {Array.from({ length: 6 }).map((_, i) => {
          const x = padding + (i * (width - padding * 2)) / 5;
          return (
            <line
              key={`v${i}`}
              x1={x}
              y1={padding}
              x2={x}
              y2={height - padding}
              stroke="#2a2a2a"
              strokeDasharray="2 4"
            />
          );
        })}
        {/* Axes */}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#3a3a3a"
        />
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="#3a3a3a"
        />
        {/* Loss */}
        <path
          d={pathFrom(lossBasis, syL)}
          stroke="#22c55e"
          fill="none"
          strokeWidth={1}
          opacity={0.5}
        />
        {/* Smoothed loss */}
        <path
          d={pathFrom(pointsLossSmoothed, syL)}
          stroke="#16a34a"
          fill="none"
          strokeWidth={1.8}
        />
        {/* LR */}
        <path
          d={pathFrom(pointsLr, syR)}
          stroke="#a855f7"
          fill="none"
          strokeWidth={1.2}
          opacity={0.9}
        />
        {/* Labels */}
        <text
          x={width / 2}
          y={height - 8}
          fill="#999"
          fontSize={11}
          textAnchor="middle"
        >
          {xKindLabel}
        </text>
        <text x={padding} y={12} fill="#999" fontSize={11}>
          Loss
        </text>
        <text
          x={width - padding}
          y={12}
          fill="#999"
          fontSize={11}
          textAnchor="end"
        >
          LR
        </text>
      </svg>

    </div>
  );
}
