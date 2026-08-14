import { BUILDING_61_DRAWING_CATALOG } from './building-61-drawing-catalog.js';
import { buildBedfordProjectMilestoneContext } from './workspace-milestones.js';

const text = value => value === null || value === undefined ? '' : String(value).trim();
const list = value => Array.isArray(value) ? value : [];

const BUILDING_61_SHEET_INDEX = new Map(BUILDING_61_DRAWING_CATALOG.map(sheet => [sheet.sheetNumber, sheet]));

const specificationMap = new Map([
  ['61T-100', [
    ['27 10 00', 'INFORMATION TRANSPORT INFRASTRUCTURE'],
    ['27 05 11', 'COMMON WORK RESULTS FOR COMMUNICATIONS'],
    ['27 05 26', 'GROUNDING AND BONDING FOR COMMUNICATIONS SYSTEMS'],
    ['27 05 33', 'WIRE MESH CABLE TRAY FOR COMMUNICATIONS SYSTEMS'],
    ['27 15 00', 'COMMUNICATIONS HORIZONTAL CABLING'],
    ['28 23 00', 'VIDEO SURVEILLANCE']
  ]],
  ['61T-101', [
    ['27 10 00', 'INFORMATION TRANSPORT INFRASTRUCTURE'],
    ['27 05 11', 'COMMON WORK RESULTS FOR COMMUNICATIONS'],
    ['27 05 26', 'GROUNDING AND BONDING FOR COMMUNICATIONS SYSTEMS'],
    ['27 05 33', 'WIRE MESH CABLE TRAY FOR COMMUNICATIONS SYSTEMS'],
    ['27 15 00', 'COMMUNICATIONS HORIZONTAL CABLING'],
    ['28 23 00', 'VIDEO SURVEILLANCE']
  ]],
  ['61T-102', [
    ['27 10 00', 'INFORMATION TRANSPORT INFRASTRUCTURE'],
    ['27 05 11', 'COMMON WORK RESULTS FOR COMMUNICATIONS'],
    ['27 05 26', 'GROUNDING AND BONDING FOR COMMUNICATIONS SYSTEMS'],
    ['27 05 33', 'WIRE MESH CABLE TRAY FOR COMMUNICATIONS SYSTEMS'],
    ['27 15 00', 'COMMUNICATIONS HORIZONTAL CABLING'],
    ['28 23 00', 'VIDEO SURVEILLANCE']
  ]],
  ['61T-402', [
    ['27 15 00', 'COMMUNICATIONS HORIZONTAL CABLING']
  ]],
  ['61T-501', [
    ['27 05 11', 'COMMON WORK RESULTS FOR COMMUNICATIONS'],
    ['27 05 26', 'GROUNDING AND BONDING FOR COMMUNICATIONS SYSTEMS'],
    ['27 05 33', 'WIRE MESH CABLE TRAY FOR COMMUNICATIONS SYSTEMS'],
    ['27 15 00', 'COMMUNICATIONS HORIZONTAL CABLING']
  ]],
  ['61T-502', [
    ['27 05 11', 'COMMON WORK RESULTS FOR COMMUNICATIONS'],
    ['27 05 26', 'GROUNDING AND BONDING FOR COMMUNICATIONS SYSTEMS'],
    ['27 05 33', 'WIRE MESH CABLE TRAY FOR COMMUNICATIONS SYSTEMS'],
    ['27 15 00', 'COMMUNICATIONS HORIZONTAL CABLING']
  ]],
  ['61T-503', [
    ['27 05 11', 'COMMON WORK RESULTS FOR COMMUNICATIONS'],
    ['27 05 26', 'GROUNDING AND BONDING FOR COMMUNICATIONS SYSTEMS'],
    ['27 05 33', 'WIRE MESH CABLE TRAY FOR COMMUNICATIONS SYSTEMS'],
    ['27 15 00', 'COMMUNICATIONS HORIZONTAL CABLING']
  ]],
  ['61T-504', [
    ['27 05 11', 'COMMON WORK RESULTS FOR COMMUNICATIONS'],
    ['27 05 26', 'GROUNDING AND BONDING FOR COMMUNICATIONS SYSTEMS'],
    ['27 05 33', 'WIRE MESH CABLE TRAY FOR COMMUNICATIONS SYSTEMS'],
    ['27 15 00', 'COMMUNICATIONS HORIZONTAL CABLING']
  ]]
]);

