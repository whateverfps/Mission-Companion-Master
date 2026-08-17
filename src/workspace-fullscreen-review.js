import { getBedfordDrawingSetForReference } from './bedford-project.js';
import { calculateDrawingFit, drawingWheelZoom } from './drawing-navigation.js';
import { openPdfBlob, renderPdfPage } from './pdf-source.js';

const text = value => value === null || value === undefined ? '' : String(value).trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));

const pdfCache = new Map();

export function workspaceFullscreenSheetIdentity(sheet = {}) {
  return [text(sheet.sheetNumber || sheet.sheetId || ''), number(sheet.pdfPageNumber || sheet.pageNumber || 0)].join(':');
}

export function resolveWorkspaceFullscreenSelectedSheet(sheets = [], selectedSheetNumber = '') {
  const needle = text(selectedSheetNumber);
  if (!needle) return sheets[0] || null;
  return sheets.find(sheet => text(sheet.sheetNumber) === needle) || sheets.find(sheet => workspaceFullscreenSheetIdentity(sheet).startsWith(`${needle}:`)) || sheets[0] || null;
}

export function buildWorkspaceFullscreenNavigatorModel(workspaceModel = {}, sheets = [], selectedSheetNumber = '') {
  const activeWorkspace = workspaceModel?.activeWorkspace || null;
  const sourceCategories = Array.isArray(activeWorkspace?.drawingCategories) ? activeWorkspace.drawingCategories : [];
  const selected = resolveWorkspaceFullscreenSelectedSheet(sheets, selectedSheetNumber);
  const selectedIdentity = workspaceFullscreenSheetIdentity(selected || {});
  const searchSheetIds = new Set(sheets.map(sheet => workspaceFullscreenSheetIdentity(sheet)));
  const categories = sourceCategories.length
    ? sourceCategories.map(category => ({
      id: text(category.id),
      label: text(category.label || category.title || category.id || 'Sheets'),
      relationship: text(category.relationship || ''),
      items: Array.isArray(category.items) ? category.items.map(item => ({
        sheetNumber: text(item.sheetNumber),
        sheetTitle: text(item.sheetTitle),
        discipline: text(item.discipline),
        drawingType: text(item.drawingType),
        pdfPageNumber: number(item.pdfPageNumber || item.pageNumber || 0),
        pageId: text(item.pageId),
        relevance: text(item.relevance || 'DIRECT'),
        category: text(item.category || category.label || 'Sheets'),
        selected: workspaceFullscreenSheetIdentity(item) === selectedIdentity || text(item.sheetNumber) === text(selected?.sheetNumber)
      })) : []
    }))
    : [{
      id: 'discipline-sheets',
      label: activeWorkspace?.disciplineFocus ? `${activeWorkspace.disciplineFocus} Sheets` : 'Sheets',
      relationship: 'Selected Workspace',
      items: sheets.map(item => ({
        sheetNumber: text(item.sheetNumber),
        sheetTitle: text(item.sheetTitle),
        discipline: text(item.discipline),
        drawingType: text(item.drawingType),
        pdfPageNumber: number(item.pdfPageNumber || item.pageNumber || 0),
        pageId: text(item.pageId),
        relevance: 'DIRECT',
        category: text(item.category || 'Sheets'),
        selected: workspaceFullscreenSheetIdentity(item) === selectedIdentity || text(item.sheetNumber) === text(selected?.sheetNumber)
      }))
    }];
  return {
    activeWorkspace,
    selectedSheet: selected,
    categories,
    sheetCount: searchSheetIds.size
  };
}

