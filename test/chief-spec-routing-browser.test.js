import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window ??= { dispatchEvent() {} };
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.localStorage ??= {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
  clear() {}
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

const authoritativeSections = readJson('project-data/bedford/specifications/authoritative-spec-index.json');
const relationshipData = readJson('project-data/bedford/relationships/building-61-spec-links.json');
const drawingCatalog = readJson('project-data/bedford/drawing-catalogs/building-61.json');
const textSections = readJson('project-data/bedford/specifications/bedford-spec-index.json');

const drawingLinks = {
  forProject() {
    const sheets = relationshipData.results || {};
    return Object.entries(sheets).flatMap(([sheetNumber, sheetData]) =>
      (sheetData.links || []).map(link => ({
        ...link,
        sheetNumber,
        projectId: 'bedford'
      }))
    );
  }
};

const drawingCatalogService = {
  recordsForDocument() {
    return drawingCatalog.sheets || [];
  }
};

const { createChiefSpecificationSME } = await import('../src/chief-specification-sme.js');
const { createChiefIntelligenceBridge } = await import('../src/chief-intelligence-bridge.js');
const { createSpecificationReverseIndex } = await import('../src/specification-reverse-index.js');
const { engine } = await import('../src/engine.js');

const reverseIndex = createSpecificationReverseIndex({ drawingSpecificationLinks: drawingLinks });
globalThis.__specificationReverseIndex = reverseIndex;

const specificationSME = createChiefSpecificationSME({
  projectId: 'bedford',
  getAuthoritativeSections: () => authoritativeSections,
  getSectionTextSections: () => textSections,
  getDrawingLinks: () => drawingLinks.forProject(),
  getDrawingCatalog: () => drawingCatalogService.recordsForDocument('bedford-specification-manual'),
  reverseIndex
});
specificationSME.setTextSections(textSections);

const bridge = createChiefIntelligenceBridge();
bridge.initialize({ specificationSME });

test('Command Desk routing answers Bedford spec questions through the SME before generic retrieval', async () => {
  engine.createConversation({ projectId: engine.state().activeProject });
  const answer = await engine.ask('What specs apply to 61FX100?', 'offline');
  assert.ok(answer.specificationAnswer, 'expected structured specificationAnswer');
  const sectionNumbers = answer.specificationAnswer.specifications.map(item => item.sectionNumber);
  assert.ok(sectionNumbers.includes('21 13 13'));
  assert.ok(sectionNumbers.includes('28 31 00'));
  assert.match(answer.content, /21 13 13/);
  assert.match(answer.content, /28 31 00/);
  assert.doesNotMatch(answer.content, /No relevant project evidence was retrieved/);
});

test('Question parsing resolves explicit sheet identifiers in the browser routing path', () => {
  const parsedSheet = specificationSME.getSheetFromQuestion('What specs apply to 61FX100?');
  assert.equal(parsedSheet?.sheetNumber, '61FX100');

  const context = bridge.buildProjectContext('What specs apply to 61FX100?');
  assert.equal(context.specificationAnswer?.queryType, 'drawing');
  assert.equal(context.specificationAnswer?.answer.includes('61FX100'), true);
  const sectionNumbers = context.specificationAnswer?.specifications?.map(item => item.sectionNumber) || [];
  assert.deepEqual(sectionNumbers, ['21 13 13', '28 31 00', '01 33 23', '07 84 00', '09 91 00', '21 08 00']);
  assert.equal(context.specificationAnswer?.drawings?.some(item => item.sheetNumber === '61FX100'), true);
});

test('Spec routing also answers drawing/spec cross-reference questions and discipline queries', async () => {
  const drawings = await engine.ask('What drawings relate to 28 31 00?', 'offline');
  assert.ok(drawings.specificationAnswer);
  assert.ok(drawings.specificationAnswer.drawings.some(item => item.sheetNumber === '61FX501'));

  const hvac = await engine.ask('What specs cover HVAC and what drawings relate?', 'offline');
  assert.ok(hvac.specificationAnswer);
  assert.ok(hvac.specificationAnswer.specifications.length > 0);
  assert.match(hvac.content, /HVAC/i);
});

test('Source-only and expert-assisted Chief responses stay distinct', async () => {
  const source = await engine.ask('What specs apply to 61FX100?', 'source');
  const assisted = await engine.ask('What specs apply to 61FX100?', 'assisted');

  assert.notEqual(source.content, assisted.content);
  assert.match(assisted.content, /Specification requirement|What the Bedford source establishes|Field verification/);
});
