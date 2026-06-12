import React, { useState } from 'react';

export default function ApiKeyModal({ open, onSave, onSkip, hasExisting }) {
  const [value, setValue] = useState('');
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[420px] rounded-2xl border border-[#333] bg-[#242424] p-6 shadow-2xl">
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7C5CFC]/20 text-[#7C5CFC]">
            🔑
          </div>
          <h2 className="text-base font-semibold text-[#F0F0F0]">Anthropic API key</h2>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-gray-400">
          Enter your Anthropic API key to enable AI layout adaptation. The key is stored only in
          this browser&apos;s localStorage and sent directly to the Anthropic API — no other server
          ever sees it.
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && onSave(value.trim())}
          placeholder="sk-ant-…"
          className="mb-4 w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2.5 text-sm text-[#F0F0F0] outline-none placeholder:text-gray-600 focus:border-[#7C5CFC]"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onSkip}
            className="rounded-lg px-4 py-2 text-xs text-gray-400 hover:text-gray-200"
          >
            {hasExisting ? 'Cancel' : 'Skip for now'}
          </button>
          <button
            disabled={!value.trim()}
            onClick={() => onSave(value.trim())}
            className="rounded-lg bg-[#7C5CFC] px-5 py-2 text-xs font-semibold text-white hover:bg-[#6a4ce0] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save key
          </button>
        </div>
      </div>
    </div>
  );
}
