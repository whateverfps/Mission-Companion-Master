const text = value => value === null || value === undefined ? '' : String(value).trim();
const list = value => Array.isArray(value) ? value : [];

const CHECKLIST_CATEGORY_ORDER = Object.freeze([
  'ROOM',
  'TELECOM',
  'POWER',
  'GROUNDING / BONDING',
  'FIRESTOPPING',
  'OIT / ACTIVATION',
  'DOCUMENTATION',
  'TESTING',
  'COORDINATION'
]);

const CHECKLIST_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'room', label: 'Room' },
  { id: 'telecom', label: 'Telecom' },
  { id: 'power', label: 'Power' },
  { id: 'oit', label: 'OIT' },
  { id: 'documentation', label: 'Documentation' },
  { id: 'blocked', label: 'Blocked' }
]);

const CATEGORY_FILTER_MAP = Object.freeze({
  ROOM: 'room',
  'ROOM / CONSTRUCTION': 'room',
  TELECOM: 'telecom',
  POWER: 'power',
  'GROUNDING / BONDING': 'power',
  FIRESTOPPING: 'telecom',
  'OIT / ACTIVATION': 'oit',
  DOCUMENTATION: 'documentation',
  TESTING: 'telecom',
  COORDINATION: 'documentation'
});

function normalizeBuildingKey(value) {
  const raw = text(value).replace(/^building\s*/i, '').replace(/^b/i, '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return raw.padStart(2, '0');
  return raw.toUpperCase();
}

function itemId(parts = []) {
  return parts.map(value => text(value)).filter(Boolean).join('|');
}

function sourceSheetRef(sheet = {}, relationship = 'Source') {
  const sheetNumber = text(sheet.sheetNumber);
  return sheetNumber ? {
    kind: 'drawing',
    relationship,
    sheetNumber,
    sheetTitle: text(sheet.sheetTitle),
    discipline: text(sheet.discipline),
    level: text(sheet.level),
    documentId: text(sheet.documentId),
    pageId: text(sheet.pageId),
    pageNumber: Number(sheet.pdfPageNumber) || 0
  } : null;
}

function specRef(spec = {}, relationship = 'Applicable') {
  const sectionNumber = text(spec.sectionNumber);
  return sectionNumber ? {
    kind: 'specification',
    relationship,
    sectionNumber,
    sectionTitle: text(spec.sectionTitle),
    sourceLabel: 'Bedford IFC specification index'
  } : null;
}

function milestoneRef(milestone = {}, relationship = 'Milestone') {
  const id = text(milestone.id);
  return id ? {
    kind: 'milestone',
    relationship,
    id,
    label: text(milestone.label || milestone.name || milestone.id),
    dueDate: text(milestone.dueDate),
    dueDateLabel: text(milestone.dueDateLabel),
    status: text(milestone.status),
    category: text(milestone.category),
    scope: text(milestone.scope),
    source: text(milestone.source)
  } : null;
}

function issueRef(issue = {}, relationship = 'Issue') {
  const id = text(issue.id);
  return id ? {
    kind: 'issue',
    relationship,
    id,
    title: text(issue.title),
    type: text(issue.type),
    severity: text(issue.severity),
    status: text(issue.status)
  } : null;
}

function createChecklistItem({
  id,
  title,
  description,
  category,
  scope,
  status = 'NOT_VERIFIED',
  sourceType,
  sourceRefs = [],
  workspaceId = '',
  required = true,
  verifiable = true,
  verificationState = 'NOT_VERIFIED',
  blockedBy = [],
  relatedIssues = [],
  relatedSpecifications = [],
  relatedSheets = [],
  relatedMilestones = [],
  notes = '',
  canToggle = true,
  authoritative = false
}) {
  return Object.freeze({
    id: text(id),
    title: text(title),
    description: text(description),
    category: text(category).toUpperCase() || 'COORDINATION',
    scope: text(scope).toUpperCase() || 'WORKSPACE',
    status: text(status).toUpperCase() || 'NOT_VERIFIED',
    sourceType: text(sourceType),
    sourceRefs: list(sourceRefs).map(ref => ref ? { ...ref } : null).filter(Boolean),
    workspaceId: text(workspaceId),
    required: Boolean(required),
    verifiable: Boolean(verifiable),
    verificationState: text(verificationState).toUpperCase() || 'NOT_VERIFIED',
    blockedBy: list(blockedBy).map(value => text(value)).filter(Boolean),
    relatedIssues: list(relatedIssues).map(item => issueRef(item)).filter(Boolean),
    relatedSpecifications: list(relatedSpecifications).map(item => specRef(item)).filter(Boolean),
    relatedSheets: list(relatedSheets).map(item => sourceSheetRef(item)).filter(Boolean),
    relatedMilestones: list(relatedMilestones).map(item => milestoneRef(item)).filter(Boolean),
    notes: text(notes),
    canToggle: Boolean(canToggle),
    authoritative: Boolean(authoritative)
  });
}

function checklistSortRank(item = {}) {
  const statusRank = {
    BLOCKED: 0,
    UNKNOWN: 1,
    NOT_VERIFIED: 2,
    VERIFIED_SESSION: 3,
    NOT_APPLICABLE: 4
  };
  const categoryRank = CHECKLIST_CATEGORY_ORDER.indexOf(item.category);
  return (statusRank[item.status] ?? 99) * 100
    + (categoryRank >= 0 ? categoryRank : 99)
    + (item.required ? 0 : 10);
}

function checklistFilterMatches(item, filterId = 'all') {
  const filter = text(filterId).toLowerCase();
  if (!filter || filter === 'all') return true;
  if (filter === 'blocked') return item.status === 'BLOCKED';
  const mapped = CATEGORY_FILTER_MAP[item.category] || CATEGORY_FILTER_MAP[item.scope] || '';
  return filter === mapped;
}

function groupChecklistItems(items = []) {
  const groups = [];
  for (const category of CHECKLIST_CATEGORY_ORDER) {
    const groupItems = items.filter(item => item.category === category);
    if (!groupItems.length) continue;
    groups.push({
      id: category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: category,
      items: groupItems
    });
  }
  return groups;
}

function buildPrimaryWorkspaceChecklist({
  workspace = null,
  projectMilestoneContext = null,
  issuesModel = null,
  pmisRuntime = null
} = {}) {
  const workspaceId = text(workspace?.id || '');
  const room = text(workspace?.room || workspace?.id || '');
  const building = normalizeBuildingKey(workspace?.building);
  const level = text(workspace?.level || 'Workspace');
  const roomType = text(workspace?.type);
  const sourceSheets = list(workspace?.sourceSheets);
  const relatedSheets = list(workspace?.relatedSheets);
  const applicableSpecifications = list(workspace?.applicableSpecifications);
  const relatedRooms = list(workspace?.relatedRooms);
  const issueList = list(issuesModel?.issues);
  const scheduleIssue = issueList.find(issue => /awaiting contractor schedule/i.test(text(issue.title))) || null;
  const appIssue = issueList.find(issue => /app date pending/i.test(text(issue.title))) || null;
  const pmisBuildingRecord = list(pmisRuntime?.buildings).find(item => normalizeBuildingKey(item?.Building) === building) || null;
  const pmisRiskCount = Math.max(0, Number(pmisBuildingRecord?.['Open Risks'] || pmisBuildingRecord?.openRisks || 0) || 0);
  const pmisQuestionCount = Math.max(0, Number(pmisBuildingRecord?.['Open Questions'] || pmisBuildingRecord?.openQuestions || 0) || 0);
  const pmisGateStatus = text(pmisBuildingRecord?.['OIT Status'] || pmisBuildingRecord?.['OIT Readiness'] || pmisBuildingRecord?.['Overall Status'] || '');
  const scheduleMilestone = list(projectMilestoneContext?.milestones).find(item => /schedule/i.test(text(item.category)) && /awaiting/i.test(text(item.status))) || null;
  const appMilestone = list(projectMilestoneContext?.milestones).find(item => text(item.id) === 'accident-prevention-plan' || /accident prevention plan/i.test(text(item.name)));
  const sourceSheetRefs = sourceSheets.map(sheet => sourceSheetRef(sheet, 'Source Sheet')).filter(Boolean);
  const relatedSheetRefs = relatedSheets.map(sheet => sourceSheetRef(sheet, 'Related Sheet')).filter(Boolean);
  const firstSheet = sourceSheets[0] || null;
  const firstSpec = applicableSpecifications[0] || null;
  const firstSpecRef = specRef(firstSpec, 'Governing Spec');
  const scheduleBlocked = Boolean(scheduleIssue);
  const appBlocked = Boolean(appIssue);
  const items = [];

  if (sourceSheetRefs.length || firstSpecRef) {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'documentation', 'source-records']),
      title: 'Review source documentation',
      description: 'Confirm the workspace is grounded in current source drawings and governing specification references.',
      category: 'DOCUMENTATION',
      scope: 'WORKSPACE',
      status: sourceSheetRefs.length ? 'NOT_VERIFIED' : 'UNKNOWN',
      sourceType: 'Workspace registry',
      sourceRefs: [...sourceSheetRefs.slice(0, 2), firstSpecRef].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: true,
      relatedSpecifications: applicableSpecifications.slice(0, 3),
      relatedSheets: sourceSheets.slice(0, 2),
      notes: `Workspace ${room || workspaceId || 'workspace'} has ${sourceSheetRefs.length} source sheet${sourceSheetRefs.length === 1 ? '' : 's'} available for review.`
    }));
  }

  if (applicableSpecifications.some(spec => text(spec.sectionNumber) === '27 05 11')) {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'room', 'construction']),
      title: 'Verify room construction and boundaries',
      description: 'Confirm the room layout, major construction conditions, and drawing boundaries against the source sheets.',
      category: 'ROOM',
      scope: 'ROOM',
      status: scheduleBlocked ? 'BLOCKED' : 'NOT_VERIFIED',
      sourceType: 'Applicable specification',
      sourceRefs: [firstSheet ? sourceSheetRef(firstSheet, 'Source Sheet') : null, specRef(applicableSpecifications.find(spec => text(spec.sectionNumber) === '27 05 11'), 'Governing Spec')].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: true,
      blockedBy: scheduleIssue ? [scheduleIssue.id] : [],
      relatedIssues: scheduleIssue ? [scheduleIssue] : [],
      relatedSpecifications: applicableSpecifications.filter(spec => text(spec.sectionNumber) === '27 05 11'),
      relatedSheets: sourceSheets.slice(0, 2),
      relatedMilestones: scheduleMilestone ? [scheduleMilestone] : [],
      notes: 'Room construction checks stay tied to the room schedule and the governing room layout sheets.'
    }));
  }

  if (applicableSpecifications.some(spec => text(spec.sectionNumber) === '27 05 33')) {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'telecom', 'pathways']),
      title: 'Confirm cable tray and pathway coordination',
      description: 'Confirm communications pathways, tray routing, and cable support coordination against the source documents.',
      category: 'TELECOM',
      scope: 'ROOM',
      status: scheduleBlocked ? 'BLOCKED' : 'NOT_VERIFIED',
      sourceType: 'Applicable specification',
      sourceRefs: [firstSheet ? sourceSheetRef(firstSheet, 'Source Sheet') : null, specRef(applicableSpecifications.find(spec => text(spec.sectionNumber) === '27 05 33'), 'Governing Spec')].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: true,
      blockedBy: scheduleIssue ? [scheduleIssue.id] : [],
      relatedIssues: scheduleIssue ? [scheduleIssue] : [],
      relatedSpecifications: applicableSpecifications.filter(spec => text(spec.sectionNumber) === '27 05 33'),
      relatedSheets: sourceSheets.slice(0, 2),
      relatedMilestones: scheduleMilestone ? [scheduleMilestone] : [],
      notes: 'Pathway coordination is part of the preconstruction sequence and should not be treated as complete until the contractor schedule is available.'
    }));
  }

  if (applicableSpecifications.some(spec => text(spec.sectionNumber) === '27 05 26')) {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'power', 'grounding']),
      title: 'Verify grounding and bonding',
      description: 'Confirm grounding and bonding conditions against the source drawing and communications grounding specification.',
      category: 'GROUNDING / BONDING',
      scope: 'ROOM',
      status: scheduleBlocked ? 'BLOCKED' : 'NOT_VERIFIED',
      sourceType: 'Applicable specification',
      sourceRefs: [firstSheet ? sourceSheetRef(firstSheet, 'Source Sheet') : null, specRef(applicableSpecifications.find(spec => text(spec.sectionNumber) === '27 05 26'), 'Governing Spec')].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: true,
      blockedBy: scheduleIssue ? [scheduleIssue.id] : [],
      relatedIssues: scheduleIssue ? [scheduleIssue] : [],
      relatedSpecifications: applicableSpecifications.filter(spec => text(spec.sectionNumber) === '27 05 26'),
      relatedSheets: sourceSheets.slice(0, 2),
      relatedMilestones: scheduleMilestone ? [scheduleMilestone] : [],
      notes: 'Grounding and bonding is a prerequisite for room turnover and should stay blocked if the room schedule is still pending.'
    }));
  }

  if (applicableSpecifications.some(spec => text(spec.sectionNumber) === '27 15 00')) {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'telecom', 'cabling']),
      title: 'Verify horizontal cabling and testing readiness',
      description: 'Confirm cable pathways, cabling, and testing readiness from the approved source sheets and cabling specification.',
      category: 'TESTING',
      scope: 'ROOM',
      status: scheduleBlocked ? 'BLOCKED' : 'NOT_VERIFIED',
      sourceType: 'Applicable specification',
      sourceRefs: [firstSheet ? sourceSheetRef(firstSheet, 'Source Sheet') : null, specRef(applicableSpecifications.find(spec => text(spec.sectionNumber) === '27 15 00'), 'Governing Spec')].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: true,
      blockedBy: scheduleIssue ? [scheduleIssue.id] : [],
      relatedIssues: scheduleIssue ? [scheduleIssue] : [],
      relatedSpecifications: applicableSpecifications.filter(spec => text(spec.sectionNumber) === '27 15 00'),
      relatedSheets: sourceSheets.slice(0, 2),
      relatedMilestones: scheduleMilestone ? [scheduleMilestone] : [],
      notes: 'Testing readiness remains pending until the contractor schedule and room sequence are established.'
    }));
  }

  if (applicableSpecifications.some(spec => text(spec.sectionNumber) === '28 23 00')) {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'coordination', 'security']),
      title: 'Verify video surveillance and security coordination',
      description: 'Confirm surveillance / security coordination where the governing sheets indicate it applies to the workspace.',
      category: 'COORDINATION',
      scope: 'ROOM',
      status: 'NOT_VERIFIED',
      sourceType: 'Applicable specification',
      sourceRefs: [firstSheet ? sourceSheetRef(firstSheet, 'Source Sheet') : null, specRef(applicableSpecifications.find(spec => text(spec.sectionNumber) === '28 23 00'), 'Governing Spec')].filter(Boolean),
      workspaceId,
      required: false,
      verifiable: true,
      relatedSpecifications: applicableSpecifications.filter(spec => text(spec.sectionNumber) === '28 23 00'),
      relatedSheets: sourceSheets.slice(0, 2),
      notes: 'Security-related coordination remains a review item when the governing evidence identifies it.'
    }));
  }

  if (relatedRooms.length) {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'coordination', 'related-rooms']),
      title: 'Review related room dependencies',
      description: 'Confirm the related room sequence and coordination points before relying on this workspace alone.',
      category: 'COORDINATION',
      scope: 'WORKSPACE',
      status: 'NOT_VERIFIED',
      sourceType: 'Workspace registry',
      sourceRefs: relatedRooms.map(roomId => ({ kind: 'workspace', relationship: 'Related room', roomId, label: roomId })).slice(0, 4),
      workspaceId,
      required: false,
      verifiable: true,
      relatedIssues: list(issuesModel?.issues).filter(issue => issue.scope === 'ROOM'),
      relatedSpecifications: applicableSpecifications.slice(0, 2),
      relatedSheets: relatedSheetRefs.slice(0, 4).map(ref => ({ ...ref, relationship: 'Related Sheet' })),
      notes: 'Related rooms are helpful for construction sequencing and dependency review.'
    }));
  }

  if (roomType === 'EXISTING_TRANSITION') {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'transition', 'inventory']),
      title: 'Inventory existing equipment and conditions',
      description: 'Document the existing room inventory before assuming the transition scope is complete.',
      category: 'DOCUMENTATION',
      scope: 'ROOM',
      status: 'NOT_VERIFIED',
      sourceType: 'Workspace registry',
      sourceRefs: [...sourceSheetRefs.slice(0, 2), firstSpecRef].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: true,
      relatedSpecifications: applicableSpecifications.slice(0, 3),
      relatedSheets: sourceSheets.slice(0, 2),
      notes: 'Existing / transition rooms require a current inventory check before migration work proceeds.'
    }));
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'transition', 'continuity']),
      title: 'Confirm active service continuity',
      description: 'Review the transition scope to keep active services available while the room is reworked.',
      category: 'COORDINATION',
      scope: 'WORKSPACE',
      status: scheduleBlocked ? 'BLOCKED' : 'NOT_VERIFIED',
      sourceType: 'Workspace registry',
      sourceRefs: [...sourceSheetRefs.slice(0, 2), firstSpecRef].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: true,
      blockedBy: scheduleIssue ? [scheduleIssue.id] : [],
      relatedIssues: scheduleIssue ? [scheduleIssue] : [],
      relatedSpecifications: applicableSpecifications.slice(0, 3),
      relatedSheets: sourceSheets.slice(0, 2),
      notes: 'Service continuity stays dependent on the live transition sequence and schedule status.'
    }));
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'transition', 'migration']),
      title: 'Review turnover and migration dependencies',
      description: 'Confirm turnover and migration dependencies before planning any transition cutover.',
      category: 'COORDINATION',
      scope: 'WORKSPACE',
      status: appBlocked ? 'BLOCKED' : 'NOT_VERIFIED',
      sourceType: 'Workspace registry',
      sourceRefs: [...sourceSheetRefs.slice(0, 2), firstSpecRef].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: true,
      blockedBy: appIssue ? [appIssue.id] : [],
      relatedIssues: appIssue ? [appIssue] : [],
      relatedSpecifications: applicableSpecifications.slice(0, 3),
      relatedSheets: sourceSheets.slice(0, 2),
      relatedMilestones: appMilestone ? [appMilestone] : [],
      notes: 'Transition dependencies should not be marked complete while the APP date remains pending.'
    }));
  }

  if (pmisBuildingRecord) {
    const pmisEvidence = [
      { kind: 'pmis', relationship: 'PMIS readiness', building: building || pmisBuildingRecord.Building, label: `${normalizeBuildingKey(pmisBuildingRecord.Building) || 'Campus'} PMIS`, readinessPct: Number(pmisBuildingRecord.readinessPct || 0), openRisks: pmisRiskCount, openQuestions: pmisQuestionCount, status: pmisGateStatus || 'Monitor' }
    ];
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'oit', 'pmis-context']),
      title: 'Review PMIS activation context',
      description: 'Check the current PMIS building context for readiness, risks, and open questions before treating activation as complete.',
      category: 'OIT / ACTIVATION',
      scope: 'PROJECT',
      status: pmisRiskCount > 0 || pmisQuestionCount > 0 ? 'BLOCKED' : 'UNKNOWN',
      sourceType: 'PMIS runtime',
      sourceRefs: pmisEvidence,
      workspaceId,
      required: true,
      verifiable: true,
      blockedBy: pmisRiskCount > 0 || pmisQuestionCount > 0 ? ['pmis-context'] : [],
      relatedIssues: list(issuesModel?.issues).filter(issue => issue.scope === 'BUILDING' || issue.type === 'QUESTION' || issue.type === 'RISK' || issue.type === 'SHUTDOWN'),
      relatedSpecifications: applicableSpecifications.slice(0, 2),
      relatedSheets: sourceSheets.slice(0, 1),
      notes: pmisRiskCount > 0 || pmisQuestionCount > 0
        ? `PMIS reports ${pmisRiskCount} open risk(s) and ${pmisQuestionCount} open question(s) for ${normalizeBuildingKey(pmisBuildingRecord.Building) || building || 'the building'}.`
        : `PMIS provides readiness context for ${normalizeBuildingKey(pmisBuildingRecord.Building) || building || 'the building'} without an explicit blocker.`
    }));
  }

  if (scheduleIssue) {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'coordination', 'room-schedule']),
      title: 'Room schedule confirmed',
      description: 'Room-level work remains blocked until the contractor schedule is received.',
      category: 'COORDINATION',
      scope: 'PROJECT',
      status: 'BLOCKED',
      sourceType: 'Workspace Issues & Risks',
      sourceRefs: [issueRef(scheduleIssue, 'Workspace issue')].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: false,
      blockedBy: [scheduleIssue.id],
      relatedIssues: [scheduleIssue],
      relatedMilestones: scheduleMilestone ? [scheduleMilestone] : [],
      notes: 'Waiting for the contractor schedule is a project dependency, not a failure.'
    }));
  }

  if (appIssue) {
    items.push(createChecklistItem({
      id: itemId([workspaceId, 'documentation', 'app']),
      title: 'APP / preconstruction gate reviewed',
      description: 'The Accident Prevention Plan remains pending until the preconstruction conference date is established.',
      category: 'DOCUMENTATION',
      scope: 'PROJECT',
      status: 'BLOCKED',
      sourceType: 'Workspace Issues & Risks',
      sourceRefs: [issueRef(appIssue, 'Workspace issue')].filter(Boolean),
      workspaceId,
      required: true,
      verifiable: false,
      blockedBy: [appIssue.id],
      relatedIssues: [appIssue],
      relatedMilestones: appMilestone ? [appMilestone] : [],
      notes: 'The APP gate should stay blocked until the related milestone has a valid date.'
    }));
  }

  const filtered = items.sort((a, b) => checklistSortRank(a) - checklistSortRank(b));
  const counts = Object.freeze({
    applicableItems: filtered.length,
    blocked: filtered.filter(item => item.status === 'BLOCKED').length,
    unknown: filtered.filter(item => item.status === 'UNKNOWN' || item.status === 'NOT_VERIFIED').length,
    room: filtered.filter(item => item.category === 'ROOM').length,
    telecom: filtered.filter(item => item.category === 'TELECOM').length,
    power: filtered.filter(item => item.category === 'POWER' || item.category === 'GROUNDING / BONDING').length,
    oit: filtered.filter(item => item.category === 'OIT / ACTIVATION').length,
    documentation: filtered.filter(item => item.category === 'DOCUMENTATION').length,
    testing: filtered.filter(item => item.category === 'TESTING').length,
    coordination: filtered.filter(item => item.category === 'COORDINATION').length
  });

  return Object.freeze({
    workspaceId,
    workspaceRoom: room,
    workspaceName: text(workspace?.name || ''),
    building,
    level,
    disciplineFocus: text(workspace?.disciplineFocus || ''),
    items: filtered,
    groups: groupChecklistItems(filtered),
    overviewItems: filtered.slice(0, 4),
    selectedItemId: filtered.find(item => item.status === 'BLOCKED')?.id || filtered[0]?.id || '',
    counts,
    filters: CHECKLIST_FILTERS.map(filter => ({
      ...filter,
      count: filter.id === 'all'
        ? filtered.length
        : filter.id === 'blocked'
          ? counts.blocked
          : filtered.filter(item => checklistFilterMatches(item, filter.id)).length
    })),
    emptyState: filtered.length ? '' : 'No deterministic checklist items are available for this Workspace yet.'
  });
}

export function buildWorkspaceChecklistModel(options = {}) {
  return buildPrimaryWorkspaceChecklist(options);
}

export { checklistFilterMatches };
