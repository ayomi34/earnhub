import { useEffect, useMemo, useRef, useState } from "react";
import { PartyPopper, RotateCw } from "lucide-react";
import { fmtN } from "./ui";
import type { SpinSegment } from "../lib/types";

/* ═══════════════════════════════════════════════════════════════════════
   CASINO SPIN WHEEL
   – 10 segments, alternating #C8161D / #FFB400
   – 36 marquee bulbs with chase animation
   – Gold metallic hub, white-gold pointer at 12 o'clock
   – All spin logic untouched
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

/* Casino segment colors — driven by position index, not segment data color */
const SEG_RED    = "#C8161D";
const SEG_YELLOW = "#FFB400";
const SEG_RED_DARK    = "#9a1015";
const SEG_YELLOW_DARK = "#cc8f00";

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

  /* Build SVG path data for each segment */
  const paths = useMemo(() => segments.map((seg, i) => {
    const isRed = i % 2 === 0;
    const fill = isRed ? SEG_RED : SEG_YELLOW;
    const fillDark = isRed ? SEG_RED_DARK : SEG_YELLOW_DARK;
    const textColor = isRed ? SEG_YELLOW : SEG_RED;
    const isJackpot = seg.label.toUpperCase().includes("JACKPOT");

    const a0 = (i * arc - 90) * (Math.PI / 180);
    const a1 = ((i + 1) * arc - 90) * (Math.PI / 180);
    const r = 148;
    const cx = 220, cy = 220;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = arc > 180 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;

    const mid = (i * arc + arc / 2 - 90) * (Math.PI / 180);
    // Place text at ~65% radius
    const labelR = 100;
    const labelX = cx + labelR * Math.cos(mid);
    const labelY = cy + labelR * Math.sin(mid);
    const textRotate = (mid * 180) / Math.PI + 90;

    return { seg, d, labelX, labelY, textRotate, fill, fillDark, textColor, isJackpot, i };
  }), [segments, arc]);

  /* 36 bulbs evenly around rim at r=185 */
  const BULB_COUNT = 36;
  const BULB_R = 185;
  const bulbs = useMemo(() => Array.from({ length: BULB_COUNT }, (_, i) => {
    const angle = (i / BULB_COUNT) * 2 * Math.PI - Math.PI / 2;
    return {
      x: 220 + BULB_R * Math.cos(angle),
      y: 220 + BULB_R * Math.sin(angle),
      group: i % 3, // 3 groups for chase animation
    };
  }), []);

  const winner = winningIndex !== null ? segments[winningIndex] : null;
  const isWin = !!winner && winner.type !== "none";
  const isJackpot = !!winner && winner.label.toUpperCase().includes("JACKPOT");
  const isLose = !!winner && winner.type === "none";

  return (
    <div className="relative mx-auto w-full max-w-[420px] select-none">
      <style>{STYLES}</style>

      {/* Light rays behind wheel */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="casino-rays absolute inset-0" />
      </div>

      {/* Outer glow on win */}
      {(glow || celebrate) && (
        <div
          className="pointer-events-none absolute -inset-8 rounded-full blur-2xl z-0"
          style={{
            background: isJackpot
              ? "radial-gradient(circle, rgba(255,215,0,0.55) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(255,180,0,0.35) 0%, transparent 70%)",
            animation: "jackpot-glow 0.4s ease-in-out infinite alternate",
          }}
        />
      )}

      {/* SVG wheel */}
      <svg
        viewBox="0 0 440 440"
        className="relative z-10 block w-full h-auto drop-shadow-2xl"
        style={{ filter: glow ? "drop-shadow(0 0 32px rgba(255,180,0,0.8))" : "drop-shadow(0 16px 40px rgba(0,0,0,0.6))" }}
      >
        <defs>
          {/* Per-segment radial gradients */}
          {paths.map(({ fill, fillDark, i }) => (
            <radialGradient key={i} id={`seg${i}`} cx="30%" cy="30%" r="80%">
              <stop offset="0%" stopColor={fill} />
              <stop offset="100%" stopColor={fillDark} />
            </radialGradient>
          ))}

          {/* Flash gradient for winning segment */}
          <radialGradient id="flashGrad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>

          {/* Gold rim gradient */}
          <linearGradient id="goldRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#fff8dc" />
            <stop offset="20%"  stopColor="#f5e08a" />
            <stop offset="45%"  stopColor="#d4af37" />
            <stop offset="65%"  stopColor="#c9a020" />
            <stop offset="80%"  stopColor="#f5e08a" />
            <stop offset="100%" stopColor="#a97f1f" />
          </linearGradient>

          {/* Hub gradient */}
          <radialGradient id="hubGrad" cx="35%" cy="30%" r="75%">
            <stop offset="0%"   stopColor="#fff8dc" />
            <stop offset="25%"  stopColor="#f5e08a" />
            <stop offset="55%"  stopColor="#d4af37" />
            <stop offset="80%"  stopColor="#a97f1f" />
            <stop offset="100%" stopColor="#7a5c0e" />
          </radialGradient>

          {/* Hub inner */}
          <radialGradient id="hubInner" cx="40%" cy="35%" r="70%">
            <stop offset="0%"   stopColor="#f5e08a" />
            <stop offset="50%"  stopColor="#d4af37" />
            <stop offset="100%" stopColor="#8b6914" />
          </radialGradient>

          {/* Bulb glow filter */}
          <filter id="bulbGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          <filter id="bulbGlowOff" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Gold rim outer ring ── */}
        <circle cx="220" cy="220" r="174" fill="url(#goldRim)" />
        {/* Rim highlight top */}
        <circle cx="220" cy="220" r="174" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5"
          strokeDasharray="60 500" strokeDashoffset="-20" />
        {/* Rim inner edge */}
        <circle cx="220" cy="220" r="163" fill="none" stroke="rgba(180,130,20,0.6)" strokeWidth="1.5" />

        {/* ── Spinning group ── */}
        <g
          style={{
            transformOrigin: "220px 220px",
            transform: `rotate(${rotation}deg)`,
            transition: "transform 5.2s cubic-bezier(0.12,0.8,0.16,1)",
          }}
        >
          {/* Segments */}
          {paths.map(({ d, labelX, labelY, textRotate, textColor, isJackpot: isJP, i }) => (
            <g key={i}>
              <path
                d={d}
                fill={`url(#seg${i})`}
                stroke="rgba(0,0,0,0.25)"
                strokeWidth="1.5"
              />
              {/* Segment separator shine */}
              <path d={d} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />

              {/* Flash overlay on winning segment */}
              {flashIndex === i && (
                <path d={d} fill="url(#flashGrad)"
                  style={{ animation: "seg-flash 0.35s ease-in-out 3" }} />
              )}

              {/* Label */}
              <text
                x={labelX}
                y={labelY}
                fill={textColor}
                fontSize={isJP ? "13" : "11"}
                fontWeight="900"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="'Arial Black', Arial, sans-serif"
                letterSpacing="0.5"
                transform={`rotate(${textRotate} ${labelX} ${labelY})`}
                style={{
                  paintOrder: "stroke",
                  stroke: "rgba(0,0,0,0.6)",
                  strokeWidth: isJP ? 3.5 : 2.5,
                  textTransform: "uppercase",
                }}
              >
                {isJP ? "JACKPOT" : seg_label(segments[i])}
              </text>
            </g>
          ))}

          {/* Outer chrome ring on wheel face */}
          <circle cx="220" cy="220" r="147" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
          <circle cx="220" cy="220" r="145" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
        </g>

        {/* ── Marquee bulbs (outside spinning group, fixed on rim) ── */}
        {bulbs.map(({ x, y, group }, i) => (
          <g key={i}>
            {/* Bulb body */}
            <circle
              cx={x} cy={y} r="6.5"
              fill={celebrate && isJackpot ? "#fff" : "#ffeea0"}
              filter="url(#bulbGlow)"
              className={`bulb-group-${group}`}
              style={{
                animation: celebrate && isJackpot
                  ? `jackpot-flash 0.15s linear infinite`
                  : `bulb-chase-${group} 0.9s step-start infinite`,
              }}
            />
            {/* Bulb socket */}
            <circle cx={x} cy={y} r="4.5" fill="none" stroke="rgba(180,130,20,0.8)" strokeWidth="1" />
          </g>
        ))}

        {/* ── Hub ── */}
        <circle cx="220" cy="220" r="36" fill="url(#hubGrad)"
          style={{ filter: "drop-shadow(0 0 8px rgba(212,175,55,0.7))" }} />
        <circle cx="220" cy="220" r="30" fill="url(#hubInner)" />
        <circle cx="220" cy="220" r="22" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        <circle cx="220" cy="220" r="14" fill="none" stroke="rgba(180,130,20,0.6)" strokeWidth="1" />
        {/* Hub highlight */}
        <ellipse cx="215" cy="212" rx="10" ry="7" fill="rgba(255,255,255,0.25)" />

        {/* ── SPIN button overlay (transparent, clickable) ── */}
        <foreignObject x="186" y="186" width="68" height="68">
          <button
            onClick={onSpin}
            disabled={disabled || spinning}
            style={{
              width: "68px", height: "68px",
              borderRadius: "50%",
              background: "transparent",
              border: "none",
              cursor: disabled || spinning ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          />
        </foreignObject>

        {/* Hub SPIN text */}
        {!spinning ? (
          <text x="220" y="224" textAnchor="middle" dominantBaseline="middle"
            fill="#7a5c0e" fontSize="9" fontWeight="900" fontFamily="'Arial Black', Arial, sans-serif"
            letterSpacing="1.5"
            style={{ pointerEvents: "none" }}>
            SPIN
          </text>
        ) : (
          <text x="220" y="224" textAnchor="middle" dominantBaseline="middle"
            fill="#7a5c0e" fontSize="8" fontWeight="900" fontFamily="'Arial Black', Arial, sans-serif"
            style={{ pointerEvents: "none", animation: "hub-spin-text 1s linear infinite" }}>
            ⟳
          </text>
        )}

        {/* ── Pointer triangle at 12 o'clock ── */}
        <polygon
          points="220,36  210,58  230,58"
          fill="url(#goldRim)"
          stroke="#a97f1f"
          strokeWidth="1.5"
          style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
        />
        <polygon points="220,40  213,56  227,56" fill="rgba(255,255,255,0.6)" />
      </svg>

      {/* ── Result banner ── */}
      {celebrate && winner && (
        <div className="result-pop mt-6 text-center">
          {isJackpot && <SpinConfetti active />}
          <div
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black"
            style={{
              background: isJackpot
                ? "linear-gradient(135deg,#f5e08a,#d4af37)"
                : isWin
                ? "rgba(255,180,0,0.12)"
                : "rgba(0,0,0,0.06)",
              border: isJackpot
                ? "2px solid #a97f1f"
                : isWin
                ? "1.5px solid rgba(255,180,0,0.4)"
                : "1.5px solid rgba(0,0,0,0.1)",
              color: isJackpot ? "#7a5c0e" : isWin ? "#b87a00" : "#888",
              boxShadow: isJackpot ? "0 0 30px rgba(212,175,55,0.5)" : "none",
            }}
          >
            {isJackpot && <PartyPopper className="h-4 w-4" />}
            {winner.type === "cash" && winner.amount > 0
              ? isJackpot
                ? `🎉 JACKPOT! You won ${fmtN(winner.amount)}!`
                : `🎉 You won ${fmtN(winner.amount)}!`
              : winner.type === "bonus_task"
              ? "✨ Bonus task unlocked"
              : isLose
              ? "Better luck next time!"
              : "No reward — try again tomorrow"}
          </div>
        </div>
      )}
    </div>
  );
}

function seg_label(seg: SpinSegment): string {
  if (!seg) return "";
  const up = seg.label.toUpperCase();
  if (up.includes("JACKPOT")) return "JACKPOT";
  if (up.includes("LOSE") || seg.type === "none") return "LOSE";
  if (seg.type === "cash" && seg.amount > 0) {
    const n = seg.amount;
    return n >= 1000 ? `${n / 1000}K` : String(n);
  }
  return seg.label.toUpperCase().slice(0, 6);
}

/* ─── CSS keyframes ───────────────────────────────────────────────── */
const STYLES = `
  @keyframes bulb-chase-0 {
    0%,66%  { fill: #fff8c0; opacity: 1; }
    67%,100%{ fill: #c8960a; opacity: 0.35; }
  }
  @keyframes bulb-chase-1 {
    0%,33%  { fill: #c8960a; opacity: 0.35; }
    34%,66% { fill: #fff8c0; opacity: 1; }
    67%,100%{ fill: #c8960a; opacity: 0.35; }
  }
  @keyframes bulb-chase-2 {
    0%,66%  { fill: #c8960a; opacity: 0.35; }
    67%,100%{ fill: #fff8c0; opacity: 1; }
  }
  @keyframes jackpot-flash {
    0%,49%  { fill: #fff; opacity: 1; }
    50%,100%{ fill: #ffd700; opacity: 0.6; }
  }
  @keyframes jackpot-glow {
    from { opacity: 0.6; }
    to   { opacity: 1.0; }
  }
  @keyframes seg-flash {
    0%,100%{ opacity: 0; }
    50%    { opacity: 0.7; }
  }
  @keyframes result-pop {
    0%  { opacity:0; transform:translateY(10px) scale(0.92) }
    100%{ opacity:1; transform:translateY(0)    scale(1)    }
  }
  .result-pop { animation: result-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards; }
  .casino-rays {
    background: repeating-conic-gradient(
      rgba(255,200,50,0.07) 0deg 9deg,
      transparent 9deg 18deg
    );
    border-radius: 50%;
    transform: scale(1.4);
  }
  @keyframes hub-spin-text {
    from { transform: rotate(0deg); transform-box: fill-box; transform-origin: center; }
    to   { transform: rotate(360deg); transform-box: fill-box; transform-origin: center; }
  }
`;

function SpinConfetti({ active }: { active: boolean }) {
  const [pieces] = useState(() =>
    Array.from({ length: 48 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 1.8 + Math.random() * 1.6,
      size: 5 + Math.random() * 7,
      color: ["#d4af37","#f5e08a","#C8161D","#FFB400","#fff","#ffd700","#ff6b6b"][i % 7],
      dx: (Math.random() - 0.5) * 200,
    }))
  );
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-12 z-30 h-72 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.size, height: p.size * 0.5,
            background: p.color,
            ["--dx" as any]: `${p.dx}px`,
            animation: `confetti-fall ${p.duration}s cubic-bezier(0.25,0.6,0.4,1) ${p.delay}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%  { transform:translate(0,-20px) rotate(0deg);   opacity:1 }
          100%{ transform:translate(var(--dx),280px) rotate(540deg); opacity:0 }
        }
      `}</style>
    </div>
  );
}
