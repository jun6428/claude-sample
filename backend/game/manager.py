import random
import uuid
from typing import Dict, List, Optional, Any
from fastapi import WebSocket

from .state import (
    GameState, Player, TradeOffer, create_game_state, setup_game,
    PLAYER_COLORS, RESOURCE_TYPES, BUILD_COSTS, GRACE_CARD_COST
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
            connected = list({pn for pn, _ in self.connections.get(game_id, [])})
            state_dict = state.to_dict()
            state_dict["connected_players"] = connected
            await self.broadcast(game_id, {"type": "game_state", "state": state_dict})

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

        if action == "take_seat":
            await self._handle_take_seat(game_id, player_name, websocket, state)
            return

        if action == "leave_seat":
            await self._handle_leave_seat(game_id, player_name, player_idx, websocket, state)
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
        elif action == "use_year_of_plenty":
            await self._handle_use_year_of_plenty(game_id, player_idx, websocket, state, data)
        elif action == "use_road_building":
            await self._handle_use_road_building(game_id, player_idx, websocket, state)
        elif action == "use_monopoly":
            await self._handle_use_monopoly(game_id, player_idx, websocket, state, data)
        elif action == "use_knight":
            await self._handle_use_knight(game_id, player_idx, websocket, state)
        elif action == "buy_grace_card":
            await self._handle_buy_grace_card(game_id, player_idx, websocket, state)
        elif action == "chat":
            await self._handle_chat(game_id, player_idx, websocket, state, data)
        elif action == "propose_trade":
            await self._handle_propose_trade(game_id, player_idx, websocket, state, data)
        elif action == "respond_trade":
            await self._handle_respond_trade(game_id, player_idx, websocket, state, data)
        elif action == "confirm_trade":
            await self._handle_confirm_trade(game_id, player_idx, websocket, state, data)
        elif action == "cancel_trade":
            await self._handle_cancel_trade(game_id, player_idx, websocket, state)
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

    async def _handle_chat(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState, data: dict):
        message = str(data.get("message", "")).strip()
        if not message:
            return
        if len(message) > 200:
            message = message[:200]
        entry = {"player_idx": player_idx, "name": state.players[player_idx].name, "message": message, "log_offset": len(state.log)}
        state.chat_log.append(entry)
        if len(state.chat_log) > 200:
            state.chat_log = state.chat_log[-200:]
        await self.broadcast_state(game_id)

    async def _handle_join(self, game_id: str, player_name: str, websocket: WebSocket, state: GameState):
        """接続時: 入室（状態変化なし、broadcastのみ）"""
        await self.broadcast_state(game_id)

    async def _handle_take_seat(self, game_id: str, player_name: str, websocket: WebSocket, state: GameState):
        """着席: 観戦者 → プレイヤー"""
        if state.phase != "preparing":
            await self.send_error(websocket, "Game already started")
            return
        if any(p.name == player_name for p in state.players):
            await self.send_error(websocket, "Already seated")
            return
        if len(state.players) >= 4:
            await self.send_error(websocket, "席が埋まっています")
            return
        color = PLAYER_COLORS[len(state.players)]
        state.players.append(Player(name=player_name, color=color))
        state.add_log(f"{player_name} が着席しました ({color}).")
        await self.broadcast_state(game_id)

    async def _handle_leave_seat(self, game_id: str, player_name: str, player_idx: int, websocket: WebSocket, state: GameState):
        """離席: プレイヤー → 観戦者"""
        if state.phase != "preparing":
            await self.send_error(websocket, "ゲーム開始後は離席できません")
            return
        state.players = [p for p in state.players if p.name != player_name]
        # PLAYER_COLORSを再割り当て
        for i, p in enumerate(state.players):
            p.color = PLAYER_COLORS[i]
        state.add_log(f"{player_name} が離席しました.")
        await self.broadcast_state(game_id)

    async def _handle_start_game(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState):
        if state.phase != "preparing":
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
                state.pending_robber_move = True
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
            state.pending_robber_move = True
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
        dice_triggered = (state.dice_rolled and sum(state.dice_values) == 7
                          and not state.pending_discards)
        if not dice_triggered and not state.pending_robber_move:
            await self.send_error(websocket, "Cannot move robber now")
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
        state.pending_robber_move = False
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
        if state.pending_robber_move or state.pending_discards:
            await self.send_error(websocket, "Must move robber first")
            return

        edge_id = data.get("edge_id")
        if not edge_id:
            await self.send_error(websocket, "edge_id required")
            return

        free_build = state.pending_road_building > 0
        if not free_build:
            cost = BUILD_COSTS["road"]
            if not state.can_afford(player_idx, cost):
                await self.send_error(websocket, "Cannot afford road (need 1 wood + 1 brick)")
                return

        if not state.is_edge_valid_for_road(edge_id, player_idx):
            await self.send_error(websocket, "Invalid road location")
            return

        road_piece = state.supply_piece(player_idx, "road")
        if not road_piece:
            if free_build:
                remaining = state.pending_road_building
                state.pending_road_building = 0
                state.add_log(f"{state.players[player_idx].name} has no road pieces left (forfeiting {remaining} free road(s)).")
                await self.broadcast_state(game_id)
            else:
                await self.send_error(websocket, "No road pieces left")
            return
        if not free_build:
            state.pay_cost(player_idx, BUILD_COSTS["road"])
        else:
            state.pending_road_building -= 1
        road_piece.location = edge_id
        state.update_longest_road()
        state.add_log(f"{state.players[player_idx].name} built a road.")

        winner = state.check_winner()
        if winner is not None:
            state.end_game(winner)

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
        if state.pending_robber_move or state.pending_discards:
            await self.send_error(websocket, "Must move robber first")
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
        state.add_log(f"{state.players[player_idx].name} built a settlement.")

        winner = state.check_winner()
        if winner is not None:
            state.end_game(winner)

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
        if state.pending_robber_move or state.pending_discards:
            await self.send_error(websocket, "Must move robber first")
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
        state.add_log(f"{state.players[player_idx].name} upgraded to a city.")

        winner = state.check_winner()
        if winner is not None:
            state.end_game(winner)

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
        if state.pending_robber_move or state.pending_discards:
            await self.send_error(websocket, "Must move robber first")
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

    async def _check_can_use_grace_card(self, websocket: WebSocket, state: GameState, player_idx: int, card_type: str) -> bool:
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return False
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return False
        if not state.dice_rolled:
            await self.send_error(websocket, "Must roll dice first")
            return False
        if state.grace_card_used_this_turn:
            await self.send_error(websocket, "Already used a grace card this turn")
            return False
        has_card = any(
            c for c in state.grace_cards
            if c.holder == f"player_{player_idx}" and c.type == card_type and not c.face_up
               and c.purchased_turn != state.turn_number
        )
        if not has_card:
            await self.send_error(websocket, f"No usable {card_type} card in hand")
            return False
        return True

    async def _handle_use_year_of_plenty(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState, data: dict):
        if not await self._check_can_use_grace_card(websocket, state, player_idx, "year_of_plenty"):
            return
        r1 = data.get("resource1")
        r2 = data.get("resource2")
        if r1 not in RESOURCE_TYPES or r2 not in RESOURCE_TYPES:
            await self.send_error(websocket, "Invalid resource")
            return
        need: dict[str, int] = {}
        need[r1] = need.get(r1, 0) + 1
        need[r2] = need.get(r2, 0) + 1
        for r, n in need.items():
            if state.bank_stock(r) < n:
                await self.send_error(websocket, f"Bank has only {state.bank_stock(r)} {r}")
                return
        state.use_grace_card(player_idx, "year_of_plenty")
        state.transfer_from_bank(r1, player_idx, 1)
        state.transfer_from_bank(r2, player_idx, 1)
        state.add_log(f"{state.players[player_idx].name} used Year of Plenty — received {r1} and {r2}.")
        await self.broadcast_state(game_id)

    async def _handle_use_knight(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if state.grace_card_used_this_turn:
            await self.send_error(websocket, "Already used a grace card this turn")
            return
        if state.pending_robber_move or state.pending_discards:
            await self.send_error(websocket, "Must move robber first")
            return
        has_card = any(
            c for c in state.grace_cards
            if c.holder == f"player_{player_idx}" and c.type == "knight"
            and not c.face_up and c.purchased_turn != state.turn_number
        )
        if not has_card:
            await self.send_error(websocket, "No usable knight card in hand")
            return
        state.use_grace_card(player_idx, "knight")
        state.pending_robber_move = True
        state.update_largest_army()
        state.add_log(f"{state.players[player_idx].name} played a Knight — move the robber.")
        await self.broadcast_state(game_id)

    async def _handle_use_road_building(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState):
        if not await self._check_can_use_grace_card(websocket, state, player_idx, "road_building"):
            return
        state.use_grace_card(player_idx, "road_building")
        state.pending_road_building = 2
        state.add_log(f"{state.players[player_idx].name} used Road Building — place 2 roads for free.")
        await self.broadcast_state(game_id)

    async def _handle_use_monopoly(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState, data: dict):
        if not await self._check_can_use_grace_card(websocket, state, player_idx, "monopoly"):
            return
        resource = data.get("resource")
        if resource not in RESOURCE_TYPES:
            await self.send_error(websocket, "Invalid resource")
            return
        state.use_grace_card(player_idx, "monopoly")
        total = 0
        for i in range(len(state.players)):
            if i == player_idx:
                continue
            count = state.player_resources(i).get(resource, 0)
            if count > 0:
                state.transfer_between_players(resource, i, player_idx, count)
                total += count
        state.add_log(f"{state.players[player_idx].name} used Monopoly on {resource} — collected {total}.")
        await self.broadcast_state(game_id)

    async def _handle_buy_grace_card(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if not state.dice_rolled:
            await self.send_error(websocket, "Must roll dice first")
            return
        if state.grace_deck_count() == 0:
            await self.send_error(websocket, "No grace cards left in deck")
            return
        if not state.can_afford(player_idx, GRACE_CARD_COST):
            await self.send_error(websocket, "Cannot afford grace card (need 1 wheat + 1 sheep + 1 ore)")
            return

        state.pay_cost(player_idx, GRACE_CARD_COST)
        card = state.draw_grace_card(player_idx)
        state.add_log(f"{state.players[player_idx].name} received a grace card.")

        winner = state.check_winner()
        if winner is not None:
            state.end_game(winner)

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
        state.turn_number += 1
        state.dice_rolled = False
        state.pending_road_building = 0
        state.grace_card_used_this_turn = False
        state.dice_values = (0, 0)
        state.robber_moved = False
        state.last_burst = {}
        state.pending_discards = {}
        state.robber_victims = []
        state.trade_offer = None
        state.add_log(f"{state.players[state.current_player_idx].name}'s turn. Roll the dice!")

        await self.broadcast_state(game_id)

    async def _handle_propose_trade(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState, data: dict):
        if state.phase != "playing":
            await self.send_error(websocket, "Not in playing phase")
            return
        if state.current_player_idx != player_idx:
            await self.send_error(websocket, "Not your turn")
            return
        if not state.dice_rolled:
            await self.send_error(websocket, "Must roll dice first")
            return
        if state.robber_victims or state.pending_discards:
            await self.send_error(websocket, "Cannot trade now")
            return

        give = {r: int(v) for r, v in data.get("give", {}).items() if r in RESOURCE_TYPES and int(v) > 0}
        want = {r: int(v) for r, v in data.get("want", {}).items() if r in RESOURCE_TYPES and int(v) > 0}
        if not give or not want:
            await self.send_error(websocket, "Invalid trade offer")
            return
        for r, v in give.items():
            if state.player_resources(player_idx).get(r, 0) < v:
                await self.send_error(websocket, f"Not enough {r}")
                return

        state.trade_offer = TradeOffer(offerer_idx=player_idx, give=give, want=want)
        await self.broadcast_state(game_id)

    async def _handle_respond_trade(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState, data: dict):
        if not state.trade_offer:
            await self.send_error(websocket, "No active trade offer")
            return
        if player_idx == state.trade_offer.offerer_idx:
            await self.send_error(websocket, "Cannot respond to your own offer")
            return
        response = data.get("response")
        if response not in ("accept", "reject"):
            await self.send_error(websocket, "Invalid response")
            return
        # 承諾しても資源が足りない場合は自動拒否
        if response == "accept":
            for r, v in state.trade_offer.want.items():
                if state.player_resources(player_idx).get(r, 0) < v:
                    response = "reject"
                    break
        state.trade_offer.responses[player_idx] = response

        # 全員拒否なら自動キャンセル
        other_idxs = [i for i in range(len(state.players)) if i != state.trade_offer.offerer_idx]
        if all(state.trade_offer.responses.get(i) == "reject" for i in other_idxs):
            state.trade_offer = None

        await self.broadcast_state(game_id)

    async def _handle_confirm_trade(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState, data: dict):
        if not state.trade_offer:
            await self.send_error(websocket, "No active trade offer")
            return
        if state.current_player_idx != player_idx or player_idx != state.trade_offer.offerer_idx:
            await self.send_error(websocket, "Not your offer")
            return
        target_idx = data.get("target_player_idx")
        if target_idx is None or state.trade_offer.responses.get(target_idx) != "accept":
            await self.send_error(websocket, "Target player has not accepted")
            return

        give = state.trade_offer.give
        want = state.trade_offer.want

        # 双方の手持ちを再検証
        for r, v in give.items():
            if state.player_resources(player_idx).get(r, 0) < v:
                await self.send_error(websocket, f"Offerer no longer has enough {r}")
                return
        for r, v in want.items():
            if state.player_resources(target_idx).get(r, 0) < v:
                await self.send_error(websocket, f"Target no longer has enough {r}")
                return

        # 交換実行
        for r, v in give.items():
            state.transfer_between_players(r, player_idx, target_idx, v)
        for r, v in want.items():
            state.transfer_between_players(r, target_idx, player_idx, v)

        offerer_name = state.players[player_idx].name
        target_name = state.players[target_idx].name
        give_str = ", ".join(f"{r}×{v}" for r, v in give.items())
        want_str = ", ".join(f"{r}×{v}" for r, v in want.items())
        state.add_log(f"{offerer_name} traded {give_str} → {want_str} with {target_name}.")
        state.trade_offer = None
        await self.broadcast_state(game_id)

    async def _handle_cancel_trade(self, game_id: str, player_idx: int, websocket: WebSocket, state: GameState):
        if not state.trade_offer:
            return
        if player_idx != state.trade_offer.offerer_idx:
            await self.send_error(websocket, "Not your offer")
            return
        state.trade_offer = None
        await self.broadcast_state(game_id)


# Global manager instance
manager = ConnectionManager()
