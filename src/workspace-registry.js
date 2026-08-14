import { BUILDING_61_DRAWING_CATALOG } from './building-61-drawing-catalog.js';

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
    applicableSpecifications: buildApplicableSpecifications(sourceSheets),
    pmisBuilding: text(pmisBuilding),
    sourceEvidence: list(sourceEvidence).length ? list(sourceEvidence) : buildSourceEvidence(sourceSheets, name),
    chiefInsight: text(chiefInsight)
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
  return WORKSPACE_REGISTRY.map(record => ({ ...record, sourceSheets: [...record.sourceSheets], relatedSheets: [...record.relatedSheets], relatedRooms: [...record.relatedRooms], applicableSpecifications: record.applicableSpecifications.map(item => ({ ...item })), sourceEvidence: record.sourceEvidence.map(item => ({ ...item })) }));
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
    workspaces: listBedfordWorkspaceRecords()
  };
}
