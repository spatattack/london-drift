import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLatLonParams } from "./geocode-params.ts";

test("text search without lat/lon is not treated as a location lookup", () => {
  assert.equal(parseLatLonParams(new URLSearchParams("q=Kings")), null);
});

test("missing, blank or non-numeric coordinates are ignored", () => {
  assert.equal(parseLatLonParams(new URLSearchParams("lat=51.5")), null);
  assert.equal(parseLatLonParams(new URLSearchParams("lon=-0.1")), null);
  assert.equal(parseLatLonParams(new URLSearchParams("lat=&lon=")), null);
  assert.equal(parseLatLonParams(new URLSearchParams("lat=abc&lon=-0.1")), null);
});

test("valid coordinates are parsed, including zero", () => {
  assert.deepEqual(parseLatLonParams(new URLSearchParams("lat=51.5416&lon=-0.1022")), { latitude: 51.5416, longitude: -0.1022 });
  assert.deepEqual(parseLatLonParams(new URLSearchParams("lat=0&lon=0")), { latitude: 0, longitude: 0 });
});
