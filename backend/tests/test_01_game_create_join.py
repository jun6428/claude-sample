"""
Test 1: ゲーム作成・参加 (REST APIのみ)
- POST /api/games でゲームが作成できる
- GET /api/games/{game_id} でゲーム情報が取得できる
- GET /api/games で一覧が取得できる
- 存在しないgame_idは404を返す
"""
import httpx
import pytest

BASE = "http://localhost:8000"


def test_create_game():
    r = httpx.post(f"{BASE}/api/games")
    assert r.status_code == 200
    data = r.json()
    assert "game_id" in data
    assert len(data["game_id"]) == 8


def test_get_game():
    game_id = httpx.post(f"{BASE}/api/games").json()["game_id"]
    r = httpx.get(f"{BASE}/api/games/{game_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["game_id"] == game_id
    assert data["phase"] == "preparing"
    assert data["players"] == []


def test_list_games():
    r = httpx.get(f"{BASE}/api/games")
    assert r.status_code == 200
    assert "games" in r.json()


def test_get_nonexistent_game():
    r = httpx.get(f"{BASE}/api/games/00000000")
    assert r.status_code == 404
