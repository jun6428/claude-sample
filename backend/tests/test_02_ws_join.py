"""
Test 2: WebSocketでのプレイヤー参加
- 1人目が接続するとlobbyにplayerが追加される
- 2人目が接続するとplayerが2人になる
- 4人まで参加できる
- 5人目は参加を拒否される
- 同名プレイヤーは重複参加しない
"""
import asyncio
import json
import httpx
import aiohttp
import pytest

BASE = "http://localhost:8000"
WS = "ws://localhost:8000"
HEADERS = {"Origin": "http://localhost:3000"}


def create_game() -> str:
    return httpx.post(f"{BASE}/api/games").json()["game_id"]


async def connect(session, game_id, name):
    ws = await session.ws_connect(f"{WS}/ws/{game_id}/{name}", headers=HEADERS)
    msg = await asyncio.wait_for(ws.receive_json(), timeout=2.0)
    return ws, msg


@pytest.mark.asyncio
async def test_single_player_join():
    game_id = create_game()
    async with aiohttp.ClientSession() as session:
        ws, msg = await connect(session, game_id, "Alice")
        assert msg["type"] == "game_state"
        assert msg["state"]["phase"] == "preparing"
        players = msg["state"]["players"]
        assert len(players) == 1
        assert players[0]["name"] == "Alice"
        assert players[0]["color"] == "red"
        await ws.close()


@pytest.mark.asyncio
async def test_two_players_join():
    game_id = create_game()
    async with aiohttp.ClientSession() as session:
        ws1, _ = await connect(session, game_id, "Alice")
        ws2, msg = await connect(session, game_id, "Bob")
        # Bob接続時にAliceにもbroadcastされる
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
            ws, _ = await connect(session, game_id, name)
            connections.append(ws)
            # 他の接続のbroadcastを消化
            for prev_ws in connections[:-1]:
                await asyncio.wait_for(prev_ws.receive_json(), timeout=2.0)

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
            ws, _ = await connect(session, game_id, name)
            connections.append(ws)
            for prev in connections[:-1]:
                try:
                    await asyncio.wait_for(prev.receive_json(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass

        ws5, msg5 = await connect(session, game_id, "P5")
        assert msg5["type"] == "error"

        for ws in connections:
            await ws.close()
        await ws5.close()


@pytest.mark.asyncio
async def test_duplicate_player_not_added():
    game_id = create_game()
    async with aiohttp.ClientSession() as session:
        ws1, _ = await connect(session, game_id, "Alice")
        ws2, msg = await connect(session, game_id, "Alice")
        # 重複参加時は状態がbroadcastされるだけでplayerは1人のまま
        state = httpx.get(f"{BASE}/api/games/{game_id}").json()
        assert len(state["players"]) == 1
        await ws1.close()
        await ws2.close()
