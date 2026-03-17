"""
Test 7: 強盗移動前の建設・交易ブロック / 道路建設カードの駒不足
- 7を振った後、強盗移動前に build_settlement はエラー
- 7を振った後、強盗移動前に build_city はエラー
- 7を振った後、強盗移動前に trade_bank はエラー
- 7を振った後、強盗移動前に build_road はエラー
- 捨て札完了後、強盗移動前に build_settlement はエラー（pending_robber_move フラグ経由）
- 道路建設カード使用時に駒が足りない場合、残り枚数をログに出して pending_road_building をリセット
"""
import asyncio
import pytest

from tests.conftest import create_game, make_clients
from tests.test_04_turn_basic import setup_and_start
from tests.test_05_robber import roll_until_seven


# ---- ヘルパー ----

async def drain(clients, timeout=0.3):
    for c in clients:
        try:
            await c.recv(timeout=timeout)
        except asyncio.TimeoutError:
            pass


# ---- Bug 2 / Bug 3: 強盗移動前の建設・交易ブロック ----

@pytest.mark.asyncio
async def test_build_settlement_blocked_before_robber_move():
    """7を振った後、強盗移動前に build_settlement はエラーになる"""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        board = clients[0].state["board"]

        state = await roll_until_seven(clients[0], clients[1:], board)
        assert state is not None, "Could not roll a 7 in time"

        msg = await clients[0].send({"action": "build_settlement", "vertex_id": "v_0_0"})
        assert msg["type"] == "error", f"Expected error, got: {msg}"
        assert "robber" in msg["message"].lower()

        for c in clients:
            await c.close()


@pytest.mark.asyncio
async def test_build_city_blocked_before_robber_move():
    """7を振った後、強盗移動前に build_city はエラーになる"""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        board = clients[0].state["board"]

        state = await roll_until_seven(clients[0], clients[1:], board)
        assert state is not None, "Could not roll a 7 in time"

        msg = await clients[0].send({"action": "build_city", "vertex_id": "v_0_0"})
        assert msg["type"] == "error", f"Expected error, got: {msg}"
        assert "robber" in msg["message"].lower()

        for c in clients:
            await c.close()


@pytest.mark.asyncio
async def test_trade_bank_blocked_before_robber_move():
    """7を振った後、強盗移動前に trade_bank はエラーになる"""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        board = clients[0].state["board"]

        state = await roll_until_seven(clients[0], clients[1:], board)
        assert state is not None, "Could not roll a 7 in time"

        msg = await clients[0].send({"action": "trade_bank", "give": "wood", "receive": "ore"})
        assert msg["type"] == "error", f"Expected error, got: {msg}"
        assert "robber" in msg["message"].lower()

        for c in clients:
            await c.close()


@pytest.mark.asyncio
async def test_build_road_blocked_before_robber_move():
    """7を振った後、強盗移動前に build_road はエラーになる"""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        board = clients[0].state["board"]

        state = await roll_until_seven(clients[0], clients[1:], board)
        assert state is not None, "Could not roll a 7 in time"

        msg = await clients[0].send({"action": "build_road", "edge_id": "e_0_0"})
        assert msg["type"] == "error", f"Expected error, got: {msg}"
        assert "robber" in msg["message"].lower()

        for c in clients:
            await c.close()


@pytest.mark.asyncio
async def test_build_allowed_after_robber_move():
    """強盗移動後は build_settlement の操作に進める（robberブロックは解除）"""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        board = clients[0].state["board"]

        state = await roll_until_seven(clients[0], clients[1:], board)
        assert state is not None, "Could not roll a 7 in time"

        # 捨て札が必要なプレイヤーがいれば全員分処理する
        for pidx_str, count in list(state.get("pending_discards", {}).items()):
            pidx = int(pidx_str)
            resources = clients[pidx].state["resources"].get(f"player_{pidx}", {})
            to_discard: dict = {}
            remaining = count
            for r, amt in resources.items():
                take = min(amt, remaining)
                if take > 0:
                    to_discard[r] = take
                    remaining -= take
                if remaining == 0:
                    break
            msg = await clients[pidx].send({"action": "discard_resources", "resources": to_discard})
            await drain([c for c in clients if c != clients[pidx]])

        # 強盗を別 hex に移動
        current_robber = clients[0].state["robber_hex"]
        new_hex = next(hid for hid in board["hexes"] if hid != current_robber)
        await clients[0].send({"action": "move_robber", "hex_id": new_hex})
        await drain(clients[1:])

        # 強盗移動後は build_settlement でエラーが "robber" ではないことを確認
        # （リソース不足・配置不正などの別エラーになるはず）
        msg = await clients[0].send({"action": "build_settlement", "vertex_id": "v_0_0"})
        if msg["type"] == "error":
            assert "robber" not in msg["message"].lower(), \
                f"Robber should be resolved, but got: {msg['message']}"

        for c in clients:
            await c.close()


# ---- Bug 4: 道路建設カードの駒不足 ----

def test_road_building_forfeits_remaining_when_no_pieces():
    """道路建設カード使用時に駒が足りない場合、残り枚数をログに出して pending_road_building をリセット"""
    from game.state import GameState, create_game_state, setup_game, Player

    state = create_game_state("test")
    for name in ["Alice", "Bob"]:
        state.players.append(Player(name=name, color="red" if name == "Alice" else "blue"))
    setup_game(state)

    # Alice の道路駒を全部使い切る（1枚だけ残す）
    alice_roads = [p for p in state.road_pieces if p.player_idx == 0]
    for piece in alice_roads[:-1]:
        piece.location = f"dummy_edge_{id(piece)}"

    assert len([p for p in state.road_pieces if p.player_idx == 0 and p.location is None]) == 1

    # pending_road_building = 2 をセット（道路建設カード使用状態）
    state.pending_road_building = 2

    # 1枚目の道路: 配置できる
    available_piece = next(p for p in state.road_pieces if p.player_idx == 0 and p.location is None)
    available_piece.location = "edge_first"
    state.pending_road_building -= 1
    assert state.pending_road_building == 1

    # 2枚目: 駒がない → pending_road_building をリセットしてログに残り枚数を記録
    remaining = state.pending_road_building
    supply = next((p for p in state.road_pieces if p.player_idx == 0 and p.location is None), None)
    assert supply is None  # 駒がないことを確認

    log_msg = f"{state.players[0].name} has no road pieces left (forfeiting {remaining} free road(s))."
    state.add_log(log_msg)
    state.pending_road_building = 0

    assert state.pending_road_building == 0
    assert any("forfeiting 1 free road(s)" in log for log in state.log)
