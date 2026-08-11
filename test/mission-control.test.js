import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStartupExperience,
  buildMissionControlPriorities,
  buildRecentActivity,
  buildProjectHealth,
  buildRecommendedActions,
  buildContinuation,
  friendlyWorkspaceLabel,
  countMissionControlSources,
  buildMissionControlModel,
  separateMissionControlProjects,
  resolvePreviousProject,
  missionControlResponseModeLabel
} from '../src/mission-control.js';
import fs from 'node:fs';
import { createDemonstrationProjectFixture, DEMO_PROJECT_ID } from '../src/demo-project.js';

const project = { id: 'p1', name: 'Clinic Renovation' };
const baseInspection = {
  inspectionId: 'i1', inspectionNumber: 'INS-001', title: 'Firestopping',
  status: 'Complete', result: 'Acceptable', inspectionDate: '2026-07-31'
};

test('startup experience defaults and invalid values normalize to Mission Control', () => {
  assert.equal(normalizeStartupExperience(), 'mission-control');
  assert.equal(normalizeStartupExperience('invalid'), 'mission-control');
  assert.equal(normalizeStartupExperience('professional-workspace'), 'professional-workspace');
});

test('Mission Control labels each response mode without combining answer surfaces', () => {
  assert.equal(missionControlResponseModeLabel('offline'), 'Source Evidence');
  assert.equal(missionControlResponseModeLabel('source'), 'Chief Analysis');
  assert.equal(missionControlResponseModeLabel('assisted'), 'Chief Analysis');
  assert.equal(missionControlResponseModeLabel('general'), 'Chief Analysis');
});

test('priorities use the approved practical urgency order', () => {
  const priorities = buildMissionControlPriorities({
    today: '2026-07-31',
    inspections: [
      { ...baseInspection, inspectionId: 'deficient', inspectionNumber: 'INS-005', result: 'Deficient' },
      { ...baseInspection, inspectionId: 'progress', inspectionNumber: 'INS-004', status: 'In Progress' },
      { ...baseInspection, inspectionId: 'follow', inspectionNumber: 'INS-003', followUpRequired: true },
      { ...baseInspection, inspectionId: 'today', inspectionNumber: 'INS-002', followUpRequired: true, followUpDate: '2026-07-31' },
      { ...baseInspection, inspectionId: 'overdue', inspectionNumber: 'INS-001', followUpRequired: true, followUpDate: '2026-07-30' }
    ]
  });
  assert.deepEqual(priorities.map(item => item.kind), ['overdue', 'due-today', 'follow-up', 'in-progress', 'deficient']);
});

test('closed inspections do not create overdue or deficient priorities', () => {
  const priorities = buildMissionControlPriorities({ today: '2026-07-31', inspections: [{ ...baseInspection, status: 'Closed', result: 'Deficient', followUpRequired: true, followUpDate: '2026-07-01' }] });
  assert.deepEqual(priorities, []);
});

test('RFI and submittal type alone never fabricate pending priorities', () => {
  const documents = [
    { id: 'r1', category: 'RFIs', type: 'rfi', status: 'Open' },
    { id: 's1', category: 'Submittals', type: 'submittal', status: 'Approved' }
  ];
  assert.deepEqual(buildMissionControlPriorities({ today: '2026-07-31', documents }), []);
  assert.deepEqual(countMissionControlSources(documents), { drawings: 0, specifications: 0, rfis: 1, submittals: 1 });
});

test('recent activity requires explicit timestamps and orders deterministically', () => {
  const activity = buildRecentActivity({
    project,
    inspections: [
      { ...baseInspection, inspectionId: 'untimed' },
      { ...baseInspection, inspectionId: 'updated', createdAt: '2026-07-29T12:00:00Z', updatedAt: '2026-07-31T12:00:00Z', status: 'Complete' }
    ],
    documents: [
      { id: 'd1', title: 'Drawing', importedAt: '2026-07-30T12:00:00Z' },
      { id: 'd2', title: 'No timestamp' }
    ]
  });
  assert.deepEqual(activity.map(item => item.id), ['inspection:updated:updated', 'document:d1:imported']);
  assert.equal(activity[0].detail, 'Current status: Complete');
});

