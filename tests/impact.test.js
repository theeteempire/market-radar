import test from 'node:test';
import assert from 'node:assert/strict';
import { assessNews, isBreaking, IMPACT_LABEL } from '../src/impact.js';

test('rate hike is bearish for crypto/tech and bullish for the dollar', () => {
  const { impact } = assessNews({ title: 'Fed signals rate hike as inflation stays hot', cls: 'macro' });
  assert.equal(impact.direction, 'mixed');
  const crypto = impact.assets.find((a) => a.key === 'crypto');
  const dxy = impact.assets.find((a) => a.key === 'DXY');
  assert.equal(crypto.dir, 'down');
  assert.equal(dxy.dir, 'up');
  assert.ok(impact.confidence >= 0.5);
  assert.equal(impact.label, IMPACT_LABEL);
  assert.equal(impact.automated, true);
});

test('crypto hack is breaking and bearish for crypto', () => {
  const result = assessNews({ title: 'Major exchange hacked, funds stolen', cls: 'crypto' });
  assert.equal(result.breaking, true);
  assert.equal(result.impact.direction, 'down');
  assert.ok(result.impact.assets.some((a) => a.key === 'crypto' && a.dir === 'down'));
  assert.match(result.impact.rationale, /اختراق|سرقة/);
  assert.ok(result.importance >= 50);
});

test('AI chip demand is bullish for Nvidia and semiconductors', () => {
  const { impact } = assessNews({ title: 'AI chip demand surges as data center orders hit record', cls: 'tech' });
  assert.equal(impact.direction, 'up');
  const nvda = impact.assets.find((a) => a.key === 'NVDA');
  assert.equal(nvda.dir, 'up');
});

test('generic news yields a neutral automated estimate, never a fabricated direction', () => {
  const { impact, breaking } = assessNews({ title: 'Local weather today', cls: 'general' });
  assert.equal(impact.direction, 'neutral');
  assert.equal(breaking, false);
  assert.equal(impact.assets.length, 1);
  assert.match(impact.disclaimer, /ليس تنبؤًا/);
});

test('isBreaking exposes the boolean helper', () => {
  assert.equal(isBreaking({ title: 'OPEC cuts production', cls: 'energy' }), true);
  assert.equal(isBreaking({ title: 'Company announces new logo', cls: 'tech' }), false);
});
