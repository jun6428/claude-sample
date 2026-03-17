import random
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Set, Any
from .board import Board


RESOURCE_TYPES = ["wood", "brick", "sheep", "wheat", "ore"]

BUILD_COSTS = {
    "road": {"wood": 1, "brick": 1},
    "settlement": {"wood": 1, "brick": 1, "sheep": 1, "wheat": 1},
    "city": {"wheat": 2, "ore": 3},
}

PLAYER_COLORS = ["red", "blue", "green", "orange"]

ROAD_LIMIT = 15
SETTLEMENT_LIMIT = 5
CITY_LIMIT = 4
RESOURCE_CARD_LIMIT = 19


@dataclass
class ResourceCard:
    resource: str  # "wood" | "brick" | "sheep" | "wheat" | "ore"
    holder: str    # "bank" | "player_0" | "player_1" | ...


@dataclass
class RoadPiece:
    player_idx: int
    location: Optional[str] = None  # None=手元, edge_id=配置済み


@dataclass
class SettlementPiece:
    player_idx: int
    location: Optional[str] = None  # None=手元, vertex_id=配置済み


@dataclass
class CityPiece:
    player_idx: int
    location: Optional[str] = None  # None=手元, vertex_id=配置済み


@dataclass
class Player:
    name: str
    color: str
    ready: bool = False

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "color": self.color,
            "ready": self.ready,
        }


