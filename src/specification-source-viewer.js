import { isSpecificationDocument } from './document-routing.js';

const text = value => value === null || value === undefined ? '' : String(value).trim();
const pageNumber = value => Math.max(0, Math.trunc(Number(value) || 0));

const pdfCache = new Map();
const renderCache = new Map();

const cacheKey = ({ documentId = '', fingerprint = '' } = {}) => `${text(documentId)}::${text(fingerprint)}`;
const renderKey = ({ documentId = '', fingerprint = '', pageNumber: requestedPage = 0, scale = 1.25, rotation = 0 } = {}) => `${cacheKey({ documentId, fingerprint })}::${pageNumber(requestedPage)}::${Number(scale) || 0}::${Number(rotation) || 0}`;

function cloneCanvas(canvas) {
  if (!canvas?.width || !canvas?.height) return null;
  if (typeof globalThis.document?.createElement === 'function') {
    const snapshot = globalThis.document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext?.('2d')?.drawImage?.(canvas, 0, 0);
    return snapshot;
  }
  return { width: canvas.width, height: canvas.height };
}

export function createSpecificationSourceViewer({ openPdf, renderPage, now = () => new Date().toISOString(), onDiagnostic = () => {} } = {}) {
  if (typeof openPdf !== 'function' || typeof renderPage !== 'function') throw new Error('Specification source viewer requires PDF open and render functions.');
  let proxy = null;
  let render = null;
  let canvas = null;
  let target = null;
  let cleanupTimestamp = '';
  let generation = 0;
  let activeRequestKey = '';

  const diagnostics = () => ({
    specificationPdfProxyActive: Boolean(proxy),
    specificationSourcePage: target?.pageNumber || null,
    sourceViewRenderTaskActive: Boolean(render),
    sourceViewCanvasPixels: canvas ? { width: Number(canvas.width) || 0, height: Number(canvas.height) || 0 } : { width: 0, height: 0 },
    sourceViewCacheEntryCount: 0,
    sourceViewCleanupTimestamp: cleanupTimestamp,
    retainedSpecificationPageRecordsInMemory: target ? 1 : 0
  });

  async function close(reason = 'closed') {
    generation += 1;
    activeRequestKey = '';
    try { render?.cancel?.(); } catch {}
    try { render?.release?.(); } catch {}
    render = null;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    canvas = null;
    try { await proxy?.cleanup?.(); } catch {}
    try { await proxy?.destroy?.(); } catch {}
    proxy = null;
    target = null;
    cleanupTimestamp = now();
    const state = { ...diagnostics(), reason };
    onDiagnostic(state);
    return state;
  }

  async function replaceCurrentRequest() {
    generation += 1;
    activeRequestKey = '';
    try { render?.cancel?.(); } catch {}
    try { render?.release?.(); } catch {}
    render = null;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    canvas = null;
    target = null;
  }

  async function open({ document, sourceBlob, pageNumber: requestedPage, sectionNumber = '', sectionTitle = '', articleReference = '', returnTarget = null, canvas: targetCanvas } = {}) {
    console.log('=== SPECIFICATION VIEWER DEBUG ===');
    console.log('viewer.open() called');
    console.log('  document.id:', document?.id);
    console.log('  requestedPage:', requestedPage);
    console.log('  sourceBlob:', Boolean(sourceBlob));
    if (sourceBlob) {
      console.log('  sourceBlob.size:', sourceBlob.size);
      console.log('  sourceBlob.type:', sourceBlob.type);
    }
    console.log('  targetCanvas:', Boolean(targetCanvas));
    
    const exactPage = pageNumber(requestedPage);
    if (!isSpecificationDocument(document)) {
      console.log('CHAIN STOPS: Invalid document role');
      return { ok: false, status: 'invalid-document-role', diagnostics: diagnostics() };
    }
    if (!exactPage || !sourceBlob || !targetCanvas?.getContext) {
      console.log('CHAIN STOPS: Missing required parameters');
      console.log('  exactPage:', exactPage);
      console.log('  sourceBlob:', Boolean(sourceBlob));
      console.log('  targetCanvas:', Boolean(targetCanvas));
      console.log('  targetCanvas.getContext:', Boolean(targetCanvas?.getContext));
      return { ok: false, status: 'exact-source-page-required', diagnostics: diagnostics() };
    }
    
    console.log('Parameters validated, calling replaceCurrentRequest()');
    await replaceCurrentRequest();
    const requestGeneration = generation;
    const fingerprint = text(document.contentHash || document.version || document.revision || sourceBlob?.lastModified || sourceBlob?.size || '');
    const pdfKey = cacheKey({ documentId: document.id, fingerprint });
    let cachedProxy = pdfCache.get(pdfKey) || null;
    if (!cachedProxy) {
      console.log('Loading PDF from blob...');
      cachedProxy = await openPdf(sourceBlob);
      console.log('PDF loaded, numPages:', cachedProxy?.numPages);
      pdfCache.set(pdfKey, cachedProxy);
    } else {
      console.log('Using cached PDF, numPages:', cachedProxy?.numPages);
    }
    if (generation !== requestGeneration) { 
      console.log('CHAIN STOPS: Superseded by another request');
      return { ok: false, status: 'superseded', diagnostics: diagnostics() }; 
    }
    
    proxy = cachedProxy;
    if (exactPage > Number(proxy?.numPages || 0)) { 
      console.log('CHAIN STOPS: Page exceeds total pages');
      await close('page-unavailable'); 
      return { ok: false, status: 'page-unavailable', diagnostics: diagnostics() }; 
    }
    
    canvas = targetCanvas;
    target = { documentId: text(document.id), pageNumber: exactPage, sectionNumber: text(sectionNumber), sectionTitle: text(sectionTitle), articleReference: text(articleReference), returnTarget: returnTarget ? structuredClone(returnTarget) : null };
    
    console.log('Rendering page', exactPage);
    activeRequestKey = renderKey({ documentId: document.id, fingerprint, pageNumber: exactPage, scale: 1.25, rotation: 0 });
    const cachedRender = renderCache.get(activeRequestKey) || null;
    if (cachedRender?.snapshot) {
      console.log('Using cached render');
      canvas.width = cachedRender.width;
      canvas.height = cachedRender.height;
      canvas.getContext('2d')?.drawImage?.(cachedRender.snapshot, 0, 0);
      const state = diagnostics();
      onDiagnostic({ ...state, operation: 'render-cache-hit', durationMs: 0, cacheKey: activeRequestKey });
      console.log('CHAIN COMPLETES: Rendered from cache');
      return { ok: true, status: 'rendered', target: structuredClone(target), diagnostics: state, cacheHit: true };
    }
    
    console.log('Calling renderPage()...');
    const pageRender = await renderPage(proxy, exactPage, canvas, { scale: 1.25 });
    console.log('renderPage() returned');
    
    if (generation !== requestGeneration) { 
      console.log('CHAIN STOPS: Superseded during render');
      try { pageRender?.cancel?.(); pageRender?.release?.(); } catch {} 
      return { ok: false, status: 'superseded', diagnostics: diagnostics() }; 
    }
    
    render = pageRender;
    try {
      console.log('Waiting for render promise...');
      await render.promise;
      console.log('Render promise resolved');
      
      if (generation !== requestGeneration) {
        console.log('CHAIN STOPS: Superseded after render');
        return { ok: false, status: 'superseded', diagnostics: diagnostics() };
      }
      
      render?.releasePage?.();
      renderCache.set(activeRequestKey, { width: canvas.width, height: canvas.height, snapshot: cloneCanvas(canvas), sourceDocumentId: target.documentId, pageNumber: exactPage });
      render = null;
      const state = diagnostics(); 
      onDiagnostic(state);
      console.log('CHAIN COMPLETES: Rendered successfully');
      console.log('  canvas.width:', canvas.width);
      console.log('  canvas.height:', canvas.height);
      
      // UI Presentation Debugging
      console.log('=== UI PRESENTATION DEBUG ===');
      console.log('canvas.parentElement:', canvas.parentElement?.tagName);
      console.log('canvas.parentElement.id:', canvas.parentElement?.id);
      console.log('canvas.parentElement.className:', canvas.parentElement?.className);
      
      if (canvas.parentElement) {
        const container = canvas.parentElement.closest('.mc-specification-viewer-container');
        console.log('Found .mc-specification-viewer-container:', Boolean(container));
        
        if (container) {
          console.log('specContainer.parentElement:', container.parentElement?.tagName);
          console.log('specContainer.parentElement === document.body:', container.parentElement === document.body);
          
          const rect = container.getBoundingClientRect();
          console.log('specContainer.getBoundingClientRect():', {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right
          });
          
          const computed = window.getComputedStyle(container);
          console.log('specContainer computed styles:', {
            display: computed.display,
            visibility: computed.visibility,
            opacity: computed.opacity,
            zIndex: computed.zIndex,
            position: computed.position,
            top: computed.top,
            left: computed.left,
            width: computed.width,
            height: computed.height
          });
          
          console.log('Is specContainer visible?', computed.display !== 'none' && computed.visibility !== 'hidden' && computed.opacity !== '0');
          
          const canvasRect = canvas.getBoundingClientRect();
          console.log('canvas.getBoundingClientRect():', {
            x: canvasRect.x,
            y: canvasRect.y,
            width: canvasRect.width,
            height: canvasRect.height
          });
          
          console.log('Is canvas within viewport?', 
            canvasRect.top >= 0 && 
            canvasRect.left >= 0 && 
            canvasRect.bottom <= window.innerHeight && 
            canvasRect.right <= window.innerWidth
          );
        } else {
          console.log('ERROR: .mc-specification-viewer-container not found in DOM ancestors');
        }
      } else {
        console.log('ERROR: canvas has no parentElement');
      }
      
      return { ok: true, status: 'rendered', target: structuredClone(target), diagnostics: state };
    } catch (error) {
      console.log('CHAIN STOPS: Render failed');
      console.log('  error:', error);
      if (generation === requestGeneration) await close('render-failed');
      return { ok: false, status: 'render-failed', error: error?.message || String(error), diagnostics: diagnostics() };
    }
  }

  return { open, close, diagnostics, target: () => target ? structuredClone(target) : null };
}
