'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { GameAction, WebSocketMessage, GameState } from './types';
import { useGameStore } from '@/store/gameStore';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

export function useWebSocket(gameId: string, playerName: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const setGameState = useGameStore((s) => s.setGameState);
  const setMyPlayerIdx = useGameStore((s) => s.setMyPlayerIdx);
  const addError = useGameStore((s) => s.addError);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (!gameId || !playerName) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const url = `${WS_URL}/ws/${gameId}/${encodeURIComponent(playerName)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg: WebSocketMessage = JSON.parse(event.data);
        if (msg.type === 'game_state' && msg.state) {
          setGameState(msg.state);
          // Determine own player index
          const idx = msg.state.players.findIndex((p) => p.name === playerName);
          if (idx !== -1) {
            setMyPlayerIdx(idx);
          }
        } else if (msg.type === 'error' && msg.message) {
          addError(msg.message);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = (e) => {
      if (!mountedRef.current) return;
      setError('WebSocket connection error');
      setIsConnected(false);
    };

    ws.onclose = (e) => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;
      // Auto-reconnect after 2 seconds
      if (e.code !== 4004) {
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, 2000);
      }
    };
  }, [gameId, playerName, setGameState, setMyPlayerIdx, addError]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendAction = useCallback((action: GameAction) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(action));
    } else {
      addError('Not connected to server');
    }
  }, [addError]);

  return { isConnected, error, sendAction };
}
