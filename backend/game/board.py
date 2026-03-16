import math
import random
from typing import Dict, List, Tuple, Set, Optional


# Standard Catan hex layout using axial coordinates (q, r)
STANDARD_HEX_COORDS = [
    # r = -2 (3 tiles)
    (0, -2), (1, -2), (2, -2),
    # r = -1 (4 tiles)
    (-1, -1), (0, -1), (1, -1), (2, -1),
    # r = 0 (5 tiles)
    (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0),
    # r = 1 (4 tiles)
    (-2, 1), (-1, 1), (0, 1), (1, 1),
    # r = 2 (3 tiles)
    (-2, 2), (-1, 2), (0, 2),
]

RESOURCE_DISTRIBUTION = (
    ["wood"] * 4 +
    ["brick"] * 3 +
    ["sheep"] * 4 +
    ["wheat"] * 4 +
    ["ore"] * 3 +
    ["desert"] * 1
)

NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]

PORT_TYPES = ["3:1", "3:1", "3:1", "3:1", "wood", "brick", "sheep", "wheat", "ore"]

# 公式レイアウトに準拠した9港の位置 (q, r, edge_index)
# edge_index は隣接hex方向: 0→(+1,-1) 1→(+1,0) 2→(0,+1) 3→(-1,+1) 4→(-1,0) 5→(0,-1)
PORT_POSITIONS = [
    ( 0, -2, 5),  # 真上       (中央: 海辺の真ん中)
    ( 1, -2, 0),  # 右上       (端: gap(2,-2)側)
    ( 2, -1, 0),  # 右・上     (端: gap(2,-2)側)  FIX: 1→0
    ( 2,  0, 1),  # 右・中     (中央: 海辺の真ん中) FIX: 2→1
    ( 1,  1, 2),  # 右下       (端: gap(0,2)側)
    (-1,  2, 2),  # 下・右     (端: gap(0,2)側)   FIX: 3→2
    (-2,  2, 3),  # 下・左中   (中央: 海辺の真ん中)
    (-2,  1, 4),  # 左下       (端: gap(-2,0)側)  FIX: 3→4
    (-1, -1, 4),  # 左上       (端: gap(-2,0)側)  FIX: 5→4
]

# Axial directions for neighbors
HEX_DIRECTIONS = [
    (1, 0), (1, -1), (0, -1),
    (-1, 0), (-1, 1), (0, 1)
]

# Pointy-top hex vertex offsets (normalized, multiplied by hex_size later)
# Vertices are indexed 0-5 going clockwise from top-left
VERTEX_ANGLE_OFFSETS = [
    (-30 + 60 * i) for i in range(6)
]


def hex_to_pixel(q: int, r: int, size: float = 60.0) -> Tuple[float, float]:
    """Convert axial hex coordinates to pixel coordinates (pointy-top)."""
    x = size * (math.sqrt(3) * q + math.sqrt(3) / 2 * r)
    y = size * (3 / 2 * r)
    return x, y


def vertex_pixel(cx: float, cy: float, i: int, size: float = 60.0) -> Tuple[float, float]:
    """Get pixel position of vertex i of a hex centered at (cx, cy)."""
    angle_deg = 60 * i - 30
    angle_rad = math.pi / 180 * angle_deg
    vx = cx + size * math.cos(angle_rad)
    vy = cy + size * math.sin(angle_rad)
    return vx, vy


def round_vertex(x: float, y: float, precision: int = 4) -> Tuple[float, float]:
    """Round vertex coordinates for consistent ID generation."""
    return round(x, precision), round(y, precision)


def vertex_id_from_coords(x: float, y: float) -> str:
    """Generate a unique vertex ID from pixel coordinates."""
    rx, ry = round_vertex(x, y)
    return f"v_{rx}_{ry}"


def edge_id_from_vertices(v1_id: str, v2_id: str) -> str:
    """Generate a unique edge ID from two vertex IDs (order-independent)."""
    ids = sorted([v1_id, v2_id])
    return f"e_{ids[0]}_{ids[1]}"


class Hex:
    def __init__(self, q: int, r: int, resource: str, number: Optional[int]):
        self.q = q
        self.r = r
        self.hex_id = f"{q},{r}"
        self.resource = resource
        self.number = number  # None for desert
        # Vertices and edges will be assigned by Board
        self.vertex_ids: List[str] = []  # 6 vertices
        self.edge_ids: List[str] = []    # 6 edges

    def to_dict(self) -> dict:
        return {
            "hex_id": self.hex_id,
            "q": self.q,
            "r": self.r,
            "resource": self.resource,
            "number": self.number,
            "vertex_ids": self.vertex_ids,
            "edge_ids": self.edge_ids,
        }


