import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanRoute, DEFAULT_BOUNDS, MAP_HEIGHT, MAP_WIDTH,
  mapBounds, projectPoint, routePath, scaleMiles, warningGeometry,
} from "../src/pages/DSS/warningMapGeometry.ts";

const route = [
  { lat: 29.9864, lon: -90.1006 },
  { lat: 29.9634, lon: -90.0819 },
  { lat: 29.9537, lon: -90.0695 },
  { lat: 29.9433, lon: -90.0725 },
  { lat: 29.9511, lon: -90.0812 },
];
const polygon = [
  { lat: 29.960, lon: -90.110 },
  { lat: 29.960, lon: -90.050 },
  { lat: 29.990, lon: -90.050 },
  { lat: 29.990, lon: -90.110 },
];
const warning = {
  id: "team1-tor", status: "active", label: "Tornado Warning", hazard: "TOR",
  points: polygon, issued_at: "2027-02-06T20:30:00+00:00",
  expires_at: "2027-02-06T21:00:00+00:00", followups: [],
};

test("default view covers the entire approximate Endymion route", () => {
  for (const point of route) {
    const screen = projectPoint(point, DEFAULT_BOUNDS);
    assert.ok(screen.x > 0 && screen.x < MAP_WIDTH, "route point x within view");
    assert.ok(screen.y > 0 && screen.y < MAP_HEIGHT, "route point y within view");
  }
  assert.ok(scaleMiles(DEFAULT_BOUNDS, 120) > 0);
});

test("focusing an issued warning fits all warning vertices and route coordinates", () => {
  const bounds = mapBounds(route, warning);
  for (const point of [...route, ...polygon]) {
    const { x, y } = projectPoint(point, bounds);
    assert.ok(x >= 0 && x <= MAP_WIDTH, "all warning and route longitude visible");
    assert.ok(y >= 0 && y <= MAP_HEIGHT, "all warning and route latitude visible");
  }
  assert.match(routePath(polygon, bounds, true), /^M /);
  assert.match(routePath(polygon, bounds, true), /Z$/);
});

test("large west-of-route Tornado Warning still fits the route and warning", () => {
  const warningWest = { ...warning, points: [
    { lon: -90.75, lat: 29.75 }, { lon: -90.46, lat: 29.75 },
    { lon: -90.46, lat: 30.05 }, { lon: -90.75, lat: 30.05 },
  ] };
  const bounds = mapBounds(route, warningWest);
  for (const point of [...route, ...warningWest.points]) {
    const { x, y } = projectPoint(point, bounds);
    assert.ok(x > 0 && x < MAP_WIDTH);
    assert.ok(y > 0 && y < MAP_HEIGHT);
  }
});

test("follow-up polygons supersede issuance polygon on the map", () => {
  const changed = { ...warning, followups: [
    { id: "cor1", action: "COR", issued_at: "2027-02-06T20:35:00Z",
      points: [{ lat: 30.0, lon: -90.2 }, { lat: 30.1, lon: -90.2 },
               { lat: 30.1, lon: -90.1 }] },
    { id: "con2", action: "CON", issued_at: "2027-02-06T20:40:00Z" },
  ] };
  assert.deepEqual(warningGeometry(changed), changed.followups[0].points);
});

test("invalid route points are excluded from map projection", () => {
  assert.deepEqual(cleanRoute([
    ...route, { lat: Number.NaN, lon: -90 }, { lat: 299, lon: -90 },
  ]), route);
});