function sheetRecord(sheetNumber) {
  const sheet = BUILDING_61_SHEET_INDEX.get(text(sheetNumber)) || null;
  return sheet ? {
    sheetNumber: sheet.sheetNumber,
    sheetTitle: sheet.sheetTitle,
    discipline: sheet.discipline,
    drawingType: sheet.drawingType,
    pdfPageNumber: Number(sheet.pdfPageNumber) || 0,
    pageId: sheet.pageId || `drawing-page:bedford-b61-drawings:${Number(sheet.pdfPageNumber) || 0}`
  } : {
    sheetNumber: text(sheetNumber),
    sheetTitle: 'Not available',
    discipline: 'Not available',
    drawingType: 'Not available',
    pdfPageNumber: 0,
    pageId: ''
  };
}

function specRecord(sectionNumber, sectionTitle) {
  return { sectionNumber, sectionTitle };
}

function buildSourceEvidence(sourceSheets, label) {
  return list(sourceSheets).map(sheetNumber => {
    const sheet = sheetRecord(sheetNumber);
    return {
      kind: 'source-sheet',
      label,
      sheetNumber: sheet.sheetNumber,
      sheetTitle: sheet.sheetTitle,
      pageId: sheet.pageId,
      pdfPageNumber: sheet.pdfPageNumber
    };
  });
}

function buildApplicableSpecifications(sourceSheets) {
  const seen = new Set();
  const records = [];
  for (const sheetNumber of list(sourceSheets)) {
    for (const [sectionNumber, sectionTitle] of list(specificationMap.get(text(sheetNumber)))) {
      if (seen.has(sectionNumber)) continue;
      seen.add(sectionNumber);
      records.push(specRecord(sectionNumber, sectionTitle));
    }
  }
  return records;
}

function buildIssues({ room, name, type }) {
  if (text(type) === 'EXISTING_TRANSITION') {
    return [
      { label: 'Existing condition inventory', detail: `${room} is documented as an existing / transition telecom-computer room and should be verified against the current inventory list.` }
    ];
  }
  return [
    { label: 'No room-specific issues recorded', detail: `${room || name || 'This workspace'} does not have separate issue data yet.` }
  ];
}

function buildTraceabilityMap({ sourceSheets, applicableSpecifications, name, level, disciplineFocus }) {
  const primarySheet = list(sourceSheets)[0] ? sheetRecord(list(sourceSheets)[0]) : null;
  const primarySpec = list(applicableSpecifications)[0] || null;
  return [
    {
      from: primarySheet?.sheetNumber || 'Source Sheet',
      requirement: primarySpec?.sectionTitle || disciplineFocus || 'Workspace requirement',
      impact: `${name || 'Workspace'} readiness`
    },
    {
      from: primarySpec?.sectionNumber || 'Governing Spec',
      requirement: primarySpec?.sectionTitle || 'Shared Bedford specification',
      impact: `${level || 'Workspace'} traceability`
    },
    {
      from: primarySheet?.sheetNumber || 'Source Sheet',
      requirement: disciplineFocus || 'Bedford source evidence',
      impact: 'Workspace'
    }
  ];
}

function buildChecklist({ sourceSheets, disciplineFocus, level, room }) {
  const items = [
    `Verify ${room || 'the workspace'} source sheet geometry and room boundaries`,
    'Confirm rack / cabinet placement against the source drawing',
    'Verify power, grounding, and bonding conditions',
    'Inspect firestopping and pathway coordination',
    `Review governing specifications for ${disciplineFocus || 'this workspace'}`
  ];
  if (list(sourceSheets).some(sheet => text(sheet) === '61T-402')) {
    items.unshift('Compare the transition inventory list against current field conditions');
  }
  return items.map(label => ({ label, done: false, detail: `${level || 'Workspace'} checklist item` }));
}

