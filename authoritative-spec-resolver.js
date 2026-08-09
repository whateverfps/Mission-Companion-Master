// Authoritative specification section resolver
// ONE INDEX. ONE VIEWER. ONE SOURCE-OPENING PATH.

// Load authoritative specification index
let authoritativeIndex = null;

async function loadAuthoritativeIndex() {
  if (!authoritativeIndex) {
    try {
      const response = await fetch('project-data/bedford/specifications/authoritative-spec-index.json');
      authoritativeIndex = await response.json();
    } catch (error) {
      console.error('Failed to load authoritative specification index:', error);
      authoritativeIndex = [];
    }
  }
  return authoritativeIndex;
}

// Normalize section number: "06 10 00" → "061000"
function normalizeSectionNumber(sectionNumber) {
  return String(sectionNumber || '').replace(/\s/g, '');
}

// Resolve section from authoritative index
async function resolveSection(sectionNumber) {
  const index = await loadAuthoritativeIndex();
  const normalized = normalizeSectionNumber(sectionNumber);
  
  // Try exact match first
  let section = index.find(s => s.sectionNumber === sectionNumber);
  
  // Try normalized match
  if (!section) {
    section = index.find(s => s.normalizedSectionNumber === normalized);
  }
  
  return section || null;
}

// THE SINGLE function to open a specification section
// Parameters: sectionNumber (e.g., "09 91 00")
// Returns: { ok: boolean, section: object|null, error: string }
export async function openSpecificationSection(sectionNumber) {
  if (!sectionNumber) {
    return { ok: false, section: null, error: 'Section number is required' };
  }
  
  const section = await resolveSection(sectionNumber);
  
  if (!section) {
    return { 
      ok: false, 
      section: null, 
      error: `Section ${sectionNumber} not found in authoritative specification index` 
    };
  }
  
  return {
    ok: true,
    section: {
      sectionNumber: section.sectionNumber,
      normalizedSectionNumber: section.normalizedSectionNumber,
      sectionTitle: section.sectionTitle,
      documentId: section.documentId,
      startPdfPage: section.startPdfPage,
      endPdfPage: section.endPdfPage
    },
    error: null
  };
}

// Integration with existing PDF viewer
// This function should be called from the UI to open a specification section
export async function openSpecificationDocument(sectionNumber, engine) {
  console.log('=== RESOLVER DEBUG ===');
  console.log('resolver called with sectionNumber:', sectionNumber);
  
  const result = await openSpecificationSection(sectionNumber);
  
  console.log('resolver result:', result);
  console.log('  ok:', result.ok);
  console.log('  section:', result.section);
  console.log('  error:', result.error);
  
  if (!result.ok) {
    console.log('CHAIN STOPS: resolver returned failure');
    alert(result.error);
    return;
  }
  
  const { section } = result;
  
  console.log('Looking up Bedford specification document in project');
  console.log('  authoritative documentId:', section.documentId);
  
  // The authoritative index uses "bedford-specification-manual" as the documentId
  // But the actual Bedford project may use a different document ID
  // Try to find the Bedford specification document in the current project
  const documents = await engine.documents();
  console.log('  total documents in project:', documents.length);
  
  const specDocument = documents.find(doc => 
    doc.projectId === 'bedford' && 
    (doc.role === 'specification' || doc.name?.toLowerCase().includes('specification') || doc.title?.toLowerCase().includes('specification'))
  );
  
  console.log('  found specDocument:', Boolean(specDocument));
  if (specDocument) {
    console.log('  specDocument.id:', specDocument.id);
    console.log('  specDocument.name:', specDocument.name);
  }
  
  if (!specDocument) {
    console.log('CHAIN STOPS: Bedford specification document not found in project');
    alert(`Bedford Specification Manual not found in current project. Please attach the Bedford Specification Manual PDF (518-22-700.Bedford.MA.EHRM.Specifications.IFC.20260413.pdf) to the Bedford project.`);
    return;
  }
  
  // Get the source file for the specification document
  console.log('Calling engine.sourceFile() with documentId:', specDocument.id);
  const source = await engine.sourceFile(specDocument.id);
  
  console.log('engine.sourceFile() result:', Boolean(source));
  if (source) {
    console.log('  sourceBlob:', Boolean(source.sourceBlob));
    if (source.sourceBlob) {
      console.log('  sourceBlob.size:', source.sourceBlob.size);
      console.log('  sourceBlob.type:', source.sourceBlob.type);
    }
  }
  
  if (!source) {
    console.log('CHAIN STOPS: source file not found');
    alert(`Specification document ${specDocument.id} not found in project. Please reattach the Bedford Specification Manual PDF.`);
    return;
  }
  
  // Return the actual document ID and source, not the canonical one
  console.log('CHAIN CONTINUES: Returning source and section');
  return { 
    source, 
    section: {
      ...section,
      documentId: specDocument.id // Use the actual document ID from the project
    }
  };
}

// For direct browser console testing
if (typeof globalThis !== 'undefined') {
  globalThis.openSpecificationSection = openSpecificationSection;
  globalThis.resolveSection = resolveSection;
  globalThis.openSpecificationDocument = openSpecificationDocument;
}
