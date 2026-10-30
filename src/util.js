export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function jitter(ms, ratio = 0.15) {
  const delta = ms * ratio;
  return Math.max(0, Math.round(ms - delta + Math.random() * delta * 2));
}
