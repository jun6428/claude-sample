'use client';

import React, { useEffect, useState } from 'react';
import { PLAYER_COLOR_MAP } from '@/lib/types';

const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

function DieFace({ value, size = 48 }: { value: number; size?: number }) {
  const pips = PIP_POSITIONS[value] ?? [];
  const r = 0.09;
  return (
    <svg width={size} height={size} viewBox="0 0 1 1">
      <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.18" ry="0.18"
        fill="#f8f4e8" stroke="#c8b89a" strokeWidth="0.04" />
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={value === 1 ? '#DC2626' : '#2d1a0e'} />
      ))}
    </svg>
  );
}

interface DiceDisplayProps {
  diceRolled: boolean;
  diceValues: [number, number];
  players?: { name: string; color: string }[];
  lastBurst?: Record<string, number>;
}

export default function DiceDisplay({ diceRolled, diceValues, players, lastBurst }: DiceDisplayProps) {
  const [displayValues, setDisplayValues] = useState<[number, number]>(diceValues);
  const [isShuffling, setIsShuffling] = useState(false);

  useEffect(() => {
    if (!diceRolled) {
      setDisplayValues([1, 1]);
      return;
    }
    setIsShuffling(true);
    const start = Date.now();
    const interval = setInterval(() => {
      setDisplayValues([
        Math.ceil(Math.random() * 6) as 1|2|3|4|5|6,
        Math.ceil(Math.random() * 6) as 1|2|3|4|5|6,
      ]);
      if (Date.now() - start >= 300) {
        clearInterval(interval);
        setDisplayValues(diceValues);
        setIsShuffling(false);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [diceRolled]);

  const total = diceValues[0] + diceValues[1];

  const burstEntries = (lastBurst && players)
    ? Object.entries(lastBurst).map(([idx, amount]) => {
        const p = players[Number(idx)];
        return { name: p?.name ?? `P${idx}`, color: PLAYER_COLOR_MAP[p?.color] ?? '#fff', amount };
      })
    : [];

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="flex gap-2">
        {diceRolled ? (
          <>
            <DieFace value={displayValues[0]} />
            <DieFace value={displayValues[1]} />
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-gray-600 opacity-40" />
            <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-gray-600 opacity-40" />
          </>
        )}
      </div>
      {diceRolled && !isShuffling && (
        total === 7 ? (
          <div className="flex flex-col items-center gap-1">
            <style>{`@keyframes robberPop { 0%{transform:scale(0.3);opacity:0} 70%{transform:scale(1.2)} 100%{transform:scale(1);opacity:1} } @keyframes burstPulse { 0%,100%{opacity:1} 50%{opacity:0.6} }`}</style>
            {/* 強盗は7が出たら常に上に表示 */}
            <div className="flex items-center gap-1.5" style={{ animation: 'robberPop 0.4s ease-out' }}>
              <svg width={28} height={28} viewBox="0 0 32 32">
                <ellipse cx={16} cy={20} rx={8} ry={11} fill="#EF4444" />
                <circle cx={16} cy={8} r={6} fill="#DC2626" />
                <circle cx={13} cy={7} r={1.5} fill="white" />
                <circle cx={19} cy={7} r={1.5} fill="white" />
              </svg>
              <span className="text-sm font-bold text-red-400">強盗!</span>
            </div>
            {/* バースト発生時のみ：その下に追加表示 */}
            {burstEntries.length > 0 && (
              <div style={{ animation: 'burstPulse 1s ease-in-out 3' }} className="flex flex-col items-center gap-0.5 w-full">
                <span className="text-sm font-bold text-orange-400 tracking-wide">バースト!</span>
                <div className="flex flex-col gap-0.5 w-full">
                  {burstEntries.map(({ name, color, amount }, i) => (
                    <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/20">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs text-gray-400 truncate flex-1">{name}</span>
                      <span className="text-xs text-orange-400">-{amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <svg width={32} height={32} viewBox="0 0 32 32">
            <circle cx={16} cy={16} r={14} fill="white" stroke="#ccc" strokeWidth={1} />
            <text x={16} y={21} textAnchor="middle" fontSize={13} fontWeight="bold"
              fill={total === 6 || total === 8 ? '#DC2626' : '#1F2937'}
            >
              {total}
            </text>
          </svg>
        )
      )}
    </div>
  );
}
