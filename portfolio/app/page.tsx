"use client";
import { useState, useEffect, useRef, RefObject } from "react";
import { projects, about } from "../projects.config.js";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Project {
  id: number;
  name: string;
  topic: string;
  desc: string;
  url: string;
  color: string;
  status: string;
  tags: string[];
  designConcept: string;
}

interface About {
  name: string;
  role: string;
  bio: string;
  github: string;
  linkedin: string;
  portfolio: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useInView(threshold = 0.1): [RefObject<HTMLElement | null>, boolean] {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ p, index, onClick }: { p: Project; index: number; onClick: (p: Project) => void }) {
  const [ref, inView] = useInView();
  const [hov, setHov] = useState(false);

  return (
    <article
      ref={ref as RefObject<HTMLElement | null>}
      onClick={() => onClick(p)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(32px)",
        transition: `opacity .7s ease ${index * 80}ms, transform .7s ease ${index * 80}ms, box-shadow .3s ease`,
        boxShadow: hov
          ? `0 20px 60px rgba(0,0,0,.1), 0 4px 16px rgba(0,0,0,.06), 0 0 0 1px ${p.color}30`
          : "0 2px 8px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04)",
      }}
      className={`card ${hov ? "hov" : ""}`}
    >
      <div className="card-accent" style={{ background: `linear-gradient(135deg, ${p.color}18, ${p.color}06)`, opacity: hov ? 1 : 0 }} />
      <div className="card-topline" style={{ background: p.color, transform: hov ? "scaleX(1)" : "scaleX(0)" }} />

      <div className="card-head">
        <span className="card-num" style={{ color: p.color }}>#{String(p.id).padStart(2, "0")}</span>
        <span className="card-live">
          <span className="live-dot" style={{ background: p.color }} />
          live
        </span>
      </div>

      <h3 className="card-name">{p.name}</h3>
      <p className="card-sub">{p.designConcept}</p>
      <p className="card-body">{p.desc}</p>

      <div className="card-tags">
        {p.tags.map((t: string) => (
          <span key={t} className="tag" style={hov ? {
            background: `${p.color}14`, color: p.color, borderColor: `${p.color}30`,
          } : {}}>{t}</span>
        ))}
      </div>

      <div className="card-foot">
        <span className="card-topic" style={{ color: p.color }}>{p.topic}</span>
        <span className="card-arrow" style={{ opacity: hov ? 1 : 0 }}>View →</span>
      </div>
    </article>
  );
}

