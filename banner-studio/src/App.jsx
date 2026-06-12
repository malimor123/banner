import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Stepper from './components/Stepper.jsx';
import ApiKeyModal from './components/ApiKeyModal.jsx';
import UploadStep from './components/UploadStep.jsx';
import SizeInput, { newSize } from './components/SizeInput.jsx';
import GenerateStep from './components/GenerateStep.jsx';
import EditorWorkspace from './components/EditorWorkspace.jsx';
import { adaptOne, runAdaptations } from './modules/aiAdapter.js';

const API_KEY_STORAGE = 'anthropic_api_key';
const HISTORY_LIMIT = 50;

/** Pick the selected master whose aspect ratio is closest to the target size. */
function bestMasterFor(size, masters) {
  const ratio = size.width / size.height;
  let best = masters[0];
  let bestDiff = Infinity;
  for (const m of masters) {
    const diff = Math.abs(Math.log(m.width / m.height) - Math.log(ratio));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = m;
    }
  }
  return best?.masterId;
}

export default function App() {
  // --- api key ---
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '');
  const [keyModalOpen, setKeyModalOpen] = useState(() => !localStorage.getItem(API_KEY_STORAGE));

  // --- workflow ---
  const [step, setStep] = useState('upload');
  const [maxReached, setMaxReached] = useState('upload');
  const stepOrder = ['upload', 'sizes', 'generate', 'edit', 'export'];

  function goTo(next) {
    setStep(next);
    if (stepOrder.indexOf(next) > stepOrder.indexOf(maxReached)) setMaxReached(next);
  }

  // --- project data ---
  const [fileName, setFileName] = useState(null);
  const [masters, setMasters] = useState([]);
  const [selectedMasterIds, setSelectedMasterIds] = useState([]);
  const [sizes, setSizes] = useState([newSize(), newSize(), newSize()]);
  const [assignments, setAssignments] = useState({}); // sizeId → masterId
  const [jobStatus, setJobStatus] = useState({}); // sizeId → {status, error, usedFallback}
  const [progress, setProgress] = useState(null);
  const [generating, setGenerating] = useState(false);

  // banners: { id, name, width, height, elements, usedFallback, error }
  const [banners, setBanners] = useState([]);
  const [activeBannerId, setActiveBannerId] = useState(null);
  const historyRef = useRef({}); // bannerId → { past: [], future: [] }
  const [, forceHistoryTick] = useState(0);

  const selectedMasters = useMemo(
    () => masters.filter((m) => selectedMasterIds.includes(m.masterId)),
    [masters, selectedMasterIds]
  );

  const validSizes = useMemo(
    () =>
      sizes
        .filter((s) => Number(s.width) > 0 && Number(s.height) > 0)
        .map((s) => ({
          ...s,
          width: Math.round(Number(s.width)),
          height: Math.round(Number(s.height)),
          name: s.name || `${s.width}x${s.height}`,
        })),
    [sizes]
  );

  // keep master assignments in sync with sizes/master selection
  useEffect(() => {
    if (!selectedMasters.length) return;
    setAssignments((prev) => {
      const next = { ...prev };
      for (const s of validSizes) {
        if (!next[s.id] || !selectedMasterIds.includes(next[s.id])) {
          next[s.id] = bestMasterFor(s, selectedMasters);
        }
      }
      return next;
    });
  }, [validSizes, selectedMasters, selectedMasterIds]);

  // --- key handling ---
  function saveKey(key) {
    localStorage.setItem(API_KEY_STORAGE, key);
    setApiKey(key);
    setKeyModalOpen(false);
  }
  function clearKey() {
    localStorage.removeItem(API_KEY_STORAGE);
    setApiKey('');
  }

  // --- generation ---
  function buildJobs(targetSizes) {
    const masterById = Object.fromEntries(masters.map((m) => [m.masterId, m]));
    return targetSizes.map((s) => ({
      id: s.id,
      size: s,
      master: masterById[assignments[s.id]] || selectedMasters[0],
    }));
  }

  function upsertBanner(result) {
    setBanners((prev) => {
      const idx = prev.findIndex((b) => b.id === result.id);
      if (idx === -1) return [...prev, result];
      const next = [...prev];
      next[idx] = result;
      return next;
    });
    historyRef.current[result.id] = { past: [], future: [] };
  }

  async function generateAll() {
    if (!validSizes.length || !selectedMasters.length) return;
    setGenerating(true);
    setBanners([]);
    historyRef.current = {};
    setJobStatus(Object.fromEntries(validSizes.map((s) => [s.id, { status: 'running' }])));
    setProgress({ done: 0, total: validSizes.length });

    const jobs = buildJobs(validSizes);
    await runAdaptations(jobs, apiKey, (done, total, result) => {
      setProgress({ done, total });
      setJobStatus((prev) => ({
        ...prev,
        [result.id]: { status: 'done', error: result.error, usedFallback: result.usedFallback },
      }));
      upsertBanner(result);
    });

    setGenerating(false);
    setProgress(null);
    setActiveBannerId(validSizes[0]?.id || null);
  }

  async function retryOne(sizeId) {
    const size = validSizes.find((s) => s.id === sizeId);
    if (!size) return;
    setJobStatus((prev) => ({ ...prev, [sizeId]: { status: 'running' } }));
    const [job] = buildJobs([size]);
    const result = await adaptOne(job, apiKey);
    setJobStatus((prev) => ({
      ...prev,
      [sizeId]: { status: 'done', error: result.error, usedFallback: result.usedFallback },
    }));
    upsertBanner(result);
  }

  // --- editing & history ---
  const updateElements = useCallback((bannerId, elements, commit) => {
    setBanners((prev) =>
      prev.map((b) => {
        if (b.id !== bannerId) return b;
        if (commit) {
          const h = historyRef.current[bannerId] || (historyRef.current[bannerId] = { past: [], future: [] });
          h.past.push(b.elements);
          if (h.past.length > HISTORY_LIMIT) h.past.shift();
          h.future = [];
        }
        return { ...b, elements };
      })
    );
    forceHistoryTick((t) => t + 1);
  }, []);

  const undo = useCallback((bannerId) => {
    const h = historyRef.current[bannerId];
    if (!h || !h.past.length) return;
    setBanners((prev) =>
      prev.map((b) => {
        if (b.id !== bannerId) return b;
        const previous = h.past.pop();
        h.future.push(b.elements);
        return { ...b, elements: previous };
      })
    );
    forceHistoryTick((t) => t + 1);
  }, []);

  const redo = useCallback((bannerId) => {
    const h = historyRef.current[bannerId];
    if (!h || !h.future.length) return;
    setBanners((prev) =>
      prev.map((b) => {
        if (b.id !== bannerId) return b;
        const next = h.future.pop();
        h.past.push(b.elements);
        return { ...b, elements: next };
      })
    );
    forceHistoryTick((t) => t + 1);
  }, []);

  const canUndo = useCallback((bannerId) => !!historyRef.current[bannerId]?.past.length, []);
  const canRedo = useCallback((bannerId) => !!historyRef.current[bannerId]?.future.length, []);

  // --- reset ---
  function resetProject() {
    setFileName(null);
    setMasters([]);
    setSelectedMasterIds([]);
    setSizes([newSize(), newSize(), newSize()]);
    setAssignments({});
    setJobStatus({});
    setBanners([]);
    setActiveBannerId(null);
    historyRef.current = {};
    setStep('upload');
    setMaxReached('upload');
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        hasKey={!!apiKey}
        fileName={fileName}
        onOpenKeyModal={() => setKeyModalOpen(true)}
        onClearKey={clearKey}
        onReset={masters.length ? resetProject : null}
      />
      <Stepper current={step} maxReached={maxReached} onNavigate={goTo} />

      {step === 'upload' && (
        <UploadStep
          masters={masters}
          selectedMasterIds={selectedMasterIds}
          onParsed={(name, parsed) => {
            setFileName(name);
            setMasters(parsed);
            setSelectedMasterIds(parsed.map((m) => m.masterId));
          }}
          onToggleMaster={(id) =>
            setSelectedMasterIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            )
          }
          onContinue={() => goTo('sizes')}
        />
      )}

      {step === 'sizes' && (
        <SizeInput sizes={sizes} onChange={setSizes} onContinue={() => goTo('generate')} />
      )}

      {step === 'generate' && (
        <GenerateStep
          sizes={validSizes}
          masters={selectedMasters}
          assignments={assignments}
          onAssign={(sizeId, masterId) =>
            setAssignments((prev) => ({ ...prev, [sizeId]: masterId }))
          }
          jobStatus={jobStatus}
          progress={progress}
          generating={generating}
          hasKey={!!apiKey}
          onGenerate={generateAll}
          onRetryOne={retryOne}
          anyResults={banners.length > 0}
          onContinue={() => {
            if (!activeBannerId && banners.length) setActiveBannerId(banners[0].id);
            goTo('edit');
            setMaxReached('export');
          }}
        />
      )}

      {(step === 'edit' || step === 'export') && banners.length > 0 && (
        <EditorWorkspace
          banners={banners}
          activeBannerId={activeBannerId || banners[0].id}
          onSelectBanner={setActiveBannerId}
          onUpdateElements={updateElements}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      )}

      <ApiKeyModal
        open={keyModalOpen}
        hasExisting={!!apiKey}
        onSave={saveKey}
        onSkip={() => setKeyModalOpen(false)}
      />
    </div>
  );
}
