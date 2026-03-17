#!/usr/bin/env python3
"""
セットアップフェーズを自動完了するスクリプト。

開拓地: 各頂点のhex pips合計が高い順に配置（資源種別無視）
道路  : 開拓地から最寄り港に向かう辺を選択

使い方:
  python3 scripts/auto-setup.py [GAME_ID]
  GAME_ID を省略すると新規ゲームを作成して自動セットアップまで行う。
"""
import asyncio
import json
import math
import sys
import urllib.request

import websockets

BASE_HTTP = "http://localhost:8000"
BASE_WS   = "ws://localhost:8000"
PLAYERS   = ["p1", "p2", "p3", "p4"]

NUMBER_PIPS = {2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1}


def http_post(path):
    req = urllib.request.Request(BASE_HTTP + path, data=b"",
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def http_get(path):
    with urllib.request.urlopen(BASE_HTTP + path) as r:
        return json.loads(r.read())


async def recv_state(ws):
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("type") == "game_state":
            return msg["state"]


def vertex_pips(vid, board):
    """頂点に隣接するhexのpips合計を返す。"""
    total = 0
    for hid in board["vertices"][vid]["adjacent_hexes"]:
        n = board["hexes"].get(hid, {}).get("number")
        total += NUMBER_PIPS.get(n, 0)
    return total


def port_vertices(board):
    """全ての港頂点のセットを返す。"""
    result = set()
    for port in board.get("ports", []):
        for vid in port["vertex_ids"]:
            result.add(vid)
    return result


def dist(v1, v2, board):
    """2頂点間のユークリッド距離。"""
    a = board["vertices"][v1]
    b = board["vertices"][v2]
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def best_road_toward_port(settlement_vid, board, port_vids):
    """
    開拓地頂点から最寄り港に向かう辺を選ぶ。
    各隣接辺の反対側頂点から最寄り港頂点への距離が最短の辺を返す。
    """
    best_eid = None
    best_d = float("inf")
    for eid in board["vertices"][settlement_vid]["adjacent_edges"]:
        edge = board["edges"][eid]
        other = edge["v2"] if edge["v1"] == settlement_vid else edge["v1"]
        d = min(dist(other, pv, board) for pv in port_vids)
        if d < best_d:
            best_d = d
            best_eid = eid
    return best_eid


def sorted_vertices_by_pips(board):
    """pips合計の降順に頂点リストを返す。"""
    vids = list(board["vertices"].keys())
    return sorted(vids, key=lambda v: vertex_pips(v, board), reverse=True)


def pick_settlement(board, used):
    """
    pips合計が最大で、distance ruleを守る空き頂点を返す。
    """
    for vid in sorted_vertices_by_pips(board):
        if vid in used:
            continue
        neighbors = board["vertices"][vid]["adjacent_vertices"]
        if any(n in used for n in neighbors):
            continue
        return vid
    raise RuntimeError("No valid vertex found")


async def main():
    game_id = sys.argv[1] if len(sys.argv) > 1 else None

    if game_id is None:
        game_id = http_post("/api/games")["game_id"]
        print(f"Game created: {game_id}")
    else:
        print(f"Using existing game: {game_id}")

    # 全プレイヤー接続
    conns = []
    for name in PLAYERS:
        ws = await websockets.connect(
            f"{BASE_WS}/ws/{game_id}/{name}",
            extra_headers={"Origin": "http://localhost:3000"},
        )
        conns.append((name, ws))
        await recv_state(ws)
        print(f"  {name} joined")

    # ゲーム開始
    await conns[0][1].send(json.dumps({"action": "start_game"}))
    for _, ws in conns:
        await recv_state(ws)
    print("Game started (setup phase)")

    # セットアップ順: round1=0,1,2,3 / round2=3,2,1,0
    setup_order = [0, 1, 2, 3, 3, 2, 1, 0]
    used_vertices = set()

    for pidx in setup_order:
        name, ws = conns[pidx]
        board = http_get(f"/api/games/{game_id}")["board"]
        port_vids = port_vertices(board)

        # 開拓地: pips最大の空き頂点
        vid = pick_settlement(board, used_vertices)
        used_vertices.add(vid)
        pips = vertex_pips(vid, board)

        await ws.send(json.dumps({"action": "place_settlement", "vertex_id": vid}))
        for _, c in conns:
            await recv_state(c)
        print(f"  {name}: settlement → {vid} (pips={pips})")

        # 道路: 最寄り港方向
        eid = best_road_toward_port(vid, board, port_vids)
        await ws.send(json.dumps({"action": "place_road", "edge_id": eid}))
        for _, c in conns:
            await recv_state(c)
        print(f"  {name}: road      → {eid}")

    state = http_get(f"/api/games/{game_id}")
    assert state["phase"] == "playing", f"Unexpected phase: {state['phase']}"
    print(f"\nSetup complete! URL: http://localhost:3000/game/{game_id}")

    for _, ws in conns:
        await ws.close()


if __name__ == "__main__":
    asyncio.run(main())