test('health categories explain exact facts and do not infer positive health from missing data', () => {
  assert.equal(buildProjectHealth().label, 'No Project Open');
  const empty = buildProjectHealth({ project, inspections: [], today: '2026-07-31' });
  assert.equal(empty.label, 'Ready to Begin');
  assert.match(empty.explanation, /no current inspection task/i);
  const attention = buildProjectHealth({ project, today: '2026-07-31', inspections: [{ ...baseInspection, result: 'Deficient' }] });
  assert.equal(attention.label, 'Needs Attention');
  assert.match(attention.explanation, /deficient result/i);
});

test('recommended actions preserve deterministic reasons and targets', () => {
  const priorities = buildMissionControlPriorities({ today: '2026-07-31', inspections: [{ ...baseInspection, result: 'Deficient' }] });
  const actions = buildRecommendedActions(priorities);
  assert.equal(actions[0].reason, 'The recorded inspection result is Deficient.');
  assert.deepEqual(actions[0].target, { view: 'inspections', inspectionId: 'i1' });
});

test('continuation describes only current-session state', () => {
  const items = buildContinuation({ selectedInspectionId: 'i1', activeWorkflowType: 'Inspection Preparation', hasEngineeringContext: true, selectedDocumentId: 'd1', hasConversation: true });
  assert.deepEqual(items.map(item => item.label), ['Resume Inspection', 'Continue Current Task', 'Return to Current Work', 'Continue Reviewing Source']);
  assert.ok(items.every(item => item.reason.includes('session') || item.label === 'Continue Current Task'));
});

test('friendly labels remain presentation-only', () => {
  assert.equal(friendlyWorkspaceLabel('engineering'), 'Current Work');
  assert.equal(friendlyWorkspaceLabel('workflow'), 'Current Task');
  assert.equal(friendlyWorkspaceLabel('knowledge'), 'Project Library');
  assert.equal(friendlyWorkspaceLabel('evidence'), 'Supporting References');
  assert.equal(friendlyWorkspaceLabel('relationships'), 'Related Information');
});

test('empty-state selection is explicit and helpful', () => {
  const model = buildMissionControlModel({ now: '2026-07-31T10:00:00', project, documents: [], sections: [], inspections: [] });
  assert.match(model.empty.priorities, /caught up/i);
  assert.match(model.empty.continuation, /Open an inspection/i);
  assert.match(model.empty.activity, /Activity will appear/i);
});

test('the demonstration fixture is compatible without project-name special cases', () => {
  const fixture = createDemonstrationProjectFixture();
  const demoProject = fixture.manifest.project;
  const model = buildMissionControlModel({
    now: '2026-03-20T10:00:00', project: demoProject,
    documents: fixture.documents, sections: fixture.sections,
    inspections: fixture.inspectionRecords, isDemonstration: demoProject.id === DEMO_PROJECT_ID
  });
  assert.equal(model.project.isDemonstration, true);
  assert.ok(model.summary.drawings > 0);
  assert.ok(model.summary.specifications > 0);
  assert.ok(model.summary.rfis > 0);
  assert.ok(model.summary.submittals > 0);
  assert.ok(model.priorities.some(item => item.kind === 'overdue'));
  assert.ok(model.priorities.some(item => item.kind === 'due-today'));
});

test('My Projects separates user projects from the built-in demonstration', () => {
  const separated = separateMissionControlProjects([
    { id: DEMO_PROJECT_ID, name: 'Veterans Community Health Clinic Renovation' },
    { id: 'zeta', name: 'Zeta Project' },
    { id: 'alpha', name: 'Alpha Project' }
  ], DEMO_PROJECT_ID);
  assert.deepEqual(separated.userProjects.map(item => item.id), ['alpha', 'zeta']);
  assert.equal(separated.demonstrationProject.id, DEMO_PROJECT_ID);
});

