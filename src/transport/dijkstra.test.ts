import { describe, it, expect } from "vitest";
import { Graph } from "./graph.ts";
import { dijkstraOneToAll, getPostcodeTimes } from "./dijkstra.ts";
import { BOARDING_WAIT, INTERCHANGE_PENALTY, BUS_BOARDING_WAIT } from "./constants.ts";

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
  it("adds boarding wait when first taking a rail edge", () => {
    const g = buildTestGraph();
    const { times } = dijkstraOneToAll(g, "A");

    expect(times.get("A")).toBe(0);
    expect(times.get("B")).toBe(120 + BOARDING_WAIT);
    expect(times.get("C")).toBe(240 + BOARDING_WAIT);
    expect(times.get("D")).toBe(360 + BOARDING_WAIT);
  });

  it("respects max time constraint", () => {
    const g = buildTestGraph();
    const { times } = dijkstraOneToAll(g, "A", { maxTime: 300 });

    expect(times.get("A")).toBe(0);
    expect(times.get("B")).toBe(120 + BOARDING_WAIT);
    expect(times.has("C")).toBe(false);
  });

  it("counts interchanges correctly", () => {
    const g = buildTestGraph();

    const { times: times0changes } = dijkstraOneToAll(g, "A", { maxChanges: 0 });
    expect(times0changes.has("E")).toBe(false);

    const { times: times1change } = dijkstraOneToAll(g, "A", { maxChanges: 1 });
    // A->B: 120 + BOARDING_WAIT, B->E on line2: 120 + INTERCHANGE_PENALTY
    expect(times1change.get("E")).toBe(120 + BOARDING_WAIT + 120 + INTERCHANGE_PENALTY);
  });

  it("respects mode constraints", () => {
    const g = buildTestGraph();

    const { times: walkOnly } = dijkstraOneToAll(g, "A", {
      allowedModes: new Set(["walking"]),
    });
    expect(walkOnly.get("centroid:SW1")).toBe(300);
    expect(walkOnly.has("B")).toBe(false);
  });

  it("walking interchange applies interchange penalty not double boarding", () => {
    const g = new Graph();

    g.addNode({ id: "X", lat: 51.5, lng: -0.1, type: "station", name: "X", lines: ["lineA"] });
    g.addNode({ id: "Y", lat: 51.5, lng: -0.1001, type: "station", name: "Y", lines: ["lineB"] });
    g.addNode({ id: "Z", lat: 51.51, lng: -0.1001, type: "station", name: "Z", lines: ["lineB"] });
    g.addNode({ id: "W", lat: 51.49, lng: -0.1, type: "station", name: "W", lines: ["lineA"] });

    g.addBidirectionalEdge("W", "X", 100, "tube", "lineA");
    g.addBidirectionalEdge("Y", "Z", 100, "tube", "lineB");

    // Walking interchange between X and Y (120s walk)
    g.addBidirectionalEdge("X", "Y", 120, "walking");

    // W -> X on lineA, walk X -> Y, Y -> Z on lineB
    // Walking preserves currentLine (lineA), so Y->Z on lineB is a
    // line change (INTERCHANGE_PENALTY), not a fresh boarding
    const { times } = dijkstraOneToAll(g, "W");

    // W->X: 100 + BOARDING_WAIT, X->Y: 120 walk, Y->Z: 100 + INTERCHANGE_PENALTY
    expect(times.get("Z")).toBe(100 + BOARDING_WAIT + 120 + 100 + INTERCHANGE_PENALTY);
  });
});

