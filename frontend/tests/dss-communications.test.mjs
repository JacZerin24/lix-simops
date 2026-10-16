import assert from "node:assert/strict";
import test from "node:test";
import { buildDssChat } from "../src/pages/DSS/communications.ts";

const sampleWarning = {
  id: "warn1",
  hazard: "TOR",
  label: "Tornado Warning",
  team_id: "Team 1",
  issued_at: "2027-02-06T20:15:00+00:00",
  expires_at: "2027-02-06T20:45:00+00:00",
  issuer: "Radar Operator 1",
  inherited: false,
  status: "active",
  text: "THIS IS AN EXERCISE: TORNADO WARNING.",
  followups: [],
};

test("radar warning snapshot produces a DSS chat notice without a live event", () => {
  const list = buildDssChat([], [sampleWarning]);
  assert.equal(list.length, 1);
  assert.equal(list[0].type, "warning_route_notice");
  assert.equal(list[0].warning_text, sampleWarning.text);
  assert.match(list[0].body, /Unified Command/);
  assert.match(list[0].title, /Tornado Warning/);
});

test("existing live route notice takes precedence and is not duplicated", () => {
  const notice = {
    type: "warning_route_notice",
    event_id: "evt1",
    action: "issue",
    warning_id: "warn1",
    sim_time: "2027-02-06T20:15:00Z",
    route_intersects: true,
    body: "Existing server route notice",
  };
  const list = buildDssChat([notice], [sampleWarning]);
  assert.equal(list.length, 1);
  assert.equal(list[0], notice);
});

test("a reconnect reconstructs SVS cancellation when the notice event is absent", () => {
  const warning = {
    ...sampleWarning,
    status: "cancelled",
    followups: [{
      id: "svs1",
      action: "CAN",
      issued_at: "2027-02-06T20:20:00+00:00",
      issuer: "Radar Operator 1",
      text: "CANCELLATION STATEMENT",
    }],
  };
  const list = buildDssChat([], [warning]);
  assert.deepEqual(list.map(row => row.action), ["issue", "CAN"]);
  assert.equal(list[1].warning_text, "CANCELLATION STATEMENT");
});

test("an inherited warning is not misrepresented as a new Radar issuance", () => {
  const list = buildDssChat([], [{ ...sampleWarning, inherited: true }]);
  assert.equal(list.length, 0);
});

test("a partner request and a warning are displayed chronologically", () => {
  const partner = {
    type: "partner_message",
    body: "Need a route weather update",
    sim_time: "2027-02-06T20:10:00+00:00",
  };
  const list = buildDssChat([partner], [sampleWarning]);
  assert.equal(list[0].type, "partner_message");
  assert.equal(list[1].type, "warning_route_notice");
});
