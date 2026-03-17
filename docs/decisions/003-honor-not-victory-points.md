# ADR 003: victory_points を honor に改名する

## 決定

`victory_points` という概念を `honor`（栄誉）に改名する。

## 背景

"victory point" を語義として分析すると、`victory` が `point` を修飾する複合名詞であり、
一般的な英語の読み方では「勝利したことで得られるポイント」を意味する。

しかしゲームの実際の因果関係は逆である。

## 因果の整理

**誤った読み方（victory point）**:
> 勝利する → ポイントが得られる

**実際の因果**:
> 開拓者として栄誉を積み上げる → 10に達する → 勝利が訪れる

開拓者（プレイヤー）は、開拓地・都市・街道を築き、恵み（GraceCard）を授かることで
`honor`（栄誉）を蓄積する。10の栄誉に達したとき、初めて勝利が訪れる。

## 変更内容

| 変更前 | 変更後 |
|--------|--------|
| `Player.victory_points` | `Player.honor` |
| `get_victory_points()` | `get_honor()` |
| `recalculate_vp()` | `recalculate_honor()` |
| GraceCard type: `victory_point` | GraceCard type: `honor` |

## 影響

- 勝利条件: `player.honor >= 10`
- `honor` を直接授ける GraceCard の type 値も `honor` とする（他の type と世界観が統一される）
- `victory_points` という**メカニクスの言葉**が消え、全て**ゲーム世界の言葉**で統一される