describe("bus edges", () => {
  function buildBusTestGraph(): Graph {
    const g = new Graph();

    // Station A on line1
    g.addNode({ id: "A", lat: 51.5, lng: -0.1, type: "station", name: "A", lines: ["line1"] });
    // Station B on line1
    g.addNode({ id: "B", lat: 51.51, lng: -0.1, type: "station", name: "B", lines: ["line1"] });
    // Station C - only reachable by bus from B
    g.addNode({ id: "C", lat: 51.52, lng: -0.05, type: "station", name: "C", lines: ["line2"] });
    // Station D on line2 from C
    g.addNode({ id: "D", lat: 51.53, lng: -0.05, type: "station", name: "D", lines: ["line2"] });

    // Rail: A-B on line1
    g.addBidirectionalEdge("A", "B", 120, "tube", "line1");
    // Rail: C-D on line2
    g.addBidirectionalEdge("C", "D", 120, "tube", "line2");
    // Bus: B-C (virtual bus edge, 180s travel time)
    g.addBidirectionalEdge("B", "C", 180, "bus");

    return g;
  }

  it("uses bus edge when bus rides allowed", () => {
    const g = buildBusTestGraph();
    const { times } = dijkstraOneToAll(g, "A", {
      allowedModes: new Set(["tube", "bus", "walking"]),
      maxBusRides: 1,
    });

    // A->B: 120 + BOARDING_WAIT, B->C bus: 180 + BUS_BOARDING_WAIT
    expect(times.get("C")).toBe(120 + BOARDING_WAIT + 180 + BUS_BOARDING_WAIT);
  });

  it("skips bus edge when maxBusRides is 0", () => {
    const g = buildBusTestGraph();
    const { times } = dijkstraOneToAll(g, "A", {
      allowedModes: new Set(["tube", "bus", "walking"]),
      maxBusRides: 0,
    });

    // C is only reachable via bus, so should not be reachable
    expect(times.has("C")).toBe(false);
    expect(times.has("D")).toBe(false);
  });

  it("enforces bus time limit", () => {
    const g = buildBusTestGraph();
    const { times } = dijkstraOneToAll(g, "A", {
      allowedModes: new Set(["tube", "bus", "walking"]),
      maxBusRides: 5,
      maxBusTime: 100, // bus edge is 180s, exceeds limit
    });

    expect(times.has("C")).toBe(false);
  });

  it("bus rides are independent of rail changes", () => {
    const g = buildBusTestGraph();
    // 0 rail changes but 1 bus ride allowed
    const { times } = dijkstraOneToAll(g, "A", {
      allowedModes: new Set(["tube", "bus", "walking"]),
      maxChanges: 0,
      maxBusRides: 1,
    });

    // A->B on line1 (0 changes), B->C via bus (not a rail change),
    // C->D on line2 (first boarding after bus, also 0 rail changes)
    expect(times.get("C")).toBe(120 + BOARDING_WAIT + 180 + BUS_BOARDING_WAIT);
    // C->D: bus resets currentLine, so D is reached with a fresh boarding wait
    expect(times.get("D")).toBe(120 + BOARDING_WAIT + 180 + BUS_BOARDING_WAIT + 120 + BOARDING_WAIT);
  });

  it("multiple bus rides accumulate correctly", () => {
    const g = new Graph();

    g.addNode({ id: "P", lat: 51.5, lng: -0.1, type: "station", name: "P" });
    g.addNode({ id: "Q", lat: 51.51, lng: -0.1, type: "station", name: "Q" });
    g.addNode({ id: "R", lat: 51.52, lng: -0.1, type: "station", name: "R" });

    // Two bus edges: P->Q (100s) and Q->R (150s)
    g.addBidirectionalEdge("P", "Q", 100, "bus");
    g.addBidirectionalEdge("Q", "R", 150, "bus");

    // With maxBusRides: 1, can reach Q but not R
    const { times: times1 } = dijkstraOneToAll(g, "P", {
      allowedModes: new Set(["bus"]),
      maxBusRides: 1,
    });
    expect(times1.get("Q")).toBe(100 + BUS_BOARDING_WAIT);
    expect(times1.has("R")).toBe(false);

    // With maxBusRides: 2, can reach R
    const { times: times2 } = dijkstraOneToAll(g, "P", {
      allowedModes: new Set(["bus"]),
      maxBusRides: 2,
    });
    expect(times2.get("R")).toBe(100 + BUS_BOARDING_WAIT + 150 + BUS_BOARDING_WAIT);
  });
});

describe("getPostcodeTimes", () => {
  it("returns only centroid nodes", () => {
    const g = buildTestGraph();
    const { times } = getPostcodeTimes(g, "A");

    expect(times.has("centroid:SW1")).toBe(true);
    expect(times.has("centroid:N1")).toBe(true);
    expect(times.has("A")).toBe(false);
  });

  it("computes correct times to centroids", () => {
    const g = buildTestGraph();
    const { times } = getPostcodeTimes(g, "A");

    // centroid:SW1 -> A: 300s walking (no rail)
    expect(times.get("centroid:SW1")).toBe(300);
    // centroid:N1 -> D: 200s walking, D->C->B->A: 360s tube + boarding wait
    expect(times.get("centroid:N1")).toBe(360 + BOARDING_WAIT + 200);
  });
});
