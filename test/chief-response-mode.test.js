import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChiefResponseMode, resolveChiefResponseModeSelection, missionControlResponseModeLabel } from '../src/chief-response-mode.js';

test('Mission Control response modes normalize to canonical engine values', () => {
  assert.equal(normalizeChiefResponseMode('offline'), 'offline');
  assert.equal(normalizeChiefResponseMode('source'), 'source');
  assert.equal(normalizeChiefResponseMode('assisted'), 'assisted');
  assert.equal(normalizeChiefResponseMode('general'), 'general');
  assert.equal(normalizeChiefResponseMode('expert-assisted-ai'), 'assisted');
  assert.equal(normalizeChiefResponseMode('source-only-evidence'), 'offline');
});

test('Mission Control response mode selection maps UI labels to engine modes', () => {
  const offline = resolveChiefResponseModeSelection({ selectedOptionText: 'Source-only evidence', selectedOptionValue: 'offline', uiStateMode: 'offline' });
  const source = resolveChiefResponseModeSelection({ selectedOptionText: 'Source-only AI', selectedOptionValue: 'source', uiStateMode: 'offline' });
  const assisted = resolveChiefResponseModeSelection({ selectedOptionText: 'Expert-assisted AI', selectedOptionValue: 'assisted', uiStateMode: 'offline' });
  const general = resolveChiefResponseModeSelection({ selectedOptionText: 'General assistant AI', selectedOptionValue: 'general', uiStateMode: 'offline' });

  assert.deepEqual(offline, {
    selectedOptionText: 'Source-only evidence',
    selectedOptionValue: 'offline',
    uiStateMode: 'offline',
    normalizedMode: 'offline',
    modePassedToEngine: 'offline'
  });
  assert.equal(source.modePassedToEngine, 'source');
  assert.equal(assisted.modePassedToEngine, 'assisted');
  assert.equal(general.modePassedToEngine, 'general');
});

test('Mission Control labels remain stable for each engine mode', () => {
  assert.equal(missionControlResponseModeLabel('offline'), 'Offline evidence');
  assert.equal(missionControlResponseModeLabel('source'), 'Source-only AI');
  assert.equal(missionControlResponseModeLabel('assisted'), 'Expert-assisted AI');
  assert.equal(missionControlResponseModeLabel('general'), 'General assistant AI');
});
