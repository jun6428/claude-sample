import random
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Set
from .board import Board


RESOURCE_TYPES = ["wood", "brick", "sheep", "wheat", "ore"]
BANK_RESOURCE_LIMIT = 19

BUILD_COSTS = {
    "road": {"wood": 1, "brick": 1},
    "settlement": {"wood": 1, "brick": 1, "sheep": 1, "wheat": 1},
    "city": {"wheat": 2, "ore": 3},
}

PLAYER_COLORS = ["red", "blue", "green", "orange"]


@dataclass
class Player:
    name: str
    color: str
    victory_points: int = 0
    ready: bool = False

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "color": self.color,
            "victory_points": self.victory_points,
            "ready": self.ready,
        }


@dataclass
class GameState:
    game_id: str
    phase: str  # "lobby", "setup", "playing", "ended"
    players: List[Player]
    board: Board
    current_player_idx: int = 0
    setup_round: int = 0  # 0 or 1
    setup_placements: List[int] = field(default_factory=list)  # count of placements per player
    setup_step: str = "settlement"  # "settlement" or "road" for current setup turn
    dice_rolled: bool = False
    dice_values: Tuple[int, int] = (0, 0)
    robber_hex: str = ""
    robber_moved: bool = False  # True after robber is moved when 7 is rolled
    buildings: Dict[str, dict] = field(default_factory=dict)  # vertex_id -> {type, player_idx}
    roads: Dict[str, int] = field(default_factory=dict)  # edge_id -> player_idx
    resources: Dict[int, Dict[str, int]] = field(default_factory=dict)  # player_idx -> {resource: count}
    longest_road_player: Optional[int] = None
    longest_road_length: int = 0
    winner: Optional[int] = None
    log: List[str] = field(default_factory=list)
    # Track setup placements per player per round
    last_settlement_placed: Optional[str] = None  # For giving resources in round 2

    def add_log(self, message: str):
        self.log.append(message)
        if len(self.log) > 100:
            self.log = self.log[-100:]

    def get_resources(self, player_idx: int) -> Dict[str, int]:
        return self.resources.get(player_idx, {r: 0 for r in RESOURCE_TYPES})

    def can_afford(self, player_idx: int, cost: Dict[str, int]) -> bool:
        res = self.get_resources(player_idx)
        return all(res.get(r, 0) >= amount for r, amount in cost.items())

    def pay_cost(self, player_idx: int, cost: Dict[str, int]):
        res = self.resources[player_idx]
        for r, amount in cost.items():
            res[r] -= amount

    def bank_stock(self, resource: str) -> int:
        in_circulation = sum(self.resources[i].get(resource, 0) for i in range(len(self.players)))
        return max(0, BANK_RESOURCE_LIMIT - in_circulation)

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
                self.resources[pidx][resource] += amount
                logs.append(f"{self.players[pidx].name} received {amount} {resource}.")
        return logs

    def count_resources(self, player_idx: int) -> int:
        return sum(self.get_resources(player_idx).values())

    def get_victory_points(self, player_idx: int) -> int:
        vp = 0
        for vid, building in self.buildings.items():
            if building["player_idx"] == player_idx:
                if building["type"] == "settlement":
                    vp += 1
                elif building["type"] == "city":
                    vp += 2
        if self.longest_road_player == player_idx:
            vp += 2
        return vp

    def recalculate_vp(self):
        for i, player in enumerate(self.players):
            player.victory_points = self.get_victory_points(i)

    def is_vertex_valid_for_settlement(self, vertex_id: str, player_idx: int, setup: bool = False) -> bool:
        """Check if a vertex is a valid location for a settlement."""
        if vertex_id not in self.board.vertices:
            return False
        # Must be empty
        if vertex_id in self.buildings:
            return False
        # Distance rule: no adjacent vertex can have a building
        v = self.board.vertices[vertex_id]
        for adj_vid in v["adjacent_vertices"]:
            if adj_vid in self.buildings:
                return False
        # During play (not setup), must be adjacent to player's road
        if not setup:
            v_edges = v["adjacent_edges"]
            has_road = any(self.roads.get(eid) == player_idx for eid in v_edges)
            if not has_road:
                return False
        return True

    def is_edge_valid_for_road(self, edge_id: str, player_idx: int, setup: bool = False,
                                setup_settlement_vid: Optional[str] = None) -> bool:
        """Check if an edge is a valid location for a road."""
        if edge_id not in self.board.edges:
            return False
        # Must be empty
        if edge_id in self.roads:
            return False
        edge = self.board.edges[edge_id]
        v1, v2 = edge["v1"], edge["v2"]

        if setup and setup_settlement_vid:
            # Must be adjacent to the just-placed settlement
            return v1 == setup_settlement_vid or v2 == setup_settlement_vid

        # Must be adjacent to a player's settlement/city or a connected road
        for vid in [v1, v2]:
            building = self.buildings.get(vid)
            if building and building["player_idx"] == player_idx:
                return True
            # Check if any road connected to this vertex belongs to player
            # and no opponent building blocks the connection
            v = self.board.vertices[vid]
            for adj_eid in v["adjacent_edges"]:
                if adj_eid != edge_id and self.roads.get(adj_eid) == player_idx:
                    # Check that the shared vertex doesn't have an opponent building
                    blocker = self.buildings.get(vid)
                    if blocker is None or blocker["player_idx"] == player_idx:
                        return True
        return False

    def calculate_longest_road(self, player_idx: int) -> int:
        """Calculate the longest continuous road for a player using DFS."""
        # Get all edges belonging to this player
        player_edges = {eid for eid, pidx in self.roads.items() if pidx == player_idx}
        if not player_edges:
            return 0

        # Build adjacency: vertex -> list of (vertex, edge_id) for player's roads
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
            neighbors = adj.get(current_v, [])
            for next_v, eid in neighbors:
                if eid not in visited_edges:
                    # Check if path is blocked by opponent building
                    # (road can still exist, but doesn't connect through opponent settlement)
                    blocker = self.buildings.get(current_v)
                    if blocker and blocker["player_idx"] != player_idx:
                        continue
                    visited_edges.add(eid)
                    result = dfs(next_v, visited_edges)
                    best = max(best, result)
                    visited_edges.remove(eid)
            return best

        # Try starting DFS from every vertex in the road network
        all_vertices = set(adj.keys())
        for start_v in all_vertices:
            length = dfs(start_v, set())
            max_length = max(max_length, length)

        return max_length

    def update_longest_road(self):
        """Recalculate longest road for all players."""
        best_player = None
        best_length = max(self.longest_road_length, 4)  # Must be at least 5 to claim

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
        self.recalculate_vp()
        for i, player in enumerate(self.players):
            if player.victory_points >= 10:
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
            "buildings": self.buildings,
            "roads": self.roads,
            "resources": {str(k): v for k, v in self.resources.items()},
            "longest_road_player": self.longest_road_player,
            "longest_road_length": self.longest_road_length,
            "winner": self.winner,
            "log": self.log,
            "last_settlement_placed": self.last_settlement_placed,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'GameState':
        board = Board.from_dict(data['board'])
        players = [Player(name=p['name'], color=p['color'],
                          victory_points=p['victory_points'], ready=p['ready'])
                   for p in data['players']]
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
            buildings=data['buildings'],
            roads=data['roads'],
            resources={int(k): v for k, v in data['resources'].items()},
            longest_road_player=data.get('longest_road_player'),
            longest_road_length=data.get('longest_road_length', 0),
            winner=data.get('winner'),
            log=data.get('log', []),
            last_settlement_placed=data.get('last_settlement_placed'),
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
    state.phase = "setup"
    state.setup_round = 0
    state.setup_placements = [0] * len(state.players)
    state.setup_step = "settlement"
    state.current_player_idx = 0
    state.resources = {i: {r: 0 for r in RESOURCE_TYPES} for i in range(len(state.players))}
    state.add_log("Game started! Setup phase begins.")
    state.add_log(f"{state.players[0].name}'s turn to place settlement.")