test('return navigation restores only an available prior user project', () => {
  const projects = [{ id: 'user-project', name: 'User Project' }, { id: DEMO_PROJECT_ID, name: 'Demo' }];
  assert.equal(resolvePreviousProject('user-project', projects, DEMO_PROJECT_ID)?.id, 'user-project');
  assert.equal(resolvePreviousProject('removed', projects, DEMO_PROJECT_ID), null);
  assert.equal(resolvePreviousProject(DEMO_PROJECT_ID, projects, DEMO_PROJECT_ID), null);
});

test('Mission Control retains the shared dark visual system without white surfaces', () => {
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  const refinement = css.slice(css.lastIndexOf('Phase 22.1'));
  assert.match(refinement, /\.mc-control-shell\{[^}]*#071119/);
  assert.match(refinement, /\.mc-control-card[^}]*#0d1c26/);
  assert.doesNotMatch(refinement, /background(?:-color)?:#fff(?:fff)?(?:[;}]|$)/i);
});

test('Mission Control uses Dashboard, Chief, and Drawings as the primary shell navigation', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /data-control-view="dashboard">Dashboard<\/button>/);
  assert.match(app, /data-control-home[^>]*>Chief<\/button>/);
  assert.match(app, /data-control-view="plans">Drawings<\/button>/);
  assert.doesNotMatch(app, /data-control-experience="professional-workspace">Professional Workspace<\/button>/);
  assert.doesNotMatch(app, /data-control-more-tools/);
  assert.doesNotMatch(app, /aria-label="More Tools"/);
  assert.match(app, /id="openProfessionalWorkspace"[^>]*aria-label="Open Professional Workspace"/);
});

test('Professional Workspace remains available through the gear launcher without a visible top-nav entry', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /id="professionalWorkspaceShell"/);
  assert.match(app, /data-view="project">Project Workspace/);
  assert.match(app, /data-view="chat">Command Desk/);
  assert.match(app, /data-view="knowledge">Knowledge Workspace/);
  assert.match(app, /data-view="sources">Source Inspector/);
  assert.match(app, /data-view="engineering">Engineering Workspace/);
  assert.match(app, /data-view="workflow">Workflow Workspace/);
  assert.match(app, /data-view="relationships">Relationship Explorer/);
  assert.match(app, /data-view="versions">Version Explorer/);
  assert.match(app, /data-view="evaluate">Knowledge Validation/);
  assert.match(app, /data-view="settings">Settings/);
  assert.match(app, /data-view="diagnostics">Diagnostics/);
  assert.match(app, /showMissionControlView\('home'\)/);
  assert.match(app, /id="openProfessionalWorkspace"/);
  assert.doesNotMatch(app, /data-control-experience="professional-workspace"/);
});

test('Mission Control embeds the hosted PMIS dashboard with dedicated actions and a safe iframe', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /missionPmisDashboardUrl/);
  assert.match(app, /project-documents\/bedford\/PMIS\/index\.html\?embedded=1/);
  assert.match(app, /renderMissionControlDashboard/);
  assert.match(app, /title="Mission PMIS Dashboard"/);
  assert.match(app, /sandbox="allow-forms allow-popups allow-scripts allow-same-origin"/);
  assert.match(app, /data-control-action="refresh-dashboard"/);
  assert.match(app, /window\.open\(missionPmisDashboardUrl/);
  assert.match(app, /Mission PMIS ready|Loading Mission PMIS/);
});

test('Mission Control uses a single Chief workspace for heading, composer, messages, and evidence', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /function renderChiefWorkspace/);
  assert.match(app, /mc-chief-workspace/);
  assert.match(app, /data-control-action="show-history"/);
  assert.match(app, /data-control-action="new-conversation"/);
  assert.match(app, /data-control-prompt/);
  assert.match(app, /chiefAssets\.idle/);
  assert.match(app, /mc-chief-evidence/);
  assert.doesNotMatch(app, /showMissionControlView\('chat'\).*renderMissionControlChat/);
});

