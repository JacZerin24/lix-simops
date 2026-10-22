import assert from "node:assert/strict";
import test from "node:test";
import { frameIndexAtOrBefore } from "../src/utils/radarTimeSync.ts";

const asFrames = (times) => times.map((timestamp) => ({ timestamp }));

test("switching REF to a less frequent moment selects by timestamp, not frame index", () => {
  const velocity = asFrames([
    "2027-02-06T20:45:00Z",
    "2027-02-06T20:50:00Z",
    "2027-02-06T20:55:00Z",
  ]);
  const reflectivity = asFrames([
    "2027-02-06T20:45:00Z",
    "2027-02-06T20:47:00Z",
    "2027-02-06T20:50:00Z",
    "2027-02-06T20:52:00Z",
    "2027-02-06T20:55:00Z",
  ]);

  assert.equal(frameIndexAtOrBefore(velocity, reflectivity[3].timestamp), 1);
  assert.equal(frameIndexAtOrBefore(reflectivity, velocity[1].timestamp), 2);
  assert.equal(frameIndexAtOrBefore(velocity, reflectivity[4].timestamp), 2);
});

test("nearest same-time-or-earlier real scan is preferred to a future scan", () => {
  const product = asFrames([
    "2027-02-06T20:46:20Z",
    "2027-02-06T20:52:40Z",
    "2027-02-06T20:57:25Z",
  ]);
  assert.equal(frameIndexAtOrBefore(product, "2027-02-06T20:53:00Z"), 1);
  assert.equal(frameIndexAtOrBefore(product, "2027-02-06T20:46:20Z"), 0);
});

test("missing and before-first scans are handled without inventing new imagery", () => {
  assert.equal(frameIndexAtOrBefore([], "2027-02-06T20:53:00Z"), 0);
  assert.equal(
    frameIndexAtOrBefore(asFrames(["2027-02-06T20:52:40Z"]), "2027-02-06T20:44:00Z"),
    0,
  );
});

test("invalid references fall back to the latest available real scan", () => {
  assert.equal(frameIndexAtOrBefore(asFrames([
    "2027-02-06T20:45:00Z",
    "2027-02-06T20:50:00Z",
  ]), "not-a-time"), 1);
});
