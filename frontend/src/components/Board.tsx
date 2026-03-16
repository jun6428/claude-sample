'use client';

import React, { useMemo, useState } from 'react';
import { GameState, PLAYER_COLOR_MAP, VertexData, EdgeData } from '@/lib/types';
import HexTile from './HexTile';
import { GameAction } from '@/lib/types';

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
    if (phase === 'playing' && selectedAction === 'build_road' && gameState.dice_rolled) {
      return new Set(
        Object.keys(board.edges).filter((eid) => {
          if (roads[eid] !== undefined) return false;
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
  }, [isMyTurn, phase, setup_step, board, buildings, roads, myPlayerIdx, selectedAction, gameState.dice_rolled]);

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
    } else if (selectedAction === 'build_city') {
      sendAction({ action: 'build_city', vertex_id: vid });
    }
  };

  const handleEdgeClick = (eid: string) => {
    if (!clickableEdges.has(eid)) return;
    if (phase === 'setup') {
      sendAction({ action: 'place_road', edge_id: eid });
    } else if (selectedAction === 'build_road') {
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
          {Array.from(clickableEdges).map((eid) => {
            if (roads[eid] !== undefined) return null;
            const edge = board.edges[eid];
            if (!edge) return null;
            const v1 = board.vertices[edge.v1];
            const v2 = board.vertices[edge.v2];
            if (!v1 || !v2) return null;
            return (
              <line
                key={`highlight-${eid}`}
                x1={v1.x}
                y1={v1.y}
                x2={v2.x}
                y2={v2.y}
                stroke="#FBBF24"
                strokeWidth={6}
                strokeLinecap="round"
                opacity={0.7}
                style={{ cursor: 'pointer' }}
                onClick={() => handleEdgeClick(eid)}
              />
            );
          })}

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
