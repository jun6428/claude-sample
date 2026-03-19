"""
Test 1: ゲーム一覧・参加 (REST APIのみ)
- POST /api/games は廃止済み（410を返す）
- GET /api/games で10部屋が事前生成されている
- GET /api/games/{game_id} でゲーム情報が取得できる
- 存在しないgame_idは404を返す
"""
import httpx
import pytest

from tests.conftest import create_game

BASE = "http://localhost:8000"


def test_create_game_is_gone():
    r = httpx.post(f"{BASE}/api/games")
    assert r.status_code == 410


def test_list_games_has_10_rooms():
    r = httpx.get(f"{BASE}/api/games")
    assert r.status_code == 200
    games = r.json()["games"]
    assert len(games) == 10
    room_numbers = sorted(g["room_number"] for g in games)
    assert room_numbers == list(range(1, 11))


def test_get_game():
    game_id = create_game()
    r = httpx.get(f"{BASE}/api/games/{game_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["game_id"] == game_id
    assert data["phase"] == "preparing"
    assert data["players"] == []


def test_get_nonexistent_game():
    r = httpx.get(f"{BASE}/api/games/00000000")
    assert r.status_code == 404
