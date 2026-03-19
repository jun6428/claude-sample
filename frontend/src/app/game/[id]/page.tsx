'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameStore } from '@/store/gameStore';
import { useWebSocket } from '@/lib/websocket';
import Board from '@/components/Board';
import PlayerPanel from '@/components/PlayerPanel';
import ActionPanel from '@/components/ActionPanel';
import GameLog from '@/components/GameLog';
import DevPanel from '@/components/DevPanel';
import DiceDisplay from '@/components/DiceDisplay';
import BankDisplay from '@/components/BankDisplay';

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;

  const gameState = useGameStore((s) => s.gameState);
  const myPlayerIdx = useGameStore((s) => s.myPlayerIdx);
  const playerName = useGameStore((s) => s.playerName);
  const selectedAction = useGameStore((s) => s.selectedAction);
  const gameIdStore = useGameStore((s) => s.gameId);
  const setGameId = useGameStore((s) => s.setGameId);

  const [nameInput, setNameInput] = useState('');
  const [resolvedPlayerName, setResolvedPlayerName] = useState(playerName);
  const [isReady, setIsReady] = useState(false);
  const [boardCssScale, setBoardCssScale] = useState(1);

  // If arrived directly (no name in store), show name prompt
  useEffect(() => {
    if (playerName) {
      setResolvedPlayerName(playerName);
      setIsReady(true);
    }
    if (gameId && gameIdStore !== gameId) {
      setGameId(gameId);
    }
  }, [playerName, gameId, gameIdStore, setGameId]);

  const { isConnected, sendAction } = useWebSocket(
    isReady ? gameId : '',
    isReady ? resolvedPlayerName : ''
  );

  const handleNameSubmit = () => {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    useGameStore.getState().setPlayerName(name);
    useGameStore.getState().setGameId(gameId);
    setResolvedPlayerName(name);
    setIsReady(true);
  };

  if (!isReady) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-gray-700">
          <h2 className="text-white text-xl font-bold mb-4">ゲームに参加</h2>
          <p className="text-gray-400 text-sm mb-4">
            ゲームID: <span className="text-blue-400 font-mono">{gameId}</span>
          </p>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="プレイヤー名を入力..."
            maxLength={20}
            className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600 placeholder-gray-500 mb-4"
            onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit(); }}
            autoFocus
          />
          <button
            onClick={handleNameSubmit}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all"
          >
            参加する
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full mt-3 text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            ← トップに戻る
          </button>
        </div>
      </main>
    );
  }

  if (!gameState) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-2xl mb-4">
            {isConnected ? 'ゲームを読み込み中...' : 'サーバーに接続中...'}
          </div>
          <div className="text-gray-400 text-sm">ゲームID: {gameId}</div>
          <div className="mt-4 w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </main>
    );
  }

  const { phase, log, chat_log, players } = gameState;

  const playerColors = Object.fromEntries(
    players.map((p, i) => [i, getPlayerColorHex(p.color)])
  );

  return (
    <main className="h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-lg">🏝️ ネオカタソ</span>
          <span className="text-gray-500 text-sm font-mono">#{gameId}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-gray-400 text-sm">
            {resolvedPlayerName}
            {myPlayerIdx !== null && players[myPlayerIdx] && (
              <span className="ml-1" style={{ color: getPlayerColorHex(players[myPlayerIdx].color) }}>
                ●
              </span>
            )}
          </span>
          <span className="text-gray-500 text-xs bg-gray-700 px-2 py-1 rounded">
            {phaseLabel(phase)}
          </span>
          <button
            onClick={() => router.push('/')}
            className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            ← 退出
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: online layer (log, dev) */}
        <div className="flex-shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col overflow-hidden" style={{ width: 'min(18vw, 256px)' }}>
          {/* 入室者一覧 */}
          <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-gray-700">
            <p className="text-gray-500 text-xs mb-1">入室中</p>
            <div className="flex flex-col gap-0.5">
              {(() => {
                const connected = gameState.connected_players ?? [];
                const playerNames = new Set(players.map(p => p.name));
                const spectatorNames = connected.filter(n => !playerNames.has(n));
                return (<>
                  {players.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected.includes(p.name) ? 'bg-green-400' : 'bg-gray-600'}`} />
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: playerColors[i] }} />
                      <span className="text-gray-300 text-xs truncate">{p.name}</span>
                    </div>
                  ))}
                  {spectatorNames.map((name) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />
                      {phase !== 'lobby' && <span className="text-gray-500 text-xs">👁</span>}
                      <span className="text-gray-500 text-xs truncate">{name}</span>
                    </div>
                  ))}
                </>);
              })()}
            </div>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            <GameLog
              log={log}
              chatLog={chat_log ?? []}
              myPlayerIdx={myPlayerIdx}
              playerColors={playerColors}
              onSendChat={(msg) => sendAction({ action: 'chat', message: msg })}
            />
          </div>
          {process.env.NEXT_PUBLIC_DEV_MODE === 'true' && (
          <div className="flex-shrink-0 p-3 border-t border-gray-700">
            <DevPanel sendAction={sendAction} />
          </div>
          )}
        </div>

        {/* Board - center */}
        <div className="flex-1 overflow-hidden bg-blue-950 flex justify-center p-4 relative">
          <div className="absolute top-4 left-4 z-10" style={{ transform: `scale(${boardCssScale})`, transformOrigin: 'top left' }}>
            <DiceDisplay diceRolled={gameState.dice_rolled} diceValues={gameState.dice_values} players={players} lastBurst={gameState.last_burst} />
          </div>
          <div className="absolute top-4 right-4 z-10" style={{ transform: `scale(${boardCssScale})`, transformOrigin: 'top right' }}>
            <BankDisplay bank={gameState.bank} graceDeckCount={gameState.grace_deck_count} />
          </div>
          <Board
            gameState={gameState}
            myPlayerIdx={myPlayerIdx}
            sendAction={sendAction}
            selectedAction={selectedAction}
            onScaleChange={setBoardCssScale}
          />
        </div>

        {/* Right panel: catan layer (players, actions) */}
        <div className="flex-shrink-0 bg-gray-900 border-l border-gray-700 overflow-y-auto" style={{ width: 'min(22vw, 288px)' }}>
          <div className="p-3 border-b border-gray-700">
            <PlayerPanel gameState={gameState} myPlayerIdx={myPlayerIdx} sendAction={sendAction} />
          </div>
          <div className="p-3">
            <ActionPanel
              gameState={gameState}
              myPlayerIdx={myPlayerIdx}
              sendAction={sendAction}
            />
          </div>
        </div>
      </div>


    </main>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'lobby': return '開始前';
    case 'setup': return '初期配置';
    case 'playing': return 'プレイ中';
    case 'ended': return '終了';
    default: return phase;
  }
}

function getPlayerColorHex(color: string): string {
  const map: Record<string, string> = {
    red: '#EF4444',
    blue: '#3B82F6',
    green: '#22C55E',
    orange: '#F97316',
  };
  return map[color] || '#fff';
}
