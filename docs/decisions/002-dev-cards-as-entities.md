# ADR 002: 発展カードをエンティティとしてモデリングする

## 決定

発展カードを `DevCard` エンティティのリストで管理する。
デッキ・手札・使用済みを別々のデータ構造で持つのではなく、
全25枚が常に存在し `holder` と `face_up` で状態を表現する。

```python
@dataclass
class DevCard:
    type: str           # knight | victory_point | road_building | year_of_plenty | monopoly
    holder: str         # "deck" | "player_0" | "player_1" | ...
    face_up: bool = False
    purchased_turn: int = -1  # -1 = まだデッキ内
```

## 背景

ADR 001 と同じ理由：発展カードも合計25枚という物理的な上限を持つコモディティ。
「デッキが何枚残っているか」「誰が何枚持っているか」はエンティティの集計として自然に得られる。

## `holder` の設計

`holder` は**所有者のみ**を表す。状態を混入させない。

```
"deck"     — まだ誰も持っていない
"player_0" — プレイヤー0が持っている
"player_1" — プレイヤー1が持っている
```

### `"played_0"` のような値を使わない理由

`holder = "played_0"` は「プレイヤー0が持っている」と「使用済み」という
2つの概念を1つのフィールドに混入させている。これは単一責任の違反であり、
`holder` の意味が「所有者」から「所有者＋状態」に膨らんでしまう。

使用済みかどうかは `face_up` で独立して表現する。

## `face_up` の設計

`face_up` は `holder` から導出できない独立した状態。

| 状態 | `holder` | `face_up` |
|------|----------|-----------|
| デッキ内 | `"deck"` | False |
| 手札（未使用） | `"player_N"` | False |
| 使用済み（騎士・アクション） | `"player_N"` | True |
| 勝利点（ゲーム中） | `"player_N"` | False |
| 勝利点（ゲーム終了） | `"player_N"` | True |

## 恩恵

- `to_dict()` の公開ロジックが `face_up or holder == viewer` で素直に書ける
- 最大騎士力の集計が `face_up == True and type == "knight"` で自然に取れる
- ゲーム終了時のVP公開は全カードの `face_up = True` にするだけ
- 「使用済み枚数チェックを実装したか」という議論が不要になる（ADR 001 と同じ効果）
