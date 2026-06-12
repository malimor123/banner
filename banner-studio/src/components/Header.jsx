import React, { useState } from 'react';

function LockIcon({ ok }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2"
        fill={ok ? '#34d399' : '#f87171'}
        opacity="0.9"
      />
      <path
        d="M8 10V7a4 4 0 1 1 8 0v3"
        stroke={ok ? '#34d399' : '#f87171'}
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

export default function Header({ hasKey, fileName, onOpenKeyModal, onClearKey, onReset }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[#333] bg-[#242424] px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7C5CFC]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="8" width="18" height="8" rx="1.5" fill="white" />
            <rect x="3" y="3" width="8" height="3" rx="1" fill="white" opacity="0.6" />
            <rect x="3" y="18" width="13" height="3" rx="1" fill="white" opacity="0.6" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight text-[#F0F0F0]">Banner Studio</div>
          <div className="text-[10px] leading-tight text-gray-500">IDML → All sizes, AI powered</div>
        </div>
      </div>

      <div className="ml-6 min-w-0 flex-1 truncate text-xs text-gray-400">
        {fileName ? (
          <span>
            <span className="text-gray-500">File:</span> {fileName}
          </span>
        ) : (
          <span className="text-gray-600">No IDML loaded</span>
        )}
      </div>

      {onReset && (
        <button
          onClick={onReset}
          className="rounded-md border border-[#333] px-3 py-1.5 text-xs text-gray-300 hover:border-[#7C5CFC] hover:text-white"
        >
          New project
        </button>
      )}

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title={hasKey ? 'API key set' : 'API key missing'}
          className="flex items-center gap-2 rounded-md border border-[#333] px-3 py-1.5 text-xs text-gray-300 hover:border-[#7C5CFC]"
        >
          <LockIcon ok={hasKey} />
          {hasKey ? 'API key set' : 'No API key'}
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-10 z-50 w-44 rounded-lg border border-[#333] bg-[#2a2a2a] p-1 shadow-xl"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenKeyModal();
              }}
              className="block w-full rounded-md px-3 py-2 text-left text-xs text-gray-200 hover:bg-[#7C5CFC]/20"
            >
              {hasKey ? 'Change key…' : 'Enter key…'}
            </button>
            {hasKey && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onClearKey();
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10"
              >
                Clear key
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
