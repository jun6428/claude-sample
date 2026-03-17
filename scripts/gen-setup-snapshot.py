#!/usr/bin/env python3
"""
セットアップフェーズ完了後のスナップショットを生成するスクリプト。
4プレイヤーがセットアップを完了した状態のJSONを outputs/setup-complete.json に保存する。
"""
import asyncio
import json
import sys
import urllib.request
import os

import websockets

BASE_HTTP = "http://localhost:8000"
BASE_WS   = "ws://localhost:8000"
PLAYERS   = ["p1", "p2", "p3", "p4"]


def http_post(path, body=None):
    url = BASE_HTTP + path
    data = json.dumps(body).encode() if body else b""
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def http_get(path):
    with urllib.request.urlopen(BASE_HTTP + path) as r:
        return json.loads(r.read())


async def recv_state(ws):
    """次のgame_stateメッセージを受け取るまで待つ。"""
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("type") == "game_state":
            return msg["state"]


async def main():
    # 1. ゲーム作成
    game_id = http_post("/api/games")["game_id"]
    print(f"Game created: {game_id}")

    # 2. 全プレイヤー接続 & join
    conns = []
    for name in PLAYERS:
        ws = await websockets.connect(f"{BASE_WS}/ws/{game_id}/{name}")
        conns.append((name, ws))
        state = await recv_state(ws)
        print(f"  {name} joined")

    # 3. ゲーム開始
    p1_ws = conns[0][1]
    await p1_ws.send(json.dumps({"action": "start_game"}))
    # 全員に state が届くので全部受け取る
    for _, ws in conns:
        await recv_state(ws)
    print("Game started (setup phase)")

    # 4. ボードの頂点・辺を取得して配置先を決める
    state = http_get(f"/api/games/{game_id}")
    vertices = list(state["board"]["vertices"].keys())
    edges    = list(state["board"]["edges"].keys())

    # セットアップ順: round1=0,1,2,3 / round2=3,2,1,0
    setup_order = [0, 1, 2, 3, 3, 2, 1, 0]

    # 各プレイヤーが使った頂点（隣接距離チェック用に単純に別々の頂点を使う）
    used_vertices = set()
    vertex_pool = iter(vertices)
    edge_pool = iter(edges)

    def next_free_vertex(board_vertices):
        """隣接していない空き頂点を探す。"""
        for vid in vertices:
            if vid in used_vertices:
                continue
            v = board_vertices[vid]
            if any(adj in used_vertices for adj in v["adjacent_vertices"]):
                continue
            return vid
        raise RuntimeError("No free vertex found")

    def next_adjacent_edge(vid, board):
        """指定頂点に隣接する空き辺を返す。"""
        v = board["vertices"][vid]
        for eid in v["adjacent_edges"]:
            if board["edges"][eid]["v1"] == vid or board["edges"][eid]["v2"] == vid:
                return eid
        return v["adjacent_edges"][0]

    placement_vertices = []  # round2の2nd settlementのため記録

    for step, pidx in enumerate(setup_order):
        name, ws = conns[pidx]
        state = http_get(f"/api/games/{game_id}")
        board = state["board"]

        # 開拓地配置
        vid = next_free_vertex(board["vertices"])
        used_vertices.add(vid)
        await ws.send(json.dumps({"action": "place_settlement", "vertex_id": vid}))
        for _, c in conns:
            await recv_state(c)
        print(f"  {name} placed settlement at {vid}")

        if step >= 4:
            placement_vertices.append(vid)

        # 道路配置
        eid = next_adjacent_edge(vid, board)
        await ws.send(json.dumps({"action": "place_road", "edge_id": eid}))
        for _, c in conns:
            await recv_state(c)
        print(f"  {name} placed road at {eid}")

    # 5. playing フェーズになっているはず
    state = http_get(f"/api/games/{game_id}")
    assert state["phase"] == "playing", f"Expected playing, got {state['phase']}"
    print(f"Setup complete! Phase: {state['phase']}")

    # 6. スナップショット保存
    out_dir = os.path.join(os.path.dirname(__file__), "..", "snapshots")
    os.makedirs(out_dir, exist_ok=True)
    from datetime import datetime
    timestamp = datetime.now().strftime("%y%m%d%H%M%S")
    out_path = os.path.join(out_dir, f"setup-complete-{timestamp}.json")
    with open(out_path, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    print(f"Snapshot saved: {out_path}")

    # 後片付け
    for _, ws in conns:
        await ws.close()


if __name__ == "__main__":
    asyncio.run(main())
