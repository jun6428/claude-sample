'use client';

import React from 'react';
import { HexTileData, RESOURCE_COLORS, RESOURCE_LABELS } from '@/lib/types';

interface HexTileProps {
  hex: HexTileData;
  cx: number;
  cy: number;
  size: number;
  hasRobber: boolean;
  isHighlighted?: boolean;
  onClick?: () => void;
}

function hexPoints(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    const x = cx + size * Math.cos(angleRad);
    const y = cy + size * Math.sin(angleRad);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(' ');
}

export default function HexTile({ hex, cx, cy, size, hasRobber, isHighlighted, onClick }: HexTileProps) {
  const fillColor = RESOURCE_COLORS[hex.resource] || '#ccc';
  const points = hexPoints(cx, cy, size);
  const label = RESOURCE_LABELS[hex.resource] || hex.resource;

  return (
    <g onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <polygon
        points={points}
        fill={fillColor}
        stroke={isHighlighted ? '#ffffff' : '#654321'}
        strokeWidth={isHighlighted ? 3 : 1.5}
        opacity={0.9}
      />
      {/* Resource label */}
      <text
        x={cx}
        y={cy - 12}
        textAnchor="middle"
        fontSize={9}
        fill="#333"
        fontWeight="bold"
        pointerEvents="none"
      >
        {label}
      </text>
      {/* Number token */}
      {hex.number !== null && (
        <>
          <circle cx={cx} cy={cy + 8} r={14} fill="white" stroke="#ccc" strokeWidth={1} />
          <text
            x={cx}
            y={cy + 13}
            textAnchor="middle"
            fontSize={13}
            fontWeight="bold"
            fill={hex.number === 6 || hex.number === 8 ? '#DC2626' : '#1F2937'}
            pointerEvents="none"
          >
            {hex.number}
          </text>
          {/* Probability dots */}
          <text
            x={cx}
            y={cy + 24}
            textAnchor="middle"
            fontSize={7}
            fill={hex.number === 6 || hex.number === 8 ? '#DC2626' : '#6B7280'}
            pointerEvents="none"
          >
            {'.'.repeat(
              hex.number === 2 || hex.number === 12 ? 1 :
              hex.number === 3 || hex.number === 11 ? 2 :
              hex.number === 4 || hex.number === 10 ? 3 :
              hex.number === 5 || hex.number === 9 ? 4 : 5
            )}
          </text>
        </>
      )}
      {/* Robber */}
      {hasRobber && (
        <g pointerEvents="none">
          <ellipse cx={cx} cy={cy - 2} rx={10} ry={14} fill="#1F2937" opacity={0.85} />
          <circle cx={cx} cy={cy - 14} r={6} fill="#374151" />
        </g>
      )}
    </g>
  );
}
