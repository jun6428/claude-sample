from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import json

from game.manager import manager
from game.state import GameState

app = FastAPI(title="Catan Board Game API")

import os

_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
_allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Catan Game API", "version": "1.0.0"}


@app.post("/api/games")
async def create_game():
    """Create a new game room."""
    game_id = manager.create_game()
    return {"game_id": game_id}


@app.get("/api/games/{game_id}")
async def get_game(game_id: str):
    """Get game state."""
    state = manager.get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")
    return state.to_dict()


@app.get("/api/games")
async def list_games():
    """List all active games."""
    games = []
    for game_id, state in manager.games.items():
        games.append({
            "game_id": game_id,
            "phase": state.phase,
            "player_count": len(state.players),
            "players": [p.name for p in state.players],
        })
    return {"games": games}


@app.get("/api/games/{game_id}/snapshot")
async def get_snapshot(game_id: str):
    """Download current game state as a snapshot."""
    state = manager.get_game(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")
    return state.to_dict()


@app.post("/api/games/{game_id}/snapshot")
async def load_snapshot(game_id: str, data: dict):
    """Restore game state from a snapshot."""
    if game_id not in manager.games:
        raise HTTPException(status_code=404, detail="Game not found")
    manager.games[game_id] = GameState.from_dict(data)
    return {"ok": True}


@app.websocket("/ws/{game_id}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, game_id: str, player_name: str):
    """WebSocket endpoint for game communication."""
    state = manager.get_game(game_id)
    if not state:
        await websocket.close(code=4004, reason="Game not found")
        return

    await manager.connect(game_id, player_name, websocket)
    await manager.handle_action(game_id, player_name, websocket, {"action": "join_game"})

    try:
        while True:
            data = await websocket.receive_json()
            await manager.handle_action(game_id, player_name, websocket, data)
    except WebSocketDisconnect:
        manager.disconnect(game_id, player_name, websocket)
        state = manager.get_game(game_id)
        if state:
            await manager.broadcast_state(game_id)
    except Exception as e:
        manager.disconnect(game_id, player_name, websocket)
