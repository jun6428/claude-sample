export type ResourceType = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export type BuildingType = 'settlement' | 'city';
export type GamePhase = 'preparing' | 'setup' | 'playing' | 'ended';
export type SetupStep = 'settlement' | 'road';

export interface Player {
  name: string;
  color: string;
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

export interface PortData {
  port_type: string;  // "3:1" | ResourceType
  vertex_ids: [string, string];
  edge_id: string;
}

export interface BoardData {
  hexes: Record<string, HexTileData>;
  vertices: Record<string, VertexData>;
  edges: Record<string, EdgeData>;
  ports: PortData[];
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
  largest_army_player: number | null;
  largest_army_count: number;
  pending_robber_move: boolean;
  winner: number | null;
  log: string[];
  bank: Record<ResourceType, number>;
  last_burst: Record<string, number>;
  pending_discards: Record<string, number>;
  robber_victims: number[];
  grace_deck_count: number;
  grace_cards_by_player: Record<string, { type: string; face_up: boolean; purchased_turn: number }[]>;
  turn_number: number;
  pending_road_building: number;
  grace_card_used_this_turn: boolean;
  chat_log: { player_idx: number; name: string; message: string; log_offset: number }[];
  connected_players: string[];
  trade_offer: {
    offerer_idx: number;
    give: Partial<Record<ResourceType, number>>;
    want: Partial<Record<ResourceType, number>>;
    responses: Record<string, 'accept' | 'reject'>;
  } | null;
}

export interface WebSocketMessage {
  type: 'game_state' | 'error';
  state?: GameState;
  message?: string;
}

function calcBaseHonor(playerIdx: number, gameState: GameState): number {
  let honor = 0;
  for (const building of Object.values(gameState.buildings)) {
    if (building.player_idx === playerIdx) {
      honor += building.type === 'city' ? 2 : 1;
    }
  }
  if (gameState.longest_road_player === playerIdx) honor += 2;
  if (gameState.largest_army_player === playerIdx) honor += 2;
  return honor;
}

/** 自分視点：honorカード含む全GP */
export function calculateHonor(playerIdx: number, gameState: GameState): number {
  const graceCards = gameState.grace_cards_by_player?.[String(playerIdx)] ?? [];
  return calcBaseHonor(playerIdx, gameState) + graceCards.filter(c => c.type === 'honor').length;
}

/** 他人視点：honorカード非公開（建物・最長道路のみ） */
export function calculateVisibleHonor(playerIdx: number, gameState: GameState): number {
  return calcBaseHonor(playerIdx, gameState);
}

export type GameAction =
  | { action: 'join_game' }
  | { action: 'take_seat' }
  | { action: 'leave_seat' }
  | { action: 'new_game' }
  | { action: 'start_game' }
  | { action: 'place_settlement'; vertex_id: string; is_city: boolean }
  | { action: 'place_road'; edge_id: string }
  | { action: 'roll_dice' }
  | { action: 'move_robber'; hex_id: string }
  | { action: 'build_road'; edge_id: string }
  | { action: 'build_settlement'; vertex_id: string }
  | { action: 'build_city'; vertex_id: string }
  | { action: 'trade_bank'; give: ResourceType; receive: ResourceType }
  | { action: 'discard_resources'; resources: Partial<Record<ResourceType, number>> }
  | { action: 'steal_from'; target_player_idx: number }
  | { action: 'end_turn' }
  | { action: 'buy_grace_card' }
  | { action: 'use_knight' }
  | { action: 'use_road_building' }
  | { action: 'use_monopoly'; resource: ResourceType }
  | { action: 'use_year_of_plenty'; resource1: ResourceType; resource2: ResourceType }
  | { action: 'debug_add_resource'; resource: ResourceType }
  | { action: 'chat'; message: string }
  | { action: 'propose_trade'; give: Partial<Record<ResourceType, number>>; want: Partial<Record<ResourceType, number>> }
  | { action: 'respond_trade'; response: 'accept' | 'reject' }
  | { action: 'confirm_trade'; target_player_idx: number }
  | { action: 'cancel_trade' };

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

export const RESOURCE_EMOJI: Record<string, string> = {
  wood:  '🌲',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore:   '⛰️',
};

export const PORT_EMOJI: Record<string, string> = {
  ...RESOURCE_EMOJI,
  '3:1': '⚓',
};

export const HONOR_LABEL = 'GP';

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
