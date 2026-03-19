import type { TransportGraph, GraphNode, GraphEdge } from "../types/transport.ts";

export class Graph {
  nodes: Map<string, GraphNode> = new Map();
  adjacency: Map<string, GraphEdge[]> = new Map();

  static fromJSON(data: TransportGraph): Graph {
    const g = new Graph();
    for (const [id, node] of Object.entries(data.nodes)) {
      g.nodes.set(id, node);
    }
    for (const [id, edges] of Object.entries(data.adjacency)) {
      g.adjacency.set(id, edges);
    }
    return g;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getEdges(id: string): GraphEdge[] {
    return this.adjacency.get(id) ?? [];
  }

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, []);
    }
  }

  addEdge(from: string, edge: GraphEdge): void {
    const edges = this.adjacency.get(from) ?? [];
    edges.push(edge);
    this.adjacency.set(from, edges);
  }

  addBidirectionalEdge(from: string, to: string, weight: number, mode: GraphEdge["mode"], line?: string): void {
    this.addEdge(from, { target: to, weight, mode, line });
    this.addEdge(to, { target: from, weight, mode, line });
  }

  toJSON(): TransportGraph {
    const nodes: Record<string, GraphNode> = {};
    const adjacency: Record<string, GraphEdge[]> = {};
    for (const [id, node] of this.nodes) {
      nodes[id] = node;
    }
    for (const [id, edges] of this.adjacency) {
      adjacency[id] = edges;
    }
    return { nodes, adjacency };
  }
}
