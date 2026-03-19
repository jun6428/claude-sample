"""
Test 2: WebSocketでのプレイヤー参加
- 接続しただけではplayerは増えない（観戦者扱い）
- take_seatでplayerが追加される
- 4人まで着席できる
- 5人目の着席はエラー
- 同名プレイヤーは重複着席しない
"""
import asyncio
import httpx
import aiohttp
import pytest

from tests.conftest import create_game

BASE = "http://localhost:8000"
WS = "ws://localhost:8000"
HEADERS = {"Origin": "http://localhost:3000"}


async def connect(session, game_id, name):
    ws = await session.ws_connect(f"{WS}/ws/{game_id}/{name}", headers=HEADERS)
    msg = await asyncio.wait_for(ws.receive_json(), timeout=2.0)
    return ws, msg


async def connect_and_sit(session, game_id, name):
    ws, _ = await connect(session, game_id, name)
    await ws.send_json({"action": "take_seat"})
    msg = await asyncio.wait_for(ws.receive_json(), timeout=2.0)
    return ws, msg


@pytest.mark.asyncio
async def test_single_player_join():
    game_id = create_game()
    async with aiohttp.ClientSession() as session:
        ws, msg = await connect(session, game_id, "Alice")
        assert msg["type"] == "game_state"
        assert msg["state"]["phase"] == "preparing"
        # 接続だけではplayerに追加されない
        assert len(msg["state"]["players"]) == 0
        # take_seatで着席
        await ws.send_json({"action": "take_seat"})
        msg2 = await asyncio.wait_for(ws.receive_json(), timeout=2.0)
        assert len(msg2["state"]["players"]) == 1
        assert msg2["state"]["players"][0]["name"] == "Alice"
        assert msg2["state"]["players"][0]["color"] == "red"
        await ws.close()


@pytest.mark.asyncio
async def test_two_players_join():
    game_id = create_game()
    async with aiohttp.ClientSession() as session:
        ws1, _ = await connect_and_sit(session, game_id, "Alice")
        ws2, msg = await connect_and_sit(session, game_id, "Bob")
        # Bob着席時にAliceにもbroadcastされる（接続時のbroadcastが先に来る場合もあるので消化）
        broadcast = await asyncio.wait_for(ws1.receive_json(), timeout=2.0)
        if len(broadcast["state"]["players"]) < 2:
            broadcast = await asyncio.wait_for(ws1.receive_json(), timeout=2.0)
        assert len(broadcast["state"]["players"]) == 2
        assert msg["state"]["players"][1]["name"] == "Bob"
        assert msg["state"]["players"][1]["color"] == "blue"
        await ws1.close()
        await ws2.close()


@pytest.mark.asyncio
async def test_four_players_join():
    game_id = create_game()
    names = ["Alice", "Bob", "Carol", "Dave"]
    colors = ["red", "blue", "green", "orange"]
    async with aiohttp.ClientSession() as session:
        connections = []
        for name in names:
            ws, _ = await connect_and_sit(session, game_id, name)
            connections.append(ws)
            for prev_ws in connections[:-1]:
                try:
                    await asyncio.wait_for(prev_ws.receive_json(), timeout=2.0)
                except asyncio.TimeoutError:
                    pass

        state = httpx.get(f"{BASE}/api/games/{game_id}").json()
        assert len(state["players"]) == 4
        for i, color in enumerate(colors):
            assert state["players"][i]["color"] == color

        for ws in connections:
            await ws.close()


@pytest.mark.asyncio
async def test_fifth_player_rejected():
    game_id = create_game()
    async with aiohttp.ClientSession() as session:
        connections = []
        for name in ["P1", "P2", "P3", "P4"]:
            ws, _ = await connect_and_sit(session, game_id, name)
            connections.append(ws)
            for prev in connections[:-1]:
                try:
                    await asyncio.wait_for(prev.receive_json(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass

        ws5, _ = await connect(session, game_id, "P5")
        await ws5.send_json({"action": "take_seat"})
        msg5 = await asyncio.wait_for(ws5.receive_json(), timeout=2.0)
        assert msg5["type"] == "error"

        for ws in connections:
            await ws.close()
        await ws5.close()


@pytest.mark.asyncio
async def test_spectator_can_chat():
    game_id = create_game()
    async with aiohttp.ClientSession() as session:
        # Aliceは着席、Bobは観戦者（take_seatしない）
        ws_alice, _ = await connect_and_sit(session, game_id, "Alice")
        ws_bob, _ = await connect(session, game_id, "Bob")
        # Bobのjoin broadcastをAliceが受け取る
        try:
            await asyncio.wait_for(ws_alice.receive_json(), timeout=1.0)
        except asyncio.TimeoutError:
            pass

        # 観戦者Bobがチャット送信
        await ws_bob.send_json({"action": "chat", "message": "観戦中です"})

        # Bobがbroadcastを受け取る
        msg_bob = await asyncio.wait_for(ws_bob.receive_json(), timeout=2.0)
        assert msg_bob["type"] == "game_state"
        assert any(e["name"] == "Bob" and e["message"] == "観戦中です"
                   for e in msg_bob["state"]["chat_log"])

        # Aliceにもbroadcastされる
        msg_alice = await asyncio.wait_for(ws_alice.receive_json(), timeout=2.0)
        assert any(e["name"] == "Bob" and e["message"] == "観戦中です"
                   for e in msg_alice["state"]["chat_log"])

        await ws_alice.close()
        await ws_bob.close()


@pytest.mark.asyncio
async def test_duplicate_player_not_added():
    game_id = create_game()
    async with aiohttp.ClientSession() as session:
        ws1, _ = await connect_and_sit(session, game_id, "Alice")
        ws2, _ = await connect(session, game_id, "Alice")
        await ws2.send_json({"action": "take_seat"})
        await asyncio.wait_for(ws2.receive_json(), timeout=2.0)
        # 重複着席しない
        state = httpx.get(f"{BASE}/api/games/{game_id}").json()
        assert len(state["players"]) == 1
        await ws1.close()
        await ws2.close()
