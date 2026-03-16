'use client';

import React from 'react';
import { ResourceType, RESOURCE_COLORS, RESOURCE_LABELS } from '@/lib/types';

const RESOURCES: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const MAX = 19;

interface BankDisplayProps {
  bank: Record<ResourceType, number>;
}

export default function BankDisplay({ bank }: BankDisplayProps) {
  return (
    <div className="flex flex-col gap-1 select-none">
      {RESOURCES.map((r) => {
        const count = bank[r] ?? 0;
        const filled = count / MAX;
        const low = count <= 3;
        return (
          <div key={r} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: RESOURCE_COLORS[r] }}
            />
            <div className="w-14 h-2 rounded-full bg-black/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${filled * 100}%`,
                  backgroundColor: low ? '#F87171' : RESOURCE_COLORS[r],
                }}
              />
            </div>
            <span
              className="text-xs font-mono w-4 text-right"
              style={{ color: low ? '#F87171' : '#9CA3AF' }}
            >
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
