'use client';

import React, { useState } from 'react';
import { GameState, GameAction, ResourceType, BUILD_COSTS, RESOURCE_LABELS, RESOURCE_EMOJI, PLAYER_COLOR_MAP, HONOR_LABEL, calculateHonor } from '@/lib/types';
import { useGameStore } from '@/store/gameStore';

interface ActionPanelProps {
  gameState: GameState;
  myPlayerIdx: number | null;
  sendAction: (action: GameAction) => void;
}

const RESOURCE_TYPES: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

function YearOfPlentySelector({ disabled, bank, onSelect }: { disabled: boolean; bank: Record<string, number>; onSelect: (r1: ResourceType, r2: ResourceType) => void }) {
  const [open, setOpen] = React.useState(false);
  const [first, setFirst] = React.useState<ResourceType | null>(null);
  const resources: ResourceType[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const canUse = resources.some(r => (bank[r] ?? 0) > 0);
  const availableFirst = resources.filter(r => (bank[r] ?? 0) > 0);
  const availableSecond = first
    ? resources.filter(r => (bank[r] ?? 0) >= (r === first ? 2 : 1))
    : availableFirst;
  return (
    <div>
      <button
        onClick={() => { setOpen(o => !o); setFirst(null); }}
        disabled={disabled || !canUse}
        className={`flex flex-col items-center gap-1 py-2 px-3 rounded transition-colors ${
          !disabled && canUse ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-900 text-gray-500 cursor-not-allowed'
        }`}
      >
        <span className="text-base leading-none">🌿</span>
        <span className="text-xs leading-none opacity-70">収穫</span>
      </button>
      {open && !disabled && canUse && (
        <div className="mt-1 bg-gray-900 rounded p-2 space-y-1">
          <p className="text-gray-400 text-xs">{first ? `1枚目: ${RESOURCE_EMOJI[first]} → 2枚目を選択` : '1枚目を選択'}</p>
          <div className="flex gap-1 flex-wrap">
            {(first ? availableSecond : availableFirst).map(r => (
              <button key={r} onClick={() => {
                if (!first) { setFirst(r); }
                else { onSelect(first, r); setOpen(false); setFirst(null); }
              }}
                className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded">
                {RESOURCE_EMOJI[r]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MonopolySelector({ disabled, onSelect }: { disabled: boolean; onSelect: (r: ResourceType) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className={`flex flex-col items-center gap-1 py-2 px-3 rounded transition-colors ${
          !disabled ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-900 text-gray-500 cursor-not-allowed'
        }`}
      >
        <span className="text-base leading-none">💰</span>
        <span className="text-xs leading-none opacity-70">独占</span>
      </button>
      {open && !disabled && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {(['wood', 'brick', 'sheep', 'wheat', 'ore'] as ResourceType[]).map(r => (
            <button key={r} onClick={() => { onSelect(r); setOpen(false); }}
              className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded">
              {RESOURCE_EMOJI[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TradePanel({ gameState, myPlayerIdx, sendAction, open }: { gameState: GameState; myPlayerIdx: number; sendAction: (a: GameAction) => void; open: boolean }) {
  const [give, setGive] = React.useState<Partial<Record<ResourceType, number>>>({});
  const [want, setWant] = React.useState<Partial<Record<ResourceType, number>>>({});
  const myResources = gameState.resources[String(myPlayerIdx)] || {};
  const offer = gameState.trade_offer;
  const isMyOffer = offer?.offerer_idx === myPlayerIdx;
  const myResponse = offer?.responses[String(myPlayerIdx)];

  const setCount = (side: 'give' | 'want', r: ResourceType, delta: number) => {
    const setter = side === 'give' ? setGive : setWant;
    setter(prev => {
      const cur = prev[r] ?? 0;
      const next = Math.max(0, cur + delta);
      if (side === 'give') {
        const max = myResources[r] ?? 0;
        return { ...prev, [r]: Math.min(next, max) };
      }
      return { ...prev, [r]: next };
    });
  };

  const canPropose = Object.values(give).some(v => (v ?? 0) > 0) && Object.values(want).some(v => (v ?? 0) > 0);
  const acceptors = offer ? Object.entries(offer.responses).filter(([, v]) => v === 'accept').map(([k]) => Number(k)) : [];

  // 他プレイヤー視点：オファーへの返答UI
  if (offer && !isMyOffer) {
    const offererName = gameState.players[offer.offerer_idx]?.name;
    const canAfford = Object.entries(offer.want).every(([r, v]) => (myResources[r as ResourceType] ?? 0) >= (v ?? 0));
    return (
      <div className="bg-gray-700 rounded p-2 space-y-2">
        <p className="text-xs text-yellow-300 font-bold">📦 {offererName} からの交換オファー</p>
        <div className="flex gap-2 text-xs">
          <div>
            <span className="text-gray-400">{offererName}が渡す: </span>
            {Object.entries(offer.give).map(([r, v]) => `${RESOURCE_EMOJI[r]}×${v}`).join(' ')}
          </div>
          <div>
            <span className="text-gray-400">あなたが渡す: </span>
            {Object.entries(offer.want).map(([r, v]) => `${RESOURCE_EMOJI[r]}×${v}`).join(' ')}
          </div>
        </div>
        {!myResponse ? (
          <div className="flex gap-2">
            <button onClick={() => sendAction({ action: 'respond_trade', response: 'accept' })}
              disabled={!canAfford}
              className="flex-1 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-xs py-1 rounded">
              ✓ 承諾
            </button>
            <button onClick={() => sendAction({ action: 'respond_trade', response: 'reject' })}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white text-xs py-1 rounded">
              ✕ 拒否
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400">{myResponse === 'accept' ? '✓ 承諾済み' : '✕ 拒否済み'}</p>
        )}
      </div>
    );
  }

  // 現在プレイヤー視点：オファー作成 or 確定
  return (
    <div className="space-y-1.5">
      {/* 提示中のオファー（常時表示） */}
      {offer && isMyOffer && (
        <div className="bg-gray-700 rounded p-2 space-y-1">
          <p className="text-xs text-yellow-300">オファー提示中...</p>
          {gameState.players.map((p, idx) => {
            if (idx === myPlayerIdx) return null;
            const res = offer.responses[String(idx)];
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PLAYER_COLOR_MAP[p.color] }} />
                <span className="text-xs text-white flex-1">{p.name}</span>
                {res === 'accept' ? (
                  <button
                    onClick={() => sendAction({ action: 'confirm_trade', target_player_idx: idx })}
                    className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-0.5 rounded">
                    ✓ 確定
                  </button>
                ) : res === 'reject' ? (
                  <span className="text-xs text-gray-500">✕ 拒否</span>
                ) : (
                  <span className="text-xs text-gray-500">待機中...</span>
                )}
              </div>
            );
          })}
          <button onClick={() => sendAction({ action: 'cancel_trade' })}
            className="w-full text-xs text-gray-400 hover:text-gray-300 py-1 mt-1">
            取り下げ
          </button>
        </div>
      )}

      {/* 新規オファー作成（トグルで展開） */}
      {!offer && open && (
        <div className="bg-gray-700 rounded p-2 space-y-2">
          {(['give', 'want'] as const).map(side => (
            <div key={side}>
              <p className="text-xs text-gray-400 mb-1">{side === 'give' ? '渡す' : '欲しい'}</p>
              <div className="flex flex-wrap gap-1">
                {RESOURCE_TYPES.map(r => {
                  const count = (side === 'give' ? give : want)[r] ?? 0;
                  const atMax = side === 'give' && count >= (myResources[r] ?? 0);
                  return (
                    <div key={r} className="flex items-center gap-0.5">
                      <button onClick={() => setCount(side, r, -1)} disabled={count === 0}
                        className="w-4 h-4 text-xs bg-gray-600 hover:bg-gray-500 disabled:opacity-30 rounded text-white leading-none">-</button>
                      <span className="text-xs w-5 text-center text-white">{RESOURCE_EMOJI[r]}{count > 0 ? `×${count}` : ''}</span>
                      <button onClick={() => setCount(side, r, 1)} disabled={atMax}
                        className="w-4 h-4 text-xs bg-gray-600 hover:bg-gray-500 disabled:opacity-30 rounded text-white leading-none">+</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            onClick={() => { sendAction({ action: 'propose_trade', give, want }); setGive({}); setWant({}); }}
            disabled={!canPropose}
            className="w-full text-xs bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 text-white py-1 rounded">
            オファーを提示
          </button>
        </div>
      )}
    </div>
  );
}


export default function ActionPanel({ gameState, myPlayerIdx, sendAction }: ActionPanelProps) {
  const { phase, current_player_idx, dice_rolled, dice_values, setup_step, players, resources } = gameState;
  const selectedAction = useGameStore((s) => s.selectedAction);
  const setSelectedAction = useGameStore((s) => s.setSelectedAction);
  const errors = useGameStore((s) => s.errors);
  const clearErrors = useGameStore((s) => s.clearErrors);

  const [tradeGive, setTradeGive] = useState<ResourceType>('wood');
  const [tradeReceive, setTradeReceive] = useState<ResourceType>('brick');
  const [showBankTrade, setShowBankTrade] = useState(false);
  const [showPlayerTrade, setShowPlayerTrade] = useState(false);

  const isMyTurn = myPlayerIdx !== null && current_player_idx === myPlayerIdx;
  const myResources = resources[String(myPlayerIdx)] || {};
  const diceTotal = dice_values[0] + dice_values[1];
  const needsRobberMove = gameState.pending_robber_move ||
    (dice_rolled && diceTotal === 7 && !gameState.robber_moved && Object.keys(gameState.pending_discards).length === 0);

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
    const winnerHonor = gameState.winner !== null ? calculateHonor(gameState.winner, gameState) : 0;
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-white font-bold mb-3">ゲーム終了!</h2>
        {winner && (
          <>
            <p className="text-yellow-400 text-lg font-bold mb-1">
              🏆 {winner.name} の勝利!
            </p>
            <p className="text-gray-400 text-sm mb-4">
              {winnerHonor} {HONOR_LABEL}
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
      {!isMyTurn && (
        <h2 className="text-white font-bold">{players[current_player_idx]?.name} のターン</h2>
      )}

      {/* Error messages */}
      {errors.length > 0 && (
        <div className="bg-red-900 rounded p-2">
          {errors.map((e, i) => (
            <p key={i} className="text-red-300 text-xs">{e}</p>
          ))}
          <button onClick={clearErrors} className="text-red-500 text-xs mt-1 hover:text-red-300">✕ 消す</button>
        </div>
      )}

      {isMyTurn && (() => {
        const pendingDiscards = Object.keys(gameState.pending_discards).length > 0;
        const pendingSteal = gameState.robber_victims.length > 0;
        const preDice = !dice_rolled && !needsRobberMove && !pendingSteal;
        const canAct = dice_rolled && !needsRobberMove && !pendingSteal && !pendingDiscards;
        return (
        <>
          {/* ダイス前 */}
          {preDice && (
            <button
              onClick={() => sendAction({ action: 'roll_dice' })}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              🎲 ダイスを振る
            </button>
          )}

          {/* 捨て牌待ち */}
          {pendingDiscards && (
            <div className="bg-gray-700 rounded p-3">
              <p className="text-gray-300 text-sm font-bold">他のプレイヤーの捨て牌を待っています...</p>
              <p className="text-gray-500 text-xs mt-1">
                {Object.keys(gameState.pending_discards).map(i => players[Number(i)]?.name).join('、')} が選択中
              </p>
            </div>
          )}

          {/* ロバー移動待ち */}
          {needsRobberMove && (
            <div className="bg-red-900 rounded p-2">
              <p className="text-red-200 text-sm font-bold">
                {gameState.pending_robber_move ? '⚔️ 騎士発動！ロバーを移動してください' : '7が出た！ロバーを移動してください'}
              </p>
              <p className="text-red-300 text-xs">別のタイルをクリック</p>
            </div>
          )}

          {/* Steal target selection */}
          {pendingSteal && (
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
          {canAct && (
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-1.5">建設</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { key: 'build_road',       emoji: '🛣️', cost: '🌲🧱' },
                  { key: 'build_settlement', emoji: '🏠', cost: '🌲🧱🐑🌾' },
                  { key: 'build_city',       emoji: '🏗️', cost: '🌾2 ⛰️3' },
                ] as const).map(({ key, emoji, cost }) => {
                  const type = key.replace('build_', '') as 'road' | 'settlement' | 'city';
                  const active = selectedAction === key;
                  const affordable = canAfford(type);
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedAction(active ? null : key)}
                      disabled={!affordable}
                      className={`flex flex-col items-center gap-2 py-2 px-1 rounded transition-colors ${
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

          {/* 発展カードを引く（ダイス後のみ） */}
          {canAct && (() => {
            const canBuyGrace = (myResources['wheat'] ?? 0) >= 1 && (myResources['sheep'] ?? 0) >= 1 && (myResources['ore'] ?? 0) >= 1;
            const deckCount = gameState.grace_deck_count ?? 0;
            return (
              <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-1.5">発展カード</p>
                <button
                  onClick={() => sendAction({ action: 'buy_grace_card' })}
                  disabled={!canBuyGrace || deckCount === 0}
                  className={`flex flex-col items-center gap-1 py-2 px-3 rounded transition-colors ${
                    canBuyGrace && deckCount > 0
                      ? 'bg-gray-700 hover:bg-gray-600 text-white'
                      : 'bg-gray-900 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <span className="text-base leading-none">✨</span>
                  <span className="text-xs leading-none opacity-70">🌾🐑⛰️</span>
                </button>
              </div>
            );
          })()}

          {/* 発展カードを使う（騎士はダイス前後両方、他はダイス後のみ） */}
          {(preDice || canAct) && (() => {
            const cardUsed = gameState.grace_card_used_this_turn;
            const myGraceCards = (gameState.grace_cards_by_player?.[String(myPlayerIdx)] ?? []).filter(c => !c.face_up);
            const usableCards = myGraceCards.filter(c => c.purchased_turn !== gameState.turn_number);
            const hasKnight = usableCards.some(c => c.type === 'knight');
            const hasRoadBuilding = usableCards.some(c => c.type === 'road_building');
            const hasYearOfPlenty = usableCards.some(c => c.type === 'year_of_plenty');
            const hasMonopoly = usableCards.some(c => c.type === 'monopoly');
            const btnClass = (active: boolean) =>
              `flex flex-col items-center gap-1 py-2 px-3 rounded transition-colors ${
                active ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-900 text-gray-500 cursor-not-allowed'
              }`;
            return (
              <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-1.5">カードを使う</p>
                <div className="flex flex-wrap gap-1.5">
                  {(preDice || canAct) && (
                    <button
                      onClick={() => sendAction({ action: 'use_knight' })}
                      disabled={cardUsed || !hasKnight}
                      className={btnClass(!cardUsed && hasKnight)}
                    >
                      <span className="text-base leading-none">⚔️</span>
                      <span className="text-xs leading-none opacity-70">騎士</span>
                    </button>
                  )}
                  {canAct && (
                    <>
                      <button
                        onClick={() => sendAction({ action: 'use_road_building' })}
                        disabled={cardUsed || !hasRoadBuilding || gameState.pending_road_building > 0}
                        className={btnClass(!cardUsed && hasRoadBuilding && gameState.pending_road_building === 0)}
                      >
                        <span className="text-base leading-none">🛤️</span>
                        <span className="text-xs leading-none opacity-70">
                          {gameState.pending_road_building > 0 ? `残り${gameState.pending_road_building}本` : '街道'}
                        </span>
                      </button>
                      <YearOfPlentySelector disabled={cardUsed || !hasYearOfPlenty} bank={gameState.bank} onSelect={(r1, r2) => sendAction({ action: 'use_year_of_plenty', resource1: r1, resource2: r2 })} />
                      <MonopolySelector disabled={cardUsed || !hasMonopoly} onSelect={(r) => sendAction({ action: 'use_monopoly', resource: r })} />
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 交易 */}
          {canAct && (
            <div className="relative">
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-1.5">交易</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setShowBankTrade(o => !o); setShowPlayerTrade(false); }}
                  className={`flex flex-col items-center gap-1 py-2 px-3 rounded transition-colors ${showBankTrade ? 'bg-yellow-500 text-gray-900 font-bold' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                >
                  <span className="text-base leading-none">🚢</span>
                  <span className="text-xs leading-none opacity-70">海外</span>
                </button>
                <button
                  onClick={() => { setShowPlayerTrade(o => !o); setShowBankTrade(false); }}
                  className={`flex flex-col items-center gap-1 py-2 px-3 rounded transition-colors ${showPlayerTrade ? 'bg-yellow-500 text-gray-900 font-bold' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                >
                  <span className="text-base leading-none">🤝</span>
                  <span className="text-xs leading-none opacity-70">交渉</span>
                </button>
              </div>
              {showBankTrade && (
                <div className="absolute bottom-full left-0 right-0 z-10 mb-1 bg-gray-900 border border-orange-500 rounded-lg shadow-xl overflow-hidden">
                  <div className="bg-gray-700 px-3 py-1.5 text-xs text-gray-300 font-medium flex items-center justify-between">
                    <span>交易 › 海外</span>
                    <button onClick={() => setShowBankTrade(false)} className="text-gray-400 hover:text-white leading-none">✕</button>
                  </div>
                  <div className="p-3 space-y-2">
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
                      setShowBankTrade(false);
                    }}
                    disabled={(myResources[tradeGive] || 0) < (myTradeRatios[tradeGive] ?? 4)}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold py-1 rounded transition-colors"
                  >
                    交換実行 ({RESOURCE_LABELS[tradeGive]}×{myTradeRatios[tradeGive] ?? 4} → {RESOURCE_LABELS[tradeReceive]}×1)
                  </button>
                </div>
                </div>
              )}
              {(showPlayerTrade || gameState.trade_offer?.offerer_idx === myPlayerIdx) && myPlayerIdx !== null && (
                <div className="absolute bottom-full left-0 right-0 z-10 mb-1 bg-gray-900 border border-orange-500 rounded-lg shadow-xl overflow-hidden">
                  <div className="bg-gray-700 px-3 py-1.5 text-xs text-gray-300 font-medium flex items-center justify-between">
                    <span>交易 › 交渉</span>
                    <button onClick={() => setShowPlayerTrade(false)} className="text-gray-400 hover:text-white leading-none">✕</button>
                  </div>
                  <div className="p-3">
                    <TradePanel gameState={gameState} myPlayerIdx={myPlayerIdx} sendAction={sendAction} open={showPlayerTrade} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* End turn */}
          {canAct && (
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
        );
      })()}

      {!isMyTurn && phase === 'playing' && (
        <>
          <p className="text-gray-400 text-sm text-center py-2">
            {players[current_player_idx]?.name} のターンを待っています...
          </p>
          {gameState.trade_offer && myPlayerIdx !== null && gameState.trade_offer.offerer_idx !== myPlayerIdx && (
            <TradePanel gameState={gameState} myPlayerIdx={myPlayerIdx} sendAction={sendAction} open={true} />
          )}
        </>
      )}
    </div>
  );
}
