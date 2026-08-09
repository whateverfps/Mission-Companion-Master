export const BEDFORD_PROJECT_ID = 'bedford';
export const BEDFORD_PROJECT_NAME = 'Bedford Veterans Affairs Hospital';
export const BEDFORD_DRAWING_DOCUMENT_ID = 'bedford-b61-drawings';
export const BEDFORD_SPEC_DOCUMENT_ID = 'bedford-specifications';

const dates = Object.freeze({ importedAt: '2026-01-06T14:00:00.000Z', indexedAt: '2026-01-06T14:05:00.000Z', lastModified: '2026-01-05T17:00:00.000Z' });

const fixture = {
  manifest: { version: 'bedford-1', project: {
    id: BEDFORD_PROJECT_ID, name: BEDFORD_PROJECT_NAME, canonicalName: 'Bedford Veterans Affairs Hospital',
    projectType: 'Healthcare facility renovation', description: 'Bedford VA Hospital renovation project including Building 61 and associated specifications.',
    isBuiltIn: true, demonstrationLabel: 'Built-in Product Data', dataLabel: 'Shipped with Mission Companion', fixtureVersion: 1,
    buildingId: '61', buildingName: 'Building 61', createdAt: '2026-01-05T13:00:00.000Z', updatedAt: '2026-01-05T17:00:00.000Z'
  } },
  libraries: [
    { id: 'bedford-lib-main', projectId: BEDFORD_PROJECT_ID, name: 'Bedford Main Library', description: 'Primary knowledge library for Bedford project', enabled: true, createdAt: dates.importedAt }
  ],
  documents: [
    {
      id: BEDFORD_DRAWING_DOCUMENT_ID,
      projectId: BEDFORD_PROJECT_ID,
      libraryId: 'bedford-lib-main',
      name: '518-22-700.Bedford.EHRM.IFC.B61.20260316.pdf',
      originalFilename: '518-22-700.Bedford.EHRM.IFC.B61.20260316.pdf',
      extension: 'pdf',
      mimeType: 'application/pdf',
      category: 'Drawings',
      type: 'drawing',
      tags: ['Drawings', 'drawing'],
      status: 'verified',
      sectionCount: 0,
      parser: 'built-in bundle',
      hierarchyVersion: 'mc-hierarchy-v2',
      ...dates,
      builtIn: true,
      staticPath: 'project-documents/bedford/drawings/518-22-700.Bedford.EHRM.IFC.B61.20260316.pdf',
      role: 'drawing',
      documentType: 'drawing'
    },
    {
      id: BEDFORD_SPEC_DOCUMENT_ID,
      projectId: BEDFORD_PROJECT_ID,
      libraryId: 'bedford-lib-main',
      name: '518-22-700.Bedford.MA.EHRM.Specifications.IFC.20260413.pdf',
      originalFilename: '518-22-700.Bedford.MA.EHRM.Specifications.IFC.20260413.pdf',
      extension: 'pdf',
      mimeType: 'application/pdf',
      category: 'Specifications',
      type: 'specification',
      tags: ['Specifications', 'specification'],
      status: 'verified',
      sectionCount: 0,
      parser: 'built-in bundle',
      hierarchyVersion: 'mc-hierarchy-v2',
      ...dates,
      builtIn: true,
      staticPath: 'project-documents/bedford/drawings/518-22-700.Bedford.MA.EHRM.Specifications.IFC.20260413.pdf',
      role: 'specification',
      documentType: 'specification'
    }
  ],
  sections: [],
  inspectionRecords: [],
  evaluations: []
};

function deepFreeze(value) {
  Object.freeze(value);
  Object.values(value).forEach(item => item && typeof item === 'object' && !Object.isFrozen(item) && deepFreeze(item));
  return value;
}

export const BEDFORD_PROJECT = deepFreeze(fixture);

export function validateBedfordProject(value = BEDFORD_PROJECT) {
  const errors = [];
  const project = value?.manifest?.project;
  const docs = Array.isArray(value?.documents) ? value.documents : [];
  
  if (!project) errors.push('Missing project manifest');
  if (project?.id !== BEDFORD_PROJECT_ID) errors.push('Project ID mismatch');
  if (docs.length !== 2) errors.push('Expected 2 documents');
  
  return { valid: errors.length === 0, errors };
}