test('Mission Control presents synchronized deterministic work packages without dead graphical claims', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.match(app, /buildActiveConstructionPackage/);
  assert.match(app, /CONSTRUCTION WORK PACKAGE/);
  assert.match(app, /Work shown or referenced/);
  assert.match(app, /Supporting requirements/);
  assert.match(app, /Current inspections/);
  assert.match(app, /Graphical association has not been verified/);
  assert.match(app, /data-work-package-current/);
  assert.match(app, /data-work-package-inspection/);
  assert.match(app, /data-work-package-target/);
  assert.match(app, /updateDrawingSearchResults/);
  assert.match(app, /pendingDrawingContext/);
  assert.match(css, /\.mc-work-package/);
  assert.doesNotMatch(app, /duct routing (?:is|shown)|diffuser quantity (?:is|shown)|clash detected/i);
});

test('Phase 23C presents drawings as construction evidence with a field-grade hierarchy', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.match(app, /CONSTRUCTION INTELLIGENCE · PLANS/);
  assert.match(app, /Find a sheet, room, trade, or tag/);
  assert.match(app, /Matched Room|matchedReason/);
  assert.match(app, /Construction Evidence/);
  assert.match(app, /Analysis details/);
  assert.match(app, /Reanalyze Drawing Set/);
  assert.match(app, /aria-label="Drawing navigation"/);
  assert.match(app, /aria-label="Drawing view controls"/);
  assert.match(app, /aria-label="Construction context actions"/);
  assert.match(app, /Reset View/);
  assert.match(app, /observationKindLabel/);
  assert.doesNotMatch(app, /<strong>\$\{esc\(item\.kind\)\}<\/strong>/);
  assert.match(css, /Phase 23C/);
  assert.match(css, /#missionDrawingViewer \.mc-drawing-evidence/);
  assert.match(css, /\.mc-drawing-stage\{min-height:520px/);
});

test('Plans keeps exactly one shared Sheet Inspector beneath the drawing viewer', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /renderDrawingWorkspace\('mission-control'\)/);
  assert.match(app, /getActivePlansSheetContext\(/);
  assert.match(app, /updatePlansInspectorOwnership\(/);
  assert.match(app, /activePlansInspectorPanel/);
  assert.match(app, /activePlansInspectorSheetId/);
  assert.match(app, /activePlansInspectorGeneration/);
  assert.match(app, /missionPlansSheetInspector/);
  assert.match(app, /constructionIntelligencePanelMarkup\(constructionIntelligencePanel\)/);
  assert.match(app, /buildConstructionIntelligencePanelModel\(/);
  assert.match(app, /const livePlansPanel = shell === 'mission-control' \? document\.querySelector\('#missionPlansSheetInspector'\) : null;/);
  assert.match(app, /const panel = shell === 'mission-control'\s*\?\s*\(livePlansPanel && livePlansPanel\.isConnected \? livePlansPanel : activePlansInspectorPanel\)\s*:\s*activeDrawingInspectorPanel;/);
  assert.match(app, /if \(panel !== activePlansInspectorPanel\) activePlansInspectorPanel = panel;/);
  assert.match(app, /panel\.innerHTML = constructionIntelligencePanelMarkup\(panelModel\)/);
  assert.equal((app.match(/missionPlansSheetInspector/g) || []).length >= 1, true);
});

test('Phase 24A keeps construction work primary and viewport/search controls stable', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.match(app, /mc-construction-orientation/);
  assert.match(app, /drawingZoom = null/);
  assert.match(app, /preservedCanvas/);
  assert.match(app, /PageDown.*PageUp.*Home.*End/);
  assert.match(app, /Construction Timeline/);
  assert.doesNotMatch(app, /Matched positioned drawing text/);
  assert.match(css, /Phase 24A/);
  assert.match(css, /position:sticky/);
});

test('Phase 24A.1 contains drawing lifecycle failures without blanking the workspace', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.match(app, /drawingUpgradeWork = new Map/);
  assert.match(app, /drawingUpgradeFailures = new Set/);
  assert.match(app, /drawingLifecycleUnavailable/);
  assert.match(app, /Drawing source unavailable/);
  assert.match(app, /open-owning-project/);
  assert.match(app, /return-to-drawing-sets/);
  assert.match(app, /retry-analysis-upgrade/);
  assert.match(app, /reduceStaleDrawingTarget/);
  assert.doesNotMatch(app.slice(app.indexOf('async function currentDrawingAnalyses'), app.indexOf('async function buildActiveConstructionPackage')), /throw /);
  assert.match(css, /mc-drawing-recovery/);
});

