"""
Test 4: 1ターン正常系
- セットアップ完了後にplayingフェーズになる
- ダイスを振る前にターン終了はエラー
- ダイスロールで dice_rolled=True になる
- 同じターンに2回ダイスはエラー
- ダイス目に対応するリソースが配布される
- ターン終了で次のプレイヤーに移る
- 自分のターンでない時のアクションはエラー
"""
import asyncio
import pytest

from tests.conftest import create_game, make_clients
from tests.test_03_setup_phase import find_valid_vertex, find_adjacent_edge


async def setup_and_start(session, n_players=2):
    """ゲーム作成→参加→セットアップ完了まで進める。clientsを返す"""
    game_id = create_game()
    names = ["Alice", "Bob", "Carol", "Dave"][:n_players]
    clients = await make_clients(session, game_id, names)

    await clients[0].send({"action": "start_game"})
    for c in clients[1:]:
        try: await c.recv(timeout=0.5)
        except asyncio.TimeoutError: pass

    # セットアップを全員分こなす
    order = list(range(n_players)) + list(reversed(range(n_players)))
    for ci in order:
        state = clients[0].state
        vid = find_valid_vertex(state)
        await clients[ci].send({"action": "place_settlement", "vertex_id": vid, "is_city": False})
        for other in clients:
            if other != clients[ci]:
                try: await other.recv(timeout=0.3)
                except asyncio.TimeoutError: pass
        state = clients[0].state
        eid = find_adjacent_edge(state, vid, ci)
        await clients[ci].send({"action": "place_road", "edge_id": eid})
        for other in clients:
            if other != clients[ci]:
                try: await other.recv(timeout=0.3)
                except asyncio.TimeoutError: pass

    assert clients[0].state["phase"] == "playing"
    return clients


@pytest.mark.asyncio
async def test_end_turn_before_roll_is_error():
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        msg = await clients[0].send({"action": "end_turn"})
        assert msg["type"] == "error"
        for c in clients: await c.close()


@pytest.mark.asyncio
async def test_roll_dice_sets_flag():
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        msg = await clients[0].send({"action": "roll_dice"})
        for c in clients[1:]:
            try: await c.recv(timeout=0.3)
            except asyncio.TimeoutError: pass
        assert msg["state"]["dice_rolled"] is True
        total = sum(msg["state"]["dice_values"])
        assert 2 <= total <= 12
        for c in clients: await c.close()


@pytest.mark.asyncio
async def test_cannot_roll_twice():
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        await clients[0].send({"action": "roll_dice"})
        for c in clients[1:]:
            try: await c.recv(timeout=0.3)
            except asyncio.TimeoutError: pass
        msg = await clients[0].send({"action": "roll_dice"})
        assert msg["type"] == "error"
        for c in clients: await c.close()


@pytest.mark.asyncio
async def test_end_turn_advances_player():
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)

        state = clients[0].state
        # 7が出るとロバー移動が必要なのでスキップできないため、ダイスが7以外になるまで試行
        for _ in range(20):
            msg = await clients[0].send({"action": "roll_dice"})
            for c in clients[1:]:
                try: await c.recv(timeout=0.3)
                except asyncio.TimeoutError: pass
            total = sum(msg["state"]["dice_values"])
            if total != 7:
                break
            # 7が出たらロバーを移動してリトライできないので、ターンを終わらせる前にロバー移動
            robber_hex = msg["state"]["robber_hex"]
            for hid in msg["state"]["board"]["hexes"]:
                if hid != robber_hex:
                    await clients[0].send({"action": "move_robber", "hex_id": hid})
                    for c in clients[1:]:
                        try: await c.recv(timeout=0.3)
                        except asyncio.TimeoutError: pass
                    break
            break

        msg = await clients[0].send({"action": "end_turn"})
        for c in clients[1:]:
            try: await c.recv(timeout=0.3)
            except asyncio.TimeoutError: pass
        assert msg["state"]["current_player_idx"] == 1
        assert msg["state"]["dice_rolled"] is False
        for c in clients: await c.close()


@pytest.mark.asyncio
async def test_other_player_cannot_act_on_my_turn():
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)
        # Bobがロール（Aliceのターン）
        msg = await clients[1].send({"action": "roll_dice"})
        assert msg["type"] == "error"
        for c in clients: await c.close()


@pytest.mark.asyncio
async def test_resource_distributed_on_roll():
    """ダイス目に対応するタイルに隣接する開拓地にリソースが配布される"""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        clients = await setup_and_start(session)

        state = clients[0].state
        buildings = state["buildings"]
        board = state["board"]

        # 初期リソース合計
        initial_total = sum(
            sum(r.values()) for r in state["resources"].values()
        )

        # ロール（7以外まで繰り返す）
        for _ in range(30):
            msg = await clients[0].send({"action": "roll_dice"})
            for c in clients[1:]:
                try: await c.recv(timeout=0.3)
                except asyncio.TimeoutError: pass
            total = sum(msg["state"]["dice_values"])
            if total == 7:
                # ロバー移動してターン終了
                robber_hex = msg["state"]["robber_hex"]
                for hid in board["hexes"]:
                    if hid != robber_hex:
                        await clients[0].send({"action": "move_robber", "hex_id": hid})
                        for c in clients[1:]:
                            try: await c.recv(timeout=0.3)
                            except asyncio.TimeoutError: pass
                        break
                await clients[0].send({"action": "end_turn"})
                for c in clients[1:]:
                    try: await c.recv(timeout=0.3)
                    except asyncio.TimeoutError: pass
                # 次のターンはBobなのでAliceに戻す
                await clients[1].send({"action": "roll_dice"})
                for c in clients:
                    if c != clients[1]:
                        try: await c.recv(timeout=0.3)
                        except asyncio.TimeoutError: pass
                b_total = sum(msg["state"]["dice_values"])
                if b_total == 7:
                    robber_hex = clients[0].state["robber_hex"]
                    for hid in board["hexes"]:
                        if hid != robber_hex:
                            await clients[1].send({"action": "move_robber", "hex_id": hid})
                            for c in clients:
                                if c != clients[1]:
                                    try: await c.recv(timeout=0.3)
                                    except asyncio.TimeoutError: pass
                            break
                await clients[1].send({"action": "end_turn"})
                for c in clients:
                    if c != clients[1]:
                        try: await c.recv(timeout=0.3)
                        except asyncio.TimeoutError: pass
                continue

            # 7以外: リソース配布を確認
            new_state = clients[0].state
            new_total = sum(sum(r.values()) for r in new_state["resources"].values())

            # 対象タイルに開拓地が隣接していればリソースが増えているはず
            hexes_with_number = [
                hid for hid, h in board["hexes"].items()
                if h["number"] == total and hid != new_state["robber_hex"]
            ]
            has_adjacent_building = any(
                vid in buildings
                for hid in hexes_with_number
                for vid in board["hexes"][hid]["vertex_ids"]
            )

            if has_adjacent_building:
                assert new_total > initial_total, \
                    f"Expected resources to increase on roll {total}, but total stayed at {new_total}"
            break

        for c in clients: await c.close()