function buildNextSteps({ sourceSheets, applicableSpecifications, relatedRooms, pmisBuilding, room, name }) {
  const steps = [
    { label: `Review ${list(sourceSheets)[0] || 'source sheet'}`, detail: 'Use the embedded drawing evidence to confirm the current room state.' },
    { label: `Compare ${list(applicableSpecifications)[0]?.sectionNumber || 'governing spec'}`, detail: 'Trace the source sheet back to the Bedford IFC specifications.' },
    { label: `Ask Chief about ${room || name || 'this workspace'}`, detail: 'Use Chief analysis for project context and implications.' },
    { label: `${pmisBuilding || 'Building 61'} readiness context`, detail: 'Check PMIS for building-level status and cross-workspace context.' }
  ];
  if (list(relatedRooms).length) {
    steps.push({ label: `Related rooms: ${list(relatedRooms).join(', ')}`, detail: 'Switch to another approved workspace when needed.' });
  }
  return steps;
}

function buildChiefInsight({
  id,
  room,
  name,
  type,
  level,
  disciplineFocus,
  sourceSheets,
  relatedSheets,
  applicableSpecifications,
  relatedRooms,
  pmisBuilding,
  projectMilestoneContext = null
}) {
  const sheetCount = list(sourceSheets).length;
  const relatedSheetCount = list(relatedSheets).length;
  const specCount = list(applicableSpecifications).length;
  const relatedRoomCount = list(relatedRooms).length;
  const parts = [
    `${room || id || 'This workspace'} is the ${name || 'Bedford workspace'} for ${disciplineFocus || 'project evidence review'} at ${level || 'the recorded level'} in ${pmisBuilding || 'Bedford'}.`,
    `It is supported by ${sheetCount} source sheet${sheetCount === 1 ? '' : 's'}${relatedSheetCount ? ` and ${relatedSheetCount} related sheet${relatedSheetCount === 1 ? '' : 's'}` : ''}.`,
    specCount ? `The workspace maps to ${specCount} applicable specification section${specCount === 1 ? '' : 's'}${relatedRoomCount ? ` and ${relatedRoomCount} related room${relatedRoomCount === 1 ? '' : 's'}` : ''}.` : 'No applicable specification sections are currently recorded.',
    type === 'EXISTING_TRANSITION'
      ? 'This is an existing-transition room; compare it against current inventory conditions.'
      : 'Use the source sheets and specification links to verify the current room condition.'
  ];
  if (projectMilestoneContext) {
    parts.push(`The project is in ${projectMilestoneContext.projectPhase || 'Preconstruction'} phase under Notice to Proceed on ${projectMilestoneContext.ntpDateLabel || projectMilestoneContext.ntpDate || 'the NTP date'}.`);
    parts.push(`The interim contractor schedule is ${projectMilestoneContext.scheduleStatus ? projectMilestoneContext.scheduleStatus.toLowerCase() : 'awaiting submission'}, while room-level construction dates remain ${projectMilestoneContext.roomScheduleStatus ? projectMilestoneContext.roomScheduleStatus.toLowerCase() : 'awaiting contractor schedule'}.`);
  }
  return parts.slice(0, 4).join(' ');
}

function buildWorkspaceRecord({
  id,
  building,
  room,
  name,
  type,
  importance,
  level,
  disciplineFocus,
  sourceSheets,
  relatedSheets,
  relatedRooms = [],
  pmisBuilding,
  chiefInsight,
  sourceEvidence
}) {
  const resolvedSourceSheets = list(sourceSheets).map(sheetNumber => sheetRecord(sheetNumber));
  const resolvedRelatedSheets = list(relatedSheets).map(sheetNumber => sheetRecord(sheetNumber));
  const applicableSpecifications = buildApplicableSpecifications(sourceSheets);
  return Object.freeze({
    id: text(id),
    building: text(building),
    room: text(room),
    name: text(name),
    type: text(type),
    importance: text(importance),
    level: text(level),
    disciplineFocus: text(disciplineFocus),
    sourceSheets: resolvedSourceSheets,
    relatedSheets: resolvedRelatedSheets,
    relatedRooms: list(relatedRooms).map(item => text(item)).filter(Boolean),
    applicableSpecifications,
    pmisBuilding: text(pmisBuilding),
    sourceEvidence: list(sourceEvidence).length ? list(sourceEvidence) : buildSourceEvidence(sourceSheets, name),
    chiefInsight: buildChiefInsight({ id, room, name, type, level, disciplineFocus, sourceSheets, relatedSheets, applicableSpecifications, relatedRooms, pmisBuilding }) || text(chiefInsight),
    issues: buildIssues({ room, name, type }),
    traceabilityMap: buildTraceabilityMap({ sourceSheets, applicableSpecifications, name, level, disciplineFocus }),
    checklist: buildChecklist({ sourceSheets, disciplineFocus, level, room }),
    nextSteps: buildNextSteps({ sourceSheets, applicableSpecifications, relatedRooms, pmisBuilding, room, name })
  });
}

