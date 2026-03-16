'use client';

import React from 'react';
import { GameState, PLAYER_COLOR_MAP, RESOURCE_LABELS, ResourceType } from '@/lib/types';

interface PlayerPanelProps {
  gameState: GameState;
  myPlayerIdx: number | null;
}

const RESOURCE_TYPES: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

const RESOURCE_EMOJI: Record<ResourceType, string> = {
  wood: '🌲',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛰️',
};

export default function PlayerPanel({ gameState, myPlayerIdx }: PlayerPanelProps) {
  const { players, current_player_idx, resources, phase, longest_road_player } = gameState;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-bold text-white mb-1">プレイヤー</h2>
      {players.map((player, idx) => {
        const isCurrentTurn = phase !== 'lobby' && phase !== 'ended' && current_player_idx === idx;
        const isMe = myPlayerIdx === idx;
        const playerColor = PLAYER_COLOR_MAP[player.color] || player.color;
        const playerResources = resources[String(idx)] || {};

        return (
          <div
            key={idx}
            className={`rounded-lg p-3 border-2 transition-all ${
              isCurrentTurn
                ? 'border-yellow-400 bg-gray-700 shadow-lg shadow-yellow-400/20'
                : 'border-gray-600 bg-gray-800'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: playerColor }}
                />
                <span className={`font-bold text-sm ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                  {player.name}
                  {isMe && ' (あなた)'}
                  {isCurrentTurn && ' ▶'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {longest_road_player === idx && (
                  <span className="text-xs bg-purple-600 text-white px-1 rounded" title="最長道路">
                    🛣️
                  </span>
                )}
                <span className="text-yellow-400 font-bold text-sm">
                  {player.victory_points} VP
                </span>
              </div>
            </div>

            {/* Resources - only show details for own player */}
            {isMe ? (
              <div className="grid grid-cols-5 gap-1 mt-2">
                {RESOURCE_TYPES.map((res) => {
                  const count = playerResources[res] || 0;
                  return (
                    <div
                      key={res}
                      className={`flex flex-col items-center rounded p-1 ${
                        count > 0 ? 'bg-gray-600' : 'bg-gray-900 opacity-50'
                      }`}
                    >
                      <span className="text-xs">{RESOURCE_EMOJI[res]}</span>
                      <span className="text-white text-xs font-bold">{count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-gray-400 text-xs mt-1">
                手札: {Object.values(playerResources).reduce((a: number, b) => a + (b as number), 0)} 枚
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
