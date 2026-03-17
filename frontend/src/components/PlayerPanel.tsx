'use client';

import React, { useState } from 'react';
import { GameState, GameAction, PLAYER_COLOR_MAP, RESOURCE_LABELS, RESOURCE_COLORS, RESOURCE_EMOJI, ResourceType, HONOR_LABEL, calculateHonor, calculateVisibleHonor } from '@/lib/types';

interface PlayerPanelProps {
  gameState: GameState;
  myPlayerIdx: number | null;
  sendAction: (action: GameAction) => void;
}

const RESOURCE_TYPES: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

const CARD_DISPLAY: Record<string, { emoji: string; label: string; border: string }> = {
  honor:          { emoji: '⭐', label: '得点', border: 'border-yellow-600' },
  road_building:  { emoji: '🛤️', label: '街道', border: 'border-orange-500' },
  monopoly:       { emoji: '💰', label: '独占', border: 'border-purple-500' },
  year_of_plenty: { emoji: '🌿', label: '収穫', border: 'border-green-500' },
};

function StackedCard({ type, count }: { type: string; count: number }) {
  const d = CARD_DISPLAY[type] ?? { emoji: '?', label: type, border: 'border-gray-500' };
  return (
    <div className="relative">
      <div className={`flex flex-col items-center justify-center w-10 h-14 rounded border ${d.border} bg-gray-800 text-center`}>
        <span className="text-base leading-none">{d.emoji}</span>
        <span className="text-yellow-300 text-xs leading-tight mt-0.5">{d.label}</span>
      </div>
      {count > 1 && (
        <span className="absolute -top-1 -right-1 bg-gray-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
          {count}
        </span>
      )}
    </div>
  );
}

function groupCards(cards: { type: string; face_up: boolean }[]): { type: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const c of cards) counts[c.type] = (counts[c.type] ?? 0) + 1;
  return Object.entries(counts).map(([type, count]) => ({ type, count }));
}


export default function PlayerPanel({ gameState, myPlayerIdx, sendAction }: PlayerPanelProps) {
  const { players, current_player_idx, resources, phase, longest_road_player, largest_army_player } = gameState;
  const [discardSelection, setDiscardSelection] = useState<Partial<Record<ResourceType, number>>>({});

  const myPendingDiscard = myPlayerIdx !== null
    ? (gameState.pending_discards?.[String(myPlayerIdx)] ?? 0)
    : 0;

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
                {largest_army_player === idx && (
                  <span className="text-xs bg-red-700 text-white px-1 rounded" title="最大騎士力">
                    ⚔️
                  </span>
                )}
                <span className="text-yellow-400 font-bold text-sm">
                  {isMe ? calculateHonor(idx, gameState) : calculateVisibleHonor(idx, gameState)} {HONOR_LABEL}
                </span>
              </div>
            </div>

            {/* Resources - only show details for own player */}
            {isMe ? (
              <>
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
                {(() => {
                  const allCards = gameState.grace_cards_by_player?.[String(idx)] ?? [];
                  const inHand = allCards.filter(c => !c.face_up);
                  const used = allCards.filter(c => c.face_up);
                  if (allCards.length === 0) return null;
                  return (
                    <div className="mt-2">

                      <div className="flex justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          {groupCards(inHand).map(({ type, count }) => (
                            <StackedCard key={type} type={type} count={count} />
                          ))}
                        </div>
                        {used.length > 0 && (
                          <div className="flex flex-wrap gap-2 justify-end opacity-40">
                            {groupCards(used).map(({ type, count }) => (
                              <StackedCard key={`used-${type}`} type={type} count={count} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {myPendingDiscard > 0 && (() => {
                  const selectedTotal = Object.values(discardSelection).reduce((s, n) => s + (n ?? 0), 0);
                  const remaining = myPendingDiscard - selectedTotal;
                  const adjust = (r: ResourceType, delta: number) => {
                    const current = discardSelection[r] ?? 0;
                    const owned = playerResources[r] ?? 0;
                    const next = Math.max(0, Math.min(owned, current + delta));
                    setDiscardSelection((prev) => ({ ...prev, [r]: next }));
                  };
                  const handleSubmit = () => {
                    const filtered = Object.fromEntries(
                      Object.entries(discardSelection).filter(([, v]) => (v ?? 0) > 0)
                    ) as Partial<Record<ResourceType, number>>;
                    sendAction({ action: 'discard_resources', resources: filtered });
                    setDiscardSelection({});
                  };
                  return (
                    <div className="mt-2 rounded-lg border border-orange-500 bg-gray-900 p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-orange-400 text-xs font-bold">捨て牌 — あと {remaining} 枚</span>
                      </div>
                      {RESOURCE_TYPES.map((r) => {
                        const owned = playerResources[r] ?? 0;
                        const selected = discardSelection[r] ?? 0;
                        return (
                          <div key={r} className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: RESOURCE_COLORS[r] }} />
                            <span className="text-gray-300 text-xs flex-1">{RESOURCE_LABELS[r]}</span>
                            <button onClick={() => adjust(r, -1)} disabled={selected === 0}
                              className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-xs leading-none">−</button>
                            <span className="text-white text-xs w-3 text-center">{selected}</span>
                            <button onClick={() => adjust(r, 1)} disabled={owned === 0 || remaining === 0}
                              className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white text-xs leading-none">＋</button>
                          </div>
                        );
                      })}
                      <button onClick={handleSubmit} disabled={remaining !== 0}
                        className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold py-1 rounded transition-colors">
                        捨てる ({selectedTotal}/{myPendingDiscard})
                      </button>
                    </div>
                  );
                })()}
              </>
            ) : (() => {
              const theirPending = gameState.pending_discards?.[String(idx)] ?? 0;
              const theirGraceCount = (gameState.grace_cards_by_player?.[String(idx)] ?? []).length;
              return theirPending > 0 ? (
                <div className="text-orange-400 text-xs mt-1 font-bold">
                  バースト — {theirPending}枚を選択中...
                </div>
              ) : (
                <>
                  <div className="text-gray-400 text-xs mt-1">
                    手札: {Object.values(playerResources).reduce((a: number, b) => a + (b as number), 0)} 枚
                  </div>
                  {theirGraceCount > 0 && (
                    <div className="mt-2">

                      <div className="flex flex-wrap gap-2">
                        {phase === 'ended' ? (
                          groupCards(gameState.grace_cards_by_player?.[String(idx)] ?? []).map(({ type, count }) => (
                            <StackedCard key={type} type={type} count={count} />
                          ))
                        ) : (() => {
                          const cards = gameState.grace_cards_by_player?.[String(idx)] ?? [];
                          const revealed = cards.filter(c => c.face_up);
                          const hidden = cards.filter(c => !c.face_up);
                          return (
                            <div className="flex justify-between gap-2 w-full">
                              <div className="flex flex-wrap gap-2">
                                {hidden.length > 0 && (
                                  <div className="relative">
                                    <div className="flex flex-col items-center justify-center w-10 h-14 rounded border border-gray-600 bg-gray-900 text-center">
                                      <span className="text-gray-500 text-lg leading-none">🂠</span>
                                    </div>
                                    {hidden.length > 1 && (
                                      <span className="absolute -top-1 -right-1 bg-gray-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                                        {hidden.length}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              {revealed.length > 0 && (
                                <div className="flex flex-wrap gap-2 justify-end opacity-40">
                                  {groupCards(revealed).map(({ type, count }) => (
                                    <StackedCard key={`revealed-${type}`} type={type} count={count} />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
