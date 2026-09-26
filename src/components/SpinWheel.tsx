import { useEffect, useMemo, useRef, useState } from "react";
import { PartyPopper, RotateCw } from "lucide-react";
import { fmtN } from "./ui";
import type { SpinSegment } from "../lib/types";

/* Premium daily-spin wheel.
 * The result is decided server-side BEFORE this component animates — the
 * wheel only visualizes the already-determined segment. Geometry: segment
 * i occupies angles [i*arc, (i+1)*arc) measured clockwise from 12 o'clock
 * (the fixed pointer). */

interface Props {
  segments: SpinSegment[];
  spinning: boolean;
  winningIndex: number | null; // set once the server responds
  onSpin: () => void;
  disabled?: boolean;
}

const START_ROTATION = -8; // slight rest tilt so the wheel feels natural

/** Final wheel rotation (deg) that lands `index` under the top pointer,
 *  with a random jitter inside the segment so repeats don't look robotic. */
function targetRotation(index: number, count: number, currentRotation: number): number {
  const arc = 360 / count;
  const jitter = (Math.random() - 0.5) * arc * 0.62;
  // segment centre sits at index*arc + arc/2; pointer is at 0deg (top),
  // so the wheel must rotate -(centre) + jitter. Add full turns so every
  // result travels clockwise from the wheel's current position.
  const base = -(index * arc + arc / 2) + jitter;
  const delta = (((base - currentRotation) % 360) + 360) % 360;
  return currentRotation + 360 * 6 + delta;
}