const WORKSPACE_REGISTRY = Object.freeze([
  buildWorkspaceRecord({
    id: 'B13',
    building: '61',
    room: 'B13',
    name: 'Primary Telecommunications Room',
    type: 'PRIMARY',
    importance: 'Primary',
    level: 'Basement',
    disciplineFocus: 'Telecommunication / OIT',
    sourceSheets: ['61T-100', '61T-501'],
    relatedSheets: ['61T-601', '61T-701'],
    relatedRooms: ['124', '226', '137'],
    pmisBuilding: 'Building 61',
    chiefInsight: 'The basement telecommunications room is the base point for the building telecom backbone and cabinet distribution.'
  }),
  buildWorkspaceRecord({
    id: '124',
    building: '61',
    room: '124',
    name: 'Primary Telecommunications Room',
    type: 'PRIMARY',
    importance: 'Primary',
    level: 'First Level',
    disciplineFocus: 'Telecommunication / OIT',
    sourceSheets: ['61T-101', '61T-501'],
    relatedSheets: ['61T-601', '61T-701'],
    relatedRooms: ['B13', '226', '137'],
    pmisBuilding: 'Building 61',
    chiefInsight: 'The first-level telecommunications room anchors the main distribution path for first-floor support and downstream risers.'
  }),
  buildWorkspaceRecord({
    id: '226',
    building: '61',
    room: '226',
    name: 'Primary Telecommunications Room',
    type: 'PRIMARY',
    importance: 'Primary',
    level: 'Second Level',
    disciplineFocus: 'Telecommunication / OIT',
    sourceSheets: ['61T-102', '61T-501'],
    relatedSheets: ['61T-601', '61T-701'],
    relatedRooms: ['B13', '124', '137'],
    pmisBuilding: 'Building 61',
    chiefInsight: 'The second-level telecommunications room is the top-level distribution point for upper-floor telecom work and risers.'
  }),
  buildWorkspaceRecord({
    id: '137',
    building: '61',
    room: '137',
    name: 'Existing / Transition Telecom-Computer Room',
    type: 'EXISTING_TRANSITION',
    importance: 'Existing Transition',
    level: 'First Level',
    disciplineFocus: 'Telecommunication / OIT',
    sourceSheets: ['61T-402', '61T-501'],
    relatedSheets: ['61T-100', '61T-101', '61T-102', '61T-601', '61T-701'],
    relatedRooms: ['B13', '124', '226'],
    pmisBuilding: 'Building 61',
    chiefInsight: 'The room 137 inventory list and telecom details make it the clearest existing-transition workspace in the current B61 set.'
  })
]);

export function listBedfordWorkspaceRecords() {
  return WORKSPACE_REGISTRY.map(record => ({
    ...record,
    sourceSheets: [...record.sourceSheets],
    relatedSheets: [...record.relatedSheets],
    relatedRooms: [...record.relatedRooms],
    applicableSpecifications: record.applicableSpecifications.map(item => ({ ...item })),
    sourceEvidence: record.sourceEvidence.map(item => ({ ...item })),
    issues: record.issues.map(item => ({ ...item })),
    traceabilityMap: record.traceabilityMap.map(item => ({ ...item })),
    checklist: record.checklist.map(item => ({ ...item })),
    nextSteps: record.nextSteps.map(item => ({ ...item }))
  }));
}

export function getBedfordWorkspaceRecord(id = '') {
  const needle = text(id);
  return WORKSPACE_REGISTRY.find(record => record.id === needle) || null;
}

export function getBedfordWorkspaceDefaultId() {
  return WORKSPACE_REGISTRY[0]?.id || '';
}

export function buildBedfordWorkspaceModel(id = '') {
  const activeRecord = getBedfordWorkspaceRecord(id) || WORKSPACE_REGISTRY[0] || null;
  return {
    activeWorkspaceId: activeRecord?.id || '',
    activeWorkspace: activeRecord,
    workspaces: listBedfordWorkspaceRecords(),
    projectMilestoneContext: buildBedfordProjectMilestoneContext({ workspace: activeRecord })
  };
}

export { buildChiefInsight };
