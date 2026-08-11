import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

const authoritativeSections = readJson('project-data/bedford/specifications/authoritative-spec-index.json');
const bedfordSpecificationSections = readJson('project-data/bedford/specifications/bedford-spec-index.json');
const relationshipData = readJson('project-data/bedford/relationships/building-61-spec-links.json');
const relationshipDataB62 = readJson('project-data/bedford/relationships/building-62-spec-links.json');
const drawingCatalog = readJson('project-data/bedford/drawing-catalogs/building-61.json');
const drawingCatalogB62 = readJson('project-data/bedford/drawing-catalogs/building-62.json');

const { createSpecificationIndex } = await import('../src/specification-index.js');
const { createDrawingCatalog } = await import('../src/drawing-catalog.js');
const { createDrawingSpecificationLinkService } = await import('../src/drawing-spec-links.js');
const { loadBedfordDrawingSpecMappings } = await import('../src/specification-knowledge.js');
const { createChiefSpecificationSME } = await import('../src/chief-specification-sme.js');
const { createChiefIntelligenceBridge } = await import('../src/chief-intelligence-bridge.js');

test('Bedford bootstrap loads the authoritative relationship graph before Chief asks questions', async () => {
  const specificationIndex = createSpecificationIndex();
  const drawingSpecificationLinks = createDrawingSpecificationLinkService({
    index: specificationIndex,
    persistence: null
  });
  const chiefSpecificationSME = createChiefSpecificationSME({
    projectId: 'bedford',
    getAuthoritativeSections: () => authoritativeSections,
    getSectionTextSections: () => bedfordSpecificationSections,
    getDrawingLinks: () => drawingSpecificationLinks.forProject('bedford'),
    getDrawingCatalog: () => drawingCatalog.sheets || [],
    reverseIndex: null
  });
  chiefSpecificationSME.setTextSections(bedfordSpecificationSections);

  const specDocument = {
    id: 'bedford-specifications',
    projectId: 'bedford',
    name: 'Bedford Specification Manual',
    title: 'Bedford Specification Manual'
  };
  specificationIndex.index({
    document: specDocument,
    sourceSections: authoritativeSections.map(section => ({
      ...section,
      pageStart: section.pageStart || section.startPdfPage || section.startPage || null,
      pageEnd: section.pageEnd || section.endPdfPage || section.endPage || section.startPdfPage || section.startPage || null
    }))
  });
  chiefSpecificationSME.setTextSections(bedfordSpecificationSections);

  const loadResult = await loadBedfordDrawingSpecMappings({
    drawingSpecificationLinks,
    specificationIndex,
    projectId: 'bedford',
    drawingDocumentId: 'bedford-specifications',
    baseUri: 'http://example.test/',
    fetcher: async url => ({
      ok: true,
      url,
      async json() {
        return relationshipData;
      }
    })
  });

  assert.equal(loadResult.loaded, 222);
  const records = drawingSpecificationLinks.forProject('bedford');
  assert.equal(records.length, 222);

  const sheetNumbers = [...new Set(Object.keys(relationshipData.results || {}))];
  assert.equal(sheetNumbers.length, 70);

  const fireSheet = relationshipData.results['61FX100'];
  assert.ok(fireSheet);
  assert.equal(fireSheet.links.length, 6);

  const firePageId = fireSheet.pageId;
  const fireRecords = records.filter(item => item.drawingPageId === firePageId);
  assert.equal(fireRecords.length, 6);
  assert.deepEqual(
    fireRecords.map(item => item.sectionNumber).sort(),
    ['01 33 23', '07 84 00', '09 91 00', '21 08 00', '21 13 13', '28 31 00'].sort()
  );

  const bridge = createChiefIntelligenceBridge();
  bridge.initialize({ specificationSME: chiefSpecificationSME });
  const context = bridge.buildProjectContext('What specs apply to 61FX100?');
  assert.equal(context.specificationAnswer?.specifications?.length, 6);
  assert.deepEqual(
    context.specificationAnswer?.specifications?.map(item => item.sectionNumber).sort(),
    ['01 33 23', '07 84 00', '09 91 00', '21 08 00', '21 13 13', '28 31 00'].sort()
  );
  assert.equal(context.specificationAnswer?.drawings?.some(item => item.sheetNumber === '61FX100'), true);
});

