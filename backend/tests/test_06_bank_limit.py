"""
Test 6: 銀行資源上限
- bank_stock() が正しく在庫を計算する
- distribute_from_bank() が在庫足りる場合は配布する
- distribute_from_bank() が在庫不足の場合は誰にも配布しない（all-or-nothing）
- バンクトレード時に在庫不足なら拒否される
"""
import pytest

from game.state import GameState, BANK_RESOURCE_LIMIT, RESOURCE_TYPES, create_game_state, setup_game, Player


def make_state(n_players=2) -> GameState:
    state = create_game_state("test")
    for i in range(n_players):
        state.players.append(Player(name=f"P{i}", color=["red", "blue"][i]))
    setup_game(state)
    # セットアップリソースをリセットして純粋な状態にする
    state.resources = {i: {r: 0 for r in RESOURCE_TYPES} for i in range(n_players)}
    return state


def test_bank_stock_full_when_no_resources():
    state = make_state()
    for r in RESOURCE_TYPES:
        assert state.bank_stock(r) == BANK_RESOURCE_LIMIT


def test_bank_stock_decreases_with_player_holdings():
    state = make_state()
    state.resources[0]["wood"] = 5
    state.resources[1]["wood"] = 3
    assert state.bank_stock("wood") == BANK_RESOURCE_LIMIT - 8


def test_distribute_from_bank_normal():
    state = make_state()
    logs = state.distribute_from_bank({"wood": {0: 2, 1: 1}})
    assert state.resources[0]["wood"] == 2
    assert state.resources[1]["wood"] == 1
    assert all("received" in log for log in logs)


def test_distribute_from_bank_insufficient_gives_nothing():
    state = make_state()
    # 在庫を18枚使い切る（1枚残り）
    state.resources[0]["wood"] = 18
    # 2枚必要なので在庫不足 → 誰も受け取れない
    logs = state.distribute_from_bank({"wood": {1: 2}})
    assert state.resources[1]["wood"] == 0
    assert any("insufficient" in log for log in logs)


def test_distribute_from_bank_exact_stock_succeeds():
    state = make_state()
    # ちょうど在庫と同数なら払い出せる
    state.resources[0]["sheep"] = 18
    logs = state.distribute_from_bank({"sheep": {1: 1}})
    assert state.resources[1]["sheep"] == 1


def test_distribute_from_bank_multi_resource_partial():
    """在庫不足の資源だけスキップ、他は正常配布"""
    state = make_state()
    state.resources[0]["ore"] = 19  # ore 在庫 0
    logs = state.distribute_from_bank({"ore": {1: 1}, "brick": {1: 2}})
    assert state.resources[1]["ore"] == 0      # ore はスキップ
    assert state.resources[1]["brick"] == 2    # brick は配布される


def test_distribute_from_bank_multiple_players_insufficient():
    """複数プレイヤーへの合計が在庫超過 → 全員もらえない"""
    state = make_state(2)
    state.resources[0]["wheat"] = 18  # 在庫 1 枚
    # P1 と P2 で計 2 枚必要
    logs = state.distribute_from_bank({"wheat": {0: 1, 1: 1}})
    assert state.resources[0]["wheat"] == 18  # 変化なし
    assert state.resources[1]["wheat"] == 0
    assert any("insufficient" in log for log in logs)
