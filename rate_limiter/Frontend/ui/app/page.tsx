"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STRATEGIES = [
  {
    id: "fixed-window",
    label: "Fixed Window",
    endpoint: "/api/fixed-window",
    color: "#00ff88",
    desc: "Hard reset every 60s. Simple quota enforcement.",
    used: "Basic APIs · Free tiers",
    tradeoff: "Allows 2x burst at window boundary",
  },
  {
    id: "sliding-window",
    label: "Sliding Window",
    endpoint: "/api/sliding-window",
    color: "#00aaff",
    desc: "Rolling 60s window. Smooth, no boundary spikes.",
    used: "GitHub API · Stripe · Most production APIs",
    tradeoff: "Slightly higher Redis memory usage",
  },
  {
    id: "token-bucket",
    label: "Token Bucket",
    endpoint: "/api/token-bucket",
    color: "#ff6b35",
    desc: "10 token capacity, refills 0.2/sec. Burst-friendly.",
    used: "AWS · Twilio · Cloudflare",
    tradeoff: "More complex state management",
  },
];

function RadialGauge({ value, max, color, label }) {
  const pct = Math.min(value / max, 1);
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const angle = pct * 270 - 135;

  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 140 140" width="140" height="140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1a1a2e" strokeWidth="12" strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" transform="rotate(135 70 70)" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12" strokeDasharray={`${dash * 0.75} ${circ - dash * 0.75}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" transform="rotate(135 70 70)" opacity="0.9" style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dasharray 0.4s ease" }} />
        <text x="70" y="65" textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily="'JetBrains Mono', monospace">{value}</text>
        <text x="70" y="82" textAnchor="middle" fill="#888" fontSize="9" fontFamily="'JetBrains Mono', monospace">/ {max}</text>
      </svg>
      <div className="gauge-label" style={{ color }}>{label}</div>
    </div>
  );
}

