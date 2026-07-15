import assert from "node:assert/strict";
import test from "node:test";

import { resolveWaterfallWidth } from "../layout-policy.js";

test("waterfall width prefers its content box over the padded main element", () => {
  assert.equal(
    resolveWaterfallWidth({ gridWidth: 351, mainWidth: 375, viewportWidth: 375 }),
    351
  );
});

test("waterfall width keeps a usable minimum before layout is measured", () => {
  assert.equal(resolveWaterfallWidth({ viewportWidth: 240 }), 280);
});
