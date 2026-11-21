import { useEffect, useMemo, useRef, useState } from "react";
import { PartyPopper, RotateCw, Sparkles } from "lucide-react";
import { fmtN } from "./ui";
import type { SpinSegment } from "../lib/types";

interface Props {
  segments: SpinSegment[];
  spinning: boolean;
  winningIndex: number | null;
  onSpin: () => void;
  disabled?: boolean;
  onAnimationEnd?: () => void;
}

const CX = 200;
const CY = 214;
const FACE_RADIUS = 158;
const FIRST_ROTATION = -10;
const SPIN_DURATION_MS = 5400;

function targetRotation(index: number, count: number, current: number): number {
  const arc = 360 / count;
  const jitter = (Math.random() - 0.5) * arc * 0.5;
  const center = -(index * arc + arc / 2) + jitter;
  const delta = (((center - current) % 360) + 360) % 360;
  return current + 360 * 6 + delta;
}

function validColor(color: string): string {
  return /^#[\da-f]{6}$/i.test(color) ? color : "#16a34a";
}

function shade(hex: string, factor: number): string {
  const color = validColor(hex).slice(1);
  const channel = (offset: number) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * factor);
  return `#${[0, 2, 4].map((offset) => channel(offset).toString(16).padStart(2, "0")).join("")}`;
}

function segmentLabel(segment: SpinSegment): string {
  if (segment.label.toUpperCase().includes("JACKPOT")) return "JACKPOT";
  if (segment.type === "none") return "TRY AGAIN";
  if (segment.type === "bonus_task") return "BONUS";
  return segment.amount >= 1000
    ? `₦${Number.isInteger(segment.amount / 1000) ? segment.amount / 1000 : (segment.amount / 1000).toFixed(1)}K`
    : `₦${segment.amount.toLocaleString("en-NG")}`;
}