test('Bedford drawing catalog bootstrap seeds the authoritative sheet map and stays idempotent', async () => {
  const catalog = createDrawingCatalog({ storage: null });
  const document = {
    id: 'bedford-b61-drawings',
    projectId: 'bedford',
    documentType: 'drawing-set'
  };

  const first = catalog.reconcile({
    documentId: document.id,
    documentType: document.documentType,
    projectId: document.projectId,
    drawingSetId: 'bedford-b61',
    pageCount: drawingCatalog.pageCount || drawingCatalog.sheets?.length || 70,
    authoritativeRecords: drawingCatalog.sheets || []
  });

  assert.equal(first.length, 70);
  assert.equal(catalog.recordsForDocument(document.id).length, 70);
  assert.equal(catalog.recordsForDocument(document.id).find(item => item.sheetNumber === '61FX100')?.pageId, 'drawing-page:bedford-b61-drawings:16');

  const second = catalog.reconcile({
    documentId: document.id,
    documentType: document.documentType,
    projectId: document.projectId,
    drawingSetId: 'bedford-b61',
    pageCount: drawingCatalog.pageCount || drawingCatalog.sheets?.length || 70,
    authoritativeRecords: drawingCatalog.sheets || []
  });

  assert.equal(second.length, 70);
  assert.equal(catalog.recordsForDocument(document.id).length, 70);
});

test('Bedford startup registers source files for every built-in drawing set', async () => {
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  assert.match(app, /const bedfordDrawingDocs = bedfordDocs\.filter\(d => bedfordDrawingSets\.some\(set => set\.documentId === d\.id\)\);/);
  assert.match(app, /for \(const drawingDoc of bedfordDrawingDocs\) \{/);
  assert.match(app, /console\.log\('Bedford drawing source file registered', drawingDoc\.id\);/);
  assert.doesNotMatch(app, /const drawingDoc = bedfordDocs\.find\(d => d\.id === BEDFORD_DRAWING_DOCUMENT_ID\);/);
});

test('Bedford B62 catalog and relationships load through the same shared pipeline', async () => {
  const specificationIndex = createSpecificationIndex();
  const drawingSpecificationLinks = createDrawingSpecificationLinkService({
    index: specificationIndex,
    persistence: null
  });
  specificationIndex.index({
    document: {
      id: 'bedford-specifications',
      projectId: 'bedford',
      name: 'Bedford Specification Manual',
      title: 'Bedford Specification Manual'
    },
    sourceSections: authoritativeSections.map(section => ({
      ...section,
      pageStart: section.pageStart || section.startPdfPage || section.startPage || null,
      pageEnd: section.pageEnd || section.endPdfPage || section.endPage || section.startPdfPage || section.startPage || null
    }))
  });

  const loadResult = await loadBedfordDrawingSpecMappings({
    drawingSpecificationLinks,
    specificationIndex,
    projectId: 'bedford',
    drawingDocumentId: 'bedford-specifications',
    relationshipsPath: 'project-data/bedford/relationships/building-62-spec-links.json',
    baseUri: 'http://example.test/',
    fetcher: async url => ({
      ok: true,
      url,
      async json() {
        return relationshipDataB62;
      }
    })
  });

  assert.equal(loadResult.loaded, 216);
  const records = drawingSpecificationLinks.forProject('bedford');
  assert.equal(records.length, 216);

  const sheetNumbers = [...new Set(Object.keys(relationshipDataB62.results || {}))];
  assert.equal(sheetNumbers.length, 68);
  const fireSheet = relationshipDataB62.results['62FX100'];
  assert.ok(fireSheet);
  assert.equal(fireSheet.links.length, 6);

  const firePageId = fireSheet.pageId;
  const fireRecords = records.filter(item => item.drawingPageId === firePageId);
  assert.equal(fireRecords.length, 6);
  assert.equal(drawingCatalogB62.sheets.some(item => item.sheetNumber === '62FX100'), true);
});
