'use client';

import React, { useEffect, useRef } from 'react';

interface GameLogProps {
  log: string[];
}

export default function GameLog({ log }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  return (
    <div className="bg-gray-800 rounded-lg p-3 flex flex-col" style={{ height: '200px' }}>
      <h3 className="text-white font-bold text-sm mb-2 flex-shrink-0">ゲームログ</h3>
      <div className="overflow-y-auto flex-1 space-y-1">
        {log.length === 0 ? (
          <p className="text-gray-500 text-xs">ログはありません</p>
        ) : (
          log.map((entry, i) => (
            <p
              key={i}
              className={`text-xs ${
                i === log.length - 1 ? 'text-white' : 'text-gray-400'
              }`}
            >
              {entry}
            </p>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