class Board:
    def __init__(self):
        self.hexes: Dict[str, Hex] = {}
        self.vertices: Dict[str, dict] = {}  # vertex_id -> {x, y, adjacent_hexes, adjacent_vertices, adjacent_edges}
        self.edges: Dict[str, dict] = {}     # edge_id -> {v1, v2, adjacent_hexes}
        self.ports: List[dict] = []          # [{port_type, vertex_ids, edge_id}]
        self._build()

    def _build(self):
        # Shuffle resources and numbers
        resources = RESOURCE_DISTRIBUTION.copy()
        random.shuffle(resources)

        numbers = NUMBER_TOKENS.copy()
        random.shuffle(numbers)

        hex_size = 60.0

        # Create hexes
        hex_list = []
        for q, r in STANDARD_HEX_COORDS:
            resource = resources.pop()
            number = None if resource == "desert" else numbers.pop()
            h = Hex(q, r, resource, number)
            self.hexes[h.hex_id] = h
            hex_list.append(h)

        # Build vertex and edge maps
        # For each hex, compute its 6 vertices and 6 edges
        vertex_to_hexes: Dict[str, List[str]] = {}
        edge_to_hexes: Dict[str, List[str]] = {}
        vertex_positions: Dict[str, Tuple[float, float]] = {}
        edge_to_vertices: Dict[str, Tuple[str, str]] = {}

        for h in hex_list:
            cx, cy = hex_to_pixel(h.q, h.r, hex_size)
            vids = []
            for i in range(6):
                vx, vy = vertex_pixel(cx, cy, i, hex_size)
                vid = vertex_id_from_coords(vx, vy)
                vids.append(vid)
                vertex_positions[vid] = (vx, vy)
                if vid not in vertex_to_hexes:
                    vertex_to_hexes[vid] = []
                vertex_to_hexes[vid].append(h.hex_id)
            h.vertex_ids = vids

            # Edges: each edge connects vertex i and vertex (i+1)%6
            eids = []
            for i in range(6):
                v1 = vids[i]
                v2 = vids[(i + 1) % 6]
                eid = edge_id_from_vertices(v1, v2)
                eids.append(eid)
                if eid not in edge_to_hexes:
                    edge_to_hexes[eid] = []
                    edge_to_vertices[eid] = (v1, v2)
                edge_to_hexes[eid].append(h.hex_id)
            h.edge_ids = eids

        # Build vertex adjacency
        # Two vertices are adjacent if they share an edge
        edge_vertex_adj: Dict[str, Set[str]] = {}
        for eid, (v1, v2) in edge_to_vertices.items():
            if v1 not in edge_vertex_adj:
                edge_vertex_adj[v1] = set()
            if v2 not in edge_vertex_adj:
                edge_vertex_adj[v2] = set()
            edge_vertex_adj[v1].add(v2)
            edge_vertex_adj[v2].add(v1)

        # Build vertex -> edges map
        vertex_to_edges: Dict[str, List[str]] = {}
        for eid, (v1, v2) in edge_to_vertices.items():
            if v1 not in vertex_to_edges:
                vertex_to_edges[v1] = []
            if v2 not in vertex_to_edges:
                vertex_to_edges[v2] = []
            vertex_to_edges[v1].append(eid)
            vertex_to_edges[v2].append(eid)

        # Populate self.vertices
        for vid, (vx, vy) in vertex_positions.items():
            self.vertices[vid] = {
                "vertex_id": vid,
                "x": vx,
                "y": vy,
                "adjacent_hexes": vertex_to_hexes.get(vid, []),
                "adjacent_vertices": list(edge_vertex_adj.get(vid, set())),
                "adjacent_edges": vertex_to_edges.get(vid, []),
            }

        # Populate self.edges
        for eid, (v1, v2) in edge_to_vertices.items():
            self.edges[eid] = {
                "edge_id": eid,
                "v1": v1,
                "v2": v2,
                "adjacent_hexes": edge_to_hexes.get(eid, []),
            }

        self._assign_ports()

    def _assign_ports(self):
        port_types = PORT_TYPES.copy()
        random.shuffle(port_types)

        self.ports = []
        for (q, r, edge_idx), port_type in zip(PORT_POSITIONS, port_types):
            hex_id = f"{q},{r}"
            if hex_id not in self.hexes:
                continue
            h = self.hexes[hex_id]
            if edge_idx >= len(h.edge_ids):
                continue
            eid = h.edge_ids[(edge_idx + 5) % 6]
            if eid not in self.edges:
                continue
            e = self.edges[eid]
            self.ports.append({
                "port_type": port_type,
                "vertex_ids": [e["v1"], e["v2"]],
                "edge_id": eid,
            })

    def get_adjacent_hexes(self, hex_id: str) -> List[str]:
        """Return list of adjacent hex IDs."""
        if hex_id not in self.hexes:
            return []
        h = self.hexes[hex_id]
        neighbors = []
        for dq, dr in HEX_DIRECTIONS:
            nq = h.q + dq
            nr = h.r + dr
            nid = f"{nq},{nr}"
            if nid in self.hexes:
                neighbors.append(nid)
        return neighbors

    def get_vertices_for_hex(self, hex_id: str) -> List[str]:
        if hex_id not in self.hexes:
            return []
        return self.hexes[hex_id].vertex_ids

    def get_edges_for_hex(self, hex_id: str) -> List[str]:
        if hex_id not in self.hexes:
            return []
        return self.hexes[hex_id].edge_ids

    def get_hexes_for_number(self, number: int) -> List[str]:
        """Return hex IDs that have the given number token."""
        return [hid for hid, h in self.hexes.items() if h.number == number]

    def to_dict(self) -> dict:
        return {
            "hexes": {hid: h.to_dict() for hid, h in self.hexes.items()},
            "vertices": self.vertices,
            "edges": self.edges,
            "ports": self.ports,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Board':
        board = cls.__new__(cls)
        board.hexes = {}
        for hid, h in data['hexes'].items():
            hex_obj = Hex(h['q'], h['r'], h['resource'], h['number'])
            hex_obj.vertex_ids = h['vertex_ids']
            hex_obj.edge_ids = h['edge_ids']
            board.hexes[hid] = hex_obj
        board.vertices = data['vertices']
        board.edges = data['edges']
        board.ports = data.get('ports', [])
        return board

    def find_desert(self) -> Optional[str]:
        for hid, h in self.hexes.items():
            if h.resource == "desert":
                return hid
        return None
