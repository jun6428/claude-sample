'use client';

import React, { useState } from 'react';
import { GameState, GameAction, ResourceType, BUILD_COSTS, RESOURCE_LABELS, PLAYER_COLOR_MAP, HONOR_LABEL } from '@/lib/types';
import { useGameStore } from '@/store/gameStore';

interface ActionPanelProps {
  gameState: GameState;
  myPlayerIdx: number | null;
  sendAction: (action: GameAction) => void;
}

const RESOURCE_TYPES: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export default function ActionPanel({ gameState, myPlayerIdx, sendAction }: ActionPanelProps) {
  const { phase, current_player_idx, dice_rolled, dice_values, setup_step, players, resources } = gameState;
  const selectedAction = useGameStore((s) => s.selectedAction);
  const setSelectedAction = useGameStore((s) => s.setSelectedAction);
  const errors = useGameStore((s) => s.errors);
  const clearErrors = useGameStore((s) => s.clearErrors);

  const [tradeGive, setTradeGive] = useState<ResourceType>('wood');
  const [tradeReceive, setTradeReceive] = useState<ResourceType>('brick');
  const [showTrade, setShowTrade] = useState(false);

  const isMyTurn = myPlayerIdx !== null && current_player_idx === myPlayerIdx;
  const myResources = resources[String(myPlayerIdx)] || {};
  const diceTotal = dice_values[0] + dice_values[1];
  const needsRobberMove = dice_rolled && diceTotal === 7 && !gameState.robber_moved && Object.keys(gameState.pending_discards).length === 0;

  // 港のレートを計算
  const myTradeRatios = React.useMemo(() => {
    const ratios: Record<string, number> = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };
    if (myPlayerIdx === null) return ratios;
    const myVertices = new Set(
      Object.entries(gameState.buildings)
        .filter(([, b]) => b.player_idx === myPlayerIdx)
        .map(([vid]) => vid)
    );
    for (const port of (gameState.board.ports || [])) {
      if (port.vertex_ids.some(vid => myVertices.has(vid))) {
        if (port.port_type === '3:1') {
          for (const r of RESOURCE_TYPES) ratios[r] = Math.min(ratios[r], 3);
        } else {
          ratios[port.port_type] = Math.min(ratios[port.port_type] ?? 4, 2);
        }
      }
    }
    return ratios;
  }, [myPlayerIdx, gameState.buildings, gameState.board.ports]);

  const canAfford = (type: 'road' | 'settlement' | 'city') => {
    const cost = BUILD_COSTS[type];
    return Object.entries(cost).every(([res, amount]) => (myResources[res as ResourceType] || 0) >= amount!);
  };

  const costLabel = (type: 'road' | 'settlement' | 'city') => {
    return Object.entries(BUILD_COSTS[type])
      .map(([res, amt]) => `${RESOURCE_LABELS[res]}×${amt}`)
      .join(' + ');
  };

  if (phase === 'lobby') {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-bold mb-3">ゲームロビー</h2>
        <p className="text-gray-300 text-sm mb-3">
          プレイヤー: {players.length}/4
        </p>
        {players.length >= 2 && (
          <button
            onClick={() => sendAction({ action: 'start_game' })}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            ゲーム開始
          </button>
        )}
        {players.length < 2 && (
          <p className="text-yellow-400 text-sm">最低2人必要です</p>
        )}
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-bold mb-2">セットアップフェーズ</h2>
        <p className="text-gray-300 text-sm mb-2">
          ラウンド {gameState.setup_round + 1}/2
        </p>
        {isMyTurn ? (
          <div className="bg-blue-900 rounded p-3">
            <p className="text-blue-200 font-bold">あなたのターン</p>
            <p className="text-blue-300 text-sm mt-1">
              {setup_step === 'settlement'
                ? '開拓地を配置してください（黄色い円をクリック）'
                : '道を配置してください（黄色い線をクリック）'}
            </p>
          </div>
        ) : (
          <div className="bg-gray-700 rounded p-3">
            <p className="text-gray-300 text-sm">
              {players[current_player_idx]?.name} が配置中...
            </p>
          </div>
        )}
        {errors.length > 0 && (
          <div className="mt-2">
            {errors.map((e, i) => (
              <p key={i} className="text-red-400 text-xs">{e}</p>
            ))}
            <button onClick={clearErrors} className="text-gray-500 text-xs mt-1">✕ 消す</button>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'ended') {
    const winner = gameState.winner !== null ? players[gameState.winner] : null;
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-bold mb-3">ゲーム終了!</h2>
        {winner && (
          <>
            <p className="text-yellow-400 text-lg font-bold mb-1">
              🏆 {winner.name} の勝利!
            </p>
            <p className="text-gray-400 text-sm mb-4">
              {winner.honor} {HONOR_LABEL}
            </p>
          </>
        )}
        <button
          onClick={() => window.location.href = '/'}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
        >
          トップに戻る
        </button>
      </div>
    );
  }

  // Playing phase
  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <h2 className="text-white font-bold">
        {isMyTurn ? 'あなたのターン' : `${players[current_player_idx]?.name} のターン`}
      </h2>

      {/* Error messages */}
      {errors.length > 0 && (
        <div className="bg-red-900 rounded p-2">
          {errors.map((e, i) => (
            <p key={i} className="text-red-300 text-xs">{e}</p>
          ))}
          <button onClick={clearErrors} className="text-red-500 text-xs mt-1 hover:text-red-300">✕ 消す</button>
        </div>
      )}

      {isMyTurn && (
        <>
          {/* Dice */}
          {!dice_rolled && (
            <button
              onClick={() => sendAction({ action: 'roll_dice' })}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              🎲 ダイスを振る
            </button>
          )}

          {/* Waiting for discards — exclusive block, hides all other actions */}
          {dice_rolled && Object.keys(gameState.pending_discards).length > 0 ? (
            <div className="bg-gray-700 rounded p-3">
              <p className="text-gray-300 text-sm font-bold">他のプレイヤーの捨て牌を待っています...</p>
              <p className="text-gray-500 text-xs mt-1">
                {Object.keys(gameState.pending_discards).map(i => players[Number(i)]?.name).join('、')} が選択中
              </p>
            </div>
          ) : (
          <>
          {/* Robber move instruction */}
          {needsRobberMove && (
            <div className="bg-red-900 rounded p-2">
              <p className="text-red-200 text-sm font-bold">7が出た！ロバーを移動してください</p>
              <p className="text-red-300 text-xs">別のタイルをクリック</p>
            </div>
          )}

          {/* Steal target selection */}
          {gameState.robber_victims.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-3 space-y-2">
              <p className="text-red-300 text-xs font-bold">盗む相手を選んでください</p>
              <div className="flex flex-col gap-1.5">
                {gameState.robber_victims.map((idx) => {
                  const p = players[idx];
                  if (!p) return null;
                  return (
                    <button
                      key={idx}
                      onClick={() => sendAction({ action: 'steal_from', target_player_idx: idx })}
                      className="flex items-center gap-2 px-3 py-2 rounded bg-gray-700 hover:bg-red-800 text-white text-sm transition-colors"
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: PLAYER_COLOR_MAP[p.color] }} />
                      <span>{p.name}</span>
                      <span className="text-gray-400 text-xs ml-auto">
                        {Object.values(resources[String(idx)] || {}).reduce((a: number, b) => a + (b as number), 0)} 枚
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Build actions */}
          {dice_rolled && !needsRobberMove && gameState.robber_victims.length === 0 && (
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-1.5">建設</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { key: 'build_road',       emoji: '🛣️', cost: '🌲🧱' },
                  { key: 'build_settlement', emoji: '🏠', cost: '🌲🧱🐑🌾' },
                  { key: 'build_city',       emoji: '🏰', cost: '🌾🌾⛰️⛰️⛰️' },
                ] as const).map(({ key, emoji, cost }) => {
                  const type = key.replace('build_', '') as 'road' | 'settlement' | 'city';
                  const active = selectedAction === key;
                  const affordable = canAfford(type);
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedAction(active ? null : key)}
                      disabled={!affordable}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded transition-colors ${
                        active
                          ? 'bg-yellow-500 text-gray-900 font-bold'
                          : affordable
                          ? 'bg-gray-700 hover:bg-gray-600 text-white'
                          : 'bg-gray-900 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-base leading-none">{emoji}</span>
                      <span className="text-xs leading-none opacity-70">{cost}</span>
                    </button>
                  );
                })}
              </div>
              {selectedAction && (
                <button
                  onClick={() => setSelectedAction(null)}
                  className="w-full text-xs text-gray-400 hover:text-gray-300 py-1 mt-1"
                >
                  キャンセル
                </button>
              )}
            </div>
          )}

          {/* Bank trade */}
          {dice_rolled && !needsRobberMove && gameState.robber_victims.length === 0 && (
            <div>
              <button
                onClick={() => setShowTrade(!showTrade)}
                className="w-full text-left text-sm py-2 px-3 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                🏦 銀行と交換
              </button>
              {showTrade && (
                <div className="mt-2 bg-gray-900 rounded p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <label className="text-gray-300 text-xs w-10">渡す:</label>
                    <select
                      value={tradeGive}
                      onChange={(e) => {
                        const newGive = e.target.value as ResourceType;
                        setTradeGive(newGive);
                        if (tradeReceive === newGive) {
                          const fallback = RESOURCE_TYPES.find((r) => r !== newGive);
                          if (fallback) setTradeReceive(fallback);
                        }
                      }}
                      className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1"
                    >
                      {RESOURCE_TYPES.map((r) => (
                        <option key={r} value={r}>
                          {RESOURCE_LABELS[r]} ({myResources[r] || 0}) {myTradeRatios[r] < 4 ? `${myTradeRatios[r]}:1` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-gray-300 text-xs w-10">受取:</label>
                    <select
                      value={tradeReceive}
                      onChange={(e) => setTradeReceive(e.target.value as ResourceType)}
                      className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1"
                    >
                      {RESOURCE_TYPES.filter((r) => r !== tradeGive).map((r) => (
                        <option key={r} value={r}>
                          {RESOURCE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      sendAction({ action: 'trade_bank', give: tradeGive, receive: tradeReceive });
                      setShowTrade(false);
                    }}
                    disabled={(myResources[tradeGive] || 0) < (myTradeRatios[tradeGive] ?? 4)}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold py-1 rounded transition-colors"
                  >
                    交換実行 ({RESOURCE_LABELS[tradeGive]}×{myTradeRatios[tradeGive] ?? 4} → {RESOURCE_LABELS[tradeReceive]}×1)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* End turn */}
          {dice_rolled && !needsRobberMove && gameState.robber_victims.length === 0 && (
            <button
              onClick={() => {
                setSelectedAction(null);
                sendAction({ action: 'end_turn' });
              }}
              className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              ターン終了
            </button>
          )}
          </>
          )}
        </>
      )}

      {!isMyTurn && phase === 'playing' && (
        <p className="text-gray-400 text-sm text-center py-2">
          {players[current_player_idx]?.name} のターンを待っています...
        </p>
      )}
    </div>
  );
}
