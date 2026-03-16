import { create } from 'zustand';
import { GameState } from '@/lib/types';

interface GameStore {
  gameState: GameState | null;
  myPlayerIdx: number | null;
  gameId: string;
  playerName: string;
  errors: string[];
  selectedAction: string | null;

  setGameState: (state: GameState) => void;
  setMyPlayerIdx: (idx: number) => void;
  setGameId: (id: string) => void;
  setPlayerName: (name: string) => void;
  addError: (msg: string) => void;
  clearErrors: () => void;
  setSelectedAction: (action: string | null) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  myPlayerIdx: null,
  gameId: '',
  playerName: '',
  errors: [],
  selectedAction: null,

  setGameState: (state) => set({ gameState: state }),
  setMyPlayerIdx: (idx) => set({ myPlayerIdx: idx }),
  setGameId: (id) => set({ gameId: id }),
  setPlayerName: (name) => set({ playerName: name }),
  addError: (msg) =>
    set((s) => ({
      errors: [...s.errors.slice(-4), msg],
    })),
  clearErrors: () => set({ errors: [] }),
  setSelectedAction: (action) => set({ selectedAction: action }),
}));