export default function SpinWheel({ segments, spinning, winningIndex, onSpin, disabled }: Props) {
  const count = Math.max(1, segments.length);
  const arc = 360 / count;
  const [rotation, setRotation] = useState(START_ROTATION);
  const [glow, setGlow] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const rotationRef = useRef(START_ROTATION);

  /* Reset celebration when a new spin starts. */
  useEffect(() => {
    if (spinning) setCelebrate(false);
  }, [spinning]);

  /* When the server result arrives, spin to the winning segment. */
  useEffect(() => {
    if (winningIndex === null) return;
    setGlow(true);
    const target = targetRotation(winningIndex, count, rotationRef.current);
    rotationRef.current = target;
    setRotation(target);
    const t = window.setTimeout(() => {
      setGlow(false);
      setCelebrate(true);
    }, 5200); // matches the CSS transition duration
    return () => window.clearTimeout(t);
  }, [winningIndex, count]);

  /* Segment paths (SVG, 200x200 viewBox, centre 100,100, r 94). */
  const paths = useMemo(() => {
    return segments.map((seg, i) => {
      const a0 = (i * arc - 90) * (Math.PI / 180);
      const a1 = ((i + 1) * arc - 90) * (Math.PI / 180);
      const x0 = 100 + 94 * Math.cos(a0), y0 = 100 + 94 * Math.sin(a0);
      const x1 = 100 + 94 * Math.cos(a1), y1 = 100 + 94 * Math.sin(a1);
      const large = arc > 180 ? 1 : 0;
      const d = `M 100 100 L ${x0.toFixed(2)} ${y0.toFixed(2)} A 94 94 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
      const mid = (i * arc + arc / 2 - 90) * (Math.PI / 180);
      const labelX = 100 + 62 * Math.cos(mid), labelY = 100 + 62 * Math.sin(mid);
      return { seg, d, labelX, labelY, mid, i };
    });
  }, [segments, arc]);

  const winner = winningIndex !== null ? segments[winningIndex] : null;
  const isWin = !!winner && winner.type !== "none";

  return (
    <WheelShell
      paths={paths} rotation={rotation} spinning={spinning}
      glow={glow} celebrate={celebrate} winner={winner} isWin={isWin}
      onSpin={onSpin} disabled={disabled}
    />
  );
}

/* ================= presentation shell ================= */

function WheelShell({
  paths, rotation, spinning, glow, celebrate, winner, isWin, onSpin, disabled,
}: any) {
  return (
    <div className="relative mx-auto w-full max-w-[380px] select-none">
      {/* ambient glow while spinning / celebrating */}
      <div
        className={`pointer-events-none absolute -inset-6 rounded-full blur-2xl transition-opacity duration-700 ${
          glow || celebrate ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.25) 0%, rgba(212,175,55,0.12) 45%, transparent 70%)" }}
      />

      {/* fixed pointer */}
      <div className="absolute left-1/2 top-[-14px] z-20 -translate-x-1/2">
        <div
          className={`h-0 w-0 border-x-[11px] border-t-[20px] border-x-transparent transition-transform duration-300 ${
            glow ? "-translate-y-1" : ""
          }`}
          style={{ borderTopColor: "#d4af37", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))" }}
        />
        <div className="mx-auto -mt-1 h-3 w-3 rounded-full border-2 border-white bg-[#d4af37] shadow" />
      </div>

      {/* wheel */}
      <div
        className={`relative rounded-full p-[10px] transition-shadow duration-700 ${
          glow ? "shadow-[0_0_50px_rgba(212,175,55,0.45)]" : "shadow-[0_18px_45px_rgba(15,23,42,0.25)]"
        }`}
        style={{ background: "conic-gradient(from 0deg, #d4af37, #f5e08a, #d4af37, #a97f1f, #d4af37)" }}
      >
        <div className="relative overflow-hidden rounded-full bg-slate-900 shadow-inner">
          <svg
            viewBox="0 0 200 200"
            className="block h-auto w-full"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: "transform 5.2s cubic-bezier(0.12, 0.8, 0.16, 1)",
            }}
          >
            {paths.map(({ seg, d, labelX, labelY, mid, i }: any) => (
              <g key={i}>
                <path d={d} fill={seg.color} stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
                <text
                  x={labelX} y={labelY} fill="#ffffff" fontSize="9" fontWeight="700"
                  textAnchor="middle" dominantBaseline="middle"
                  transform={`rotate(${(mid * 180) / Math.PI + 90} ${labelX} ${labelY})`}
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.25)", strokeWidth: 2 }}
                >
                  {seg.label}
                </text>
              </g>
            ))}
            <circle cx="100" cy="100" r="26" fill="#0f172a" stroke="#d4af37" strokeWidth="2" />
          </svg>

          {/* central SPIN button */}
          <button
            onClick={onSpin}
            disabled={disabled || spinning}
            className="absolute left-1/2 top-1/2 z-10 flex h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-lg ring-2 ring-[#d4af37] transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
          >
            {spinning ? (
              <RotateCw className="h-5 w-5 animate-spin" />
            ) : (
              <span className="text-[11px] font-extrabold tracking-widest">SPIN</span>
            )}
          </button>
        </div>
      </div>

      {/* result celebration */}
      {celebrate && winner && (
        <div className="fade-up mt-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            {isWin ? <PartyPopper className="h-3.5 w-3.5" /> : null}
            {winner.type === "cash"
              ? `You won ${fmtN(winner.amount)} — added to your pending balance`
              : winner.type === "bonus_task"
              ? "Bonus task unlocked — check Earn"
              : "No reward this time — try again tomorrow"}
          </div>
        </div>
      )}

      <SpinConfetti active={celebrate && isWin} />
    </div>
  );
}

/* Lightweight DOM confetti — a handful of gold/emerald pieces, no deps. */
function SpinConfetti({ active }: { active: boolean }) {
  const [pieces] = useState(() =>
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.2 + Math.random() * 1.6,
      size: 5 + Math.random() * 5,
      color: ["#d4af37", "#f5e08a", "#10b981", "#059669"][i % 4],
      drift: (Math.random() - 0.5) * 120,
    }))
  );
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-10 z-30 h-64 overflow-hidden">
      <style>{`
        @keyframes spin-confetti-fall {
          0% { transform: translate(0, -20px) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--drift), 240px) rotate(540deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            ["--drift" as any]: `${p.drift}px`,
            animation: `spin-confetti-fall ${p.duration}s cubic-bezier(0.25,0.6,0.4,1) ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}