test('Phase 24A.2 exposes a full-scale stable viewer and verified construction overlays', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.match(app, /Analyze Page Objects/);
  assert.doesNotMatch(app, /data-drawing-overlay/);
  assert.match(app, /Expand Drawing/);
  assert.match(app, /calculateDrawingFit/);
  assert.match(app, /Candidate occurrence/);
  assert.match(css, /\.mc-drawing-layout\.drawing-expanded/);
  assert.match(css, /\.mc-drawing-object-overlay\.confirmed/);
  assert.doesNotMatch(css, /\.mc-drawing-stage\{[^}]*background:\s*(?:white|#fff(?:fff)?)/i);
});

test('Phase 24B makes Chief construction-first with one synchronized drawing state', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  const messageMarkup = app.slice(app.indexOf('class="mc-control-messages"'), app.indexOf('id="missionControlComposer"'));
  assert.ok(messageMarkup.indexOf('constructionWorkPackageMarkup(message)') < messageMarkup.indexOf('mc-control-message-content'));
  assert.match(app, /chiefConstructionContext/);
  assert.match(app, /validateChiefConstructionContext/);
  assert.match(app, /missionInlineDrawingViewer/);
  assert.match(app, /Open Full Drawing Workspace/);
  assert.match(app, /activeDrawingRenderIdentity/);
  assert.match(app, /renderCanvas/);
  assert.match(app, /updateDrawingOverlays/);
  assert.match(app, /message\.workPackageReferences\) return ''/);
  assert.match(css, /Phase 24B/);
  assert.match(css, /\.mc-inline-plan/);
  assert.doesNotMatch(app, /engine\.setState\([^)]*workPackage|persistWorkPackage/);
});

test('Mission Control hides built-in demo entry points and opens to Chief by default', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /data-control-home[^>]*>Chief<\/button>/);
  assert.match(app, /<button[^>]*data-control-view="plans">Drawings<\/button>/);
  assert.doesNotMatch(app, /<button[^>]*data-control-experience="professional-workspace">Professional Workspace<\/button>/);
  assert.doesNotMatch(app, /Explore Demonstration Project/);
  assert.doesNotMatch(app, /Load Demonstration Project/);
  assert.doesNotMatch(app, /Open Demonstration Project/);
  assert.doesNotMatch(app, /Stop Demonstration/);
  assert.doesNotMatch(app, /Reset Demonstration Project/);
});

test('Mission Control uses the compact primary navigation without the compatibility drawer', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /data-control-view="dashboard">Dashboard<\/button>/);
  assert.match(app, /data-control-home[^>]*>Chief<\/button>/);
  assert.match(app, /<button[^>]*data-control-view="plans">Drawings<\/button>/);
  assert.doesNotMatch(app, /<button[^>]*data-control-experience="professional-workspace">Professional Workspace<\/button>/);
  assert.doesNotMatch(app, /<button[^>]*data-control-more-tools[^>]*>More Tools<\/button>/);
  assert.doesNotMatch(app, /aria-label="More Tools"/);
});

test('stopping the demonstration clears transient state without deleting the fixture or restoring a project', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const lifecycle = app.slice(app.indexOf('function clearDemonstrationTransientState'), app.indexOf('async function openDemonstrationProject'));
  assert.match(lifecycle, /activeRetrievalSession = null/);
  assert.match(lifecycle, /selectedInspectionId = null/);
  assert.match(lifecycle, /clearActiveContext/);
  assert.match(lifecycle, /engine\.setProject\('general'\)/);
  assert.match(lifecycle, /engine\.createConversation/);
  assert.doesNotMatch(lifecycle, /deleteProject|resetDemoProject/);
});

