'use client';

import React from 'react';
import { GameAction, ResourceType } from '@/lib/types';
import { useGameStore } from '@/store/gameStore';

interface DevPanelProps {
  sendAction: (action: GameAction) => void;
}

const RESOURCE_TYPES: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export default function DevPanel({ sendAction }: DevPanelProps) {
  const gameId = useGameStore((s) => s.gameId);

  const handleSaveSnapshot = async () => {
    const res = await fetch(`http://localhost:8000/api/games/${gameId}/snapshot`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catan-${gameId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadSnapshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await fetch(`http://localhost:8000/api/games/${gameId}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: text,
    });
    window.location.reload();
  };

  return (
    <div className="border-t border-gray-700 pt-3 mt-3">
      <p className="text-xs text-gray-500 mb-2">DEV</p>
      <div className="flex gap-1 flex-wrap mb-2">
        {RESOURCE_TYPES.map((r) => (
          <button
            key={r}
            onClick={() => sendAction({ action: 'debug_add_resource', resource: r })}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded transition-colors"
          >
            {r} +1
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSaveSnapshot}
          className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded transition-colors"
        >
          📥 保存
        </button>
        <label className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded transition-colors cursor-pointer">
          📤 読込
          <input type="file" accept=".json" className="hidden" onChange={handleLoadSnapshot} />
        </label>
      </div>
    </div>
  );
}
