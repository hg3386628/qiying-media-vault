export const FEED_SOUND_KEY = "posts.feedSoundEnabled";
export const FEED_LONG_PRESS_MS = 360;
export const FEED_LONG_PRESS_RATE = 3;
export const FEED_LONG_PRESS_MOVE_PX = 12;

export function resolveFeedDuration(mediaDuration, fallbackDuration = 0) {
  const media = Number(mediaDuration);
  if (Number.isFinite(media) && media > 0) return media;
  const fallback = Number(fallbackDuration);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

export function feedProgressPercent(currentTime, duration) {
  const total = resolveFeedDuration(duration);
  if (!total) return 0;
  const current = Number(currentTime);
  if (!Number.isFinite(current)) return 0;
  return Math.min(100, Math.max(0, (current / total) * 100));
}

export function feedSeekTime(value, max, duration) {
  const total = resolveFeedDuration(duration);
  const range = Number(max);
  const position = Number(value);
  if (!total || !Number.isFinite(range) || range <= 0 || !Number.isFinite(position)) return 0;
  return Math.min(total, Math.max(0, (position / range) * total));
}

const TERMINAL_FEED_HTTP_STATUS = new Set([404, 410, 415, 422, 451, 567]);
const TERMINAL_FEED_ERROR_DETAILS = new Set([
  "empty-path",
  "manifestParsingError",
  "manifestIncompatibleCodecsError",
  "levelEmptyError",
  "levelParsingError",
  "fragParsingError",
  "bufferIncompatibleCodecsError",
]);

export function isTerminalFeedVideoError(error) {
  if (error?.sourceFatal === true) return true;
  const status = Number(error?.response?.code ?? error?.responseCode ?? error?.status);
  if (TERMINAL_FEED_HTTP_STATUS.has(status)) return true;
  const mediaCode = Number(error?.mediaCode);
  if (mediaCode === 3 || mediaCode === 4) return true;
  return TERMINAL_FEED_ERROR_DETAILS.has(String(error?.details || ""));
}

export function isFeedVideoEligible(item, unavailablePaths = new Set()) {
  const path = String(item?.path || "");
  if (!path || unavailablePaths?.has?.(path)) return false;
  const status = item?.status == null ? "" : String(item.status);
  if (status && status !== "1") return false;
  return item?.kind !== "mp4" || status === "1";
}

export function listEligibleFeedIndexes(items, unavailablePaths = new Set(), limit = items.length) {
  const end = Math.min(items.length, Math.max(0, Number(limit) || 0));
  const indexes = [];
  for (let index = 0; index < end; index += 1) {
    if (isFeedVideoEligible(items[index], unavailablePaths)) indexes.push(index);
  }
  return indexes;
}

export function findEligibleFeedIndex(
  items,
  unavailablePaths = new Set(),
  startIndex = 0,
  direction = 1
) {
  const step = direction < 0 ? -1 : 1;
  for (let index = Number(startIndex) || 0; index >= 0 && index < items.length; index += step) {
    if (isFeedVideoEligible(items[index], unavailablePaths)) return index;
  }
  return -1;
}

export function shouldStartFeedLongPress({ isPrimary, pointerType, button, interactive }) {
  if (!isPrimary || interactive) return false;
  return pointerType !== "mouse" || button === 0;
}

export function createFeedLongPressController({
  delayMs = FEED_LONG_PRESS_MS,
  movementPx = FEED_LONG_PRESS_MOVE_PX,
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
  onActivate = () => true,
  onDeactivate = () => {},
} = {}) {
  let timer = null;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let active = false;
  let destroyed = false;

  const clearPending = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const finish = (event, suppressClick = false) => {
    if (pointerId === null || (event && event.pointerId !== pointerId)) {
      return { handled: false, wasActive: false, pointerId: null, suppressClick: false };
    }
    const finishedPointerId = pointerId;
    const wasActive = active;
    clearPending();
    pointerId = null;
    active = false;
    if (wasActive) onDeactivate(finishedPointerId);
    return {
      handled: true,
      wasActive,
      pointerId: finishedPointerId,
      suppressClick: wasActive && suppressClick,
    };
  };

  return {
    pointerDown(event) {
      if (destroyed) return false;
      finish(null);
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      const scheduledPointerId = pointerId;
      timer = setTimer(() => {
        timer = null;
        if (destroyed || pointerId !== scheduledPointerId) return;
        active = onActivate(scheduledPointerId) !== false;
      }, delayMs);
      return true;
    },
    pointerMove(event) {
      if (pointerId === null || event.pointerId !== pointerId) {
        return { handled: false, wasActive: false, pointerId: null, suppressClick: false };
      }
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.hypot(dx, dy) <= movementPx) {
        return { handled: false, wasActive: active, pointerId, suppressClick: false };
      }
      return finish(event, true);
    },
    pointerUp(event) {
      return finish(event, true);
    },
    pointerCancel(event) {
      return finish(event);
    },
    cancel() {
      return finish(null);
    },
    destroy() {
      destroyed = true;
      return finish(null);
    },
    snapshot() {
      return { active, pending: timer !== null, pointerId, destroyed };
    },
  };
}

export function bindFeedProgressControl(
  progress,
  { getDuration, seekTo, update, showControls } = {}
) {
  const stop = (event) => event.stopPropagation();
  const begin = (event) => {
    stop(event);
    progress.dataset.seeking = "1";
    showControls?.(0);
  };
  const input = (event) => {
    stop(event);
    const duration = getDuration?.();
    if (duration === null || duration === undefined) return;
    const target = feedSeekTime(progress.value, progress.max, duration);
    seekTo?.(target);
    update?.(target);
  };
  const finish = (event) => {
    stop(event);
    delete progress.dataset.seeking;
    update?.();
    showControls?.();
  };

  progress.addEventListener("pointerdown", begin);
  progress.addEventListener("input", input);
  progress.addEventListener("change", finish);
  progress.addEventListener("pointerup", finish);
  progress.addEventListener("pointercancel", finish);
  progress.addEventListener("blur", finish);
  progress.addEventListener("click", stop);

  return () => {
    progress.removeEventListener("pointerdown", begin);
    progress.removeEventListener("input", input);
    progress.removeEventListener("change", finish);
    progress.removeEventListener("pointerup", finish);
    progress.removeEventListener("pointercancel", finish);
    progress.removeEventListener("blur", finish);
    progress.removeEventListener("click", stop);
  };
}

export function listFeedPlayerIndexes(players) {
  return Array.from(players.keys());
}

export function readFeedSoundEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(FEED_SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFeedSoundEnabled(enabled, storage = globalThis.localStorage) {
  try {
    storage?.setItem(FEED_SOUND_KEY, enabled ? "1" : "0");
  } catch {}
}