test('Mission Control explicitly isolates inactive shells from layout and focus', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.match(app, /\.inert = !missionControl/);
  assert.match(app, /\.inert = missionControl/);
  assert.match(app, /setAttribute\('aria-hidden'/);
  assert.match(css, /\[hidden\],\.mc-shell-inactive\{display:none!important\}/);
});

test('Mission Control owns native chat, conversation history, attachments, and precise source actions', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /function renderMissionControlChat/);
  assert.match(app, /function renderConversationHistory/);
  assert.match(app, /id="missionControlComposer"/);
  assert.match(app, /id="missionControlFiles"/);
  assert.match(app, /data-control-source-document/);
  assert.doesNotMatch(app.slice(app.indexOf('if \(button\.dataset\.controlPrompt\)'), app.indexOf('const action = button.dataset.controlAction')), /openProfessionalDestination\(\{ view: 'chat'/);
});

test('Mission Control uses user-facing Chief, command-desk, and drawing guidance', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /Select or create a project to begin construction analysis\./);
  assert.match(app, /Ask Chief about \$\{esc\(project\.name\)\}/);
  assert.match(app, /No construction context selected/);
  assert.match(app, /No drawing set is available for this project\./);
  assert.match(app, /Import Drawing/);
  assert.match(app, /Return to Chief/);
  assert.doesNotMatch(app, /No active Engineering Context/);
});

test('exact engineering navigation returns before retrieval and preserves registry ownership', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const submitStart = app.indexOf("$('#missionControlContent').addEventListener('submit'");
  const submit = app.slice(submitStart, app.indexOf('async function ingestMissionControlFiles', submitStart));
  const exactBranch = submit.indexOf('if (navigationIntent.exact)');
  const retrieval = submit.indexOf('await engine.ask');
  assert.ok(exactBranch >= 0 && retrieval > exactBranch);
  assert.match(submit.slice(exactBranch, retrieval), /await showMissionControlView\('plans'\)/);
  assert.match(submit.slice(exactBranch, retrieval), /await openProfessionalDestination\(\{ \.\.\.locationPresentation\.target, view: 'knowledge' \}\)/);
  assert.match(submit.slice(exactBranch, retrieval), /return;/);
  assert.match(submit, /projectId: locationPresentation\.target\.projectId/);
  assert.match(submit, /drawingId: locationPresentation\.target\.drawingId/);
  assert.match(submit, /currentGlobalDrawingRegistryAnalyses\(promptValue\)/);
  const globalUpgrade = app.slice(app.indexOf('async function currentGlobalDrawingRegistryAnalyses'), app.indexOf('async function buildActiveConstructionPackage'));
  assert.match(globalUpgrade, /engine\.drawingRegistryAnalyses\(\)/);
  assert.match(globalUpgrade, /drawingAnalysisRequiresUpgrade\(analysis\)/);
  assert.match(globalUpgrade, /loadAuthoritativeDrawingRegistry/);
  assert.match(globalUpgrade, /loadAnalyses: \(\) => engine\.drawingRegistryAnalyses\(\)/);
  assert.match(globalUpgrade, /save: analysis => engine\.saveDrawingAnalysis\(analysis\)/);
  assert.match(globalUpgrade, /const commandAnalyses = activeExactMatch/);
  assert.match(globalUpgrade, /inspectDrawingRegistryRuntime/);
  const exactCommand = submit.slice(exactBranch, retrieval);
  assert.equal((exactCommand.match(/logger\.info\('Drawing registry runtime inspection'/g) || []).length, 1);
  assert.match(exactCommand, /latestDrawingRegistryInspection = null/);
});

test('legacy Command Desk exact drawing commands terminate before Expert-assisted generation', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const askStart = app.indexOf('async function ask()');
  const ask = app.slice(askStart, app.indexOf("$('#send').onclick = ask", askStart));
  const navigation = ask.indexOf('await navigateExactDrawingCommand');
  const ai = ask.indexOf('await engine.ask');
  assert.ok(navigation >= 0 && ai > navigation);
  const successfulBranch = ask.slice(navigation, ai);
  assert.match(successfulBranch, /if \(navigation\.handled\)/);
  assert.match(successfulBranch, /await showMissionControlView\('plans'\)/);
  assert.match(successfulBranch, /return;/);
});

