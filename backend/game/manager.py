import random
import uuid
from typing import Dict, List, Optional, Any
from fastapi import WebSocket

from .state import (
    GameState, Player, create_game_state, setup_game,
    PLAYER_COLORS, RESOURCE_TYPES, BUILD_COSTS
)


class ConnectionManager:
    def __init__(self):
        self.games: Dict[str, GameState] = {}
        # game_id -> list of (player_name, websocket)
        self.connections: Dict[str, List[tuple]] = {}

    def create_game(self) -> str:
        game_id = str(uuid.uuid4())[:8]
        state = create_game_state(game_id)
        self.games[game_id] = state
        self.connections[game_id] = []
        return game_id

    def get_game(self, game_id: str) -> Optional[GameState]:
        return self.games.get(game_id)

    async def connect(self, game_id: str, player_name: str, websocket: WebSocket):
        await websocket.accept()
        if game_id not in self.connections:
            self.connections[game_id] = []
        self.connections[game_id].append((player_name, websocket))

    def disconnect(self, game_id: str, player_name: str, websocket: WebSocket):
        if game_id in self.connections:
            self.connections[game_id] = [
                (pn, ws) for pn, ws in self.connections[game_id]
                if not (pn == player_name and ws == websocket)
            ]

    def get_player_idx(self, game_id: str, player_name: str) -> Optional[int]:
        state = self.games.get(game_id)
        if not state:
            return None
        for i, p in enumerate(state.players):
            if p.name == player_name:
                return i
        return None

    async def broadcast(self, game_id: str, message: dict):
        if game_id not in self.connections:
            return
        dead = []
        for pn, ws in self.connections[game_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append((pn, ws))
        for item in dead:
            if item in self.connections[game_id]:
                self.connections[game_id].remove(item)

    async def send_error(self, websocket: WebSocket, message: str):
        await websocket.send_json({"type": "error", "message": message})

    async def broadcast_state(self, game_id: str):
        state = self.games.get(game_id)
        if state:
            await self.broadcast(game_id, {"type": "game_state", "state": state.to_dict()})

    # ===== Action Handlers =====

    async def handle_action(self, game_id: str, player_name: str, websocket: WebSocket, data: dict):
        state = self.games.get(game_id)
        if not state:
            await self.send_error(websocket, "Game not found")
            return

        action = data.get("action")
        player_idx = self.get_player_idx(game_id, player_name)

        if action == "join_game":
            await self._handle_join(game_id, player_name, websocket, state)
            return

        if player_idx is None:
            await self.send_error(websocket, "Player not in game")
            return

        if action == "start_game":
            await self._handle_start_game(game_id, player_idx, websocket, state)
        elif action == "place_settlement":
            await self._handle_place_settlement(game_id, player_idx, websocket, state, data)
        elif action == "place_road":
            await self._handle_place_road(game_id, player_idx, websocket, state, data)
        elif action == "roll_dice":
            await self._handle_roll_dice(game_id, player_idx, websocket, state)
        elif action == "move_robber":
            await self._handle_move_robber(game_id, player_idx, websocket, state, data)
        elif action == "build_road":
            await self._handle_build_road(game_id, player_idx, websocket, state, data)
        elif action == "build_settlement":
            await self._handle_build_settlement(game_id, player_idx, websocket, state, data)
        elif action == "build_city":
            await self._handle_build_city(game_id, player_idx, websocket, state, data)
        elif action == "trade_bank":
            await self._handle_trade_bank(game_id, player_idx, websocket, state, data)
        elif action == "discard_resources":
            await self._handle_discard_resources(game_id, player_idx, websocket, state, data)
        elif action == "steal_from":
            await self._handle_steal_from(game_id, player_idx, websocket, state, data)
        elif action == "end_turn":
            await self._handle_end_turn(game_id, player_idx, websocket, state)
        elif action == "debug_add_resource":
            resource = data.get("resource")
            if resource not in RESOURCE_TYPES:
                await self.send_error(websocket, f"Invalid resource: {resource}")
                return
            if state.bank_stock(resource) == 0:
                await self.send_error(websocket, f"Bank has no {resource} left.")
                return
            state.transfer_from_bank(resource, player_idx, 1)
            state.add_log(f"[DEBUG] {state.players[player_idx].name} +1 {resource}.")
            await self.broadcast_state(game_id)
        else:
            await self.send_error(websocket, f"Unknown action: {action}")

    async def _handle_join(self, game_id: str, player_name: str, websocket: WebSocket, state: GameState):
        if state.phase != "lobby":
            # Allow reconnect
            await self.broadcast_state(game_id)
            return

        # Check if already in game
        for p in state.players:
            if p.name == player_name:
                await self.broadcast_state(game_id)
                return

        if len(state.players) >= 4:
            await self.send_error(websocket, "Game is full (max 4 players)")
            return

        color = PLAYER_COLORS[len(state.players)]
        player = Player(name=player_name, color=color)
        state.players.append(player)
        state.add_log(f"{player_name} joined the game as {color}.")
        await self.broadcast_state(game_id)

    async def _handle_start_game(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState):
        if state.phase != "lobby":
            await self.send_error(websocket, "Game already started")
            return
        if len(state.players) < 2:
            await self.send_error(websocket, "Need at least 2 players to start")
            return
        setup_game(state)
        await self.broadcast_state(game_id)

    async def _handle_place_settlement(self, game_id: str, player_idx: int, websocket: WebSocket,
                                        state: GameState, data: dict):
        if state.phase != "setup":
            await self.send_error(websocket, "Not in setup phase")
            return
        if state.setup_step != "settlement":
            await self.send_error(websocket, "Must place road next")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return

        vertex_id = data.get("vertex_id")
        if not vertex_id:
            await self.send_error(websocket, "vertex_id required")
            return

        if not state.is_vertex_valid_for_settlement(vertex_id, player_idx, setup=True):
            await self.send_error(websocket, "Invalid settlement location")
            return

        piece = state.supply_piece(player_idx, "settlement")
        if not piece:
            await self.send_error(websocket, "No settlement pieces left")
            return
        piece.location = vertex_id
        state.last_settlement_placed = vertex_id
        state.setup_step = "road"
        state.add_log(f"{state.players[player_idx].name} placed a settlement.")
        await self.broadcast_state(game_id)

    async def _handle_place_road(self, game_id: str, player_idx: int, websocket: WebSocket,
                                   state: GameState, data: dict):
        if state.phase != "setup":
            await self.send_error(websocket, "Not in setup phase")
            return
        if state.setup_step != "road":
            await self.send_error(websocket, "Must place settlement first")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return

        edge_id = data.get("edge_id")
        if not edge_id:
            await self.send_error(websocket, "edge_id required")
            return

        if not state.is_edge_valid_for_road(edge_id, player_idx, setup=True,
                                             setup_settlement_vid=state.last_settlement_placed):
            await self.send_error(websocket, "Invalid road location")
            return

        piece = state.supply_piece(player_idx, "road")
        if not piece:
            await self.send_error(websocket, "No road pieces left")
            return
        piece.location = edge_id
        state.setup_placements[player_idx] += 1
        state.setup_step = "settlement"

        # In round 2, give resources from 2nd settlement's adjacent hexes
        if state.setup_round == 1 and state.last_settlement_placed:
            vertex = state.board.vertices.get(state.last_settlement_placed, {})
            adj_hexes = vertex.get("adjacent_hexes", [])
            bonus_resources = {}
            for hid in adj_hexes:
                hex_obj = state.board.hexes.get(hid)
                if hex_obj and hex_obj.resource != "desert":
                    res = hex_obj.resource
                    bonus_resources[res] = bonus_resources.get(res, 0) + 1
            if bonus_resources:
                pending = {r: {player_idx: amt} for r, amt in bonus_resources.items()}
                for log in state.distribute_from_bank(pending):
                    state.add_log(log)

        state.add_log(f"{state.players[player_idx].name} placed a road.")
        state.last_settlement_placed = None

        # Advance setup turn
        self._advance_setup(state)
        await self.broadcast_state(game_id)

    def _advance_setup(self, state: GameState):
        n = len(state.players)
        if state.setup_round == 0:
            # Forward order: 0, 1, 2, ..., n-1
            if state.current_player_idx < n - 1:
                state.current_player_idx += 1
            else:
                # Move to round 2 (reverse)
                state.setup_round = 1
                # current stays at n-1 (they go first in reverse)
            state.add_log(f"{state.players[state.current_player_idx].name}'s turn to place.")
        else:
            # Reverse order: n-1, n-2, ..., 0
            if state.current_player_idx > 0:
                state.current_player_idx -= 1
                state.add_log(f"{state.players[state.current_player_idx].name}'s turn to place.")
            else:
                # Setup complete, start playing
                state.phase = "playing"
                state.current_player_idx = 0
                state.dice_rolled = False
                state.add_log("Setup complete! Game begins.")
                state.add_log(f"{state.players[0].name}'s turn. Roll the dice!")

    async def _handle_roll_dice(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if state.dice_rolled:
            await self.send_error(websocket, "Already rolled dice this turn")
            return

        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        state.dice_values = (d1, d2)
        state.dice_rolled = True
        total = d1 + d2
        state.add_log(f"{state.players[player_idx].name} rolled {d1}+{d2}={total}.")

        if total == 7:
            # Record burst event and request discards
            state.last_burst = {}
            state.pending_discards = {}
            for i, player in enumerate(state.players):
                count = state.count_resources(i)
                if count > 7:
                    to_discard = count // 2
                    state.last_burst[i] = to_discard
                    state.pending_discards[i] = to_discard
                    state.add_log(f"{player.name} must discard {to_discard} resources.")
            if not state.pending_discards:
                state.add_log(f"{state.players[player_idx].name} must move the robber.")
        else:
            # Distribute resources
            hexes = state.board.get_hexes_for_number(total)
            pending: dict = {}
            for hid in hexes:
                if hid == state.robber_hex:
                    continue
                hex_obj = state.board.hexes[hid]
                resource = hex_obj.resource
                if resource not in pending:
                    pending[resource] = {}
                for vid in hex_obj.vertex_ids:
                    building = state.building_at(vid)
                    if building:
                        pidx = building["player_idx"]
                        amount = 2 if building["type"] == "city" else 1
                        pending[resource][pidx] = pending[resource].get(pidx, 0) + amount
            for log in state.distribute_from_bank(pending):
                state.add_log(log)

        await self.broadcast_state(game_id)

    async def _handle_discard_resources(self, game_id: str, player_idx: int, websocket: WebSocket,
                                         state: GameState, data: dict):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if player_idx not in state.pending_discards:
            await self.send_error(websocket, "You don't need to discard")
            return

        required = state.pending_discards[player_idx]
        resources: dict = data.get("resources", {})

        # Validate total count
        total = sum(resources.values())
        if total != required:
            await self.send_error(websocket, f"Must discard exactly {required} resources (got {total})")
            return

        # Validate player has all specified resources
        player_res = state.player_resources(player_idx)
        for r, amount in resources.items():
            if r not in RESOURCE_TYPES:
                await self.send_error(websocket, f"Invalid resource: {r}")
                return
            if amount < 0:
                await self.send_error(websocket, "Amount must be non-negative")
                return
            if player_res.get(r, 0) < amount:
                await self.send_error(websocket, f"Not enough {r}")
                return

        # Execute discard
        for r, amount in resources.items():
            state.transfer_to_bank(r, player_idx, amount)
        del state.pending_discards[player_idx]
        state.add_log(f"{state.players[player_idx].name} discarded {required} resources.")

        # If all discards done, prompt robber move
        if not state.pending_discards:
            state.add_log(f"{state.players[state.current_player_idx].name} must move the robber.")

        await self.broadcast_state(game_id)

    async def _handle_move_robber(self, game_id: str, player_idx: int, websocket: WebSocket,
                                   state: GameState, data: dict):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if not state.dice_rolled or sum(state.dice_values) != 7:
            await self.send_error(websocket, "Can only move robber when 7 is rolled")
            return
        if state.pending_discards:
            await self.send_error(websocket, "Waiting for players to discard")
            return

        hex_id = data.get("hex_id")
        if not hex_id or hex_id not in state.board.hexes:
            await self.send_error(websocket, "Invalid hex")
            return
        if hex_id == state.robber_hex:
            await self.send_error(websocket, "Must move robber to a different hex")
            return

        state.robber_hex = hex_id
        state.robber_moved = True
        state.add_log(f"{state.players[player_idx].name} moved the robber to {hex_id}.")

        # Collect eligible victims (have buildings on this hex, not self)
        hex_obj = state.board.hexes[hex_id]
        victims = set()
        for vid in hex_obj.vertex_ids:
            building = state.building_at(vid)
            if building and building["player_idx"] != player_idx:
                victims.add(building["player_idx"])

        if len(victims) == 1:
            target_idx = next(iter(victims))
            available = [r for r in RESOURCE_TYPES if state.player_resources(target_idx)[r] > 0]
            if available:
                stolen = random.choice(available)
                state.transfer_between_players(stolen, target_idx, player_idx, 1)
                state.add_log(f"{state.players[player_idx].name} stole 1 resource from {state.players[target_idx].name}.")
            else:
                state.add_log(f"{state.players[target_idx].name} had nothing to steal.")
        elif len(victims) > 1:
            state.robber_victims = sorted(victims)
            state.add_log(f"{state.players[player_idx].name} must choose who to steal from.")

        await self.broadcast_state(game_id)

    async def _handle_steal_from(self, game_id: str, player_idx: int, websocket: WebSocket,
                                  state: GameState, data: dict):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if not state.robber_victims:
            await self.send_error(websocket, "No steal pending")
            return

        target_idx = data.get("target_player_idx")
        if target_idx is None or target_idx not in state.robber_victims:
            await self.send_error(websocket, "Invalid target")
            return

        available = [r for r in RESOURCE_TYPES if state.player_resources(target_idx)[r] > 0]
        if available:
            stolen = random.choice(available)
            state.transfer_between_players(stolen, target_idx, player_idx, 1)
            state.add_log(f"{state.players[player_idx].name} stole 1 resource from {state.players[target_idx].name}.")
        else:
            state.add_log(f"{state.players[target_idx].name} had nothing to steal.")

        state.robber_victims = []
        await self.broadcast_state(game_id)

    async def _handle_build_road(self, game_id: str, player_idx: int, websocket: WebSocket,
                                  state: GameState, data: dict):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if not state.dice_rolled:
            await self.send_error(websocket, "Must roll dice first")
            return
        if sum(state.dice_values) == 7 and state.robber_hex == "":
            await self.send_error(websocket, "Must move robber first")
            return

        edge_id = data.get("edge_id")
        if not edge_id:
            await self.send_error(websocket, "edge_id required")
            return

        cost = BUILD_COSTS["road"]
        if not state.can_afford(player_idx, cost):
            await self.send_error(websocket, "Cannot afford road (need 1 wood + 1 brick)")
            return

        if not state.is_edge_valid_for_road(edge_id, player_idx):
            await self.send_error(websocket, "Invalid road location")
            return

        road_piece = state.supply_piece(player_idx, "road")
        if not road_piece:
            await self.send_error(websocket, "No road pieces left")
            return
        state.pay_cost(player_idx, cost)
        road_piece.location = edge_id
        state.update_longest_road()
        state.recalculate_honor()
        state.add_log(f"{state.players[player_idx].name} built a road.")

        winner = state.check_winner()
        if winner is not None:
            state.winner = winner
            state.phase = "ended"
            state.add_log(f"{state.players[winner].name} wins!")

        await self.broadcast_state(game_id)

    async def _handle_build_settlement(self, game_id: str, player_idx: int, websocket: WebSocket,
                                        state: GameState, data: dict):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if not state.dice_rolled:
            await self.send_error(websocket, "Must roll dice first")
            return

        vertex_id = data.get("vertex_id")
        if not vertex_id:
            await self.send_error(websocket, "vertex_id required")
            return

        cost = BUILD_COSTS["settlement"]
        if not state.can_afford(player_idx, cost):
            await self.send_error(websocket, "Cannot afford settlement")
            return

        if not state.is_vertex_valid_for_settlement(vertex_id, player_idx, setup=False):
            await self.send_error(websocket, "Invalid settlement location")
            return

        settlement_piece = state.supply_piece(player_idx, "settlement")
        if not settlement_piece:
            await self.send_error(websocket, "No settlement pieces left")
            return
        state.pay_cost(player_idx, cost)
        settlement_piece.location = vertex_id
        state.recalculate_honor()
        state.add_log(f"{state.players[player_idx].name} built a settlement.")

        winner = state.check_winner()
        if winner is not None:
            state.winner = winner
            state.phase = "ended"
            state.add_log(f"{state.players[winner].name} wins!")

        await self.broadcast_state(game_id)

    async def _handle_build_city(self, game_id: str, player_idx: int, websocket: WebSocket,
                                  state: GameState, data: dict):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if not state.dice_rolled:
            await self.send_error(websocket, "Must roll dice first")
            return

        vertex_id = data.get("vertex_id")
        if not vertex_id:
            await self.send_error(websocket, "vertex_id required")
            return

        building = state.building_at(vertex_id)
        if not building or building["type"] != "settlement" or building["player_idx"] != player_idx:
            await self.send_error(websocket, "Must upgrade your own settlement")
            return

        cost = BUILD_COSTS["city"]
        if not state.can_afford(player_idx, cost):
            await self.send_error(websocket, "Cannot afford city (need 2 wheat + 3 ore)")
            return

        # Return settlement piece to supply, place city piece
        for p in state.settlement_pieces:
            if p.location == vertex_id:
                p.location = None
                break
        city_piece = state.supply_piece(player_idx, "city")
        if not city_piece:
            await self.send_error(websocket, "No city pieces left")
            return
        state.pay_cost(player_idx, cost)
        city_piece.location = vertex_id
        state.recalculate_honor()
        state.add_log(f"{state.players[player_idx].name} upgraded to a city.")

        winner = state.check_winner()
        if winner is not None:
            state.winner = winner
            state.phase = "ended"
            state.add_log(f"{state.players[winner].name} wins!")

        await self.broadcast_state(game_id)

    async def _handle_trade_bank(self, game_id: str, player_idx: int, websocket: WebSocket,
                                  state: GameState, data: dict):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if not state.dice_rolled:
            await self.send_error(websocket, "Must roll dice first")
            return

        give_res = data.get("give")
        receive_res = data.get("receive")

        if give_res not in RESOURCE_TYPES or receive_res not in RESOURCE_TYPES:
            await self.send_error(websocket, "Invalid resource type")
            return
        if give_res == receive_res:
            await self.send_error(websocket, "Cannot trade same resource")
            return

        trade_ratio = state.get_player_trade_ratios(player_idx)[give_res]
        if state.player_resources(player_idx).get(give_res, 0) < trade_ratio:
            await self.send_error(websocket, f"Need {trade_ratio} {give_res} to trade")
            return

        logs = state.distribute_from_bank({receive_res: {player_idx: 1}})
        if not logs or "insufficient" in logs[0]:
            await self.send_error(websocket, f"Bank has no {receive_res} available")
            return
        state.transfer_to_bank(give_res, player_idx, trade_ratio)
        for log in logs:
            state.add_log(log)
        state.add_log(f"{state.players[player_idx].name} traded {trade_ratio} {give_res} → 1 {receive_res} with bank.")

        await self.broadcast_state(game_id)

    async def _handle_end_turn(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if not state.dice_rolled:
            await self.send_error(websocket, "Must roll dice before ending turn")
            return
        if state.robber_victims:
            await self.send_error(websocket, "Must steal from a player first")
            return

        n = len(state.players)
        state.current_player_idx = (state.current_player_idx + 1) % n
        state.dice_rolled = False
        state.dice_values = (0, 0)
        state.robber_moved = False
        state.last_burst = {}
        state.pending_discards = {}
        state.robber_victims = []
        state.add_log(f"{state.players[state.current_player_idx].name}'s turn. Roll the dice!")

        await self.broadcast_state(game_id)


# Global manager instance
manager = ConnectionManager()