export default function SpinWheel({ segments, spinning, winningIndex, onSpin, disabled, onAnimationEnd }: Props) {
  const count = Math.max(1, segments.length);
  const arc = 360 / count;
  const [rotation, setRotation] = useState(FIRST_ROTATION);
  const [celebrate, setCelebrate] = useState(false);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const rotationRef = useRef(FIRST_ROTATION);

  useEffect(() => {
    if (spinning) {
      setCelebrate(false);
      setFlashIndex(null);
    }
  }, [spinning]);

  useEffect(() => {
    if (winningIndex === null) return;
    const nextRotation = targetRotation(winningIndex, count, rotationRef.current);
    rotationRef.current = nextRotation;
    setRotation(nextRotation);
    const timeout = window.setTimeout(() => {
      setFlashIndex(winningIndex);
      setCelebrate(true);
      onAnimationEnd?.();
    }, SPIN_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [winningIndex, count]);

  const sectors = useMemo(() => segments.map((segment, index) => {
    const start = (index * arc - 90) * Math.PI / 180;
    const end = ((index + 1) * arc - 90) * Math.PI / 180;
    const x0 = CX + FACE_RADIUS * Math.cos(start);
    const y0 = CY + FACE_RADIUS * Math.sin(start);
    const x1 = CX + FACE_RADIUS * Math.cos(end);
    const y1 = CY + FACE_RADIUS * Math.sin(end);
    const path = `M ${CX} ${CY} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${FACE_RADIUS} ${FACE_RADIUS} 0 ${arc > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;

    const middle = index * arc + arc / 2 - 90;
    const radians = middle * Math.PI / 180;
    const labelRadius = count > 9 ? 112 : 106;
    const x = CX + labelRadius * Math.cos(radians);
    const y = CY + labelRadius * Math.sin(radians);
    const angle = middle > 90 || middle < -90 ? middle + 180 : middle;
    const color = validColor(segment.color);

    return {
      segment,
      index,
      path,
      x,
      y,
      angle,
      color,
      darkColor: shade(color, 0.7),
      label: segmentLabel(segment),
    };
  }), [segments, arc, count]);

  const winner = winningIndex !== null ? segments[winningIndex] : null;
  const isWin = !!winner && winner.type !== "none";
  const isJackpot = !!winner && winner.label.toUpperCase().includes("JACKPOT");
  const isLoss = !!winner && winner.type === "none";

  return (
    <div className="relative mx-auto w-full max-w-[470px] select-none">
      <style>{STYLES}</style>
      <div className="pointer-events-none absolute inset-[14%] rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-[24%] rounded-full bg-cyan-300/10 blur-2xl" />

      <svg
        viewBox="0 0 400 430"
        role="img"
        aria-label={`Prize wheel with ${count} segments`}
        className="relative z-10 block h-auto w-full overflow-visible"
        style={{
          filter: spinning
            ? "drop-shadow(0 18px 34px rgba(16, 185, 129, .24))"
            : "drop-shadow(0 18px 28px rgba(2, 6, 23, .4))",
          transition: "filter .45s ease",
        }}
      >
        <defs>
          <linearGradient id="wheel-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f5fffb" />
            <stop offset=".16" stopColor="#6ee7b7" />
            <stop offset=".46" stopColor="#0f766e" />
            <stop offset=".76" stopColor="#082f49" />
            <stop offset="1" stopColor="#020617" />
          </linearGradient>
          <radialGradient id="wheel-hub" cx="30%" cy="22%" r="80%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".36" stopColor="#eafff6" />
            <stop offset="1" stopColor="#91e8c4" />
          </radialGradient>
          <radialGradient id="wheel-gloss" cx="30%" cy="16%" r="82%">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".18" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id="wheel-label-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#020617" floodOpacity=".55" />
          </filter>
        </defs>

        {/* Outer illuminated chassis */}
        <circle cx={CX} cy={CY + 3} r="185" fill="#020617" opacity=".8" />
        <circle cx={CX} cy={CY} r="183" fill="url(#wheel-rim)" />
        <circle cx={CX} cy={CY} r="178" fill="#0b1220" stroke="#d1fae5" strokeOpacity=".7" strokeWidth="1.5" />
        <circle cx={CX} cy={CY} r="168" fill="#111c2b" stroke="#6ee7b7" strokeOpacity=".45" strokeWidth="1" />

        {/* Fine luminous indexing around the rim */}
        {Array.from({ length: 36 }, (_, index) => {
          const angle = (index * 10 - 90) * Math.PI / 180;
          const radius = 174;
          return (
            <circle
              key={`led-${index}`}
              cx={CX + radius * Math.cos(angle)}
              cy={CY + radius * Math.sin(angle)}
              r={index % 3 === 0 ? 2.1 : 1.1}
              fill={index % 3 === 0 ? "#d1fae5" : "#5eead4"}
              opacity={index % 3 === 0 ? ".95" : ".48"}
            />
          );
        })}

        {/* Face and prize sectors rotate together; the pointer remains fixed. */}
        <g
          style={{
            transformOrigin: `${CX}px ${CY}px`,
            transform: `rotate(${rotation}deg)`,
            transition: `transform ${SPIN_DURATION_MS}ms cubic-bezier(.12,.82,.14,1)`,
          }}
        >
          <circle cx={CX} cy={CY} r={FACE_RADIUS + 1} fill="#07111d" />
          {sectors.map(({ segment, index, path, color, darkColor, label, x, y, angle }) => (
            <g key={index}>
              <defs>
                <linearGradient id={`wheel-sector-${index}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor={color} />
                  <stop offset="1" stopColor={darkColor} />
                </linearGradient>
              </defs>
              <path
                d={path}
                fill={`url(#wheel-sector-${index})`}
                stroke="#ecfdf5"
                strokeOpacity=".82"
                strokeWidth="2"
              />
              {flashIndex === index && (
                <path d={path} fill="#ffffff" opacity=".5" className="spin-sector-flash" />
              )}
              <text
                x={x}
                y={y}
                fill="#ffffff"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={count > 9 ? "9.5" : "12"}
                fontWeight="900"
                fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
                letterSpacing={label.length > 7 ? ".2" : ".7"}
                filter="url(#wheel-label-shadow)"
                transform={`rotate(${angle} ${x} ${y})`}
              >
                {label}
              </text>
              {segment.type === "cash" && segment.amount > 0 && (
                <circle cx={x} cy={y + 12} r="1.5" fill="#ecfdf5" opacity=".8" />
              )}
            </g>
          ))}
          <circle cx={CX} cy={CY} r={FACE_RADIUS} fill="url(#wheel-gloss)" pointerEvents="none" />
          <circle cx={CX} cy={CY} r={FACE_RADIUS} fill="none" stroke="#ecfdf5" strokeOpacity=".76" strokeWidth="2" />
        </g>

        {/* Fixed pointer and hub hardware */}
        <path d="M 183 32 Q 200 20 217 32 L 211 66 Q 200 78 189 66 Z" fill="#020617" opacity=".72" />
        <path d="M 183 27 Q 200 15 217 27 L 210 61 Q 200 71 190 61 Z" fill="#f8fafc" stroke="#a7f3d0" strokeWidth="2" />
        <path d="M 191 30 Q 200 24 209 30 L 205 49 Q 200 56 195 49 Z" fill="#059669" />
        <circle cx={CX} cy={CY} r="43" fill="#06121e" stroke="#d1fae5" strokeWidth="2" />
        <circle cx={CX} cy={CY} r="36" fill="url(#wheel-hub)" stroke="#ffffff" strokeWidth="2" />
        <circle cx={CX} cy={CY} r="29" fill="none" stroke="#0f766e" strokeOpacity=".38" strokeWidth="1" />
      </svg>

      <button
        type="button"
        onClick={onSpin}
        disabled={disabled || spinning}
        aria-label={spinning ? "Wheel is spinning" : disabled ? "Daily spin is on cooldown" : "Spin the wheel"}
        className="absolute left-1/2 top-[49.8%] z-20 flex h-[78px] w-[78px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-slate-900 shadow-[0_6px_18px_rgba(2,6,23,.35)] transition duration-200 hover:scale-105 hover:shadow-[0_0_26px_rgba(110,231,183,.55)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-80"
        style={{ background: "linear-gradient(145deg, #ffffff 4%, #d1fae5 100%)" }}
      >
        <RotateCw className={`h-5 w-5 text-emerald-700 ${spinning ? "animate-spin" : ""}`} />
        <span className="mt-0.5 text-[10px] font-black tracking-[.18em]">
          {spinning ? "GO" : disabled ? "WAIT" : "SPIN"}
        </span>
      </button>

      {celebrate && winner && (
        <div className="spin-result-pop relative z-20 mx-auto -mt-1 flex w-fit max-w-[92%] items-center gap-2.5 rounded-2xl border border-white/15 bg-slate-950/85 px-5 py-3 text-sm font-bold text-white shadow-xl backdrop-blur-xl">
          {isWin ? <PartyPopper className="h-4 w-4 shrink-0 text-amber-300" /> : <Sparkles className="h-4 w-4 shrink-0 text-slate-300" />}
          <span>
            {winner.type === "cash" && winner.amount > 0
              ? `${isJackpot ? "Jackpot! " : "You won "}${fmtN(winner.amount)}${isJackpot ? "!" : ""}`
              : winner.type === "bonus_task"
              ? "Bonus task unlocked"
              : isLoss
              ? "Better luck next time"
              : "No reward this time"}
          </span>
        </div>
      )}

      {isJackpot && celebrate && <SpinConfetti />}
    </div>
  );
}

const STYLES = `
  @keyframes spin-sector-flash { 0%,100%{opacity:0} 50%{opacity:.85} }
  .spin-sector-flash { animation: spin-sector-flash .42s ease-in-out 3; }
  @keyframes spin-result-pop { 0%{opacity:0;transform:translateY(8px) scale(.94)} 100%{opacity:1;transform:translateY(0) scale(1)} }
  .spin-result-pop { animation: spin-result-pop .42s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes spin-confetti-fall { 0%{transform:translate(0,-10px) rotate(0);opacity:1} 100%{transform:translate(var(--dx),260px) rotate(500deg);opacity:0} }
  @media (prefers-reduced-motion: reduce) {
    .spin-sector-flash,.spin-result-pop { animation-duration:.01ms !important; }
  }
`;

function SpinConfetti() {
  const [pieces] = useState(() => Array.from({ length: 36 }, (_, index) => ({
    id: index,
    left: Math.random() * 100,
    delay: Math.random() * .5,
    duration: 1.5 + Math.random(),
    size: 5 + Math.random() * 6,
    color: ["#6ee7b7", "#fbbf24", "#ffffff", "#34d399", "#c4b5fd"][index % 5],
    dx: (Math.random() - .5) * 180,
  })));
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-8 z-30 h-72 overflow-hidden">
      {pieces.map((piece) => (
        <span key={piece.id} className="absolute rounded-sm"
          style={{
            left: `${piece.left}%`, width: piece.size, height: piece.size * .55,
            background: piece.color,
            ["--dx" as string]: `${piece.dx}px`,
            animation: `spin-confetti-fall ${piece.duration}s ease-in ${piece.delay}s forwards`,
          }} />
      ))}
    </div>
  );
}
