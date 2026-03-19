'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/store/gameStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'preparing': return '開始前';
    case 'setup': return '初期配置';
    case 'playing': return 'プレイ中';
    case 'ended': return '終了';
    default: return phase;
  }
}

export default function HomePage() {
  const router = useRouter();
  const setGameId = useGameStore((s) => s.setGameId);
  const setPlayerName = useGameStore((s) => s.setPlayerName);

  const [playerName, setPlayerNameLocal] = useState('');
  const [joinGameId, setJoinGameId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState<{ game_id: string; phase: string; player_count: number; players: string[] }[]>([]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch(`${API_URL}/api/games`);
        if (res.ok) {
          const data = await res.json();
          setRooms(data.games);
        }
      } catch {}
    };
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      setError('プレイヤー名を入力してください');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/games`, { method: 'POST' });
      if (!res.ok) throw new Error('ゲームの作成に失敗しました');
      const data = await res.json();
      const gameId = data.game_id;
      setGameId(gameId);
      setPlayerName(playerName.trim());
      router.push(`/game/${gameId}`);
    } catch (e: any) {
      setError(e.message || 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (!playerName.trim()) {
      setError('プレイヤー名を入力してください');
      return;
    }
    if (!joinGameId.trim()) {
      setError('ゲームIDを入力してください');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/games/${joinGameId.trim()}`);
      if (!res.ok) throw new Error('ゲームが見つかりません');
      setGameId(joinGameId.trim());
      setPlayerName(playerName.trim());
      router.push(`/game/${joinGameId.trim()}`);
    } catch (e: any) {
      setError(e.message || 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">
            🏝️ ネオカタソ
          </h1>
          <p className="text-gray-400">オンラインボードゲーム</p>
        </div>

        {/* Card */}
        <div className="bg-gray-800 rounded-2xl p-6 shadow-2xl border border-gray-700">
          {/* Player name input */}
          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              プレイヤー名
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerNameLocal(e.target.value)}
              placeholder="名前を入力..."
              maxLength={20}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600 placeholder-gray-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateGame();
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 bg-red-900 border border-red-700 rounded-lg px-4 py-2">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Create game */}
          <button
            onClick={handleCreateGame}
            disabled={isLoading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-xl transition-all mb-4 text-lg"
          >
            {isLoading ? '作成中...' : '🎲 新しいゲームを作成'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gray-600" />
            <span className="text-gray-500 text-sm">または</span>
            <div className="flex-1 h-px bg-gray-600" />
          </div>

          {/* Join game */}
          <div className="flex gap-2">
            <input
              type="text"
              value={joinGameId}
              onChange={(e) => setJoinGameId(e.target.value)}
              placeholder="ゲームIDを入力..."
              maxLength={8}
              className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600 placeholder-gray-500 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoinGame();
              }}
            />
            <button
              onClick={handleJoinGame}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-5 rounded-xl transition-all"
            >
              参加
            </button>
          </div>
        </div>

        {/* Room list */}
        {rooms.length > 0 && (
          <div className="mt-4 bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700">
              <h2 className="text-gray-300 text-sm font-medium">参加できる部屋</h2>
            </div>
            <div className="divide-y divide-gray-700">
              {rooms.map((room) => (
                <div key={room.game_id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-white text-sm font-mono">#{room.game_id}</span>
                    <span className="ml-2 text-gray-400 text-xs">{phaseLabel(room.phase)}</span>
                    <div className="text-gray-500 text-xs mt-0.5">{room.players.join(', ')}</div>
                  </div>
                  <button
                    onClick={() => {
                      setJoinGameId(room.game_id);
                    }}
                    className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    参加
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info */}
        <div className="mt-6 text-center">
          <p className="text-gray-500 text-sm">2〜4人でプレイ</p>
          <p className="text-gray-600 text-xs mt-1">
            {process.env.NEXT_PUBLIC_DEV_MODE === 'true' && (
              <span className="text-yellow-600 font-bold mr-2">DEV MODE</span>
            )}
            {process.env.NEXT_PUBLIC_COMMIT_SHA
              ? `v0.0.1.${process.env.NEXT_PUBLIC_COMMIT_SHA}`
              : 'local'}
          </p>
        </div>
      </div>
    </main>
  );
}
