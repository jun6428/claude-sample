'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { GameState, PLAYER_COLOR_MAP, RESOURCE_COLORS, RESOURCE_LABELS, PORT_EMOJI } from '@/lib/types';
import HexTile from './HexTile';
import { GameAction } from '@/lib/types';
import { useGameStore } from '@/store/gameStore';

const HEX_SIZE = 60;
const BOARD_PADDING = 80;

function hexToPixel(q: number, r: number, size: number): [number, number] {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * (1.5 * r);
  return [x, y];
}

interface BoardProps {
  gameState: GameState;
  myPlayerIdx: number | null;
  sendAction: (action: GameAction) => void;
  selectedAction: string | null;
}

export default function Board({ gameState, myPlayerIdx, sendAction, selectedAction }: BoardProps) {
  const { board, buildings, roads, robber_hex, phase, setup_step, current_player_idx } = gameState;
  const isMyTurn = myPlayerIdx !== null && current_player_idx === myPlayerIdx;
  const setSelectedAction = useGameStore((s) => s.setSelectedAction);
  const [pendingEdge, setPendingEdge] = useState<string | null>(null);
  useEffect(() => { setPendingEdge(null); }, [roads]);

  // Compute bounding box for SVG viewport
  const { minX, minY, maxX, maxY } = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const hex of Object.values(board.hexes)) {
      const [x, y] = hexToPixel(hex.q, hex.r, HEX_SIZE);
      minX = Math.min(minX, x - HEX_SIZE);
      minY = Math.min(minY, y - HEX_SIZE);
      maxX = Math.max(maxX, x + HEX_SIZE);
      maxY = Math.max(maxY, y + HEX_SIZE);
    }
    return { minX, minY, maxX, maxY };
  }, [board]);

  const svgWidth = maxX - minX + BOARD_PADDING * 2;
  const svgHeight = maxY - minY + BOARD_PADDING * 2;
  const offsetX = -minX + BOARD_PADDING;
  const offsetY = -minY + BOARD_PADDING;

  // Determine clickable vertices/edges/hexes
  const clickableVertices = useMemo(() => {
    if (!isMyTurn) return new Set<string>();
    if (phase === 'setup') {
      if (setup_step === 'settlement') {
        return new Set(
          Object.keys(board.vertices).filter((vid) =>
            gameState.buildings[vid] === undefined &&
            !(Object.values(board.vertices[vid].adjacent_vertices).some(
              (adjVid) => buildings[adjVid as string] !== undefined
            ))
          )
        );
      }
      return new Set<string>();
    }
    if (phase === 'playing' && gameState.dice_rolled) {
      if (selectedAction === 'build_settlement') {
        return new Set(
          Object.keys(board.vertices).filter((vid) => {
            if (buildings[vid]) return false;
            const v = board.vertices[vid];
            if (v.adjacent_vertices.some((adj) => buildings[adj])) return false;
            return v.adjacent_edges.some((eid) => roads[eid] === myPlayerIdx);
          })
        );
      }
      if (selectedAction === 'build_city') {
        return new Set(
          Object.keys(buildings).filter(
            (vid) => buildings[vid].type === 'settlement' && buildings[vid].player_idx === myPlayerIdx
          )
        );
      }
    }
    return new Set<string>();
  }, [isMyTurn, phase, setup_step, board, buildings, roads, myPlayerIdx, selectedAction, gameState.dice_rolled]);

  const clickableEdges = useMemo(() => {
    if (!isMyTurn) return new Set<string>();
    if (phase === 'setup' && setup_step === 'road') {
      // Find last placed settlement vertex
      const playerBuildings = Object.entries(buildings)
        .filter(([, b]) => b.player_idx === myPlayerIdx && b.type === 'settlement')
        .map(([vid]) => vid);
      const lastSettlement = playerBuildings[playerBuildings.length - 1];
      if (!lastSettlement) return new Set<string>();
      const v = board.vertices[lastSettlement];
      return new Set(v?.adjacent_edges.filter((eid) => !roads[eid]) || []);
    }
    if (phase === 'playing' && (selectedAction === 'build_road' || (gameState.pending_road_building ?? 0) > 0) && gameState.dice_rolled) {
      return new Set(
        Object.keys(board.edges).filter((eid) => {
          if (roads[eid] !== undefined || eid === pendingEdge) return false;
          const edge = board.edges[eid];
          for (const vid of [edge.v1, edge.v2]) {
            const building = buildings[vid];
            if (building && building.player_idx === myPlayerIdx) return true;
            const v = board.vertices[vid];
            if (v?.adjacent_edges.some((ae) => ae !== eid && roads[ae] === myPlayerIdx)) {
              // Check no opponent building blocks
              const blocker = buildings[vid];
              if (!blocker || blocker.player_idx === myPlayerIdx) return true;
            }
          }
          return false;
        })
      );
    }
    return new Set<string>();
  }, [isMyTurn, phase, setup_step, board, buildings, roads, myPlayerIdx, selectedAction, gameState.dice_rolled, pendingEdge]);

  const clickableHexes = useMemo(() => {
    if (!isMyTurn) return new Set<string>();
    if (phase === 'playing' && gameState.dice_rolled &&
        gameState.dice_values[0] + gameState.dice_values[1] === 7 &&
        Object.keys(gameState.pending_discards).length === 0) {
      return new Set(
        Object.keys(board.hexes).filter((hid) => hid !== robber_hex)
      );
    }
    return new Set<string>();
  }, [isMyTurn, phase, gameState.dice_rolled, gameState.dice_values, gameState.pending_discards, board, robber_hex]);

  const handleVertexClick = (vid: string) => {
    if (!clickableVertices.has(vid)) return;
    if (phase === 'setup') {
      sendAction({ action: 'place_settlement', vertex_id: vid, is_city: false });
    } else if (selectedAction === 'build_settlement') {
      sendAction({ action: 'build_settlement', vertex_id: vid });
      setSelectedAction(null);
    } else if (selectedAction === 'build_city') {
      sendAction({ action: 'build_city', vertex_id: vid });
      setSelectedAction(null);
    }
  };

  const handleEdgeClick = (eid: string) => {
    if (!clickableEdges.has(eid)) return;
    if (phase === 'setup') {
      sendAction({ action: 'place_road', edge_id: eid });
    } else if (selectedAction === 'build_road' || (gameState.pending_road_building ?? 0) > 0) {
      setPendingEdge(eid);
      sendAction({ action: 'build_road', edge_id: eid });
    }
  };

  const handleHexClick = (hexId: string) => {
    if (!clickableHexes.has(hexId)) return;
    sendAction({ action: 'move_robber', hex_id: hexId });
  };

  const showVertices = clickableVertices.size > 0 || Object.keys(buildings).length > 0;
  const showEdges = clickableEdges.size > 0 || Object.keys(roads).length > 0;

  return (
    <div className="overflow-auto flex items-center justify-center">
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      >
        <g transform={`translate(${offsetX}, ${offsetY})`}>
          {/* Render hexes */}
          {Object.values(board.hexes).map((hex) => {
            const [cx, cy] = hexToPixel(hex.q, hex.r, HEX_SIZE);
            return (
              <HexTile
                key={hex.hex_id}
                hex={hex}
                cx={cx}
                cy={cy}
                size={HEX_SIZE}
                hasRobber={robber_hex === hex.hex_id}
                isHighlighted={clickableHexes.has(hex.hex_id)}
onClick={clickableHexes.has(hex.hex_id) ? () => handleHexClick(hex.hex_id) : undefined}
              />
            );
          })}

          {/* Render roads */}
          {Object.entries(roads).map(([eid, pidx]) => {
            const edge = board.edges[eid];
            if (!edge) return null;
            const v1 = board.vertices[edge.v1];
            const v2 = board.vertices[edge.v2];
            if (!v1 || !v2) return null;
            const color = gameState.players[pidx]?.color || 'gray';
            return (
              <line
                key={eid}
                x1={v1.x}
                y1={v1.y}
                x2={v2.x}
                y2={v2.y}
                stroke={PLAYER_COLOR_MAP[color] || color}
                strokeWidth={6}
                strokeLinecap="round"
              />
            );
          })}

          {/* Render clickable edge highlights */}
          {(() => {
            const myColor = myPlayerIdx !== null ? PLAYER_COLOR_MAP[gameState.players[myPlayerIdx]?.color] : '#FBBF24';
            return Array.from(clickableEdges).map((eid) => {
              if (roads[eid] !== undefined) return null;
              const edge = board.edges[eid];
              if (!edge) return null;
              const v1 = board.vertices[edge.v1];
              const v2 = board.vertices[edge.v2];
              if (!v1 || !v2) return null;
              return (
                <g key={`highlight-${eid}`} style={{ cursor: 'pointer' }} onClick={() => handleEdgeClick(eid)}>
                  {(() => {
                    const dx = v2.x - v1.x, dy = v2.y - v1.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const nx = dx / len, ny = dy / len;
                    const inset = 14;
                    const x1 = v1.x + nx * inset, y1 = v1.y + ny * inset;
                    const x2 = v2.x - nx * inset, y2 = v2.y - ny * inset;
                    return (<>
                      <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke="white" strokeWidth={8} strokeLinecap="round" opacity={0.45} />
                      <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke="black" strokeWidth={5} strokeLinecap="round" opacity={0.25} />
                    </>);
                  })()}
                  <circle
                    cx={(v1.x + v2.x) / 2} cy={(v1.y + v2.y) / 2}
                    r={8} fill="#FBBF24" stroke="white" strokeWidth={2} opacity={0.8}
                  />
                </g>
              );
            });
          })()}

          {/* Render buildings */}
          {Object.entries(buildings).map(([vid, building]) => {
            const vertex = board.vertices[vid];
            if (!vertex) return null;
            const color = gameState.players[building.player_idx]?.color || 'gray';
            const fillColor = PLAYER_COLOR_MAP[color] || color;
            if (building.type === 'settlement') {
              return (
                <g key={vid}>
                  <polygon
                    points={`${vertex.x},${vertex.y - 12} ${vertex.x - 8},${vertex.y + 6} ${vertex.x + 8},${vertex.y + 6}`}
                    fill={fillColor}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                </g>
              );
            } else {
              // City: larger house shape
              return (
                <g key={vid}>
                  <rect
                    x={vertex.x - 9}
                    y={vertex.y - 6}
                    width={18}
                    height={12}
                    fill={fillColor}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                  <polygon
                    points={`${vertex.x - 9},${vertex.y - 6} ${vertex.x},${vertex.y - 16} ${vertex.x + 9},${vertex.y - 6}`}
                    fill={fillColor}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                </g>
              );
            }
          })}

          {/* Render ports */}
          {(board.ports || []).map((port, i) => {
            const v1 = board.vertices[port.vertex_ids[0]];
            const v2 = board.vertices[port.vertex_ids[1]];
            if (!v1 || !v2) return null;
            const mx = (v1.x + v2.x) / 2;
            const my = (v1.y + v2.y) / 2;
            // Board center (approx)
            const bcx = (maxX + minX) / 2;
            const bcy = (maxY + minY) / 2;
            const dx = mx - bcx;
            const dy = my - bcy;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len; // 海方向の単位ベクトル
            const uy = dy / len;
            const extLen = 32;    // 頂点から海への延長距離
            const labelDist = 30; // バッジの距離
            const labelX = mx + ux * labelDist;
            const labelY = my + uy * labelDist;
            // 辺方向の単位ベクトル（v1→v2）
            const edgeDx = v2.x - v1.x;
            const edgeDy = v2.y - v1.y;
            const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;
            const ex = edgeDx / edgeLen;
            const ey = edgeDy / edgeLen;
            // 各頂点の破線方向：海方向 ± 辺方向を合成してV字に開く
            const k = 1.2; // 辺方向の混合量（大きいほど辺と平行に近づく）
            const d1x = ux + ex * k; const d1y = uy + ey * k; // v1用（v2方向へ寄る → ハの字）
            const d2x = ux - ex * k; const d2y = uy - ey * k; // v2用（v1方向へ寄る → ハの字）
            const d1len = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
            const d2len = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
            // 海側アンカー点
            const a1x = v1.x + (d1x / d1len) * extLen;
            const a1y = v1.y + (d1y / d1len) * extLen;
            const a2x = v2.x + (d2x / d2len) * extLen;
            const a2y = v2.y + (d2y / d2len) * extLen;
            const isGeneric = port.port_type === '3:1';
            const portColor = isGeneric ? '#E5E7EB' : (RESOURCE_COLORS[port.port_type] || '#9CA3AF');
            // portColorを白と60%ブレンドして淡い背景色を生成
            const hex = portColor.replace('#', '');
            const pr = parseInt(hex.slice(0, 2), 16);
            const pg = parseInt(hex.slice(2, 4), 16);
            const pb = parseInt(hex.slice(4, 6), 16);
            const f = 0.88;
            const lr = Math.round(pr + (255 - pr) * f).toString(16).padStart(2, '0');
            const lg = Math.round(pg + (255 - pg) * f).toString(16).padStart(2, '0');
            const lb = Math.round(pb + (255 - pb) * f).toString(16).padStart(2, '0');
            const lightColor = `#${lr}${lg}${lb}`;
            return (
              <g key={`port-${i}`}>
                {/* v1 → 海への破線 */}
                <line
                  x1={v1.x} y1={v1.y} x2={a1x} y2={a1y}
                  stroke={portColor} strokeWidth={2.5}
                  strokeDasharray="5,4" strokeLinecap="round" opacity={0.9}
                />
                {/* v2 → 海への破線 */}
                <line
                  x1={v2.x} y1={v2.y} x2={a2x} y2={a2y}
                  stroke={portColor} strokeWidth={2.5}
                  strokeDasharray="5,4" strokeLinecap="round" opacity={0.9}
                />
                {/* 沖アンカー点 */}
                <circle cx={a1x} cy={a1y} r={3} fill={portColor} opacity={0.6} />
                <circle cx={a2x} cy={a2y} r={3} fill={portColor} opacity={0.6} />
                {/* バッジ */}
                <circle cx={labelX} cy={labelY} r={14}
                  fill={lightColor}
                  stroke={portColor} strokeWidth={2} />
                <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central"
                  fontSize={14}>
                  {PORT_EMOJI[port.port_type] ?? '⚓'}
                </text>
              </g>
            );
          })}

          {/* Render clickable vertex highlights */}
          {Array.from(clickableVertices).map((vid) => {
            const vertex = board.vertices[vid];
            if (!vertex) return null;
            return (
              <circle
                key={`highlight-${vid}`}
                cx={vertex.x}
                cy={vertex.y}
                r={8}
                fill="#FBBF24"
                stroke="white"
                strokeWidth={2}
                opacity={0.8}
                style={{ cursor: 'pointer' }}
                onClick={() => handleVertexClick(vid)}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
