import React from 'react';

const STEPS = [
  { key: 'upload', label: 'Upload IDML' },
  { key: 'sizes', label: 'Set target sizes' },
  { key: 'generate', label: 'Generate adaptations' },
  { key: 'edit', label: 'Edit' },
  { key: 'export', label: 'Export' },
];

export default function Stepper({ current, onNavigate, maxReached }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  const maxIdx = STEPS.findIndex((s) => s.key === maxReached);

  return (
    <div className="flex h-11 shrink-0 items-center justify-center gap-1 border-b border-[#333] bg-[#1f1f1f] px-4">
      {STEPS.map((step, i) => {
        const reachable = i <= maxIdx;
        const active = i === currentIdx;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && <div className="mx-1 h-px w-8 bg-[#3a3a3a]" />}
            <button
              disabled={!reachable}
              onClick={() => reachable && onNavigate(step.key)}
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs transition-colors ${
                active
                  ? 'bg-[#7C5CFC] text-white'
                  : reachable
                    ? 'text-gray-300 hover:bg-[#7C5CFC]/20'
                    : 'cursor-default text-gray-600'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                  active ? 'bg-white text-[#7C5CFC]' : i < currentIdx ? 'bg-[#7C5CFC] text-white' : 'bg-[#3a3a3a]'
                }`}
              >
                {i < currentIdx ? '✓' : i + 1}
              </span>
              {step.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export { STEPS };
