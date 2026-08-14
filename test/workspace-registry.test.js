import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBedfordWorkspaceModel,
  getBedfordWorkspaceDefaultId,
  getBedfordWorkspaceRecord,
  listBedfordWorkspaceRecords
} from '../src/workspace-registry.js';

test('Bedford workspace registry exposes the four plan-derived Building 61 records', () => {
  const records = listBedfordWorkspaceRecords();
  assert.deepEqual(records.map(item => item.id), ['B13', '124', '226', '137']);
  assert.equal(getBedfordWorkspaceDefaultId(), 'B13');
});

test('Bedford workspace registry grounds each record in live B61 sheet metadata', () => {
  const b13 = getBedfordWorkspaceRecord('B13');
  assert.ok(b13);
  assert.equal(b13.building, '61');
  assert.equal(b13.room, 'B13');
  assert.equal(b13.sourceSheets[0].sheetNumber, '61T-100');
  assert.equal(b13.sourceSheets[0].sheetTitle, 'TELECOMMUNICATION PLAN - BASEMENT LEVEL');
  assert.match(b13.sourceSheets[0].pageId, /^drawing-page:bedford-b61-drawings:/);
  assert.equal(b13.applicableSpecifications[0].sectionNumber, '27 10 00');
  assert.match(b13.chiefInsight, /telecom backbone/i);
});

test('Bedford workspace registry preserves the 137 transition room grounding', () => {
  const room137 = getBedfordWorkspaceRecord('137');
  assert.ok(room137);
  assert.equal(room137.sourceSheets[0].sheetNumber, '61T-402');
  assert.equal(room137.sourceSheets[0].sheetTitle, 'TELECOMMUNICATION ROOM 137- INVENTORY LIST');
  assert.equal(room137.sourceSheets[1].sheetNumber, '61T-501');
  assert.ok(room137.relatedRooms.includes('B13'));
  assert.ok(room137.applicableSpecifications.some(item => item.sectionNumber === '27 15 00'));
});

test('Bedford workspace model keeps the active record and returns all records', () => {
  const model = buildBedfordWorkspaceModel('226');
  assert.equal(model.activeWorkspaceId, '226');
  assert.equal(model.activeWorkspace?.room, '226');
  assert.equal(model.workspaces.length, 4);
  assert.deepEqual(model.workspaces.map(item => item.id), ['B13', '124', '226', '137']);
});
