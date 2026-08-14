import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBedfordWorkspaceModel } from '../src/workspace-registry.js';
import { buildWorkspaceIssuesModel } from '../src/workspace-issues.js';
import { buildWorkspaceChecklistModel, checklistFilterMatches } from '../src/workspace-checklist.js';

function checklistFor(id, pmisRuntime = null) {
  const workspaceModel = buildBedfordWorkspaceModel(id);
  const issuesModel = buildWorkspaceIssuesModel({
    workspace: workspaceModel.activeWorkspace,
    projectMilestoneContext: workspaceModel.projectMilestoneContext,
    pmisRuntime
  });
  return buildWorkspaceChecklistModel({
    workspace: workspaceModel.activeWorkspace,
    projectMilestoneContext: workspaceModel.projectMilestoneContext,
    issuesModel,
    pmisRuntime
  });
}

test('B13 derives a deterministic checklist from source drawings, specs, and project dependencies', () => {
  const checklist = checklistFor('B13');
  assert.equal(checklist.workspaceId, 'B13');
  assert.ok(checklist.items.length > 0);
  assert.equal(checklist.counts.applicableItems, checklist.items.length);
  assert.ok(checklist.items.some(item => item.title === 'Verify room construction and boundaries'));
  assert.ok(checklist.items.some(item => item.title === 'Verify grounding and bonding'));
  assert.ok(checklist.items.some(item => item.title === 'Verify horizontal cabling and testing readiness'));
  assert.ok(checklist.items.some(item => item.title === 'Room schedule confirmed' && item.status === 'BLOCKED'));
  assert.ok(checklist.items.some(item => item.title === 'APP / preconstruction gate reviewed' && item.status === 'BLOCKED'));
  const grounding = checklist.items.find(item => item.title === 'Verify grounding and bonding');
  assert.ok(grounding?.sourceRefs.some(ref => ref.kind === 'specification' && ref.sectionNumber === '27 05 26'));
  assert.ok(grounding?.sourceRefs.some(ref => ref.kind === 'drawing' && ref.sheetNumber === '61T-100'));
  assert.ok(checklist.items.every(item => item.workspaceId === 'B13'));
});

test('Existing transition workspace 137 gets transition-specific checklist items without B13-specific source bleed-through', () => {
  const checklist = checklistFor('137');
  assert.equal(checklist.workspaceId, '137');
  assert.ok(checklist.items.some(item => item.title === 'Inventory existing equipment and conditions'));
  assert.ok(checklist.items.some(item => item.title === 'Confirm active service continuity'));
  assert.ok(checklist.items.some(item => item.title === 'Review turnover and migration dependencies'));
  assert.ok(checklist.items.some(item => item.title === 'Room schedule confirmed'));
  assert.ok(checklist.items.every(item => item.sourceRefs.every(ref => ref.kind !== 'drawing' || !['61T-100', '61T-101', '61T-102'].includes(ref.sheetNumber) || item.title === 'Review source documentation' || item.title === 'Room schedule confirmed')));
});

test('Checklist filters stay deterministic and blocked state remains distinct', () => {
  const checklist = checklistFor('B13');
  assert.ok(checklistFilterMatches(checklist.items[0], 'all'));
  assert.ok(checklist.items.some(item => checklistFilterMatches(item, 'blocked')));
  assert.ok(checklist.items.some(item => checklistFilterMatches(item, 'documentation')));
  assert.ok(checklist.items.some(item => checklistFilterMatches(item, 'power')));
  assert.ok(checklist.items.some(item => checklistFilterMatches(item, 'telecom')));
});

test('Low PMIS readiness does not create checklist-only fabrications', () => {
  const checklist = checklistFor('B13', {
    buildings: [
      {
        Building: '61',
        readinessPct: 0.01,
        'Open Risks': 0,
        'Open Questions': 0,
        'Overall Status': 'Attention',
        'OIT Status': 'Blocked'
      }
    ],
    shutdowns: [],
    projectRegister: []
  });
  const pmisItem = checklist.items.find(item => item.title === 'Review PMIS activation context');
  assert.ok(pmisItem);
  assert.equal(pmisItem.status, 'UNKNOWN');
  assert.equal(pmisItem.blockedBy.length, 0);
  assert.ok(checklist.items.some(item => item.title === 'Review source documentation'));
  assert.equal(checklist.counts.blocked, 6);
});
