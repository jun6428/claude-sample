"""
共通フィクスチャ
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


class GameClient:
    """WebSocket接続を1プレイヤー分ラップするヘルパー"""

    def __init__(self, ws, name: str):
        self.ws = ws
        self.name = name
        self.state = {}

    async def recv(self, timeout=2.0) -> dict:
        msg = await asyncio.wait_for(self.ws.receive_json(), timeout=timeout)
        if msg.get("type") == "game_state":
            self.state = msg["state"]
        return msg

    async def send(self, action: dict, drain=True) -> dict | None:
        await self.ws.send_json(action)
        if drain:
            return await self.recv()
        return None

    async def close(self):
        await self.ws.close()


async def make_clients(session, game_id: str, names: list[str]) -> list[GameClient]:
    clients = []
    for name in names:
        ws = await session.ws_connect(f"{WS}/ws/{game_id}/{name}", headers=HEADERS)
        client = GameClient(ws, name)
        msg = await client.recv()
        # 先に接続済みのクライアントへのbroadcastを消化
        for prev in clients:
            try:
                await prev.recv(timeout=0.5)
            except asyncio.TimeoutError:
                pass
        clients.append(client)
    return clients
