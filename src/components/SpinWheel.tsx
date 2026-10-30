import { useEffect, useMemo, useRef, useState } from "react";
import { PartyPopper, RotateCw } from "lucide-react";
import { fmtN } from "./ui";
import type { SpinSegment } from "../lib/types";

/* ═══════════════════════════════════════════════════════════════════════
   SPIN WHEEL — clean, minimal, professional
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

const SEG_RED    = "#C8161D";
const SEG_YELLOW = "#FFB400";
const SEG_RED_DARK    = "#a01218";
const SEG_YELLOW_DARK = "#cc9000";

export default function SpinWheel({ segments, spinning, winningIndex, onSpin, disabled, onAnimationEnd }: Props) {
  const count = Math.max(1, segments.length);
  const arc = 360 / count;
  const [rotation, setRotation] = useState(START_ROTATION);
  const [glow, setGlow] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const rotRef = useRef(START_ROTATION);

  useEffect(() => { if (spinning) { setCelebrate(false); setFlashIndex(null); } }, [spinning]);

  useEffect(() => {
    if (winningIndex === null) return;
    setGlow(true);
    const target = targetRotation(winningIndex, count, rotRef.current);
    rotRef.current = target;
    setRotation(target);
    const t = window.setTimeout(() => {
      setGlow(false);
      setFlashIndex(winningIndex);
      setCelebrate(true);
      onAnimationEnd?.();
    }, 5200);
    return () => window.clearTimeout(t);
  }, [winningIndex, count]);

  const paths = useMemo(() => segments.map((seg, i) => {
    const isRed = i % 2 === 0;
    const fill      = isRed ? SEG_RED    : SEG_YELLOW;
    const fillDark  = isRed ? SEG_RED_DARK : SEG_YELLOW_DARK;
    const textColor = isRed ? "#fff"     : "#7a3e00";

    // SVG centre and radius
    const cx = 180, cy = 180, r = 148;
    const a0 = (i * arc - 90) * (Math.PI / 180);
    const a1 = ((i + 1) * arc - 90) * (Math.PI / 180);
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = arc > 180 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;

    // Label centred at 55% radius, oriented radially outward
    const mid = (i * arc + arc / 2 - 90) * (Math.PI / 180);
    const labelR = 90;
    const labelX = cx + labelR * Math.cos(mid);
    const labelY = cy + labelR * Math.sin(mid);
    // rotate text so it reads outward along the spoke
    const textRotate = (mid * 180) / Math.PI + 90;

    const labelText = segLabel(seg);
    const isJP = labelText === "JACKPOT";

    return { seg, d, labelX, labelY, textRotate, fill, fillDark, textColor, isJP, i, labelText };
  }), [segments, arc]);

  const winner = winningIndex !== null ? segments[winningIndex] : null;
  const isWin   = !!winner && winner.type !== "none";
  const isJackpot = !!winner && winner.label.toUpperCase().includes("JACKPOT");
  const isLose  = !!winner && winner.type === "none";

  return (
    <div className="relative mx-auto w-full max-w-[380px] select-none">
      <style>{STYLES}</style>

      {/* Downward pointer ▼ — sits above the SVG, centred, pointing down */}
      <div
        className="relative z-20 flex justify-center"
        style={{ marginBottom: "-14px" }}
      >
        <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
          <polygon
            points="14,18 2,2 26,2"
            fill="#d4af37"
            stroke="#a97f1f"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <polygon points="14,15 5,4 23,4" fill="rgba(255,255,255,0.5)" />
        </svg>
      </div>

      {/* SVG wheel */}
      <svg
        viewBox="0 0 360 360"
        className="relative z-10 block w-full h-auto"
        style={{
          filter: glow
            ? "drop-shadow(0 0 18px rgba(200,22,29,0.45)) drop-shadow(0 8px 24px rgba(0,0,0,0.18))"
            : "drop-shadow(0 6px 20px rgba(0,0,0,0.15))",
          transition: "filter 0.7s",
        }}
      >
        <defs>
          {paths.map(({ fill, fillDark, i }) => (
            <radialGradient key={i} id={`sg${i}`} cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor={fill} />
              <stop offset="100%" stopColor={fillDark} />
            </radialGradient>
          ))}
          <radialGradient id="flashGrad" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hubGrad" cx="38%" cy="32%" r="75%">
            <stop offset="0%"   stopColor="#fff8dc" />
            <stop offset="30%"  stopColor="#f5e08a" />
            <stop offset="65%"  stopColor="#d4af37" />
            <stop offset="100%" stopColor="#8b6914" />
          </radialGradient>
          <radialGradient id="rimGrad" cx="0%" cy="0%" r="140%">
            <stop offset="0%"   stopColor="#fff8dc" />
            <stop offset="35%"  stopColor="#f0d060" />
            <stop offset="65%"  stopColor="#c9a020" />
            <stop offset="100%" stopColor="#8b6914" />
          </radialGradient>
        </defs>

        {/* Gold rim */}
        <circle cx="180" cy="180" r="158" fill="url(#rimGrad)" />
        <circle cx="180" cy="180" r="152" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <circle cx="180" cy="180" r="149" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />

        {/* Spinning group */}
        <g
          style={{
            transformOrigin: "180px 180px",
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 5.2s cubic-bezier(0.12,0.8,0.16,1)" : "none",
          }}
        >
          {paths.map(({ d, labelX, labelY, textRotate, textColor, isJP, i, labelText }) => (
            <g key={i}>
              <path d={d} fill={`url(#sg${i})`} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

              {/* Flash overlay */}
              {flashIndex === i && (
                <path d={d} fill="url(#flashGrad)"
                  style={{ animation: "seg-flash 0.4s ease-in-out 3" }} />
              )}

              {/* Label — no stroke, clean text */}
              <text
                x={labelX}
                y={labelY}
                fill={textColor}
                fontSize={isJP ? "12" : "10.5"}
                fontWeight="800"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="'Arial Black', 'Arial Bold', Arial, sans-serif"
                letterSpacing="0.3"
                transform={`rotate(${textRotate} ${labelX} ${labelY})`}
              >
                {labelText}
              </text>
            </g>
          ))}

          {/* Divider lines between segments */}
          <circle cx="180" cy="180" r="147" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        </g>

        {/* Hub */}
        <circle cx="180" cy="180" r="34" fill="url(#hubGrad)"
          style={{ filter: "drop-shadow(0 0 5px rgba(212,175,55,0.5))" }} />
        <circle cx="180" cy="180" r="27" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <circle cx="180" cy="180" r="20" fill="none" stroke="rgba(180,130,20,0.5)" strokeWidth="1" />
        <ellipse cx="175" cy="172" rx="9" ry="6" fill="rgba(255,255,255,0.28)" />

        {/* Spin button overlay */}
        <foreignObject x="146" y="146" width="68" height="68">
          <button
            onClick={onSpin}
            disabled={disabled || spinning}
            style={{
              width: "68px", height: "68px", borderRadius: "50%",
              background: "transparent", border: "none",
              cursor: disabled || spinning ? "not-allowed" : "pointer",
            }}
          />
        </foreignObject>

        {/* Hub label */}
        <text x="180" y="183" textAnchor="middle" dominantBaseline="middle"
          fill="#7a5c0e" fontSize="9" fontWeight="900"
          fontFamily="'Arial Black', Arial, sans-serif"
          letterSpacing="1.2"
          style={{ pointerEvents: "none" }}>
          {spinning ? "…" : "SPIN"}
        </text>
      </svg>

      {/* Spinning indicator on hub */}
      {spinning && (
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <RotateCw className="h-4 w-4 text-amber-800 animate-spin opacity-0" />
        </div>
      )}

      {/* Result banner */}
      {celebrate && winner && (
        <div className="result-pop mt-5 text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold"
            style={{
              background: isJackpot ? "#fefce8" : isWin ? "#fefce8" : "#f8fafc",
              border: `1.5px solid ${isJackpot ? "#d4af37" : isWin ? "#fbbf24" : "#e2e8f0"}`,
              color: isJackpot ? "#854d0e" : isWin ? "#92400e" : "#64748b",
            }}
          >
            {isWin && <PartyPopper className="h-4 w-4 flex-shrink-0" />}
            {winner.type === "cash" && winner.amount > 0
              ? isJackpot
                ? `🎉 JACKPOT! You won ${fmtN(winner.amount)}!`
                : `You won ${fmtN(winner.amount)}!`
              : winner.type === "bonus_task"
              ? "✨ Bonus task unlocked"
              : isLose
              ? "Better luck next time!"
              : "No reward — try again tomorrow"}
          </div>
        </div>
      )}

      {isJackpot && celebrate && <SpinConfetti />}
    </div>
  );
}