test('Chief exact drawing navigation delegates page selection to the Drawing Workspace API', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const submitStart = app.indexOf("$('#missionControlContent').addEventListener('submit'");
  const submit = app.slice(submitStart, app.indexOf('async function ingestMissionControlFiles', submitStart));
  const navigation = submit.indexOf('drawingWorkspace.open(resolvedLocationTarget');
  const ai = submit.indexOf('await engine.ask');
  assert.ok(navigation >= 0 && ai > navigation);
  assert.match(submit.slice(navigation, ai), /await showMissionControlView\('plans'\)/);
  assert.match(submit.slice(navigation, ai), /return;/);
});

test('Drawing Workspace context panel is page-scoped and exposes honest empty sections', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /drawingWorkspace\.setPages\(\(analysis\?\.sheets \|\| \[\]\)\.map/);
  assert.match(app, /drawingWorkspace\.getContext\(currentSheet \?/);
  for (const heading of ['Summary', 'Specifications', 'Related Drawings', 'Inspection Items', 'Equipment', 'Rooms', 'Photos', 'Documents', 'Issues', 'History']) assert.match(app, new RegExp(`<h3>${heading}<\\/h3>`));
  assert.match(app, /No linked data\./);
});

test('Drawing Workspace relationship groups separate trust states and delegate valid actions', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const heading of ['Confirmed Specifications', 'Suggested Specifications', 'Related Drawings', 'Rooms', 'Equipment', 'Inspections', 'Photos', 'Issues', 'Risks', 'RFIs', 'Submittals', 'Shutdowns', 'Commissioning', 'History']) assert.match(app, new RegExp(`'${heading}'`));
  assert.match(app, /relationship\.verificationState === 'suggested'/);
  assert.match(app, /data-project-relationship-confirm/);
  assert.match(app, /data-project-relationship-reject/);
  assert.match(app, /entity\.metadata\?\.navigationTarget/);
  assert.match(app, /projectRelationshipEngine\.registerRelationship/);
  assert.match(app, /drawingWorkspace\.open\(target\)/);
});

test('Drawing Workspace requirements panel keeps scope, evidence, trade, and exact actions explicit', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const heading of ['Current Context', 'Governing Drawings', 'Field Requirements', 'Project-Wide Requirements']) assert.match(app, new RegExp(`<h3>${heading}<\\/h3>`));
  assert.match(app, /<h3>Applicable Specifications — Confirmed<\/h3>/);
  assert.match(app, /<h3>Applicable Specifications — Suggested<\/h3>/);
  assert.match(app, /data-drawing-trade/);
  assert.match(app, /data-drawing-select-region/);
  assert.match(app, /data-drawing-clear-region/);
  assert.match(app, /data-requirement-open=/);
  assert.match(app, /data-requirement-open-drawing/);
  assert.match(app, /Review Evidence/);
  assert.match(app, /drawingRequirementsResolver\.invalidate\(\)/);
  assert.match(app, /drawingViewportContextService\.update/);
});

test('Drawing Workspace loads routed document metadata without loading specification chunks and contains provider failure', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const wrapper = app.slice(app.indexOf("async function renderDrawingWorkspace(shell = 'professional')"), app.indexOf("async function renderDrawingWorkspaceWithProviders"));
  const renderer = app.slice(app.indexOf("async function renderDrawingWorkspaceWithProviders"), app.indexOf('async function renderMissionControlDashboard'));
  assert.match(wrapper, /loadDrawingWorkspaceProviders/);
  assert.match(wrapper, /loadDocuments: \(\) => engine\.documents\(\)/);
  assert.match(renderer, /\{ documents: providerDocuments, warnings: providerWarnings = \[\] \}/);
  assert.match(renderer, /providerWarnings/);
  assert.match(renderer, /const documents = allDocuments\.filter\(isDrawingDocumentRole\)/);
  assert.match(renderer, /const specificationDocument = allDocuments\.find\(isSpecificationDocument\)/);
  assert.doesNotMatch(renderer, /await engine\.sections\(\)/);
});
