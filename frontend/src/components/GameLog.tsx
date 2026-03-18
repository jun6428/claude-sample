'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PLAYER_COLOR_MAP } from '@/lib/types';

interface ChatEntry {
  player_idx: number;
  name: string;
  message: string;
  log_offset: number;
}

interface GameLogProps {
  log: string[];
  chatLog: ChatEntry[];
  myPlayerIdx: number | null;
  playerColors: Record<number, string>;
  onSendChat: (message: string) => void;
}

type StreamEntry =
  | { kind: 'log'; text: string; idx: number }
  | { kind: 'chat'; entry: ChatEntry; idx: number };

export default function GameLog({ log, chatLog, myPlayerIdx, playerColors, onSendChat }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  // ログとチャットを時系列順にマージ（インデックスで順序を保つ）
  const stream: StreamEntry[] = [
    ...log.map((text, idx) => ({ kind: 'log' as const, text, idx: idx * 2 })),
    ...chatLog.map((entry, idx) => ({ kind: 'chat' as const, entry, idx: (entry.log_offset ?? 0) * 2 - 1 + idx * 0.001 })),
  ].sort((a, b) => a.idx - b.idx);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log, chatLog]);

  const submit = () => {
    const msg = input.trim();
    if (!msg) return;
    onSendChat(msg);
    setInput('');
  };

  return (
    <div className="bg-gray-800 rounded-lg p-3 flex flex-col" style={{ height: '480px' }}>
      <h3 className="text-white font-bold text-sm mb-2 flex-shrink-0">ログ / チャット</h3>
      <div className="overflow-y-auto flex-1 space-y-1 mb-2">
        {stream.length === 0 ? (
          <p className="text-gray-500 text-xs">ログはありません</p>
        ) : (
          stream.map((item, i) => {
            if (item.kind === 'log') {
              return (
                <p key={`log-${item.idx}`} className="text-xs text-gray-400">
                  {item.text}
                </p>
              );
            }
            const { entry } = item;
            const color = playerColors[entry.player_idx] ?? '#9CA3AF';
            const isMe = entry.player_idx === myPlayerIdx;
            return (
              <p key={`chat-${item.idx}`} className="text-xs">
                <span className="font-bold" style={{ color }}>{entry.name}</span>
                <span className="text-gray-300">: {entry.message}</span>
              </p>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      {myPlayerIdx !== null && (
        <div className="flex gap-1 flex-shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
            placeholder="メッセージを入力..."
            maxLength={200}
            className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={submit}
            disabled={!input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs px-2 py-1 rounded transition-colors"
          >
            送信
          </button>
        </div>
      )}
    </div>
  );
}