@dataclass
class GameState:
    game_id: str
    phase: str  # "lobby", "setup", "playing", "ended"
    players: List[Player]
    board: Board
    current_player_idx: int = 0
    setup_round: int = 0
    setup_placements: List[int] = field(default_factory=list)
    setup_step: str = "settlement"
    dice_rolled: bool = False
    dice_values: Tuple[int, int] = (0, 0)
    robber_hex: str = ""
    robber_moved: bool = False
    resource_cards: List[ResourceCard] = field(default_factory=list)
    road_pieces: List[RoadPiece] = field(default_factory=list)
    settlement_pieces: List[SettlementPiece] = field(default_factory=list)
    city_pieces: List[CityPiece] = field(default_factory=list)
    longest_road_player: Optional[int] = None
    longest_road_length: int = 0
    winner: Optional[int] = None
    last_burst: Dict[int, int] = field(default_factory=dict)  # player_idx -> cards lost
    pending_discards: Dict[int, int] = field(default_factory=dict)  # player_idx -> cards to discard
    robber_victims: List[int] = field(default_factory=list)  # eligible victim player indices
    log: List[str] = field(default_factory=list)
    last_settlement_placed: Optional[str] = None

    def add_log(self, message: str):
        self.log.append(message)
        if len(self.log) > 100:
            self.log = self.log[-100:]

    # --- 資源カード操作 ---

    def bank_stock(self, resource: str) -> int:
        return sum(1 for c in self.resource_cards if c.resource == resource and c.holder == "bank")

    def player_resources(self, player_idx: int) -> Dict[str, int]:
        holder = f"player_{player_idx}"
        counts = {r: 0 for r in RESOURCE_TYPES}
        for c in self.resource_cards:
            if c.holder == holder:
                counts[c.resource] += 1
        return counts

    def transfer_from_bank(self, resource: str, player_idx: int, amount: int) -> bool:
        """銀行からプレイヤーへ移動。在庫不足なら False を返す。"""
        available = [c for c in self.resource_cards if c.resource == resource and c.holder == "bank"]
        if len(available) < amount:
            return False
        holder = f"player_{player_idx}"
        for c in available[:amount]:
            c.holder = holder
        return True

    def transfer_to_bank(self, resource: str, player_idx: int, amount: int):
        """プレイヤーから銀行へ移動。"""
        holder = f"player_{player_idx}"
        moved = 0
        for c in self.resource_cards:
            if c.resource == resource and c.holder == holder and moved < amount:
                c.holder = "bank"
                moved += 1

    def transfer_between_players(self, resource: str, from_idx: int, to_idx: int, amount: int):
        """プレイヤー間移動（盗賊など）。"""
        from_holder = f"player_{from_idx}"
        to_holder = f"player_{to_idx}"
        moved = 0
        for c in self.resource_cards:
            if c.resource == resource and c.holder == from_holder and moved < amount:
                c.holder = to_holder
                moved += 1

    def distribute_from_bank(self, pending: Dict[str, Dict[int, int]]) -> List[str]:
        """資源ごとに在庫チェックし、足りない資源は誰にも払い出さない（all-or-nothing）。"""
        logs = []
        for resource, distributions in pending.items():
            total_needed = sum(distributions.values())
            stock = self.bank_stock(resource)
            if total_needed > stock:
                logs.append(f"Bank has insufficient {resource} (need {total_needed}, have {stock}). No {resource} distributed.")
                continue
            for pidx, amount in distributions.items():
                self.transfer_from_bank(resource, pidx, amount)
                logs.append(f"{self.players[pidx].name} received {amount} {resource}.")
        return logs

    # --- コマ操作 ---

    def building_at(self, vertex_id: str) -> Optional[dict]:
        for p in self.settlement_pieces:
            if p.location == vertex_id:
                return {"type": "settlement", "player_idx": p.player_idx}
        for p in self.city_pieces:
            if p.location == vertex_id:
                return {"type": "city", "player_idx": p.player_idx}
        return None

    def road_owner_at(self, edge_id: str) -> Optional[int]:
        for p in self.road_pieces:
            if p.location == edge_id:
                return p.player_idx
        return None

    def placed_roads(self) -> Dict[str, int]:
        return {p.location: p.player_idx for p in self.road_pieces if p.location}

    def supply_piece(self, player_idx: int, piece_type: str) -> Optional[Any]:
        pieces: Dict[str, list] = {
            "road": self.road_pieces,
            "settlement": self.settlement_pieces,
            "city": self.city_pieces,
        }
        return next((p for p in pieces[piece_type] if p.player_idx == player_idx and p.location is None), None)

    # --- 既存メソッド（新APIに移行） ---

    def get_player_trade_ratios(self, player_idx: int) -> Dict[str, int]:
        """資源ごとの最良交易レートを返す（港なし=4、3:1港=3、2:1港=2）。"""
        ratios = {r: 4 for r in RESOURCE_TYPES}
        player_vertices = {p.location for p in self.settlement_pieces if p.location and p.player_idx == player_idx}
        player_vertices |= {p.location for p in self.city_pieces if p.location and p.player_idx == player_idx}
        for port in self.board.ports:
            if any(vid in player_vertices for vid in port["vertex_ids"]):
                if port["port_type"] == "3:1":
                    for r in RESOURCE_TYPES:
                        ratios[r] = min(ratios[r], 3)
                elif port["port_type"] in RESOURCE_TYPES:
                    ratios[port["port_type"]] = min(ratios[port["port_type"]], 2)
        return ratios

    def get_resources(self, player_idx: int) -> Dict[str, int]:
        return self.player_resources(player_idx)

    def can_afford(self, player_idx: int, cost: Dict[str, int]) -> bool:
        res = self.player_resources(player_idx)
        return all(res.get(r, 0) >= amount for r, amount in cost.items())

    def pay_cost(self, player_idx: int, cost: Dict[str, int]):
        for r, amount in cost.items():
            self.transfer_to_bank(r, player_idx, amount)

    def count_resources(self, player_idx: int) -> int:
        return sum(self.player_resources(player_idx).values())

    def get_honor(self, player_idx: int) -> int:
        honor = 0
        for p in self.settlement_pieces:
            if p.location and p.player_idx == player_idx:
                honor += 1
        for p in self.city_pieces:
            if p.location and p.player_idx == player_idx:
                honor += 2
        if self.longest_road_player == player_idx:
            honor += 2
        return honor


    def is_vertex_valid_for_settlement(self, vertex_id: str, player_idx: int, setup: bool = False) -> bool:
        if vertex_id not in self.board.vertices:
            return False
        if self.building_at(vertex_id) is not None:
            return False
        v = self.board.vertices[vertex_id]
        for adj_vid in v["adjacent_vertices"]:
            if self.building_at(adj_vid) is not None:
                return False
        if not setup:
            v_edges = v["adjacent_edges"]
            has_road = any(self.road_owner_at(eid) == player_idx for eid in v_edges)
            if not has_road:
                return False
        return True

    def is_edge_valid_for_road(self, edge_id: str, player_idx: int, setup: bool = False,
                                setup_settlement_vid: Optional[str] = None) -> bool:
        if edge_id not in self.board.edges:
            return False
        if self.road_owner_at(edge_id) is not None:
            return False
        edge = self.board.edges[edge_id]
        v1, v2 = edge["v1"], edge["v2"]

        if setup and setup_settlement_vid:
            return v1 == setup_settlement_vid or v2 == setup_settlement_vid

        roads = self.placed_roads()
        for vid in [v1, v2]:
            building = self.building_at(vid)
            if building and building["player_idx"] == player_idx:
                return True
            v = self.board.vertices[vid]
            for adj_eid in v["adjacent_edges"]:
                if adj_eid != edge_id and roads.get(adj_eid) == player_idx:
                    blocker = self.building_at(vid)
                    if blocker is None or blocker["player_idx"] == player_idx:
                        return True
        return False

    def calculate_longest_road(self, player_idx: int) -> int:
        roads = self.placed_roads()
        player_edges = {eid for eid, pidx in roads.items() if pidx == player_idx}
        if not player_edges:
            return 0

        adj: Dict[str, List[Tuple[str, str]]] = {}
        for eid in player_edges:
            edge = self.board.edges[eid]
            v1, v2 = edge["v1"], edge["v2"]
            if v1 not in adj:
                adj[v1] = []
            if v2 not in adj:
                adj[v2] = []
            adj[v1].append((v2, eid))
            adj[v2].append((v1, eid))

        max_length = 0

        def dfs(current_v: str, visited_edges: Set[str]) -> int:
            best = len(visited_edges)
            for next_v, eid in adj.get(current_v, []):
                if eid not in visited_edges:
                    blocker = self.building_at(current_v)
                    if blocker and blocker["player_idx"] != player_idx:
                        continue
                    visited_edges.add(eid)
                    result = dfs(next_v, visited_edges)
                    best = max(best, result)
                    visited_edges.remove(eid)
            return best

        for start_v in set(adj.keys()):
            max_length = max(max_length, dfs(start_v, set()))

        return max_length

    def update_longest_road(self):
        best_player = None
        best_length = max(self.longest_road_length, 4)

        for i in range(len(self.players)):
            length = self.calculate_longest_road(i)
            if length >= 5 and length > best_length:
                best_length = length
                best_player = i

        if best_player is not None and best_player != self.longest_road_player:
            old_holder = self.longest_road_player
            self.longest_road_player = best_player
            self.longest_road_length = best_length
            if old_holder is not None:
                self.add_log(f"{self.players[best_player].name} takes Longest Road from {self.players[old_holder].name}!")
            else:
                self.add_log(f"{self.players[best_player].name} claims Longest Road ({best_length} roads)!")

    def check_winner(self) -> Optional[int]:
        for i in range(len(self.players)):
            if self.get_honor(i) >= 10:
                return i
        return None

    def to_dict(self) -> dict:
        return {
            "game_id": self.game_id,
            "phase": self.phase,
            "players": [p.to_dict() for p in self.players],
            "board": self.board.to_dict(),
            "current_player_idx": self.current_player_idx,
            "setup_round": self.setup_round,
            "setup_placements": self.setup_placements,
            "setup_step": self.setup_step,
            "dice_rolled": self.dice_rolled,
            "dice_values": list(self.dice_values),
            "robber_hex": self.robber_hex,
            "robber_moved": self.robber_moved,
            "buildings": {
                **{p.location: {"type": "settlement", "player_idx": p.player_idx}
                   for p in self.settlement_pieces if p.location},
                **{p.location: {"type": "city", "player_idx": p.player_idx}
                   for p in self.city_pieces if p.location},
            },
            "roads": {p.location: p.player_idx for p in self.road_pieces if p.location},
            "resources": {str(i): self.player_resources(i) for i in range(len(self.players))},
            "bank": {r: self.bank_stock(r) for r in RESOURCE_TYPES},
            "longest_road_player": self.longest_road_player,
            "longest_road_length": self.longest_road_length,
            "winner": self.winner,
            "log": self.log,
            "last_settlement_placed": self.last_settlement_placed,
            "last_burst": {str(k): v for k, v in self.last_burst.items()},
            "pending_discards": {str(k): v for k, v in self.pending_discards.items()},
            "robber_victims": self.robber_victims,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'GameState':
        board = Board.from_dict(data['board'])
        players = [Player(name=p['name'], color=p['color'],
                          ready=p['ready'])
                   for p in data['players']]
        n = len(players)

        # 資源カードを再構築
        resource_cards = []
        bank_data = data.get('bank', {r: RESOURCE_CARD_LIMIT for r in RESOURCE_TYPES})
        for resource, count in bank_data.items():
            for _ in range(count):
                resource_cards.append(ResourceCard(resource, "bank"))
        for pidx_str, res_dict in data['resources'].items():
            pidx = int(pidx_str)
            holder = f"player_{pidx}"
            for resource, count in res_dict.items():
                for _ in range(count):
                    resource_cards.append(ResourceCard(resource, holder))

        # コマを再構築
        road_pieces = [RoadPiece(i) for i in range(n) for _ in range(ROAD_LIMIT)]
        settlement_pieces = [SettlementPiece(i) for i in range(n) for _ in range(SETTLEMENT_LIMIT)]
        city_pieces = [CityPiece(i) for i in range(n) for _ in range(CITY_LIMIT)]

        supply_roads = {i: iter([p for p in road_pieces if p.player_idx == i]) for i in range(n)}
        for edge_id, pidx in data.get('roads', {}).items():
            next(supply_roads[pidx]).location = edge_id

        supply_settlements = {i: iter([p for p in settlement_pieces if p.player_idx == i]) for i in range(n)}
        supply_cities = {i: iter([p for p in city_pieces if p.player_idx == i]) for i in range(n)}
        for vertex_id, building in data.get('buildings', {}).items():
            pidx = building['player_idx']
            if building['type'] == 'settlement':
                next(supply_settlements[pidx]).location = vertex_id
            else:
                next(supply_cities[pidx]).location = vertex_id

        return cls(
            game_id=data['game_id'],
            phase=data['phase'],
            players=players,
            board=board,
            current_player_idx=data['current_player_idx'],
            setup_round=data['setup_round'],
            setup_placements=data['setup_placements'],
            setup_step=data['setup_step'],
            dice_rolled=data['dice_rolled'],
            dice_values=tuple(data['dice_values']),
            robber_hex=data['robber_hex'],
            robber_moved=data['robber_moved'],
            resource_cards=resource_cards,
            road_pieces=road_pieces,
            settlement_pieces=settlement_pieces,
            city_pieces=city_pieces,
            longest_road_player=data.get('longest_road_player'),
            longest_road_length=data.get('longest_road_length', 0),
            winner=data.get('winner'),
            log=data.get('log', []),
            last_settlement_placed=data.get('last_settlement_placed'),
            last_burst={int(k): v for k, v in data.get('last_burst', {}).items()},
            pending_discards={int(k): v for k, v in data.get('pending_discards', {}).items()},
            robber_victims=data.get('robber_victims', []),
        )


def create_game_state(game_id: str) -> GameState:
    """Create a new game state in lobby phase."""
    board = Board()
    desert_hex = board.find_desert()
    state = GameState(
        game_id=game_id,
        phase="lobby",
        players=[],
        board=board,
        robber_hex=desert_hex or "",
    )
    return state


def setup_game(state: GameState):
    """Initialize game for setup phase."""
    n = len(state.players)
    state.phase = "setup"
    state.setup_round = 0
    state.setup_placements = [0] * n
    state.setup_step = "settlement"
    state.current_player_idx = 0
    state.resource_cards = [ResourceCard(r, "bank") for r in RESOURCE_TYPES for _ in range(RESOURCE_CARD_LIMIT)]
    state.road_pieces = [RoadPiece(i) for i in range(n) for _ in range(ROAD_LIMIT)]
    state.settlement_pieces = [SettlementPiece(i) for i in range(n) for _ in range(SETTLEMENT_LIMIT)]
    state.city_pieces = [CityPiece(i) for i in range(n) for _ in range(CITY_LIMIT)]
    state.add_log("Game started! Setup phase begins.")
    state.add_log(f"{state.players[0].name}'s turn to place settlement.")
