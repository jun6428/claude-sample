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
  knight:         { emoji: '⚔️', label: '騎士', border: 'border-red-700' },
  road_building:  { emoji: '🛤️', label: '街道', border: 'border-orange-500' },
  monopoly:       { emoji: '💰', label: '独占', border: 'border-purple-500' },
  year_of_plenty: { emoji: '🌿', label: '収穫', border: 'border-green-500' },
};

function StackedCard({ type, count }: { type: string; count: number }) {
  const d = CARD_DISPLAY[type] ?? { emoji: '?', label: type, border: 'border-gray-500' };
  return (
    <div className="relative">
      <div className={`flex flex-col items-center justify-center w-8 h-11 rounded border ${d.border} bg-gray-800 text-center`}>
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

const CARD_W = 18;   // px: カード幅
const CARD_H = 26;   // px: カード高さ
const OVERLAP = 10;  // px: 重なり幅
const MAX_VISIBLE = 8;

/** 横に重なるカード列。face_up=trueなら絵柄表示、falseなら裏面 */
function FanCards({ cards, backStyle = 'resource', size = 'md' }: { cards: { face_up: boolean; type?: string }[]; backStyle?: 'resource' | 'dev'; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 12 : CARD_W;
  const h = size === 'sm' ? 18 : CARD_H;
  const overlap = size === 'sm' ? 7 : OVERLAP;
  const visible = cards.slice(0, MAX_VISIBLE);
  const extra = cards.length - MAX_VISIBLE;
  const totalW = visible.length > 0 ? w + (visible.length - 1) * (w - overlap) : 0;
  return (
    <div className="flex items-center gap-1">
      <div className="relative flex-shrink-0" style={{ width: totalW, height: h }}>
        {visible.map((c, i) => {
          const d = c.type ? (CARD_DISPLAY[c.type] ?? null) : null;
          return (
            <div
              key={i}
              className={`absolute flex flex-col items-center justify-center rounded border text-center overflow-hidden ${
                c.face_up && d
                  ? `${d.border} bg-gray-800`
                  : backStyle === 'dev'
                  ? 'border-black bg-gray-700'
                  : 'border-gray-400 bg-gray-600'
              }`}
              style={{ width: w, height: h, left: i * (w - overlap), zIndex: i }}
            >
              {c.face_up && d ? (
                <span style={{ fontSize: 10 }}>{d.emoji}</span>
              ) : (
                <span className="text-gray-500" style={{ fontSize: 11 }}>🂠</span>
              )}
            </div>
          );
        })}
      </div>
      {extra > 0 && (
        <span className="text-gray-400 text-xs">+{extra}</span>
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
    <div className="flex flex-col gap-1">

      {players.map((player, idx) => {
        const isCurrentTurn = phase !== 'lobby' && phase !== 'ended' && current_player_idx === idx;
        const isMe = myPlayerIdx === idx;
        const playerColor = PLAYER_COLOR_MAP[player.color] || player.color;
        const isConnected = (gameState.connected_players ?? []).includes(player.name);
        const playerResources = resources[String(idx)] || {};

        return (
          <div
            key={idx}
            className={`transition-all ${
              isMe
                ? `rounded-lg p-3 border-2 ${isCurrentTurn ? 'border-yellow-400 bg-gray-700 shadow-lg shadow-yellow-400/20' : 'border-gray-600 bg-gray-800'}`
                : `py-1 border-t rounded ${isCurrentTurn ? 'border-yellow-400/50 bg-yellow-400/20' : 'border-gray-700'}`
            }`}
          >
            <div className={`flex items-center justify-between ${isMe ? 'mb-1' : 'mb-0'}`}>
              <div className="flex items-center gap-2">
                {isConnected
                  ? <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />
                  : <span className="text-xs leading-none">❌</span>
                }
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: playerColor }}
                />
                <span className={`font-bold ${isMe ? 'text-sm text-yellow-300' : 'text-xs text-white'}`}>
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
                        <div className="flex flex-wrap gap-1">
                          {groupCards(inHand).map(({ type, count }) => (
                            <StackedCard key={type} type={type} count={count} />
                          ))}
                        </div>
                        {used.length > 0 && (
                          <div className="flex flex-wrap gap-1 justify-end opacity-40">
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
              const resourceCount = Object.values(playerResources).reduce((a: number, b) => a + (b as number), 0);
              const graceCards = gameState.grace_cards_by_player?.[String(idx)] ?? [];
              // 資源を裏面カードとして展開
              const resourceFan = Array.from({ length: resourceCount }, () => ({ face_up: false }));
              // 発展カード（ゲーム終了時は全公開）
              const graceFan = phase === 'ended'
                ? graceCards.map(c => ({ face_up: true, type: c.type }))
                : graceCards.map(c => ({ face_up: c.face_up, type: c.type }));
              const allCards = [...resourceFan, ...graceFan];
              return (
                <div className="mt-1 flex flex-col gap-0.5">
                  {theirPending > 0 && (
                    <div className="text-orange-400 text-xs font-bold">
                      バースト — {theirPending}枚を選択中...
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs w-6 flex-shrink-0">資源</span>
                    {resourceFan.length > 0
                      ? <><FanCards cards={resourceFan} backStyle="resource" size="sm" /><span className="text-gray-400 text-xs ml-1">{resourceCount}</span></>
                      : <span className="text-gray-600 text-xs">なし</span>
                    }
                  </div>
                  {graceFan.length > 0 && (() => {
                    const unused = graceFan.filter(c => !c.face_up);
                    const used = graceFan.filter(c => c.face_up);
                    return (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs w-6 flex-shrink-0">発展</span>
                        {unused.length > 0 && <FanCards cards={unused} backStyle="dev" />}
                        {used.length > 0 && (
                          <div className="opacity-70">
                            <FanCards cards={used} backStyle="dev" />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