function buildFullScreenShellMarkup() {
  return `
    <div class="mc-mdi-shell" data-mdi-shell>
      <header class="mc-mdi-topbar">
        <div class="mc-mdi-brand">
          <span>MISSION COMPANION</span>
          <strong>Fullscreen Drawing Review</strong>
        </div>
        <div class="mc-mdi-center" data-mdi-top-center>
          <strong data-mdi-sheet-label>Loading drawing…</strong>
          <small data-mdi-sheet-subtitle>Preparing the selected workspace sheet</small>
        </div>
        <div class="mc-mdi-right">
          <span data-mdi-position>Page -- of --</span>
          <button type="button" data-mdi-fit="width" aria-pressed="true">Fit Width</button>
          <button type="button" data-mdi-fit="page" aria-pressed="false">Fit Page</button>
          <button type="button" data-mdi-zoom-out>-</button>
          <span class="mc-mdi-zoom-readout" data-mdi-pulse-zoom>100%</span>
          <button type="button" data-mdi-zoom-in>+</button>
          <button type="button" data-mdi-exit>Exit</button>
        </div>
      </header>
      <div class="mc-mdi-viewport" data-mdi-viewer-host tabindex="0" aria-label="Fullscreen drawing pages">
        <div class="mc-mdi-stack" data-mdi-stack>
          <div class="mc-mdi-stage-loading" data-mdi-loading>Loading drawing…</div>
        </div>
      </div>
      <footer class="mc-mdi-pulse" data-mdi-pulse>
        <span data-mdi-pulse-sheet>Sheet --</span>
        <span data-mdi-pulse-position>Page -- of --</span>
        <span data-mdi-pulse-zoom>Zoom --</span>
        <span data-mdi-pulse-fit>Fit Page</span>
        <span data-mdi-pulse-counts>Issues 0 · RFIs 0 · Evidence 0</span>
      </footer>
    </div>`;
}

function normalizePageInfo(pdf, pageNumber, sheet) {
  return pdf.getPage(pageNumber).then(page => {
    try {
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      return {
        pageNumber,
        width: Number(viewport.width) || 1,
        height: Number(viewport.height) || 1,
        rotation: page.rotate || 0,
        sheet: sheet || null
      };
    } finally {
      try { page.cleanup?.(); } catch {}
    }
  });
}

