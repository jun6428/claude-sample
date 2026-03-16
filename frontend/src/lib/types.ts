export type ResourceType = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export type BuildingType = 'settlement' | 'city';
export type GamePhase = 'lobby' | 'setup' | 'playing' | 'ended';
export type SetupStep = 'settlement' | 'road';

export interface Player {
  name: string;
  color: string;
  victory_points: number;
  ready: boolean;
}

export interface HexTileData {
  hex_id: string;
  q: number;
  r: number;
  resource: ResourceType | 'desert';
  number: number | null;
  vertex_ids: string[];
  edge_ids: string[];
}

export interface VertexData {
  vertex_id: string;
  x: number;
  y: number;
  adjacent_hexes: string[];
  adjacent_vertices: string[];
  adjacent_edges: string[];
}

export interface EdgeData {
  edge_id: string;
  v1: string;
  v2: string;
  adjacent_hexes: string[];
}

export interface BoardData {
  hexes: Record<string, HexTileData>;
  vertices: Record<string, VertexData>;
  edges: Record<string, EdgeData>;
}

export interface Building {
  type: BuildingType;
  player_idx: number;
}

export interface GameState {
  game_id: string;
  phase: GamePhase;
  players: Player[];
  board: BoardData;
  current_player_idx: number;
  setup_round: number;
  setup_placements: number[];
  setup_step: SetupStep;
  dice_rolled: boolean;
  dice_values: [number, number];
  robber_hex: string;
  robber_moved: boolean;
  buildings: Record<string, Building>;
  roads: Record<string, number>;
  resources: Record<string, Record<ResourceType, number>>;
  longest_road_player: number | null;
  longest_road_length: number;
  winner: number | null;
  log: string[];
  bank: Record<ResourceType, number>;
  last_burst: Record<string, number>;
}

export interface WebSocketMessage {
  type: 'game_state' | 'error';
  state?: GameState;
  message?: string;
}

export type GameAction =
  | { action: 'join_game' }
  | { action: 'start_game' }
  | { action: 'place_settlement'; vertex_id: string; is_city: boolean }
  | { action: 'place_road'; edge_id: string }
  | { action: 'roll_dice' }
  | { action: 'move_robber'; hex_id: string }
  | { action: 'build_road'; edge_id: string }
  | { action: 'build_settlement'; vertex_id: string }
  | { action: 'build_city'; vertex_id: string }
  | { action: 'trade_bank'; give: ResourceType; receive: ResourceType }
  | { action: 'end_turn' }
  | { action: 'debug_add_resource'; resource: ResourceType };

export const RESOURCE_COLORS: Record<string, string> = {
  wood: '#228B22',
  brick: '#8B4513',
  sheep: '#90EE90',
  wheat: '#FFD700',
  ore: '#708090',
  desert: '#F4A460',
};

export const RESOURCE_LABELS: Record<string, string> = {
  wood: '木材',
  brick: 'レンガ',
  sheep: '羊毛',
  wheat: '小麦',
  ore: '鉄鉱石',
  desert: '砂漠',
};

export const PLAYER_COLOR_MAP: Record<string, string> = {
  red: '#EF4444',
  blue: '#3B82F6',
  green: '#22C55E',
  orange: '#F97316',
};

export const BUILD_COSTS: Record<string, Partial<Record<ResourceType, number>>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
};
