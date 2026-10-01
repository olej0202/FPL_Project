import test from 'node:test';
import assert from 'node:assert/strict';
import { accountTransfers, transferPenaltyPoints } from './transferAccounting.js';

test('zero available FTs stays zero and shows the hit', () => {
  const result = accountTransfers([{ gw: 6, count: 1, spend: 0.2 }], 0, 1);
  assert.equal(result[6].available, 0);
  assert.equal(result[6].hits, 1);
  assert.equal(result[6].after, 0);
  assert.equal(result[6].bank, 0.8);
});

test('wildcard changes cash but preserves available FTs for the following week', () => {
  const result = accountTransfers([{ gw: 6, chip: 'wildcard', count: 12, spend: 0.4 }, { gw: 7, count: 0, spend: 0 }], 3, 1);
  assert.equal(result[6].used, 0);
  assert.equal(result[6].hits, 0);
  assert.equal(result[7].available, 3);
  assert.equal(result[7].bank, 0.6);
});

test('freehit shows temporary bank then restores permanent bank and FTs', () => {
  const result = accountTransfers([{ gw: 6, chip: 'freehit', count: 12, spend: 0.4 }, { gw: 7, count: 0, spend: 0 }], 5, 1);
  assert.equal(result[6].bank, 0.6);
  assert.equal(result[6].hits, 0);
  assert.equal(result[7].bank, 1);
  assert.equal(result[7].available, 5);
});

test('rolling at the cap never creates a sixth free transfer', () => {
  const result = accountTransfers(Array.from({ length: 8 }, (_, index) => ({ gw: index + 6, count: 0, spend: 0 })), 5, 1);
  assert.ok(Object.values(result).every((week) => week.available === 5 && week.hits === 0));
});

test('saved normalized preferences map to the new penalty and preserve zero', () => {
  assert.equal(transferPenaltyPoints(), 1.2);
  assert.equal(transferPenaltyPoints(0.5), 1.2);
  assert.equal(transferPenaltyPoints(0), 0);
  assert.equal(transferPenaltyPoints(1), 2.4);
});