export function createWorkspaceFullscreenReviewController({
  root,
  workspaceModel = null,
  activeWorkspace = null,
  sheets = [],
  selectedSheetNumber = '',
  sourceUrl = '',
  counts = {},
  onExit = () => {},
  onWorkspaceChange = () => {},
  onActiveSheetChange = () => {},
  onToolChange = () => {},
  onSheetSelect = () => {},
  onDiagnostics = () => {},
  openPdf = openPdfBlob,
  renderPage = renderPdfPage,
  calculateFit = calculateDrawingFit,
  wheelZoom = drawingWheelZoom,
  now = () => new Date().toISOString()
} = {}) {
  if (!root) throw new Error('Fullscreen review controller requires a root element.');

  root.innerHTML = buildFullScreenShellMarkup();
  root.classList.add('mc-mdi-shell-root');

  const viewerHost = root.querySelector('[data-mdi-viewer-host]');
  const stackNode = root.querySelector('[data-mdi-stack]');
  const loadingNode = root.querySelector('[data-mdi-loading]');
  const sheetLabelNode = root.querySelector('[data-mdi-sheet-label]');
  const sheetSubtitleNode = root.querySelector('[data-mdi-sheet-subtitle]');
  const positionNode = root.querySelector('[data-mdi-position]');
  const pulseSheetNode = root.querySelector('[data-mdi-pulse-sheet]');
  const pulsePositionNode = root.querySelector('[data-mdi-pulse-position]');
  const pulseZoomNode = root.querySelector('[data-mdi-pulse-zoom]');
  const pulseFitNode = root.querySelector('[data-mdi-pulse-fit]');
  const pulseCountsNode = root.querySelector('[data-mdi-pulse-counts]');
  const exitButton = root.querySelector('[data-mdi-exit]');
  const fitButtons = [...root.querySelectorAll('[data-mdi-fit]')];
  const zoomOutButton = root.querySelector('[data-mdi-zoom-out]');
  const zoomInButton = root.querySelector('[data-mdi-zoom-in]');

  let destroyed = false;
  let controllerGeneration = 0;
  let currentWorkspaceModel = workspaceModel;
  let currentActiveWorkspace = activeWorkspace;
  let currentSheets = Array.isArray(sheets) ? [...sheets] : [];
  let currentSelectedSheetNumber = text(selectedSheetNumber);
  let currentSourceUrl = text(sourceUrl);
  let currentCounts = { issues: 0, rfis: 0, evidence: 0, ...(counts || {}) };
  let currentTool = 'select';
  let currentFitMode = 'width';
  let currentCustomZoom = null;
  let currentRotation = 0;
  let currentPdf = null;
  let currentSourceBlob = null;
  let pageMetaByNumber = new Map();
  let pageShellByNumber = new Map();
  let renderedScaleByNumber = new Map();
  let activePageNumber = 1;
  let activePageSheetNumber = '';
  let pageObserver = null;
  let sourceLoadAbort = null;
  let loadSequence = 0;
  const pageRenderState = new Map();
  const pageInfoState = new Map();
  const debugFullscreenPdf = false;

  const cachedSource = sourceUrl ? pdfCache.get(currentSourceUrl) || null : null;
  if (cachedSource?.pdf) {
    currentPdf = cachedSource.pdf;
    currentSourceBlob = cachedSource.blob || null;
  }

  const safeUpdateDiagnostics = (state = {}) => {
    try { onDiagnostics({ ...state, controllerGeneration, sourceUrl: currentSourceUrl, activePageNumber, selectedSheetNumber: currentSelectedSheetNumber, tool: 'select' }); } catch {}
  };

  const selectedSheet = () => resolveWorkspaceFullscreenSelectedSheet(currentSheets, currentSelectedSheetNumber);
  const selectedSheetKey = () => workspaceFullscreenSheetIdentity(selectedSheet() || {});
  const viewerDimension = () => viewerHost?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const pageInfo = pageNumber => pageMetaByNumber.get(Number(pageNumber)) || null;
  const pageShell = pageNumber => pageShellByNumber.get(Number(pageNumber)) || null;

  function updateShellState() {
    const resolvedSelected = selectedSheet();
    const sheetNumber = resolvedSelected?.sheetNumber || currentSelectedSheetNumber || '—';
    const sheetTitle = resolvedSelected?.sheetTitle || '';
    if (sheetLabelNode) sheetLabelNode.textContent = resolvedSelected ? `${sheetNumber} — ${sheetTitle || 'Drawing sheet'}` : 'No sheet selected';
    if (sheetSubtitleNode) sheetSubtitleNode.textContent = currentActiveWorkspace ? `${currentActiveWorkspace.buildingId || currentActiveWorkspace.building || ''} ${currentActiveWorkspace.room || ''}`.trim() || currentActiveWorkspace.name || 'Selected workspace' : 'Select a workspace';
    const totalPages = Number(currentPdf?.numPages || pageMetaByNumber.size || 0);
    if (positionNode) positionNode.textContent = `Page ${activePageNumber || '--'} of ${totalPages || '--'}`;
    if (pulseSheetNode) pulseSheetNode.textContent = `Sheet ${sheetNumber}`;
    if (pulsePositionNode) pulsePositionNode.textContent = `Page ${activePageNumber || '--'} of ${totalPages || '--'}`;
    if (pulseZoomNode) pulseZoomNode.textContent = `${Math.round((getEffectiveScaleForPage(activePageNumber) || 1) * 100)}%`;
    if (pulseFitNode) pulseFitNode.textContent = currentFitMode === 'width' ? 'Fit Width' : currentFitMode === 'custom' ? 'Zoom' : 'Fit Page';
    if (pulseCountsNode) pulseCountsNode.textContent = `Issues ${number(currentCounts.issues)} · RFIs ${number(currentCounts.rfis)} · Evidence ${number(currentCounts.evidence)}`;
    fitButtons.forEach(button => button.setAttribute('aria-pressed', button.dataset.mdiFit === currentFitMode ? 'true' : 'false'));
    if (zoomOutButton) zoomOutButton.disabled = !(currentFitMode === 'custom' ? currentCustomZoom > .25 : true);
    if (zoomInButton) zoomInButton.disabled = false;
  }

  function viewportRect() {
    return viewerHost?.getBoundingClientRect?.() || { width: viewerHost?.clientWidth || 0, height: viewerHost?.clientHeight || 0 };
  }

  function getEffectiveScaleForPage(pageNumber) {
    const info = pageInfo(pageNumber) || pageInfo(activePageNumber) || pageMetaByNumber.values().next().value || null;
    if (!info) return 1;
    if (currentFitMode === 'custom' && Number(currentCustomZoom) > 0) return currentCustomZoom;
    const rect = viewportRect();
    const fit = calculateFit({
      containerWidth: rect.width || 1,
      containerHeight: rect.height || 1,
      pageWidth: info.width,
      pageHeight: info.height,
      rotation: currentRotation || info.rotation || 0,
      padding: 24,
      toolbarHeight: 0,
      mode: currentFitMode === 'width' ? 'fit-width' : 'fit-page'
    });
    return fit.ready ? fit.scale : 1;
  }

  function sizePageShell(pageNumber, scale) {
    const info = pageInfo(pageNumber);
    const shell = pageShell(pageNumber);
    if (!info || !shell) return;
    const nextScale = Number(scale) || 1;
    shell.style.minHeight = `${Math.max(1, Math.round(info.height * nextScale))}px`;
  }

  function pageRenderRecord(pageNumber) {
    const key = Number(pageNumber);
    if (!pageRenderState.has(key)) pageRenderState.set(key, { status: 'idle', task: null, promise: null, canvas: null, requestedScale: null, requestSource: '' });
    return pageRenderState.get(key);
  }

  function pageInfoRecord(pageNumber) {
    const key = Number(pageNumber);
    if (!pageInfoState.has(key)) pageInfoState.set(key, { status: 'idle', promise: null, info: null });
    return pageInfoState.get(key);
  }

  async function ensurePageInfo(pageNumber, { sheet = null, source = 'unknown' } = {}) {
    const key = Number(pageNumber);
    if (pageMetaByNumber.has(key)) return pageMetaByNumber.get(key);
    const state = pageInfoRecord(key);
    if (state.status === 'ready' && state.info) return state.info;
    if (state.status === 'loading' && state.promise) return state.promise;
    state.status = 'loading';
    state.promise = (async () => {
      if (debugFullscreenPdf) console.info('[FULLSCREEN PDF] get-page', { pageNumber: key, source });
      const info = await normalizePageInfo(currentPdf, key, sheet || currentSheets.find(item => Number(item.pdfPageNumber || item.pageNumber) === key) || null);
      pageMetaByNumber.set(key, info);
      state.info = info;
      state.status = 'ready';
      state.promise = null;
      return info;
    })().catch(error => {
      state.status = 'idle';
      state.promise = null;
      throw error;
    });
    return state.promise;
  }

  async function requestPageRender(pageNumber, { force = false, source = 'unknown' } = {}) {
    if (!currentPdf) return;
    const info = await ensurePageInfo(pageNumber, { source });
    const shell = pageShell(pageNumber);
    const canvas = shell?.querySelector('canvas');
    if (!info || !shell || !canvas) return;
    const scale = getEffectiveScaleForPage(pageNumber);
    const renderedKey = renderedScaleByNumber.get(Number(pageNumber));
    const desiredKey = `${scale}:${currentRotation || info.rotation || 0}`;
    const state = pageRenderRecord(pageNumber);
    const existingPromise = state.promise;
    if (!force && renderedKey === desiredKey && state.status === 'rendered' && state.requestedScale === scale && state.canvas === canvas) return existingPromise || Promise.resolve();
    if (existingPromise && !force) return existingPromise;
    if (existingPromise && force && state.task?.cancel) {
      try { state.task.cancel(); } catch {}
    }
    const requestToken = Symbol(`page-render:${pageNumber}`);
    state.token = requestToken;
    state.status = 'queued';
    state.canvas = canvas;
    state.requestedScale = scale;
    state.requestSource = source;
    const run = (async () => {
      if (destroyed || state.token !== requestToken) return;
      if (state.status === 'rendering' && state.canvas === canvas && state.requestedScale === scale && state.promise) return state.promise;
      if (debugFullscreenPdf) console.info('[FULLSCREEN PDF] REQUEST', { pageNumber, source, scale, rotation: currentRotation || info.rotation || 0 });
      sizePageShell(pageNumber, scale);
      state.status = 'rendering';
      if (debugFullscreenPdf) console.info('[FULLSCREEN PDF] render-start', { pageNumber, source });
      const renderTask = await renderPage(currentPdf, Number(pageNumber), canvas, { scale, rotation: currentRotation || info.rotation || 0 });
      state.task = renderTask;
      try {
        if (state.token !== requestToken) {
          try { renderTask.cancel?.(); } catch {}
          return;
        }
        await renderTask.promise;
        if (state.token !== requestToken) return;
        renderedScaleByNumber.set(Number(pageNumber), desiredKey);
        shell.dataset.renderedScale = `${scale}`;
        shell.dataset.renderedRotation = `${currentRotation || info.rotation || 0}`;
        state.status = 'rendered';
        if (debugFullscreenPdf) console.info('[FULLSCREEN PDF] render-complete', { pageNumber, source });
      } catch (error) {
        state.status = 'idle';
        console.error('[FULLSCREEN PDF] render-error', error?.stack || error?.message || error);
        throw error;
      } finally {
        renderTask.releasePage?.();
        if (state.task === renderTask) state.task = null;
        if (state.token === requestToken) state.promise = null;
      }
    })().catch(error => {
      if (state.token === requestToken) {
        state.status = 'idle';
        state.promise = null;
      }
      throw error;
    });
    state.promise = run;
    return run;
  }

  async function renderPageIfNeeded(pageNumber, { force = false, source = 'manual' } = {}) {
    return requestPageRender(pageNumber, { force, source });
  }

  async function renderNearbyPages(centerPageNumber = activePageNumber) {
    const totalPages = Number(currentPdf?.numPages || 0);
    const numbers = [centerPageNumber - 1, centerPageNumber + 1].filter(page => Number.isInteger(Number(page)) && Number(page) > 0 && Number(page) <= totalPages);
    for (const page of numbers) {
      await requestPageRender(page, { source: 'adjacent' });
    }
  }

  function updateActivePageFromViewport() {
    if (!viewerHost) return;
    const hostRect = viewerHost.getBoundingClientRect();
    const hostCenter = hostRect.top + (hostRect.height / 2);
    let closest = null;
    let closestDistance = Infinity;
    for (const [pageNumber, shell] of pageShellByNumber.entries()) {
      const rect = shell.getBoundingClientRect();
      const center = rect.top + (rect.height / 2);
      const distance = Math.abs(center - hostCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = pageNumber;
      }
    }
    if (closest && closest !== activePageNumber) {
      activePageNumber = closest;
      const info = pageInfo(activePageNumber);
      activePageSheetNumber = info?.sheet?.sheetNumber || '';
      currentSelectedSheetNumber = activePageSheetNumber || currentSelectedSheetNumber;
      updateShellState();
      onActiveSheetChange?.(activeSelectedSheet());
      safeUpdateDiagnostics({ reason: 'active-page-change' });
    }
  }

  function activeSelectedSheet() {
    return resolveWorkspaceFullscreenSelectedSheet(currentSheets, currentSelectedSheetNumber);
  }

  function scrollSheetIntoView(sheetNumber, { behavior = 'smooth' } = {}) {
    const sheet = resolveWorkspaceFullscreenSelectedSheet(currentSheets, sheetNumber);
    const pageNumber = Number(sheet?.pdfPageNumber || sheet?.pageNumber || 0);
    const shell = pageShell(pageNumber);
    if (shell?.scrollIntoView) shell.scrollIntoView({ behavior, block: 'center', inline: 'center' });
    activePageNumber = pageNumber || activePageNumber;
    activePageSheetNumber = sheet?.sheetNumber || activePageSheetNumber;
    currentSelectedSheetNumber = sheet?.sheetNumber || currentSelectedSheetNumber;
    updateShellState();
    onActiveSheetChange?.(sheet || null);
    onSheetSelect?.(sheet || null);
  }

  function setTool(tool = 'select') {
    currentTool = ['select'].includes(tool) ? tool : 'select';
    updateShellState();
    onToolChange?.(currentTool);
  }

  function setFitMode(mode = 'page') {
    currentFitMode = mode === 'width' ? 'width' : 'page';
    currentCustomZoom = null;
    renderedScaleByNumber = new Map();
    void requestPageRender(activePageNumber, { force: true, source: 'fit' });
    updateShellState();
    safeUpdateDiagnostics({ reason: 'fit-mode' });
  }

  function setZoom(nextZoom = 1) {
    currentFitMode = 'custom';
    currentCustomZoom = clamp(nextZoom, 0.25, 8);
    renderedScaleByNumber = new Map();
    void requestPageRender(activePageNumber, { force: true, source: 'zoom' });
    updateShellState();
    safeUpdateDiagnostics({ reason: 'zoom' });
  }

  async function handleWheel(event) {
    if (currentTool !== 'hand') return;
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    viewerHost.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: 'auto' });
  }

  function handlePointerDown(event) {
    if (currentTool !== 'hand') return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollLeft = viewerHost.scrollLeft;
    const startScrollTop = viewerHost.scrollTop;
    dragState = { startX, startY, startScrollLeft, startScrollTop };
    viewerHost.classList.add('is-dragging');
    viewerHost.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (!dragState || currentTool !== 'hand') return;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    viewerHost.scrollLeft = dragState.startScrollLeft - deltaX;
    viewerHost.scrollTop = dragState.startScrollTop - deltaY;
  }

  function handlePointerUp(event) {
    if (!dragState) return;
    dragState = null;
    viewerHost.classList.remove('is-dragging');
    try { viewerHost.releasePointerCapture?.(event.pointerId); } catch {}
  }

  function handleViewerScroll() {
    updateActivePageFromViewport();
  }

  function handleViewerKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      void close();
      return;
    }
    if (event.key === 'PageDown') {
      event.preventDefault();
      const selected = resolveWorkspaceFullscreenSelectedSheet(currentSheets, currentSelectedSheetNumber);
      const next = pageShell((selected?.pdfPageNumber || selected?.pageNumber || activePageNumber) + 1) ? (selected?.pdfPageNumber || selected?.pageNumber || activePageNumber) + 1 : activePageNumber;
      pageShell(next)?.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
    }
  }

  async function loadSource({ nextSourceUrl = currentSourceUrl, nextSelectedSheetNumber = currentSelectedSheetNumber, nextWorkspaceModel = currentWorkspaceModel, nextActiveWorkspace = currentActiveWorkspace, nextSheets = currentSheets, nextCounts = currentCounts } = {}) {
    if (destroyed) return { ok: false, status: 'destroyed' };
    currentSourceUrl = text(nextSourceUrl);
    currentWorkspaceModel = nextWorkspaceModel;
    currentActiveWorkspace = nextActiveWorkspace;
    currentSheets = Array.isArray(nextSheets) ? [...nextSheets] : [];
    currentCounts = { issues: 0, rfis: 0, evidence: 0, ...(nextCounts || {}) };
    currentSelectedSheetNumber = text(nextSelectedSheetNumber || currentSelectedSheetNumber);
    const selected = resolveWorkspaceFullscreenSelectedSheet(currentSheets, currentSelectedSheetNumber);
    if (selected?.sheetNumber) currentSelectedSheetNumber = selected.sheetNumber;
    updateShellState();
    if (!currentSourceUrl) {
      loadingNode.textContent = 'No drawing source is available for this workspace.';
      return { ok: false, status: 'missing-source' };
    }

    const sourceKey = currentSourceUrl;
    const requestGeneration = ++controllerGeneration;
    const abort = new AbortController();
    sourceLoadAbort?.abort?.();
    sourceLoadAbort = abort;
    loadingNode.textContent = 'Loading drawing…';
    try {
      let cached = pdfCache.get(sourceKey) || null;
      if (!cached?.blob || !cached?.pdf) {
        const response = await fetch(sourceKey, { signal: abort.signal });
        if (!response.ok) throw new Error(`Unable to load drawing source (${response.status})`);
        const blob = await response.blob();
        const pdf = await openPdf(blob);
        cached = { blob, pdf };
        pdfCache.set(sourceKey, cached);
      }
      if (destroyed || requestGeneration !== controllerGeneration) return { ok: false, status: 'superseded' };
      currentSourceBlob = cached.blob;
      currentPdf = cached.pdf;
      pageMetaByNumber = new Map();
      pageShellByNumber = new Map();
      renderedScaleByNumber = new Map();
      pageRenderState.clear();
      pageInfoState.clear();
      const totalPages = Number(currentPdf?.numPages || 0);
      const selectedPage = selected ? Number(selected.pdfPageNumber || selected.pageNumber) : 1;
      activePageNumber = Number.isFinite(selectedPage) && selectedPage > 0 ? selectedPage : 1;
      activePageSheetNumber = selected?.sheetNumber || '';
      const selectedInfo = selectedPage ? await ensurePageInfo(activePageNumber, { sheet: selected || null, source: 'selected-info' }) : null;
      if (destroyed || requestGeneration !== controllerGeneration) return { ok: false, status: 'superseded' };
      const shellWidth = Math.max(1, Math.round(selectedInfo?.width || viewerHost.clientWidth || 1200));
      const shellHeight = Math.max(1, Math.round(selectedInfo?.height || viewerHost.clientHeight || 900));
      const pageMarkup = Array.from({ length: totalPages }, (_, index) => {
        const pageNumber = index + 1;
        const sheet = currentSheets.find(item => Number(item.pdfPageNumber || item.pageNumber) === pageNumber) || null;
        const label = sheet?.sheetNumber || `Page ${pageNumber}`;
        const title = sheet?.sheetTitle || 'Drawing page';
        return `
          <section class="mc-mdi-page" data-mdi-page="${pageNumber}" data-sheet-number="${text(sheet?.sheetNumber || '')}" data-page-number="${pageNumber}" style="width:${shellWidth}px;min-height:${shellHeight}px;aspect-ratio:${shellWidth} / ${shellHeight};">
            <header class="mc-mdi-page-header">
              <strong>${label}</strong>
              <span>${title}</span>
            </header>
            <div class="mc-mdi-page-canvas-shell">
              <canvas class="mc-mdi-page-canvas" aria-label="${label} ${title}"></canvas>
            </div>
          </section>`;
      }).join('');
      stackNode.innerHTML = pageMarkup || '<div class="mc-mdi-empty">No drawing pages were found.</div>';
      stackNode.querySelectorAll('.mc-mdi-page').forEach(node => {
        const pageNumber = Number(node.dataset.pageNumber) || 0;
        if (pageNumber) pageShellByNumber.set(pageNumber, node);
      });
      if (pageObserver) pageObserver.disconnect();
      pageObserver = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(entries => {
          let bestPage = activePageNumber;
          let bestRatio = 0;
          for (const entry of entries) {
            const pageNumber = Number(entry.target?.dataset?.pageNumber) || 0;
            if (!pageNumber) continue;
            if (entry.isIntersecting) {
              void renderPageIfNeeded(pageNumber, { source: 'observer' });
              if (entry.intersectionRatio >= bestRatio) {
                bestRatio = entry.intersectionRatio;
                bestPage = pageNumber;
              }
            }
          }
          if (bestPage && bestPage !== activePageNumber) {
            activePageNumber = bestPage;
            const info = pageInfo(activePageNumber);
            activePageSheetNumber = info?.sheet?.sheetNumber || '';
            currentSelectedSheetNumber = activePageSheetNumber || currentSelectedSheetNumber;
            updateShellState();
            onActiveSheetChange?.(info?.sheet || null);
            safeUpdateDiagnostics({ reason: 'observer' });
          }
        }, { root: viewerHost, threshold: [0.1, 0.5, 0.9] })
        : null;
      pageShellByNumber.forEach(node => pageObserver?.observe(node));
      updateShellState();
      if (selectedPage && pageShell(selectedPage)?.scrollIntoView) {
        requestAnimationFrame(() => pageShell(selectedPage)?.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' }));
      }
      await requestPageRender(activePageNumber, { force: true, source: 'initial' });
      loadingNode.remove?.();
      safeUpdateDiagnostics({ reason: 'loaded' });
      void renderNearbyPages(activePageNumber);
      return { ok: true, status: 'loaded' };
    } catch (error) {
      const message = error?.message || String(error);
      if (loadingNode) loadingNode.textContent = `Unable to load drawing: ${message}`;
      pageMetaByNumber = new Map();
      pageShellByNumber = new Map();
      safeUpdateDiagnostics({ reason: 'load-failed', message });
      return { ok: false, status: 'load-failed', error: message };
    }
  }

  async function update(next = {}) {
    if (destroyed) return { ok: false, status: 'destroyed' };
    const nextWorkspaceModel = next.workspaceModel || currentWorkspaceModel;
    const nextActiveWorkspace = next.activeWorkspace || nextWorkspaceModel?.activeWorkspace || currentActiveWorkspace;
    const nextSheets = Array.isArray(next.sheets) ? next.sheets : currentSheets;
    const nextCounts = next.counts || currentCounts;
    const nextSelected = text(next.selectedSheetNumber || currentSelectedSheetNumber);
    const nextSourceUrl = text(next.sourceUrl || currentSourceUrl);
    const sourceChanged = nextSourceUrl && nextSourceUrl !== currentSourceUrl;
    if (next.fitMode) {
      currentFitMode = next.fitMode === 'width' ? 'width' : next.fitMode === 'custom' ? 'custom' : 'page';
      if (currentFitMode !== 'custom') currentCustomZoom = null;
    }
    if (number(next.rotation, currentRotation) !== currentRotation) currentRotation = number(next.rotation, currentRotation);
    currentWorkspaceModel = nextWorkspaceModel;
    currentActiveWorkspace = nextActiveWorkspace;
    currentSheets = nextSheets;
    currentCounts = { ...currentCounts, ...nextCounts };
    currentSelectedSheetNumber = nextSelected || currentSelectedSheetNumber;
    updateShellState();
    if (sourceChanged || !currentPdf) {
      return loadSource({ nextSourceUrl, nextSelectedSheetNumber: currentSelectedSheetNumber, nextWorkspaceModel, nextActiveWorkspace, nextSheets, nextCounts });
    }
    const selected = resolveWorkspaceFullscreenSelectedSheet(currentSheets, currentSelectedSheetNumber);
    if (selected?.sheetNumber) {
      currentSelectedSheetNumber = selected.sheetNumber;
      activePageNumber = Number(selected.pdfPageNumber || selected.pageNumber || activePageNumber || 1);
      activePageSheetNumber = selected.sheetNumber;
      updateShellState();
      await requestPageRender(activePageNumber, { force: true, source: 'update' });
      void renderNearbyPages(activePageNumber);
    }
    return { ok: true, status: 'updated' };
  }

  async function openFromNavigator(sheetNumber) {
    const sheet = resolveWorkspaceFullscreenSelectedSheet(currentSheets, sheetNumber);
    if (!sheet) return { ok: false, status: 'missing-sheet' };
    currentSelectedSheetNumber = sheet.sheetNumber;
    updateShellState();
    scrollSheetIntoView(sheet.sheetNumber, { behavior: 'smooth' });
    return { ok: true, sheet };
  }

  async function close(reason = 'exit') {
    if (destroyed) return { ok: false, status: 'destroyed' };
    destroyed = true;
    try { pageObserver?.disconnect?.(); } catch {}
    pageObserver = null;
    sourceLoadAbort?.abort?.();
    sourceLoadAbort = null;
    if (currentPdf?.destroy) {
      try { await currentPdf.destroy(); } catch {}
    }
    currentPdf = null;
    currentSourceBlob = null;
    root.innerHTML = '';
    onDiagnostics?.({ reason: `closed:${reason}`, controllerGeneration });
    return { ok: true, status: 'closed' };
  }

  function handleRootClick(event) {
    const button = event.target?.closest?.('button');
    if (!button || !root.contains(button)) return;
    if (button.hasAttribute('data-mdi-exit')) {
      event.preventDefault();
      void onExit?.();
      return;
    }
    if (button.hasAttribute('data-mdi-fit')) {
      event.preventDefault();
      setFitMode(button.dataset.mdiFit || 'page');
      return;
    }
    if (button.hasAttribute('data-mdi-zoom-out')) {
      event.preventDefault();
      setZoom(currentFitMode === 'custom' ? Math.max(.25, Number(currentCustomZoom) - .1) : .9);
      return;
    }
    if (button.hasAttribute('data-mdi-zoom-in')) {
      event.preventDefault();
      setZoom(currentFitMode === 'custom' ? Math.min(8, Number(currentCustomZoom) + .1) : 1.1);
      return;
    }
  }

  function handleRootInput(event) {
  }

  viewerHost.addEventListener('scroll', handleViewerScroll, { passive: true });
  viewerHost.addEventListener('keydown', handleViewerKeydown);
  root.addEventListener('click', handleRootClick);
  root.addEventListener('input', handleRootInput);

  updateShellState();
  void loadSource({ nextSourceUrl: currentSourceUrl, nextSelectedSheetNumber: currentSelectedSheetNumber, nextWorkspaceModel: currentWorkspaceModel, nextActiveWorkspace: currentActiveWorkspace, nextSheets: currentSheets, nextCounts: currentCounts });

  const controller = {
    root,
    viewerHost,
    update,
    destroy: close,
    setTool,
    setFitMode,
    setZoom,
    scrollSheetIntoView,
    getState: () => ({
      selectedSheetNumber: currentSelectedSheetNumber,
      tool: currentTool,
      fitMode: currentFitMode,
      zoom: currentCustomZoom,
      activePageNumber,
      sourceUrl: currentSourceUrl
    })
  };
  safeUpdateDiagnostics({ reason: 'mounted' });
  return controller;
}

export function resolveWorkspaceFullscreenSourceUrl(sheet = null, baseURI = globalThis.document?.baseURI || 'http://localhost/') {
  const drawingSet = sheet ? getBedfordDrawingSetForReference(sheet) : null;
  return drawingSet?.sourceFileName
    ? new URL(`project-documents/bedford/drawings/${drawingSet.sourceFileName}`, baseURI).toString()
    : '';
}
