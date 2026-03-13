"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LogEntry {
  id: number;
  time: string;
  strategy: string;
  key: string;
  status: "HIT" | "MISS" | "CLEAR" | "ERROR";
  latency: number | null;
  evicted: string | null;
  msg: string;
}

interface CacheStats {
  memory: { cache_size: number; keys: string[] };
  redis:  { cache_size: number; keys: string[] };
  lru:    { cache_size: number; capacity: number; keys: string[] };
}

interface Strategy {
  id: string;
  label: string;
  endpoint: string;
  color: string;
  desc: string;
  used: string;
  tradeoff: string;
  capacity: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const STRATEGIES: Strategy[] = [
  {
    id: "memory",
    label: "In-Memory",
    endpoint: "/cache/memory",
    color: "#00ff88",
    desc: "Python dict with TTL. Fastest — no network hop.",
    used: "Local app cache · Single server",
    tradeoff: "Lost on restart · Not shared across servers",
    capacity: "Unlimited (TTL based)",
  },
  {
    id: "redis",
    label: "Redis Cache",
    endpoint: "/cache/redis",
    color: "#00aaff",
    desc: "Distributed Redis GET/SET with 30s TTL.",
    used: "GitHub · Twitter · Uber · Most production APIs",
    tradeoff: "Network latency (~1-5ms) vs local dict",
    capacity: "Unlimited (TTL based)",
  },
  {
    id: "lru",
    label: "LRU Cache",
    endpoint: "/cache/lru",
    color: "#ff6b35",
    desc: "Fixed capacity (3). Evicts least recently used.",
    used: "CPU caches · Browser cache · DNS resolvers",
    tradeoff: "Fixed size — eviction can surprise you",
    capacity: "3 items max",
  },
];

const AVAILABLE_KEYS = [
  "user:1", "user:2", "user:3",
  "product:1", "product:2", "product:3",
];

const STATUS_COLOR: Record<string, string> = {
  HIT:   "#00ff88",
  MISS:  "#ff6b35",
  CLEAR: "#888",
  ERROR: "#ff4444",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function CacheBar({ label, size, capacity, color, keys }: {
  label: string; size: number; capacity: number | null;
  color: string; keys: string[];
}) {
  const max   = capacity ?? Math.max(size, 6);
  const pct   = max > 0 ? Math.min((size / max) * 100, 100) : 0;
  return (
    <div className="cache-bar-wrap">
      <div className="cache-bar-header">
        <span className="cache-bar-label" style={{ color }}>{label}</span>
        <span className="cache-bar-count">{size}{capacity ? `/${capacity}` : ""}</span>
      </div>
      <div className="cache-bar-track">
        <div className="cache-bar-fill" style={{ width: `${pct}%`, background: color, transition: "width .4s ease" }} />
      </div>
      <div className="cache-bar-keys">
        {keys.length === 0
          ? <span className="key-empty">empty</span>
          : keys.map((k, i) => (
            <span key={k} className="key-chip" style={{ borderColor: `${color}50`, color }}>
              {i === 0 && capacity ? "◀LRU " : ""}{k}
            </span>
          ))
        }
      </div>
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const sc = STATUS_COLOR[entry.status] ?? "#888";
  return (
    <div className={`log-row ${entry.status === "HIT" ? "log-hit" : entry.status === "MISS" ? "log-miss" : ""}`}>
      <span className="log-time">{entry.time}</span>
      <span className="log-strat">[{entry.strategy}]</span>
      <span className="log-status" style={{ color: sc }}>{entry.status}</span>
      <span className="log-key">{entry.key}</span>
      {entry.latency !== null && <span className="log-lat">{entry.latency}ms</span>}
      {entry.evicted && <span className="log-evict">evicted: {entry.evicted}</span>}
      <span className="log-msg">{entry.msg}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CacheDashboard() {
  const [strategy, setStrategy]     = useState<Strategy>(STRATEGIES[0]);
  const [selectedKey, setSelectedKey] = useState<string>(AVAILABLE_KEYS[0]);
  const [stats, setStats]           = useState<CacheStats | null>(null);
  const [logs, setLogs]             = useState<LogEntry[]>([]);
  const [loading, setLoading]       = useState(false);
  const [totalHits, setTotalHits]   = useState(0);
  const [totalMiss, setTotalMiss]   = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/cache/stats`);
      const data: CacheStats = await res.json();
      setStats(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    const t = setInterval(fetchStats, 2000);
    return () => clearInterval(t);
  }, [fetchStats]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (entry: Omit<LogEntry, "id" | "time">) => {
    const time = new Date().toTimeString().slice(0, 8);
    setLogs(p => [...p.slice(-59), { ...entry, id: Date.now() + Math.random(), time }]);
  };

  const fireRequest = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}${strategy.endpoint}?key=${selectedKey}`);
      const data = await res.json();

      if (res.status === 404) {
        addLog({ strategy: strategy.label, key: selectedKey, status: "ERROR", latency: null, evicted: null, msg: "Key not found" });
      } else {
        const isHit = data.status === "HIT";
        if (isHit) setTotalHits(p => p + 1);
        else       setTotalMiss(p => p + 1);

        addLog({
          strategy: strategy.label,
          key: selectedKey,
          status: data.status,
          latency: data.latency_ms,
          evicted: data.evicted_key ?? null,
          msg: isHit
            ? `Served from cache${data.ttl_remaining ? ` · TTL ${data.ttl_remaining}s` : ""}`
            : `DB fetch · stored in cache${data.evicted_key ? ` · evicted ${data.evicted_key}` : ""}`,
        });
      }
    } catch {
      addLog({ strategy: strategy.label, key: selectedKey, status: "ERROR", latency: null, evicted: null, msg: "Connection error" });
    }
    await fetchStats();
    setLoading(false);
  };

  const clearCache = async () => {
    try {
      await fetch(`${API_BASE}${strategy.endpoint}`, { method: "DELETE" });
      addLog({ strategy: strategy.label, key: "*", status: "CLEAR", latency: null, evicted: null, msg: `${strategy.label} cache cleared` });
      await fetchStats();
    } catch {}
  };

  const hitRate = totalHits + totalMiss > 0
    ? Math.round((totalHits / (totalHits + totalMiss)) * 100)
    : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Syne:wght@700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { color-scheme: dark; }
        body { background: #080810 !important; color: #e0e0e0; font-family: 'JetBrains Mono', monospace; min-height: 100vh; }

        .bg-grid {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: linear-gradient(rgba(0,170,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,170,255,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        .wrap { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 28px 24px; }

        /* ── HEADER ── */
        .hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid #1e1e3a; }
        .hdr-left {}
        .hdr-badge { font-size: 9px; letter-spacing: .2em; color: #00aaff; border: 1px solid #00aaff30; padding: 3px 10px; border-radius: 2px; display: inline-block; margin-bottom: 8px; text-transform: uppercase; }
        .hdr-title { font-family: 'Syne', sans-serif; font-size: 26px; font-weight: 800; color: white; letter-spacing: -.02em; }
        .hdr-title span { color: #00aaff; }
        .hdr-sub { font-size: 10px; color: #444; margin-top: 4px; }

        .hdr-metrics { display: flex; gap: 20px; align-items: center; }
        .metric { text-align: right; }
        .metric-val { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 700; }
        .metric-lbl { font-size: 9px; color: #444; letter-spacing: .1em; text-transform: uppercase; }
        .metric-sep { width: 1px; height: 32px; background: #1e1e3a; }

        /* ── GRID ── */
        .main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
        @media (max-width: 768px) { .main-grid { grid-template-columns: 1fr; } .hdr { flex-direction: column; gap: 16px; } }

        /* ── CARD ── */
        .card { background: #0d0d1a; border: 1px solid #1e1e3a; border-radius: 8px; padding: 18px; }
        .card-title { font-size: 9px; letter-spacing: .2em; color: #444; text-transform: uppercase; margin-bottom: 14px; }

        /* ── STRATEGY TABS ── */
        .tabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
        .tab { padding: 7px 12px; border-radius: 4px; border: 1px solid #1e1e3a; background: transparent; cursor: pointer; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #555; transition: all .2s; }
        .tab:hover { color: #888; border-color: #333; }
        .tab.active { background: #111125; }

        /* ── STRATEGY INFO ── */
        .strat-info { background: #060610; border-radius: 6px; padding: 12px; margin-bottom: 14px; border-left: 3px solid var(--sc); }
        .strat-desc { font-size: 11px; color: #ccc; margin-bottom: 6px; }
        .strat-meta { font-size: 10px; color: #444; margin-bottom: 3px; }
        .strat-meta span { color: #777; }

        /* ── KEY SELECTOR ── */
        .key-row { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
        .key-btn { padding: 5px 10px; border-radius: 3px; border: 1px solid #1e1e3a; background: transparent; cursor: pointer; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #555; transition: all .2s; }
        .key-btn:hover { color: #888; border-color: #333; }
        .key-btn.selected { border-color: var(--sc); color: var(--sc); background: #0a0a1a; }

        /* ── BUTTONS ── */
        .btn-row { display: flex; gap: 8px; }
        .btn { flex: 1; padding: 11px; border: none; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; cursor: pointer; transition: all .15s; letter-spacing: .04em; }
        .btn-fetch { background: #00aaff; color: #080810; }
        .btn-fetch:hover { background: #22bbff; transform: translateY(-1px); }
        .btn-fetch:disabled { background: #1a2a3a; color: #3a5a7a; cursor: not-allowed; transform: none; }
        .btn-clear { background: transparent; color: #ff4444; border: 1px solid #ff444430; }
        .btn-clear:hover { background: #ff444410; border-color: #ff4444; }

        /* ── CACHE BARS ── */
        .cache-bars { display: flex; flex-direction: column; gap: 20px; }
        .cache-bar-wrap {}
        .cache-bar-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .cache-bar-label { font-size: 10px; font-weight: 600; letter-spacing: .08em; }
        .cache-bar-count { font-size: 10px; color: #444; }
        .cache-bar-track { height: 4px; background: #1a1a2e; border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
        .cache-bar-fill  { height: 100%; border-radius: 2px; }
        .cache-bar-keys  { display: flex; gap: 5px; flex-wrap: wrap; min-height: 20px; }
        .key-chip { font-size: 9px; padding: 2px 7px; border-radius: 3px; border: 1px solid; letter-spacing: .04em; }
        .key-empty { font-size: 9px; color: #2a2a3a; }

        /* ── HIT RATE RING ── */
        .ring-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; }
        .ring-label { font-size: 9px; color: #444; letter-spacing: .15em; text-transform: uppercase; }

        /* ── LOG ── */
        .log-panel { background: #060610; border: 1px solid #1a1a2e; border-radius: 8px; overflow: hidden; }
        .log-hdr { padding: 10px 16px; border-bottom: 1px solid #1a1a2e; display: flex; justify-content: space-between; align-items: center; }
        .log-hdr-title { font-size: 9px; letter-spacing: .2em; color: #444; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
        .log-hdr-clear { font-size: 9px; color: #2a2a3a; cursor: pointer; background: none; border: none; font-family: 'JetBrains Mono', monospace; letter-spacing: .1em; }
        .log-hdr-clear:hover { color: #555; }
        .log-body { height: 220px; overflow-y: auto; padding: 6px 0; }
        .log-body::-webkit-scrollbar { width: 3px; }
        .log-body::-webkit-scrollbar-thumb { background: #1e1e3a; border-radius: 2px; }
        .log-row { display: flex; gap: 8px; align-items: center; padding: 4px 14px; font-size: 10px; border-left: 2px solid transparent; flex-wrap: wrap; }
        .log-row:hover { background: #0d0d1a; }
        .log-hit  { border-left-color: #00ff8840; }
        .log-miss { border-left-color: #ff6b3560; }
        .log-time  { color: #2a2a3a; min-width: 62px; }
        .log-strat { color: #444; min-width: 90px; font-size: 9px; }
        .log-status { font-weight: 700; min-width: 40px; font-size: 10px; }
        .log-key   { color: #888; min-width: 72px; }
        .log-lat   { color: #444; font-size: 9px; }
        .log-evict { color: #ff6b35; font-size: 9px; }
        .log-msg   { color: #555; font-size: 9px; flex: 1; }
        .log-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #2a2a3a; font-size: 10px; }

        .pulse { animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.3} }
        @keyframes breathe { 0%,100%{opacity:1}50%{opacity:.25} }
      `}</style>

      <div className="bg-grid" />
      <div className="wrap">

        {/* HEADER */}
        <header className="hdr">
          <div className="hdr-left">
            <div className="hdr-badge">● Cache Monitor</div>
            <h1 className="hdr-title"><span>Cache</span> Strategies</h1>
            <p className="hdr-sub">In-Memory · Redis · LRU — live hit/miss tracking</p>
          </div>
          <div className="hdr-metrics">
            <div className="metric">
              <div className="metric-val" style={{ color: "#00ff88" }}>{totalHits}</div>
              <div className="metric-lbl">Hits</div>
            </div>
            <div className="metric-sep" />
            <div className="metric">
              <div className="metric-val" style={{ color: "#ff6b35" }}>{totalMiss}</div>
              <div className="metric-lbl">Misses</div>
            </div>
            <div className="metric-sep" />
            <div className="metric">
              <div className="metric-val" style={{ color: hitRate >= 50 ? "#00ff88" : "#ff6b35" }}>{hitRate}%</div>
              <div className="metric-lbl">Hit Rate</div>
            </div>
          </div>
        </header>

        <div className="main-grid">

          {/* LEFT — Controls */}
          <div className="card">
            <div className="card-title">Strategy</div>

            {/* Strategy tabs */}
            <div className="tabs">
              {STRATEGIES.map(s => (
                <button
                  key={s.id}
                  className={`tab ${strategy.id === s.id ? "active" : ""}`}
                  style={strategy.id === s.id ? { borderColor: s.color, color: s.color } : {}}
                  onClick={() => setStrategy(s)}
                >{s.label}</button>
              ))}
            </div>

            {/* Info */}
            <div className="strat-info" style={{ "--sc": strategy.color } as React.CSSProperties}>
              <div className="strat-desc">{strategy.desc}</div>
              <div className="strat-meta">Used by: <span>{strategy.used}</span></div>
              <div className="strat-meta">Tradeoff: <span>{strategy.tradeoff}</span></div>
              <div className="strat-meta">Capacity: <span>{strategy.capacity}</span></div>
            </div>

            {/* Key selector */}
            <div className="card-title">Select Key</div>
            <div className="key-row">
              {AVAILABLE_KEYS.map(k => (
                <button
                  key={k}
                  className={`key-btn ${selectedKey === k ? "selected" : ""}`}
                  style={{ "--sc": strategy.color } as React.CSSProperties}
                  onClick={() => setSelectedKey(k)}
                >{k}</button>
              ))}
            </div>

            {/* Buttons */}
            <div className="btn-row">
              <button className="btn btn-fetch" onClick={fireRequest} disabled={loading}>
                {loading ? "Fetching..." : "▶ Fetch Key"}
              </button>
              <button className="btn btn-clear" onClick={clearCache}>
                ✕ Clear
              </button>
            </div>
          </div>

          {/* RIGHT — Cache state */}
          <div className="card">
            <div className="card-title">Live Cache State</div>
            <div className="cache-bars">
              <CacheBar
                label="In-Memory"
                size={stats?.memory.cache_size ?? 0}
                capacity={null}
                color="#00ff88"
                keys={stats?.memory.keys ?? []}
              />
              <CacheBar
                label="Redis"
                size={stats?.redis.cache_size ?? 0}
                capacity={null}
                color="#00aaff"
                keys={stats?.redis.keys ?? []}
              />
              <CacheBar
                label="LRU"
                size={stats?.lru.cache_size ?? 0}
                capacity={stats?.lru.capacity ?? 3}
                color="#ff6b35"
                keys={stats?.lru.keys ?? []}
              />
            </div>

            {/* Hit rate ring */}
            <div style={{ marginTop: 24, borderTop: "1px solid #1a1a2e", paddingTop: 16 }}>
              <div className="card-title">Session Hit Rate</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <svg viewBox="0 0 100 100" width="80" height="80">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#1a1a2e" strokeWidth="10" />
                  <circle cx="50" cy="50" r="38" fill="none"
                    stroke={hitRate >= 50 ? "#00ff88" : "#ff6b35"}
                    strokeWidth="10"
                    strokeDasharray={`${(hitRate / 100) * 238.76} 238.76`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                    style={{ transition: "stroke-dasharray .5s ease", filter: `drop-shadow(0 0 4px ${hitRate >= 50 ? "#00ff88" : "#ff6b35"})` }}
                  />
                  <text x="50" y="55" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="JetBrains Mono">{hitRate}%</text>
                </svg>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 10, color: "#00ff88" }}>✓ {totalHits} hits</div>
                  <div style={{ fontSize: 10, color: "#ff6b35" }}>✗ {totalMiss} misses</div>
                  <div style={{ fontSize: 9, color: "#333", marginTop: 4 }}>
                    {hitRate >= 70 ? "Cache performing well" : hitRate >= 40 ? "Cache warming up" : "Cache cold — fetch more"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* LOG */}
        <div className="log-panel">
          <div className="log-hdr">
            <div className="log-hdr-title">
              {logs.length > 0 && <span className="pulse" style={{ color: "#00aaff" }}>●</span>}
              Request Log
            </div>
            <button className="log-hdr-clear" onClick={() => setLogs([])}>CLEAR</button>
          </div>
          <div className="log-body" ref={logRef}>
            {logs.length === 0
              ? <div className="log-empty">Select a key and fetch to see cache hits and misses...</div>
              : logs.map(e => <LogRow key={e.id} entry={e} />)
            }
          </div>
        </div>

      </div>
    </>
  );
}