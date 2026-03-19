import { describe, it, expect } from "vitest";
import { Graph } from "./graph.ts";
import { dijkstraOneToAll, getPostcodeTimes } from "./dijkstra.ts";

function buildTestGraph(): Graph {
  const g = new Graph();

  // Simple line: A -- B -- C -- D (all on "line1")
  g.addNode({ id: "A", lat: 51.5, lng: -0.1, type: "station", name: "A", lines: ["line1"] });
  g.addNode({ id: "B", lat: 51.51, lng: -0.1, type: "station", name: "B", lines: ["line1"] });
  g.addNode({ id: "C", lat: 51.52, lng: -0.1, type: "station", name: "C", lines: ["line1"] });
  g.addNode({ id: "D", lat: 51.53, lng: -0.1, type: "station", name: "D", lines: ["line1"] });

  // line1: A-B-C-D, 120s each
  g.addBidirectionalEdge("A", "B", 120, "tube", "line1");
  g.addBidirectionalEdge("B", "C", 120, "tube", "line1");
  g.addBidirectionalEdge("C", "D", 120, "tube", "line1");

  // Second line through B and C: line2: E -- B -- C -- F
  g.addNode({ id: "E", lat: 51.5, lng: -0.05, type: "station", name: "E", lines: ["line2"] });
  g.addNode({ id: "F", lat: 51.52, lng: -0.05, type: "station", name: "F", lines: ["line2"] });

  g.addBidirectionalEdge("E", "B", 120, "tube", "line2");
  g.addBidirectionalEdge("B", "C", 120, "tube", "line2");
  g.addBidirectionalEdge("C", "F", 120, "tube", "line2");

  // Centroid connected to A via walking
  g.addNode({ id: "centroid:SW1", lat: 51.498, lng: -0.1, type: "centroid" });
  g.addBidirectionalEdge("centroid:SW1", "A", 300, "walking");

  // Centroid connected to D via walking
  g.addNode({ id: "centroid:N1", lat: 51.532, lng: -0.1, type: "centroid" });
  g.addBidirectionalEdge("centroid:N1", "D", 200, "walking");

  return g;
}

describe("dijkstraOneToAll", () => {
  it("computes shortest paths from source", () => {
    const g = buildTestGraph();
    const times = dijkstraOneToAll(g, "A");

    expect(times.get("A")).toBe(0);
    expect(times.get("B")).toBe(120);
    expect(times.get("C")).toBe(240);
    expect(times.get("D")).toBe(360);
  });

  it("respects max time constraint", () => {
    const g = buildTestGraph();
    const times = dijkstraOneToAll(g, "A", { maxTime: 200 });

    expect(times.get("A")).toBe(0);
    expect(times.get("B")).toBe(120);
    expect(times.has("C")).toBe(false); // 240 > 200
    expect(times.has("D")).toBe(false);
  });

  it("counts interchanges correctly", () => {
    const g = buildTestGraph();

    // From A (line1) to E requires: A->B on line1, then B->E on line2 (1 change)
    const times0changes = dijkstraOneToAll(g, "A", { maxChanges: 0 });
    // With 0 changes, can only ride line1: A, B, C, D reachable
    // E requires changing from line1 to line2 at B
    expect(times0changes.has("E")).toBe(false);

    const times1change = dijkstraOneToAll(g, "A", { maxChanges: 1 });
    // With 1 change: A->B (line1, 120s), B->E (line2, 120s + 300s interchange)
    expect(times1change.get("E")).toBe(120 + 120 + 300); // 540s
  });

  it("respects mode constraints", () => {
    const g = buildTestGraph();

    // If we only allow walking, we can only reach centroid:SW1 from A
    const walkOnly = dijkstraOneToAll(g, "A", {
      allowedModes: new Set(["walking"]),
    });
    expect(walkOnly.get("centroid:SW1")).toBe(300);
    expect(walkOnly.has("B")).toBe(false); // B requires tube
  });
});

describe("getPostcodeTimes", () => {
  it("returns only centroid nodes", () => {
    const g = buildTestGraph();
    const times = getPostcodeTimes(g, "A");

    // Should only contain centroid nodes
    expect(times.has("centroid:SW1")).toBe(true);
    expect(times.has("centroid:N1")).toBe(true);
    expect(times.has("A")).toBe(false);
    expect(times.has("B")).toBe(false);
  });

  it("computes correct times to centroids", () => {
    const g = buildTestGraph();
    const times = getPostcodeTimes(g, "A");

    // centroid:SW1 -> A: 300s walking
    expect(times.get("centroid:SW1")).toBe(300);
    // centroid:N1 -> D: 200s walking, D -> C -> B -> A: 360s tube
    expect(times.get("centroid:N1")).toBe(360 + 200);
  });
});
