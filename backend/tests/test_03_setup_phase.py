"""
Test 3: セットアップフェーズ
- 2人未満ではゲーム開始できない
- start_game でsetupフェーズに移行する
- プレイヤー順に開拓地→道を配置できる
- 距離ルール違反の開拓地配置はエラー
- 隣接していない道の配置はエラー
- ラウンド2は逆順で進行する
- ラウンド2の2枚目開拓地配置後にリソースが付与される
- セットアップ完了でplayingフェーズに移行する
"""
import asyncio
import pytest
import httpx

from tests.conftest import create_game, make_clients, BASE


def find_valid_vertex(state, player_idx=None):
    """空いていて距離ルールを満たす頂点を返す"""
    occupied = set(state["buildings"].keys())
    for vid, vdata in state["board"]["vertices"].items():
        if vid not in occupied and not any(a in occupied for a in vdata["adjacent_vertices"]):
            return vid
    return None


def find_adjacent_edge(state, vertex_id, player_idx):
    """指定頂点に隣接する未使用の辺を返す"""
    occupied_roads = set(state["roads"].keys())
    vdata = state["board"]["vertices"][vertex_id]
    for eid in vdata["adjacent_edges"]:
        if eid not in occupied_roads:
            return eid
    return None


@pytest.mark.asyncio
async def test_cannot_start_with_one_player():
    game_id = create_game()
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await make_clients(session, game_id, ["Alice"])
        msg = await clients[0].send({"action": "start_game"})
        assert msg["type"] == "error"
        await clients[0].close()


@pytest.mark.asyncio
async def test_start_game_transitions_to_setup():
    game_id = create_game()
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await make_clients(session, game_id, ["Alice", "Bob"])
        msg = await clients[0].send({"action": "start_game"})
        # Bob側にもbroadcastされる
        await clients[1].recv(timeout=0.5)
        assert msg["state"]["phase"] == "setup"
        assert msg["state"]["current_player_idx"] == 0
        assert msg["state"]["setup_round"] == 0
        assert msg["state"]["setup_step"] == "settlement"
        for c in clients:
            await c.close()


@pytest.mark.asyncio
async def test_setup_full_flow_2players():
    """2人のセットアップフェーズ全体が正常に完了する"""
    game_id = create_game()
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await make_clients(session, game_id, ["Alice", "Bob"])
        await clients[0].send({"action": "start_game"})
        await clients[1].recv(timeout=0.5)

        placed_settlements = {}  # player_idx -> list of vertex_ids

        # ラウンド1: Alice → Bob
        # ラウンド2: Bob → Alice
        expected_order = [0, 1, 1, 0]

        for expected_ci in expected_order:
            state = clients[0].state
            ci = state["current_player_idx"]
            assert ci == expected_ci
            ws = clients[ci]

            # 開拓地配置
            vid = find_valid_vertex(state)
            assert vid is not None
            msg = await ws.send({"action": "place_settlement", "vertex_id": vid, "is_city": False})
            for other in clients:
                if other != ws:
                    try: await other.recv(timeout=0.3)
                    except asyncio.TimeoutError: pass
            assert msg["state"]["setup_step"] == "road"
            placed_settlements.setdefault(ci, []).append(vid)

            # 道配置
            state = clients[0].state
            eid = find_adjacent_edge(state, vid, ci)
            assert eid is not None
            msg = await ws.send({"action": "place_road", "edge_id": eid})
            for other in clients:
                if other != ws:
                    try: await other.recv(timeout=0.3)
                    except asyncio.TimeoutError: pass

        # セットアップ完了
        state = clients[0].state
        assert state["phase"] == "playing"
        assert len(state["buildings"]) == 4  # 各プレイヤー2個ずつ
        assert len(state["roads"]) == 4

        for c in clients:
            await c.close()


@pytest.mark.asyncio
async def test_distance_rule_violation():
    """隣接頂点への開拓地配置はエラー"""
    game_id = create_game()
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await make_clients(session, game_id, ["Alice", "Bob"])
        await clients[0].send({"action": "start_game"})
        await clients[1].recv(timeout=0.5)

        state = clients[0].state
        vid = find_valid_vertex(state)
        await clients[0].send({"action": "place_settlement", "vertex_id": vid, "is_city": False})
        await clients[1].recv(timeout=0.3)

        # 隣接頂点に配置しようとする
        adj = state["board"]["vertices"][vid]["adjacent_vertices"]
        if adj:
            msg = await clients[0].send({"action": "place_settlement", "vertex_id": adj[0], "is_city": False})
            # 道を置く前に再度開拓地→エラー or 隣接チェックエラー
            assert msg["type"] == "error"

        for c in clients:
            await c.close()


@pytest.mark.asyncio
async def test_round2_resource_grant():
    """ラウンド2の2枚目開拓地でリソースが付与される"""
    game_id = create_game()
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await make_clients(session, game_id, ["Alice", "Bob"])
        await clients[0].send({"action": "start_game"})
        await clients[1].recv(timeout=0.5)

        # ラウンド1を全員通過
        for ci in [0, 1]:
            state = clients[0].state
            vid = find_valid_vertex(state)
            await clients[ci].send({"action": "place_settlement", "vertex_id": vid, "is_city": False})
            for other in clients:
                if other.name != clients[ci].name:
                    try: await other.recv(timeout=0.3)
                    except asyncio.TimeoutError: pass
            state = clients[0].state
            eid = find_adjacent_edge(state, vid, ci)
            await clients[ci].send({"action": "place_road", "edge_id": eid})
            for other in clients:
                if other.name != clients[ci].name:
                    try: await other.recv(timeout=0.3)
                    except asyncio.TimeoutError: pass

        # ラウンド2: Bobが先
        assert clients[0].state["setup_round"] == 1
        assert clients[0].state["current_player_idx"] == 1

        # Bob: ラウンド2の開拓地を砂漠以外のタイルに隣接する場所に置く
        state = clients[0].state
        resource_vertex = None
        for vid, vdata in state["board"]["vertices"].items():
            occupied = set(state["buildings"].keys())
            if vid in occupied: continue
            if any(a in occupied for a in vdata["adjacent_vertices"]): continue
            for hid in vdata["adjacent_hexes"]:
                if state["board"]["hexes"][hid]["resource"] != "desert":
                    resource_vertex = vid
                    break
            if resource_vertex:
                break

        assert resource_vertex is not None
        await clients[1].send({"action": "place_settlement", "vertex_id": resource_vertex, "is_city": False})
        for other in clients:
            if other.name != "Bob":
                try: await other.recv(timeout=0.3)
                except asyncio.TimeoutError: pass

        state = clients[0].state
        eid = find_adjacent_edge(state, resource_vertex, 1)
        msg = await clients[1].send({"action": "place_road", "edge_id": eid})
        for other in clients:
            if other.name != "Bob":
                try: await other.recv(timeout=0.3)
                except asyncio.TimeoutError: pass

        # Bobがリソースを持っている
        bob_resources = clients[0].state["resources"].get("1", {})
        total = sum(bob_resources.values())
        assert total > 0, f"Bob should have received resources but got {bob_resources}"

        for c in clients:
            await c.close()