function segLabel(seg: SpinSegment): string {
  if (!seg) return "";
  const up = seg.label.toUpperCase();
  if (up.includes("JACKPOT")) return "JACKPOT";
  if (seg.type === "none") return "LOSE";
  if (seg.type === "cash" && seg.amount > 0) {
    const n = seg.amount;
    return n >= 1000 ? `${n / 1000}K` : String(n);
  }
  return seg.label.toUpperCase().slice(0, 6);
}

const STYLES = `
  @keyframes seg-flash {
    0%,100%{ opacity:0 }
    50%    { opacity:0.7 }
  }
  @keyframes result-pop {
    0%  { opacity:0; transform:translateY(8px) scale(0.95) }
    100%{ opacity:1; transform:translateY(0)   scale(1)    }
  }
  .result-pop { animation: result-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards; }
  @keyframes confetti-fall {
    0%  { transform:translate(0,-10px) rotate(0deg); opacity:1 }
    100%{ transform:translate(var(--dx),260px) rotate(520deg); opacity:0 }
  }
`;

function SpinConfetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      duration: 1.8 + Math.random() * 1.4,
      size: 5 + Math.random() * 6,
      color: ["#d4af37","#f5e08a","#C8161D","#FFB400","#fff","#ffd700"][i % 6],
      dx: (Math.random() - 0.5) * 180,
    }))
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-10 z-30 h-72 overflow-hidden">
      {pieces.map((p) => (
        <span key={p.id} className="absolute rounded-sm"
          style={{
            left: `${p.left}%`, width: p.size, height: p.size * 0.5,
            background: p.color,
            ["--dx" as any]: `${p.dx}px`,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }} />
      ))}
    </div>
  );
}