// ─── Slot ─────────────────────────────────────────────────────────────────────
function Slot({ num }: { num: number }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref as RefObject<HTMLDivElement | null>}
      className="slot"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(20px)",
        transition: `opacity .6s ease ${(num % 6) * 60}ms, transform .6s ease ${(num % 6) * 60}ms`,
      }}
    >
      <span className="slot-num">#{String(num).padStart(2, "0")}</span>
      <span className="slot-txt">Coming soon</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Portfolio() {
  const [active, setActive] = useState<Project | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);

  const typedAbout = about as About;

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = active ? "hidden" : "";
    if (active) setIframeReady(false);
    return () => { document.body.style.overflow = ""; };
  }, [active]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        :root {
          --bg:      #f5f6fa;
          --surface: #ffffff;
          --surface2:#f9fafb;
          --border:  #e8eaef;
          --border2: #d8dce8;
          --ink:     #0e0e1a;
          --ink2:    #3d3d54;
          --ink3:    #7e7e98;
          --ink4:    #b0b0c4;
          --accent:  #4f52e8;
          --green:   #16a34a;
          --r-sm:    10px;
          --r-md:    16px;
          --r-lg:    24px;
          --font-d:  'Instrument Serif', Georgia, serif;
          --font-b:  'Outfit', system-ui, sans-serif;
          --font-m:  'DM Mono', monospace;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { color-scheme: light; scroll-behavior: smooth; }
        body {
          background: var(--bg) !important;
          color: var(--ink);
          font-family: var(--font-b);
          font-size: 15px;
          line-height: 1.6;
          -webkit-font-smoothing: antialiased;
        }

        .nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          height: 56px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 36px;
          background: rgba(245,246,250,0);
          transition: background .4s ease, box-shadow .4s ease, border-color .4s;
          border-bottom: 1px solid transparent;
        }
        .nav.up {
          background: rgba(245,246,250,.92);
          backdrop-filter: blur(24px) saturate(200%);
          -webkit-backdrop-filter: blur(24px) saturate(200%);
          border-bottom-color: var(--border);
          box-shadow: 0 1px 0 var(--border), 0 4px 24px rgba(0,0,0,.04);
        }
        .nav-logo { font-family: var(--font-d); font-size: 18px; color: var(--ink); letter-spacing: -.02em; font-style: italic; }
        .nav-logo b { font-style: normal; font-family: var(--font-b); font-weight: 700; color: var(--accent); }
        .nav-chip {
          display: flex; align-items: center; gap: 7px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 999px; padding: 5px 14px;
          box-shadow: 0 1px 4px rgba(0,0,0,.05);
          font-family: var(--font-m); font-size: 11px; color: var(--ink3);
        }
        .chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: breathe 2.4s ease-in-out infinite; }

        .page { max-width: 1100px; margin: 0 auto; padding: 100px 32px 100px; }

        .hero { padding: 60px 0 72px; }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 999px; padding: 6px 16px 6px 12px;
          font-family: var(--font-m); font-size: 10px; color: var(--accent);
          letter-spacing: .06em; box-shadow: 0 1px 4px rgba(0,0,0,.05);
          margin-bottom: 32px;
          opacity: 0; animation: fadeUp .6s ease .1s forwards;
        }
        .badge-pip { width: 5px; height: 5px; background: var(--accent); border-radius: 50%; }
        .hero-title {
          font-family: var(--font-d);
          font-size: clamp(52px, 7vw, 96px);
          font-weight: 400; line-height: 1.0;
          letter-spacing: -.04em; color: var(--ink);
          margin-bottom: 40px;
          opacity: 0; animation: fadeUp .7s ease .2s forwards;
        }
        .hero-title b  { font-weight: 700; font-family: var(--font-b); }
        .hero-title em { font-style: italic; color: var(--accent); }
        .hero-grid {
          display: grid; grid-template-columns: 1fr 300px;
          gap: 56px; align-items: start;
          opacity: 0; animation: fadeUp .65s ease .32s forwards;
        }
        @media (max-width: 800px) { .hero-grid { grid-template-columns: 1fr; gap: 36px; } }
        .hero-bio { font-size: 16px; color: var(--ink2); line-height: 1.8; margin-bottom: 28px; font-weight: 300; }
        .hero-bio b { color: var(--ink); font-weight: 600; }
        .links { display: flex; gap: 8px; flex-wrap: wrap; }
        .link {
          font-family: var(--font-m); font-size: 11px; color: var(--ink3);
          text-decoration: none; border: 1px solid var(--border2);
          border-radius: var(--r-sm); padding: 9px 18px;
          background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,.05);
          transition: color .2s, border-color .2s, background .2s, transform .2s, box-shadow .2s;
          letter-spacing: .03em; font-weight: 500;
        }
        .link:hover { color: var(--accent); border-color: var(--accent); background: #f0f1ff; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(79,82,232,.12); }

        .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 22px 24px; box-shadow: 0 4px 20px rgba(0,0,0,.06); }
        .sc-eyebrow { font-family: var(--font-m); font-size: 9px; color: var(--ink4); letter-spacing: .18em; text-transform: uppercase; margin-bottom: 16px; }
        .sc-row { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 0; border-bottom: 1px solid var(--bg); }
        .sc-row:last-of-type { border-bottom: none; }
        .sc-key  { font-size: 13px; color: var(--ink3); }
        .sc-val  { font-family: var(--font-d); font-size: 24px; color: var(--ink); letter-spacing: -.03em; line-height: 1; }
        .sc-val sup { font-family: var(--font-m); font-size: 11px; color: var(--accent); margin-left: 2px; }
        .sc-stack { font-family: var(--font-m); font-size: 10px; color: var(--ink3); }
        .sc-role { margin-top: 16px; display: inline-flex; align-items: center; gap: 7px; background: #f0fff4; border: 1px solid #bbf7d0; border-radius: 999px; padding: 6px 14px; font-family: var(--font-m); font-size: 10px; color: var(--green); letter-spacing: .04em; font-weight: 500; }
        .sc-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: breathe 2s ease-in-out infinite; }

        .section-row { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; opacity: 0; animation: fadeUp .5s ease .5s forwards; }
        .section-label { font-family: var(--font-m); font-size: 10px; color: var(--ink4); letter-spacing: .2em; text-transform: uppercase; white-space: nowrap; }
        .section-rule { flex: 1; height: 1px; background: var(--border); }
        .section-pill { font-family: var(--font-m); font-size: 10px; font-weight: 500; color: var(--accent); background: #eef0ff; border: 1px solid #d0d3ff; border-radius: 999px; padding: 3px 12px; white-space: nowrap; }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; margin-bottom: 80px; }
        @media (max-width: 660px) { .grid { grid-template-columns: 1fr; } }

        .card {
          position: relative; overflow: hidden; background: var(--surface);
          border: 1px solid var(--border); border-radius: var(--r-md);
          padding: 24px 24px 20px; cursor: pointer;
          display: flex; flex-direction: column;
          transition: transform .28s cubic-bezier(.34,1.2,.64,1);
          will-change: transform;
        }
        .card.hov { transform: translateY(-5px) scale(1.006); }
        .card-accent { position: absolute; inset: 0; pointer-events: none; border-radius: var(--r-md); transition: opacity .4s ease; }
        .card-topline { position: absolute; top: 0; left: 0; right: 0; height: 2.5px; transform-origin: left; transition: transform .35s cubic-bezier(.22,1,.36,1); border-radius: var(--r-md) var(--r-md) 0 0; }
        .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .card-num { font-family: var(--font-m); font-size: 11px; font-weight: 500; letter-spacing: .06em; }
        .card-live { display: flex; align-items: center; gap: 5px; font-family: var(--font-m); font-size: 9px; color: var(--ink4); letter-spacing: .1em; text-transform: uppercase; }
        .live-dot { width: 5px; height: 5px; border-radius: 50%; animation: breathe 2.5s ease-in-out infinite; }
        .card-name { font-family: var(--font-d); font-size: 20px; font-weight: 400; color: var(--ink); letter-spacing: -.02em; line-height: 1.2; margin-bottom: 5px; }
        .card-sub { font-size: 12px; color: var(--ink3); font-style: italic; margin-bottom: 10px; line-height: 1.5; }
        .card-body { font-size: 13px; color: var(--ink2); line-height: 1.65; margin-bottom: 16px; flex: 1; font-weight: 300; }
        .card-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 16px; }
        .tag { font-family: var(--font-m); font-size: 9px; font-weight: 500; padding: 3px 9px; border-radius: 5px; background: var(--surface2); color: var(--ink3); border: 1px solid transparent; transition: background .25s, color .25s, border-color .25s; }
        .card-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--bg); }
        .card-topic { font-family: var(--font-m); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; font-weight: 500; }
        .card-arrow { font-family: var(--font-m); font-size: 10px; color: var(--ink3); transition: opacity .25s, transform .25s; }
        .card.hov .card-arrow { transform: translateX(4px); }

        .slot { background: var(--surface2); border: 1.5px dashed var(--border); border-radius: var(--r-md); min-height: 170px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; }
        .slot-num { font-family: var(--font-d); font-size: 26px; font-style: italic; color: var(--border2); letter-spacing: -.03em; line-height: 1; }
        .slot-txt { font-family: var(--font-m); font-size: 9px; color: var(--ink4); letter-spacing: .16em; text-transform: uppercase; }

        .overlay { position: fixed; inset: 0; z-index: 300; background: rgba(14,14,26,.35); backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); display: flex; align-items: stretch; padding: 16px; animation: fadeIn .25s ease; }
        .drawer { flex: 1; max-width: 1440px; margin: 0 auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: 0 32px 80px rgba(0,0,0,.18); display: flex; flex-direction: column; overflow: hidden; animation: popIn .35s cubic-bezier(.34,1.3,.64,1); }
        .drawer-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: var(--surface2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .drawer-l { display: flex; align-items: center; gap: 10px; }
        .drawer-pip { width: 8px; height: 8px; border-radius: 50%; animation: breathe 2s infinite; }
        .drawer-name { font-family: var(--font-d); font-size: 15px; color: var(--ink); letter-spacing: -.02em; }
        .drawer-sub  { font-family: var(--font-m); font-size: 9px; color: var(--ink4); letter-spacing: .12em; text-transform: uppercase; }
        .drawer-r { display: flex; gap: 8px; }
        .d-btn { font-family: var(--font-m); font-size: 10px; font-weight: 500; color: var(--ink3); text-decoration: none; border: 1px solid var(--border2); border-radius: var(--r-sm); padding: 7px 14px; background: var(--surface); transition: all .2s; cursor: pointer; letter-spacing: .03em; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
        .d-btn:hover { color: var(--accent); border-color: var(--accent); background: #f0f1ff; }
        .drawer-loader { height: 2px; background: var(--bg); flex-shrink: 0; overflow: hidden; }
        .drawer-bar-fill { height: 100%; width: 35%; background: var(--accent); animation: scan 1.4s ease-in-out infinite; }
        .drawer-frame { flex: 1; border: none; width: 100%; min-height: 0; }

        .footer { border-top: 1px solid var(--border); padding: 28px 0 0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; opacity: 0; animation: fadeUp .5s ease 1s forwards; }
        .footer span { font-family: var(--font-m); font-size: 10px; color: var(--ink4); letter-spacing: .04em; }

        @keyframes fadeUp  { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes popIn   { from { opacity:0; transform:scale(.96) translateY(20px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes breathe { 0%,100% { opacity:1 } 50% { opacity:.25 } }
        @keyframes scan    { 0% { transform:translateX(-100%) } 100% { transform:translateX(400%) } }

        @media (max-width: 600px) {
          .page { padding: 88px 18px 80px; }
          .nav  { padding: 0 18px; }
          .overlay { padding: 0; }
          .drawer  { border-radius: 0; }
        }
      `}</style>

      <nav className={`nav ${scrolled ? "up" : ""}`}>
        <div className="nav-logo"><b>sys</b>_design</div>
        <div className="nav-chip">
          <span className="chip-dot" />
          <span style={{ fontFamily: "var(--font-m)", fontSize: 11, color: "var(--ink3)" }}>
            <b style={{ color: "var(--ink2)" }}>{(projects as Project[]).length}</b> / 15 live
          </span>
        </div>
      </nav>

      <main className="page">
        <section className="hero">
          <div className="hero-badge">
            <span className="badge-pip" />
            System Design Series · 2025
          </div>

          <h1 className="hero-title">
            {typedAbout.name.split(" ")[0]}{" "}
            <b>{typedAbout.name.split(" ")[1]}</b><br />
            <em>builds systems.</em>
          </h1>

          <div className="hero-grid">
            <div>
              <p className="hero-bio">
                <b>Software Engineer</b> specializing in AI integration and full-stack
                architecture. Building 15 real-world system design concepts — each one
                designed, implemented, and <b>deployed live</b>.
              </p>
              <div className="links">
                <a href={typedAbout.github}    target="_blank" rel="noreferrer" className="link">GitHub ↗</a>
                <a href={typedAbout.linkedin}  target="_blank" rel="noreferrer" className="link">LinkedIn ↗</a>
                <a href={typedAbout.portfolio} target="_blank" rel="noreferrer" className="link">Portfolio ↗</a>
              </div>
            </div>

            <div className="stat-card">
              <div className="sc-eyebrow">Progress snapshot</div>
              <div className="sc-row">
                <span className="sc-key">Mini projects</span>
                <span className="sc-val">{(projects as Project[]).length}<sup>/15</sup></span>
              </div>
              <div className="sc-row">
                <span className="sc-key">Adv projects</span>
                <span className="sc-val">3<sup>+</sup></span>
              </div>
              <div className="sc-row">
                <span className="sc-key">Stack</span>
                <span className="sc-stack">FastAPI · Next.js · Redis</span>
              </div>
              <div className="sc-role">
                <span className="sc-dot" />
                {typedAbout.role}
              </div>
            </div>
          </div>
        </section>

        <div className="section-row">
          <span className="section-label">Projects</span>
          <span className="section-rule" />
          <span className="section-pill">{(projects as Project[]).length} of 15 built</span>
        </div>

        <div className="grid">
          {(projects as Project[]).map((p, i) => (
            <Card key={p.id} p={p} index={i} onClick={setActive} />
          ))}
          {Array.from({ length: 15 - (projects as Project[]).length }).map((_, i) => (
            <Slot key={i} num={(projects as Project[]).length + i + 1} />
          ))}
        </div>

        <footer className="footer">
          <span>© 2025 {typedAbout.name} · System Design Series</span>
          <span>Next.js · Vercel</span>
        </footer>
      </main>

      {active && (
        <div className="overlay" onClick={() => setActive(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-bar">
              <div className="drawer-l">
                <span className="drawer-pip" style={{ background: active.color }} />
                <span className="drawer-name">{active.name}</span>
                <span className="drawer-sub">{active.topic}</span>
              </div>
              <div className="drawer-r">
                <a href={active.url} target="_blank" rel="noreferrer" className="d-btn">Open full ↗</a>
                <button className="d-btn" onClick={() => setActive(null)}>✕ Close</button>
              </div>
            </div>
            {!iframeReady && (
              <div className="drawer-loader">
                <div className="drawer-bar-fill" />
              </div>
            )}
            <iframe
              className="drawer-frame"
              src={active.url}
              title={active.name}
              onLoad={() => setIframeReady(true)}
            />
          </div>
        </div>
      )}
    </>
  );
}