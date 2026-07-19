import assert from "node:assert/strict";
import test from "node:test";

import {
  FEED_LONG_PRESS_MS,
  FEED_LONG_PRESS_MOVE_PX,
  FEED_LONG_PRESS_RATE,
  bindFeedProgressControl,
  createFeedLongPressController,
  feedProgressPercent,
  feedSeekTime,
  listFeedPlayerIndexes,
  readFeedSoundEnabled,
  resolveFeedDuration,
  shouldStartFeedLongPress,
  writeFeedSoundEnabled,
} from "../feed-policy.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function fakeTimers() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    setTimer(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clearTimer(id) {
      callbacks.delete(id);
    },
    runAll() {
      for (const [id, callback] of [...callbacks]) {
        callbacks.delete(id);
        callback();
      }
    },
    get size() {
      return callbacks.size;
    },
  };
}

class FakeProgress {
  constructor() {
    this.dataset = {};
    this.value = "0";
    this.max = "1000";
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    const event = {
      type,
      stopped: false,
      stopPropagation() {
        this.stopped = true;
      },
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
}

test("feed player cleanup enumerates numeric map keys without destructuring them", () => {
  const players = new Map([
    [0, { id: "first" }],
    [3, { id: "fourth" }],
  ]);
  assert.deepEqual(listFeedPlayerIndexes(players), [0, 3]);
});

test("long press policy uses a deliberate mobile hold and 3x playback", () => {
  assert.equal(FEED_LONG_PRESS_RATE, 3);
  assert.equal(FEED_LONG_PRESS_MS, 360);
  assert.equal(FEED_LONG_PRESS_MOVE_PX, 12);
});

test("feed progress math clamps seek targets and invalid media values", () => {
  assert.equal(resolveFeedDuration(90, 120), 90);
  assert.equal(resolveFeedDuration("90.5", 120), 90.5);
  assert.equal(resolveFeedDuration(Number.POSITIVE_INFINITY, 120), 120);
  assert.equal(resolveFeedDuration(Number.NaN, "75"), 75);
  assert.equal(resolveFeedDuration(0, -1), 0);
  assert.equal(feedProgressPercent(45, 90), 50);
  assert.equal(feedProgressPercent(200, 90), 100);
  assert.equal(feedProgressPercent(-5, 90), 0);
  assert.equal(feedProgressPercent(Number.NaN, 90), 0);
  assert.equal(feedProgressPercent(Number.POSITIVE_INFINITY, 90), 0);
  assert.equal(feedSeekTime(250, 1000, 120), 30);
  assert.equal(feedSeekTime(-1, 1000, 120), 0);
  assert.equal(feedSeekTime(0.25, 0.5, 120), 60);
  assert.equal(feedSeekTime(1500, 1000, 120), 120);
  assert.equal(feedSeekTime(500, 0, 120), 0);
  assert.equal(feedSeekTime(Number.NaN, 1000, 120), 0);
  assert.equal(feedSeekTime(500, Number.POSITIVE_INFINITY, 120), 0);
});

test("mobile long press activates once, restores on release, and requests click suppression", () => {
  const timers = fakeTimers();
  const media = { playbackRate: 1, speedVisible: false };
  let activations = 0;
  let deactivations = 0;
  const hold = createFeedLongPressController({
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onActivate() {
      activations += 1;
      media.playbackRate = FEED_LONG_PRESS_RATE;
      media.speedVisible = true;
    },
    onDeactivate() {
      deactivations += 1;
      media.playbackRate = 1;
      media.speedVisible = false;
    },
  });

  hold.pointerDown({ pointerId: 7, clientX: 40, clientY: 80 });
  assert.deepEqual(hold.snapshot(), {
    active: false,
    pending: true,
    pointerId: 7,
    destroyed: false,
  });
  assert.equal(media.playbackRate, 1);

  timers.runAll();
  assert.equal(activations, 1);
  assert.equal(media.playbackRate, 3);
  assert.equal(media.speedVisible, true);

  const release = hold.pointerUp({ pointerId: 7 });
  assert.equal(release.wasActive, true);
  assert.equal(release.suppressClick, true);
  assert.equal(deactivations, 1);
  assert.equal(media.playbackRate, 1);
  assert.equal(media.speedVisible, false);
});

test("vertical movement and cancellation prevent stale long-press activation", () => {
  const timers = fakeTimers();
  let activations = 0;
  let deactivations = 0;
  const hold = createFeedLongPressController({
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onActivate() {
      activations += 1;
    },
    onDeactivate() {
      deactivations += 1;
    },
  });

  hold.pointerDown({ pointerId: 1, clientX: 10, clientY: 10 });
  const moved = hold.pointerMove({ pointerId: 1, clientX: 10, clientY: 35 });
  assert.equal(moved.handled, true);
  assert.equal(moved.wasActive, false);
  assert.equal(timers.size, 0);
  timers.runAll();
  assert.equal(activations, 0);

  hold.pointerDown({ pointerId: 2, clientX: 0, clientY: 0 });
  timers.runAll();
  const cancelled = hold.pointerCancel({ pointerId: 2 });
  assert.equal(cancelled.wasActive, true);
  assert.equal(cancelled.suppressClick, false);
  assert.equal(deactivations, 1);
});

test("feed teardown destroys pending holds and active switches restore normal speed", () => {
  const timers = fakeTimers();
  let activations = 0;
  let deactivations = 0;
  const hold = createFeedLongPressController({
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onActivate() {
      activations += 1;
    },
    onDeactivate() {
      deactivations += 1;
    },
  });

  hold.pointerDown({ pointerId: 1, clientX: 0, clientY: 0 });
  hold.destroy();
  timers.runAll();
  assert.equal(activations, 0);
  assert.deepEqual(hold.snapshot(), {
    active: false,
    pending: false,
    pointerId: null,
    destroyed: true,
  });

  const activeTimers = fakeTimers();
  const activeHold = createFeedLongPressController({
    setTimer: activeTimers.setTimer,
    clearTimer: activeTimers.clearTimer,
    onActivate() {
      activations += 1;
    },
    onDeactivate() {
      deactivations += 1;
    },
  });
  activeHold.pointerDown({ pointerId: 2, clientX: 0, clientY: 0 });
  activeTimers.runAll();
  activeHold.cancel();
  assert.equal(activations, 1);
  assert.equal(deactivations, 1);
});

test("long press ignores progress controls, secondary pointers, and right clicks", () => {
  assert.equal(
    shouldStartFeedLongPress({
      isPrimary: true,
      pointerType: "touch",
      button: 0,
      interactive: false,
    }),
    true
  );
  assert.equal(
    shouldStartFeedLongPress({
      isPrimary: true,
      pointerType: "touch",
      button: 0,
      interactive: true,
    }),
    false
  );
  assert.equal(
    shouldStartFeedLongPress({
      isPrimary: false,
      pointerType: "touch",
      button: 0,
      interactive: false,
    }),
    false
  );
  assert.equal(
    shouldStartFeedLongPress({
      isPrimary: true,
      pointerType: "mouse",
      button: 2,
      interactive: false,
    }),
    false
  );
});

test("progress drag seeks endpoints, keeps seeking state, and isolates pointer events", () => {
  const progress = new FakeProgress();
  const seeks = [];
  const updates = [];
  const controls = [];
  const unbind = bindFeedProgressControl(progress, {
    getDuration: () => 120,
    seekTo: (target) => seeks.push(target),
    update: (target) => updates.push(target),
    showControls: (timeout) => controls.push(timeout),
  });

  const down = progress.dispatch("pointerdown");
  assert.equal(down.stopped, true);
  assert.equal(progress.dataset.seeking, "1");
  assert.deepEqual(controls, [0]);

  progress.value = "0";
  const startInput = progress.dispatch("input");
  progress.value = "1000";
  const endInput = progress.dispatch("input");
  assert.equal(startInput.stopped, true);
  assert.equal(endInput.stopped, true);
  assert.deepEqual(seeks, [0, 120]);
  assert.deepEqual(updates, [0, 120]);
  assert.equal(progress.dataset.seeking, "1");

  const up = progress.dispatch("pointerup");
  assert.equal(up.stopped, true);
  assert.equal(progress.dataset.seeking, undefined);
  assert.deepEqual(updates, [0, 120, undefined]);
  assert.deepEqual(controls, [0, undefined]);

  progress.dispatch("pointerdown");
  progress.dispatch("pointercancel");
  assert.equal(progress.dataset.seeking, undefined);
  progress.dispatch("pointerdown");
  progress.dispatch("blur");
  assert.equal(progress.dataset.seeking, undefined);
  assert.equal(progress.dispatch("click").stopped, true);

  unbind();
  progress.dispatch("pointerdown");
  assert.equal(progress.dataset.seeking, undefined);
});

test("feed sound preference stays enabled until explicitly disabled", () => {
  const storage = memoryStorage();
  assert.equal(readFeedSoundEnabled(storage), false);

  writeFeedSoundEnabled(true, storage);
  assert.equal(readFeedSoundEnabled(storage), true);

  writeFeedSoundEnabled(false, storage);
  assert.equal(readFeedSoundEnabled(storage), false);
});

test("feed sound preference tolerates unavailable browser storage", () => {
  const blockedStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readFeedSoundEnabled(blockedStorage), false);
  assert.doesNotThrow(() => writeFeedSoundEnabled(true, blockedStorage));
});
