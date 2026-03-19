'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/store/gameStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Room = { game_id: string; room_number: number; phase: string; player_count: number; players: string[] };
type Selection = { type: 'join'; room: Room };

function PhaseTag({ phase }: { phase: string }) {
  const map: Record<string, { label: string; className: string }> = {
    preparing: { label: '開始前',   className: 'bg-green-800 text-green-200' },
    setup:     { label: '初期配置', className: 'bg-yellow-800 text-yellow-200' },
    playing:   { label: 'プレイ中', className: 'bg-blue-800 text-blue-200' },
    ended:     { label: '終了',     className: 'bg-gray-700 text-gray-400' },
  };
  const { label, className } = map[phase] ?? { label: phase, className: 'bg-gray-700 text-gray-400' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${className}`}>{label}</span>;
}

export default function HomePage() {
  const router = useRouter();
  const setGameId = useGameStore((s) => s.setGameId);
  const setPlayerName = useGameStore((s) => s.setPlayerName);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [playerName, setPlayerNameLocal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch(`${API_URL}/api/games`);
        if (res.ok) setRooms((await res.json()).games);
      } catch {}
    };
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selection) {
      setError('');
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [selection]);

  const handleEnter = async () => {
    if (!playerName.trim()) { setError('名前を入力してください'); return; }
    if (!selection) return;
    setIsLoading(true);
    setError('');
    try {
      const gameId = selection.room.game_id;
      setGameId(gameId);
      setPlayerName(playerName.trim());
      router.push(`/game/${gameId}`);
    } catch (e: any) {
      setError(e.message || 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">🏝️ ネオカタソ</h1>
          <p className="text-gray-400 text-sm">オンラインボードゲーム / 2〜4人</p>
        </div>

        {/* Name input panel (appears after selection) */}
        {selection && (
          <div className="mb-4 bg-gray-800 rounded-2xl p-5 border border-gray-600 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => { setSelection(null); setError(''); }}
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                ← 戻る
              </button>
              <span className="text-gray-500 text-sm">|</span>
              <span className="text-gray-300 text-sm">
                {`部屋${selection.room.room_number} に入室`}
              </span>
            </div>
            <input
              ref={nameInputRef}
              type="text"
              value={playerName}
              onChange={(e) => setPlayerNameLocal(e.target.value)}
              placeholder="あなたの名前..."
              maxLength={20}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600 placeholder-gray-500 mb-3"
              onKeyDown={(e) => { if (e.key === 'Enter') handleEnter(); }}
            />
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button
              onClick={handleEnter}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white font-bold py-3 rounded-xl transition-all"
            >
              {isLoading ? '接続中...' : '入室する'}
            </button>
          </div>
        )}

        {/* Room list */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">

          <div className="divide-y divide-gray-700">
              {rooms.map((room) => {
                const isSelected = selection?.type === 'join' && selection.room.game_id === room.game_id;
                return (
                  <button
                    key={room.game_id}
                    onClick={() => setSelection({ type: 'join', room })}
                    className={`w-full flex items-center justify-between px-5 py-3.5 transition-colors text-left
                      ${isSelected
                        ? 'bg-blue-900/40 border-l-2 border-l-blue-500'
                        : 'hover:bg-gray-700/50'}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-white text-sm font-medium">部屋{room.room_number}</span>
                        <PhaseTag phase={room.phase} />
                        <span className="text-gray-500 text-xs">{room.player_count}/4人</span>
                      </div>
                      <div className="text-gray-400 text-xs truncate">
                        {room.players.length > 0 ? room.players.join(', ') : '（まだ誰もいません）'}
                      </div>
                    </div>
                    <span className="text-gray-400 text-xs ml-3 flex-shrink-0">
                      {room.phase === 'preparing' ? '入室 →' : '観戦 →'}
                    </span>
                  </button>
                );
              })}
            </div>
        </div>

        {/* Version */}
        <div className="mt-6 text-center">
          <p className="text-gray-600 text-xs">
            {process.env.NEXT_PUBLIC_DEV_MODE === 'true' && (
              <span className="text-yellow-600 font-bold mr-2">DEV MODE</span>
            )}
            {process.env.NEXT_PUBLIC_COMMIT_SHA ? `v0.0.1.${process.env.NEXT_PUBLIC_COMMIT_SHA}` : 'local'}
          </p>
        </div>

      </div>
    </main>
  );
}
