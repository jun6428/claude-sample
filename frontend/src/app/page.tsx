'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/store/gameStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Room = { game_id: string; room_number: number; phase: string; connected_count: number; player_count: number; players: string[] };

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

function RoomRow({ room, onEnter }: { room: Room; onEnter: (gameId: string, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    setOpen(o => !o);
    setError('');
    if (!open) setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleEnter = async () => {
    if (!playerName.trim()) { setError('名前を入力してください'); return; }
    setIsLoading(true);
    setError('');
    try {
      await onEnter(room.game_id, playerName.trim());
    } catch (e: any) {
      setError(e.message || 'エラーが発生しました');
      setIsLoading(false);
    }
  };

  return (
    <div className={`border-b border-gray-700 last:border-b-0 ${open ? 'bg-gray-750' : ''}`}>
      {/* Row header */}
      <button
        onClick={toggle}
        className={`w-full flex items-center justify-between px-5 py-3.5 transition-colors text-left
          ${open ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : 'hover:bg-gray-700/50'}`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-white text-lg font-bold">部屋{room.room_number}</span>
            <span className="text-gray-300 text-xs font-medium">🪑 {room.player_count} / 4</span>
            <span className="text-gray-300 text-xs font-medium">👥 {room.connected_count} / 20</span>
          </div>
          <div className="flex items-center gap-2 text-xs truncate">
            <PhaseTag phase={room.phase} />
            <span className="text-gray-400">プレイヤー: {room.players.join(', ')}</span>
          </div>
        </div>
        <span className={`text-gray-400 text-xs ml-3 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
          {room.phase === 'preparing' ? '入室 ›' : '観戦 ›'}
        </span>
      </button>

      {/* Accordion: name input */}
      {open && (
        <div className="px-5 pb-4 pt-2 bg-gray-900/40">
          <input
            ref={inputRef}
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="あなたの名前..."
            maxLength={20}
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600 placeholder-gray-500 mb-2"
            onKeyDown={(e) => { if (e.key === 'Enter') handleEnter(); }}
          />
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          <button
            onClick={handleEnter}
            disabled={isLoading}
            className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition-all text-base shadow-lg shadow-blue-900/50"
          >
            {isLoading ? '接続中...' : '入室する'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const setGameId = useGameStore((s) => s.setGameId);
  const setPlayerName = useGameStore((s) => s.setPlayerName);

  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch(`${API_URL}/api/games`);
        if (res.ok) setRooms((await res.json()).games.sort((a: Room, b: Room) => a.room_number - b.room_number));
      } catch {}
    };
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleEnter = async (gameId: string, name: string) => {
    setGameId(gameId);
    setPlayerName(name);
    router.push(`/game/${gameId}`);
  };

  return (
    <main className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">🏝️ ネオカタソ</h1>
          <p className="text-gray-400 text-sm">オンラインボードゲーム / 2〜4人</p>
        </div>

        {/* Room list */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
          {rooms.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">読み込み中...</div>
          ) : (
            rooms.map((room) => (
              <RoomRow key={room.game_id} room={room} onEnter={handleEnter} />
            ))
          )}
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
