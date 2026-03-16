'use client';

import React, { useState } from 'react';
import { GameState, GameAction, ResourceType, BUILD_COSTS, RESOURCE_LABELS } from '@/lib/types';
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
  const needsRobberMove = dice_rolled && diceTotal === 7 && !gameState.robber_moved;

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
              {winner.victory_points} VP
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

          {dice_rolled && (
            <div className="bg-gray-700 rounded p-2 text-center">
              <span className="text-white text-sm">ダイス: </span>
              <span className="text-yellow-400 font-bold text-lg">
                {dice_values[0]} + {dice_values[1]} = {diceTotal}
              </span>
            </div>
          )}

          {/* Robber move instruction */}
          {needsRobberMove && (
            <div className="bg-red-900 rounded p-2">
              <p className="text-red-200 text-sm font-bold">7が出た！ロバーを移動してください</p>
              <p className="text-red-300 text-xs">別のタイルをクリック</p>
            </div>
          )}

          {/* Build actions */}
          {dice_rolled && !needsRobberMove && (
            <div className="space-y-2">
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wide">建設</p>

              {/* Road */}
              <button
                onClick={() => setSelectedAction(selectedAction === 'build_road' ? null : 'build_road')}
                disabled={!canAfford('road')}
                className={`w-full text-left text-sm py-2 px-3 rounded transition-colors ${
                  selectedAction === 'build_road'
                    ? 'bg-yellow-500 text-gray-900 font-bold'
                    : canAfford('road')
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-900 text-gray-500 cursor-not-allowed'
                }`}
              >
                🛣️ 道を建設
                <span className="block text-xs opacity-70">{costLabel('road')}</span>
              </button>

              {/* Settlement */}
              <button
                onClick={() => setSelectedAction(selectedAction === 'build_settlement' ? null : 'build_settlement')}
                disabled={!canAfford('settlement')}
                className={`w-full text-left text-sm py-2 px-3 rounded transition-colors ${
                  selectedAction === 'build_settlement'
                    ? 'bg-yellow-500 text-gray-900 font-bold'
                    : canAfford('settlement')
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-900 text-gray-500 cursor-not-allowed'
                }`}
              >
                🏠 開拓地を建設
                <span className="block text-xs opacity-70">{costLabel('settlement')}</span>
              </button>

              {/* City */}
              <button
                onClick={() => setSelectedAction(selectedAction === 'build_city' ? null : 'build_city')}
                disabled={!canAfford('city')}
                className={`w-full text-left text-sm py-2 px-3 rounded transition-colors ${
                  selectedAction === 'build_city'
                    ? 'bg-yellow-500 text-gray-900 font-bold'
                    : canAfford('city')
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-900 text-gray-500 cursor-not-allowed'
                }`}
              >
                🏰 都市に昇格
                <span className="block text-xs opacity-70">{costLabel('city')}</span>
              </button>

              {selectedAction && (
                <button
                  onClick={() => setSelectedAction(null)}
                  className="w-full text-xs text-gray-400 hover:text-gray-300 py-1"
                >
                  キャンセル
                </button>
              )}
            </div>
          )}

          {/* Bank trade */}
          {dice_rolled && !needsRobberMove && (
            <div>
              <button
                onClick={() => setShowTrade(!showTrade)}
                className="w-full text-left text-sm py-2 px-3 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                🏦 銀行と交換 (4:1)
              </button>
              {showTrade && (
                <div className="mt-2 bg-gray-900 rounded p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <label className="text-gray-300 text-xs w-10">渡す:</label>
                    <select
                      value={tradeGive}
                      onChange={(e) => setTradeGive(e.target.value as ResourceType)}
                      className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1"
                    >
                      {RESOURCE_TYPES.map((r) => (
                        <option key={r} value={r}>
                          {RESOURCE_LABELS[r]} ({myResources[r] || 0})
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
                    disabled={(myResources[tradeGive] || 0) < 4}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold py-1 rounded transition-colors"
                  >
                    交換実行 ({RESOURCE_LABELS[tradeGive]}×4 → {RESOURCE_LABELS[tradeReceive]}×1)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* End turn */}
          {dice_rolled && !needsRobberMove && (
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

      {!isMyTurn && phase === 'playing' && (
        <p className="text-gray-400 text-sm text-center py-2">
          {players[current_player_idx]?.name} のターンを待っています...
        </p>
      )}
    </div>
  );
}
