import { useEffect, useMemo, useRef, useState } from "react";
import { PartyPopper, RotateCw } from "lucide-react";
import { fmtN } from "./ui";
import type { SpinSegment } from "../lib/types";

/* ═══════════════════════════════════════════════════════════════════════
   3-D GOLDEN SPIN WHEEL
   – Geometry: segment i occupies [i*arc, (i+1)*arc) clockwise from 12 o'clock
   – Server decides the result BEFORE animation; wheel only visualises it.
═══════════════════════════════════════════════════════════════════════ */

interface Props {
  segments: SpinSegment[];
  spinning: boolean;
  winningIndex: number | null;
  onSpin: () => void;
  disabled?: boolean;
  onAnimationEnd?: () => void;
}

const START_ROTATION = -8;

function targetRotation(index: number, count: number, cur: number): number {
  const arc = 360 / count;
  const jitter = (Math.random() - 0.5) * arc * 0.62;
  const base = -(index * arc + arc / 2) + jitter;
  const delta = (((base - cur) % 360) + 360) % 360;
  return cur + 360 * 6 + delta;
}

export default function SpinWheel({ segments, spinning, winningIndex, onSpin, disabled, onAnimationEnd }: Props) {
  const count = Math.max(1, segments.length);
  const arc = 360 / count;
  const [rotation, setRotation] = useState(START_ROTATION);
  const [glow, setGlow] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const rotRef = useRef(START_ROTATION);

  useEffect(() => { if (spinning) setCelebrate(false); }, [spinning]);

  useEffect(() => {
    if (winningIndex === null) return;
    setGlow(true);
    const target = targetRotation(winningIndex, count, rotRef.current);
    rotRef.current = target;
    setRotation(target);
    const t = window.setTimeout(() => {
      setGlow(false);
      setCelebrate(true);
      onAnimationEnd?.();
    }, 5200);
    return () => window.clearTimeout(t);
  }, [winningIndex, count]);

  const paths = useMemo(() => segments.map((seg, i) => {
    const a0 = (i * arc - 90) * (Math.PI / 180);
    const a1 = ((i + 1) * arc - 90) * (Math.PI / 180);
    const r = 94;
    const x0 = 100 + r * Math.cos(a0), y0 = 100 + r * Math.sin(a0);
    const x1 = 100 + r * Math.cos(a1), y1 = 100 + r * Math.sin(a1);
    const large = arc > 180 ? 1 : 0;
    const d = `M 100 100 L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    const mid = (i * arc + arc / 2 - 90) * (Math.PI / 180);
    const labelX = 100 + 63 * Math.cos(mid);
    const labelY = 100 + 63 * Math.sin(mid);
    return { seg, d, labelX, labelY, mid, i };
  }), [segments, arc]);

  const winner = winningIndex !== null ? segments[winningIndex] : null;
  const isWin = !!winner && winner.type !== "none";

  return (
    <Shell
      paths={paths} rotation={rotation} spinning={spinning}
      glow={glow} celebrate={celebrate} winner={winner} isWin={isWin}
      onSpin={onSpin} disabled={disabled}
    />
  );
}

/* ─── CSS keyframes injected once ─────────────────────────────────── */
const STYLES = `
  @keyframes pointer-bounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-4px)} }
  @keyframes hub-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(212,175,55,0.55)} 50%{box-shadow:0 0 0 10px rgba(212,175,55,0)} }
  @keyframes rim-shine { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
  @keyframes confetti-fall {
    0%  { transform:translate(0,-20px) rotate(0deg);   opacity:1 }
    100%{ transform:translate(var(--dx),260px) rotate(540deg); opacity:0 }
  }
  @keyframes result-pop {
    0%  { opacity:0; transform:translateY(10px) scale(0.95) }
    100%{ opacity:1; transform:translateY(0)    scale(1)    }
  }
  .result-pop { animation: result-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards; }
`;

function Shell({ paths, rotation, spinning, glow, celebrate, winner, isWin, onSpin, disabled }: any) {
  return (
    <div className="relative mx-auto w-full max-w-[400px] select-none">
      <style>{STYLES}</style>

      {/* ── stage glow ── */}
      <div
        className="pointer-events-none absolute -inset-10 rounded-full blur-3xl transition-opacity duration-700"
        style={{
          opacity: glow || celebrate ? 1 : 0,
          background: "radial-gradient(circle, rgba(212,175,55,0.30) 0%, rgba(212,175,55,0.10) 45%, transparent 70%)",
        }}
      />

      {/* ── 3-D tilt wrapper ── */}
      <div style={{ perspective: "900px" }}>
        <div
          style={{
            transformStyle: "preserve-3d",
            transform: "rotateX(22deg)",
            transition: "filter 0.7s",
            filter: glow ? "drop-shadow(0 0 28px rgba(212,175,55,0.7))" : "drop-shadow(0 24px 32px rgba(0,0,0,0.55))",
          }}
        >
          {/* ── outer golden bezel (3-D rim) ── */}
          <div
            className="relative mx-auto rounded-full p-[12px]"
            style={{
              background: "linear-gradient(135deg,#f5e08a 0%,#d4af37 20%,#a97f1f 40%,#f5e08a 55%,#d4af37 75%,#c9a227 100%)",
              backgroundSize: "200% 200%",
              animation: "rim-shine 4s linear infinite",
              boxShadow: [
                "0 0 0 3px #a97f1f",
                "0 0 0 5px #f5e08a44",
                "0 6px 0 6px #7a5c0e",         /* bottom edge — 3-D depth */
                "0 10px 30px rgba(0,0,0,0.6)",
                "inset 0 2px 4px rgba(255,255,255,0.35)",
                "inset 0 -2px 4px rgba(0,0,0,0.25)",
              ].join(","),
            }}
          >
            {/* inner dark face */}
            <div
              className="relative overflow-hidden rounded-full"
              style={{
                background: "#0a0f1a",
                boxShadow: "inset 0 0 30px rgba(0,0,0,0.8), inset 0 0 8px rgba(212,175,55,0.12)",
              }}
            >
              {/* SVG segments */}
              <svg
                viewBox="0 0 200 200"
                className="block h-auto w-full"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: "transform 5.2s cubic-bezier(0.12,0.8,0.16,1)",
                }}
              >
                <defs>
                  {paths.map(({ seg, i }: any) => (
                    <radialGradient key={i} id={`sg${i}`} cx="50%" cy="50%" r="70%">
                      <stop offset="0%" stopColor={seg.color} stopOpacity="1" />
                      <stop offset="100%" stopColor={seg.color} stopOpacity="0.75" />
                    </radialGradient>
                  ))}
                  {/* gold separator overlay */}
                  <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f5e08a" />
                    <stop offset="60%" stopColor="#d4af37" />
                    <stop offset="100%" stopColor="#7a5c0e" />
                  </radialGradient>
                </defs>

                {/* segments */}
                {paths.map(({ d, labelX, labelY, mid, i, seg }: any) => (
                  <g key={i}>
                    <path d={d} fill={`url(#sg${i})`} stroke="rgba(212,175,55,0.45)" strokeWidth="1.2" />
                    {/* shine highlight near hub */}
                    <text
                      x={labelX} y={labelY}
                      fill="#fff" fontSize="8.5" fontWeight="800"
                      textAnchor="middle" dominantBaseline="middle"
                      transform={`rotate(${(mid * 180) / Math.PI + 90} ${labelX} ${labelY})`}
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.5)", strokeWidth: 3 }}
                    >
                      {seg.label}
                    </text>
                  </g>
                ))}

                {/* outer ring chrome line */}
                <circle cx="100" cy="100" r="93" fill="none" stroke="rgba(212,175,55,0.35)" strokeWidth="2.5" />

                {/* hub disc */}
                <circle cx="100" cy="100" r="28" fill="url(#centerGlow)" stroke="#f5e08a" strokeWidth="1.5"
                  style={{ filter: "drop-shadow(0 0 6px rgba(212,175,55,0.8))" }} />
                <circle cx="100" cy="100" r="22" fill="#0a0f1a" stroke="rgba(212,175,55,0.4)" strokeWidth="1" />
              </svg>

              {/* SPIN hub button */}
              <button
                onClick={onSpin}
                disabled={disabled || spinning}
                className="absolute left-1/2 top-1/2 z-10 flex h-[48px] w-[48px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                style={{
                  background: "linear-gradient(145deg,#f5e08a,#d4af37 40%,#a97f1f)",
                  boxShadow: "0 0 0 2px #7a5c0e, 0 4px 10px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.4)",
                  animation: !disabled && !spinning ? "hub-pulse 2s ease-in-out infinite" : "none",
                }}
              >
                {spinning
                  ? <RotateCw className="h-5 w-5 text-amber-900 animate-spin" />
                  : <span className="text-[10px] font-black tracking-widest text-amber-900 leading-none">SPIN</span>
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── pointer (outside the 3-D wrapper so it stays flat) ── */}
      <div
        className="absolute left-1/2 z-20"
        style={{
          top: "-2px",
          animation: spinning ? "pointer-bounce 0.4s ease-in-out infinite" : "none",
          transform: "translateX(-50%)",
        }}
      >
        {/* pointer arrow */}
        <div
          style={{
            width: 0, height: 0,
            borderLeft: "13px solid transparent",
            borderRight: "13px solid transparent",
            borderTop: "26px solid #d4af37",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
          }}
        />
        <div
          className="mx-auto -mt-[3px] h-[10px] w-[10px] rounded-full"
          style={{ background: "linear-gradient(135deg,#f5e08a,#a97f1f)", boxShadow: "0 2px 4px rgba(0,0,0,0.4)" }}
        />
      </div>

      {/* ── result banner ── */}
      {celebrate && winner && (
        <div className="result-pop mt-8 text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold"
            style={{
              background: isWin
                ? "linear-gradient(135deg,rgba(212,175,55,0.15),rgba(212,175,55,0.05))"
                : "rgba(255,255,255,0.05)",
              border: `1.5px solid ${isWin ? "#d4af37" : "rgba(255,255,255,0.15)"}`,
              color: isWin ? "#f5e08a" : "rgba(255,255,255,0.5)",
              boxShadow: isWin ? "0 0 20px rgba(212,175,55,0.2)" : "none",
            }}
          >
            {isWin && <PartyPopper className="h-4 w-4" />}
            {winner.type === "cash"
              ? `🎉 You won ${fmtN(winner.amount)}!`
              : winner.type === "bonus_task"
              ? "✨ Bonus task unlocked"
              : "No reward this time — try again tomorrow"}
          </div>
        </div>
      )}

      <SpinConfetti active={celebrate && isWin} />
    </div>
  );
}

function SpinConfetti({ active }: { active: boolean }) {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.9,
      duration: 2.0 + Math.random() * 1.8,
      size: 5 + Math.random() * 6,
      color: ["#d4af37","#f5e08a","#fbbf24","#a97f1f","#fff","#10b981"][i % 6],
      dx: (Math.random() - 0.5) * 150,
    }))
  );
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-10 z-30 h-72 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.size, height: p.size * 0.55,
            background: p.color,
            ["--dx" as any]: `${p.dx}px`,
            animation: `confetti-fall ${p.duration}s cubic-bezier(0.25,0.6,0.4,1) ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