function LogEntry({ entry }) {
  return (
    <div className={`log-entry ${entry.status === 429 ? "log-blocked" : "log-ok"}`}>
      <span className="log-time">{entry.time}</span>
      <span className="log-strategy">[{entry.strategy}]</span>
      <span className={`log-status ${entry.status === 429 ? "status-429" : "status-200"}`}>
        {entry.status === 429 ? "✗ 429" : "✓ 200"}
      </span>
      <span className="log-msg">{entry.msg}</span>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [activeStrategy, setActiveStrategy] = useState(STRATEGIES[0]);
  const [firing, setFiring] = useState(false);
  const [logs, setLogs] = useState([]);
  const [burstCount, setBurstCount] = useState(0);
  const [totalHits, setTotalHits] = useState(0);
  const [totalBlocked, setTotalBlocked] = useState(0);
  const logRef = useRef(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 1500);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (strategy, status, msg) => {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    setLogs((prev) => [...prev.slice(-49), { time, strategy, status, msg, id: Date.now() + Math.random() }]);
  };

  const fireRequest = useCallback(async () => {
    if (firing) return;
    setFiring(true);
    try {
      const res = await fetch(`${API_BASE}${activeStrategy.endpoint}`, { method: "POST" });
      const data = await res.json();
      setTotalHits((p) => p + 1);
      if (res.status === 429) {
        setTotalBlocked((p) => p + 1);
        addLog(activeStrategy.label, 429, `Rate limit exceeded. Retry after ${data.detail?.retry_after ?? "?"}s`);
      } else {
        const rem = data.detail?.remaining ?? data.detail?.tokens_remaining ?? "?";
        addLog(activeStrategy.label, 200, `Allowed · ${rem} remaining`);
      }
      await fetchStats();
    } catch (e) {
      addLog(activeStrategy.label, 0, "Connection error — is API running?");
    }
    setFiring(false);
  }, [activeStrategy, firing, fetchStats]);

  const burstFire = useCallback(async () => {
    setBurstCount(15);
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 120));
      try {
        const res = await fetch(`${API_BASE}${activeStrategy.endpoint}`, { method: "POST" });
        const data = await res.json();
        setTotalHits((p) => p + 1);
        if (res.status === 429) {
          setTotalBlocked((p) => p + 1);
          addLog(activeStrategy.label, 429, `Burst blocked · retry ${data.detail?.retry_after ?? "?"}s`);
        } else {
          addLog(activeStrategy.label, 200, `Burst allowed · ${data.detail?.remaining ?? data.detail?.tokens_remaining ?? "?"} left`);
        }
      } catch (e) {}
      setBurstCount((p) => p - 1);
    }
    await fetchStats();
  }, [activeStrategy, fetchStats]);

  const fw = stats?.fixed_window;
  const sw = stats?.sliding_window;
  const tb = stats?.token_bucket;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Syne:wght@400;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #080810;
          color: #e0e0e0;
          font-family: 'JetBrains Mono', monospace;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .bg-grid {
          position: fixed; inset: 0; z-index: 0;
          background-image: linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }

        .container {
          position: relative; z-index: 1;
          max-width: 1200px; margin: 0 auto;
          padding: 32px 24px;
        }

        .header {
          display: flex; align-items: flex-start;
          justify-content: space-between; margin-bottom: 40px;
          border-bottom: 1px solid #1e1e3a; padding-bottom: 24px;
        }

        .header-left {}
        .header-badge {
          display: inline-block;
          font-size: 10px; letter-spacing: 0.2em;
          color: #00ff88; border: 1px solid #00ff8840;
          padding: 4px 10px; border-radius: 2px;
          margin-bottom: 10px; text-transform: uppercase;
        }
        .header-title {
          font-family: 'Syne', sans-serif;
          font-size: 28px; font-weight: 800;
          color: white; letter-spacing: -0.02em;
          line-height: 1.1;
        }
        .header-title span { color: #00ff88; }
        .header-sub { font-size: 11px; color: #555; margin-top: 6px; }

        .header-metrics {
          display: flex; gap: 24px; align-items: center;
        }
        .metric-pill {
          text-align: right;
        }
        .metric-val {
          font-size: 24px; font-weight: 700;
          font-family: 'Syne', sans-serif;
        }
        .metric-lbl { font-size: 9px; color: #555; letter-spacing: 0.1em; text-transform: uppercase; }

        .grid-top {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 16px; margin-bottom: 16px;
        }

        @media (max-width: 768px) {
          .grid-top { grid-template-columns: 1fr; }
          .header { flex-direction: column; gap: 16px; }
        }

        .card {
          background: #0d0d1a;
          border: 1px solid #1e1e3a;
          border-radius: 8px; padding: 20px;
        }

        .card-title {
          font-size: 9px; letter-spacing: 0.2em;
          color: #555; text-transform: uppercase;
          margin-bottom: 16px;
        }

        .strategy-tabs {
          display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .strategy-tab {
          padding: 8px 14px; border-radius: 4px;
          border: 1px solid #1e1e3a;
          background: transparent; cursor: pointer;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px; color: #666;
          transition: all 0.2s;
        }
        .strategy-tab:hover { border-color: #333; color: #999; }
        .strategy-tab.active {
          background: #111125; color: white;
        }

        .strategy-info {
          padding: 14px; background: #060610;
          border-radius: 6px; margin-bottom: 16px;
          border-left: 3px solid var(--sc);
        }
        .strategy-desc { font-size: 12px; color: #ccc; margin-bottom: 6px; }
        .strategy-meta { font-size: 10px; color: #555; }
        .strategy-meta span { color: #888; }

        .btn-row { display: flex; gap: 10px; }

        .btn {
          flex: 1; padding: 12px;
          border: none; border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
          letter-spacing: 0.05em;
        }
        .btn-fire {
          background: #00ff88; color: #080810;
        }
        .btn-fire:hover { background: #00ffaa; transform: translateY(-1px); }
        .btn-fire:disabled { background: #1a3a2a; color: #3a7a5a; cursor: not-allowed; transform: none; }

        .btn-burst {
          background: transparent; color: #ff6b35;
          border: 1px solid #ff6b3540;
        }
        .btn-burst:hover { background: #ff6b3510; border-color: #ff6b35; }
        .btn-burst:disabled { opacity: 0.3; cursor: not-allowed; }

        .gauges-row {
          display: flex; justify-content: space-around;
          align-items: center; gap: 8px;
        }

        .gauge-wrap { text-align: center; }
        .gauge-label { font-size: 10px; margin-top: 4px; letter-spacing: 0.05em; font-weight: 600; }

        .log-panel {
          background: #060610; border: 1px solid #1a1a2e;
          border-radius: 8px; overflow: hidden;
        }
        .log-header {
          padding: 12px 16px;
          border-bottom: 1px solid #1a1a2e;
          display: flex; justify-content: space-between; align-items: center;
        }
        .log-title { font-size: 9px; letter-spacing: 0.2em; color: #555; text-transform: uppercase; }
        .log-clear {
          font-size: 9px; color: #333; cursor: pointer;
          background: none; border: none;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.1em;
        }
        .log-clear:hover { color: #666; }

        .log-body {
          height: 240px; overflow-y: auto; padding: 8px 0;
        }
        .log-body::-webkit-scrollbar { width: 4px; }
        .log-body::-webkit-scrollbar-track { background: transparent; }
        .log-body::-webkit-scrollbar-thumb { background: #1e1e3a; border-radius: 2px; }

        .log-entry {
          display: flex; gap: 10px; align-items: center;
          padding: 5px 16px; font-size: 11px;
          border-left: 2px solid transparent;
          transition: background 0.1s;
        }
        .log-entry:hover { background: #0d0d1a; }
        .log-blocked { border-left-color: #ff4444; }
        .log-ok { border-left-color: #00ff8840; }

        .log-time { color: #333; min-width: 65px; }
        .log-strategy { color: #555; min-width: 110px; font-size: 10px; }
        .status-429 { color: #ff4444; min-width: 50px; font-weight: 700; }
        .status-200 { color: #00ff88; min-width: 50px; }
        .log-msg { color: #777; font-size: 10px; }

        .log-empty {
          display: flex; align-items: center; justify-content: center;
          height: 100%; color: #333; font-size: 11px;
        }

        .pulse { animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }

        .divider { width: 1px; background: #1e1e3a; align-self: stretch; }
      `}</style>

      <div className="bg-grid" />
      <div className="container">

        <header className="header">
          <div className="header-left">
            <div className="header-badge">● Live System Monitor</div>
            <h1 className="header-title">Rate<span>Limiter</span> API</h1>
            <p className="header-sub">Multi-strategy · Redis-backed · Production-grade</p>
          </div>
          <div className="header-metrics">
            <div className="metric-pill">
              <div className="metric-val" style={{ color: "#00ff88" }}>{totalHits}</div>
              <div className="metric-lbl">Total Requests</div>
            </div>
            <div className="divider" />
            <div className="metric-pill">
              <div className="metric-val" style={{ color: "#ff4444" }}>{totalBlocked}</div>
              <div className="metric-lbl">Blocked</div>
            </div>
            <div className="divider" />
            <div className="metric-pill">
              <div className="metric-val" style={{ color: "#888" }}>
                {totalHits > 0 ? Math.round((totalBlocked / totalHits) * 100) : 0}%
              </div>
              <div className="metric-lbl">Block Rate</div>
            </div>
          </div>
        </header>

        <div className="grid-top">
          {/* Fire Panel */}
          <div className="card">
            <div className="card-title">Fire Requests</div>

            <div className="strategy-tabs">
              {STRATEGIES.map((s) => (
                <button
                  key={s.id}
                  className={`strategy-tab ${activeStrategy.id === s.id ? "active" : ""}`}
                  style={activeStrategy.id === s.id ? { borderColor: s.color, color: s.color } : {}}
                  onClick={() => setActiveStrategy(s)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="strategy-info" style={{ "--sc": activeStrategy.color }}>
              <div className="strategy-desc">{activeStrategy.desc}</div>
              <div className="strategy-meta">Used by: <span>{activeStrategy.used}</span></div>
              <div className="strategy-meta">Tradeoff: <span>{activeStrategy.tradeoff}</span></div>
            </div>

            <div className="btn-row">
              <button className="btn btn-fire" onClick={fireRequest} disabled={firing || burstCount > 0}>
                {firing ? "Firing..." : "▶  Fire Request"}
              </button>
              <button className="btn btn-burst" onClick={burstFire} disabled={firing || burstCount > 0}>
                {burstCount > 0 ? `Burst ${burstCount}...` : "⚡ Burst ×15"}
              </button>
            </div>
          </div>

          {/* Gauges */}
          <div className="card">
            <div className="card-title">Live State — All Strategies</div>
            <div className="gauges-row">
              <RadialGauge
                value={fw ? fw.count : 0}
                max={10}
                color="#00ff88"
                label="Fixed Window"
              />
              <RadialGauge
                value={sw ? sw.count : 0}
                max={10}
                color="#00aaff"
                label="Sliding Window"
              />
              <RadialGauge
                value={tb ? Math.round(10 - tb.tokens) : 0}
                max={10}
                color="#ff6b35"
                label="Tokens Used"
              />
            </div>
          </div>
        </div>

        {/* Request Log */}
        <div className="log-panel">
          <div className="log-header">
            <div className="log-title">
              {logs.length > 0 ? (
                <span className="pulse" style={{ color: "#00ff88", marginRight: 6 }}>●</span>
              ) : null}
              Request Log
            </div>
            <button className="log-clear" onClick={() => setLogs([])}>CLEAR</button>
          </div>
          <div className="log-body" ref={logRef}>
            {logs.length === 0 ? (
              <div className="log-empty">Fire a request to see logs...</div>
            ) : (
              logs.map((e) => <LogEntry key={e.id} entry={e} />)
            )}
          </div>
        </div>

      </div>
    </>
  );
}