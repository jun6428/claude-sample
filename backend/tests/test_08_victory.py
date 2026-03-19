"""
Test 8: 勝利宣言
- 10VP未満で宣言するとエラー
- 自分のターン以外で宣言するとエラー
- 10VP以上で自分のターンに宣言するとゲーム終了

VP到達ルート:
  初期開拓地 2VP
  + 道5本 → 道賞 +2VP
  + 都市2つ化 → +2VP
  + grace カード13枚購入（資源使用→銀行に戻る）→ 12枚購入 = 計25枚で honor 5枚確定 +5VP
  合計 11VP
"""
import asyncio
import pytest
import aiohttp

from tests.conftest import create_game, make_clients
from tests.test_03_setup_phase import find_adjacent_edge
from tests.test_04_turn_basic import setup_and_start


async def drain_others(clients: list, except_client):
    for c in clients:
        if c is not except_client:
            while True:
                try:
                    await c.recv(timeout=0.3)
                except asyncio.TimeoutError:
                    break


async def give_resources(client, all_clients: list, resources: dict):
    """debug_add_resource で指定資源を付与する。broadcast の詰まりを防ぐため都度 drain する。"""
    for resource, count in resources.items():
        for _ in range(count):
            await client.send({"action": "debug_add_resource", "resource": resource})
            await drain_others(all_clients, client)


async def roll_and_handle_robber(client, all_clients):
    """ダイスを振り、7が出た場合はロバーを砂漠に移動させる。"""
    await client.send({"action": "roll_dice"})
    await drain_others(all_clients, client)
    state = client.state
    for pidx_str, count in list(state.get("pending_discards", {}).items()):
        pidx = int(pidx_str)
        res = state.get("resources", {}).get(pidx_str, {})
        discard = {}
        remaining = count
        for r, cnt in sorted(res.items()):
            if remaining <= 0:
                break
            take = min(cnt, remaining)
            if take > 0:
                discard[r] = take
                remaining -= take
        await all_clients[pidx].send({"action": "discard_resources", "resources": discard})
        await drain_others(all_clients, all_clients[pidx])
    if client.state.get("pending_robber_move"):
        desert_hex = next(
            hid for hid, h in client.state["board"]["hexes"].items()
            if h["resource"] == "desert"
        )
        await client.send({"action": "move_robber", "hex_id": desert_hex})
        await drain_others(all_clients, client)


async def build_road_chain(client, all_clients, length: int):
    """既存の道・開拓地から連続して length 本の道を建設する。"""
    for _ in range(length):
        state = client.state
        my_roads = [eid for eid, pidx in state["roads"].items() if pidx == 0]
        my_buildings = [vid for vid, b in state["buildings"].items() if b["player_idx"] == 0]
        occupied_roads = set(state["roads"].keys())

        edge_id = None
        for road_eid in my_roads:
            edge = state["board"]["edges"][road_eid]
            for vid in [edge["v1"], edge["v2"]]:
                for eid in state["board"]["vertices"][vid]["adjacent_edges"]:
                    if eid not in occupied_roads:
                        edge_id = eid
                        break
                if edge_id:
                    break
            if edge_id:
                break
        if not edge_id:
            for vid in my_buildings:
                for eid in state["board"]["vertices"][vid]["adjacent_edges"]:
                    if eid not in occupied_roads:
                        edge_id = eid
                        break
                if edge_id:
                    break

        assert edge_id, "有効な道建設先が見つからない"
        await give_resources(client, all_clients, {"wood": 1, "brick": 1})
        await client.send({"action": "build_road", "edge_id": edge_id})
        await drain_others(all_clients, client)



async def buy_grace_cards(client, all_clients, count: int):
    """grace カードを count 枚購入する。資源は13枚ずつバッチで付与（銀行の戻りを活用）。"""
    remaining = count
    while remaining > 0:
        batch = min(13, remaining)
        await give_resources(client, all_clients, {"wheat": batch, "sheep": batch, "ore": batch})
        for _ in range(batch):
            await client.send({"action": "buy_grace_card"})
            await drain_others(all_clients, client)
        remaining -= batch


async def reach_10vp(clients: list):
    """
    Alice（player 0）を10VP以上に引き上げる。
    初期2VP + 道賞+2VP + 都市2つ+2VP + honor カード5枚+5VP = 11VP
    """
    alice = clients[0]

    await roll_and_handle_robber(alice, clients)

    # 道5本建設（最長道路賞 +2VP）
    await build_road_chain(alice, clients, 5)

    # 初期開拓地2つを都市化（+2VP）
    settlements = [
        vid for vid, b in alice.state["buildings"].items()
        if b["player_idx"] == 0 and b["type"] == "settlement"
    ]
    await give_resources(alice, clients, {"wheat": 4, "ore": 6})
    for vid in settlements:
        await alice.send({"action": "build_city", "vertex_id": vid})
        await drain_others(clients, alice)

    # grace デッキ25枚全購入（honor 5枚確定で +5VP）
    # 13枚購入→資源が銀行に戻る→12枚購入
    await buy_grace_cards(alice, clients, 25)

    assert alice.state.get("winner") is None, "まだ宣言していないのでゲームは継続中のはず"
    assert alice.state["phase"] == "playing"


@pytest.mark.asyncio
async def test_declare_victory_insufficient_vp():
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        alice = clients[0]
        await alice.send({"action": "roll_dice"})
        await drain_others(clients, alice)
        msg = await alice.send({"action": "declare_victory"})
        assert msg["type"] == "error"
        for c in clients:
            await c.close()


@pytest.mark.asyncio
async def test_declare_victory_not_your_turn():
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        alice = clients[0]
        bob = clients[1]
        await alice.send({"action": "roll_dice"})
        await drain_others(clients, alice)
        msg = await bob.send({"action": "declare_victory"})
        assert msg["type"] == "error"
        for c in clients:
            await c.close()


@pytest.mark.asyncio
async def test_declare_victory_success():
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        await reach_10vp(clients)

        msg = await clients[0].send({"action": "declare_victory"})
        assert msg["type"] == "game_state", f"expected game_state, got error: {msg.get('message')}"
        assert msg["state"]["phase"] == "ended"
        assert msg["state"]["winner"] == 0

        for c in clients:
            await c.close()
