import React from 'react';

function StatusBadge({ status, error, usedFallback }) {
  if (status === 'pending') return <span className="text-gray-500">Pending</span>;
  if (status === 'running')
    return (
      <span className="flex items-center gap-1.5 text-[#9d85ff]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#7C5CFC]" /> Adapting…
      </span>
    );
  if (status === 'done' && usedFallback && error)
    return (
      <span className="text-amber-400" title={error}>
        ⚠ Auto layout — {error}
      </span>
    );
  if (status === 'done' && usedFallback)
    return <span className="text-emerald-400">✓ Auto layout</span>;
  if (status === 'done') return <span className="text-emerald-400">✓ AI adapted</span>;
  return <span className="text-red-400">{error || 'Failed'}</span>;
}

export default function GenerateStep({
  sizes,
  masters,
  assignments, // { sizeId: masterId }
  onAssign,
  jobStatus, // { sizeId: { status, error, usedFallback } }
  progress, // { done, total } | null
  generating,
  hasKey,
  onGenerate,
  onRetryOne,
  anyResults,
  onContinue,
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto p-8">
      <h2 className="mb-1 text-lg font-semibold text-[#F0F0F0]">Generate adaptations</h2>
      <p className="mb-5 text-xs text-gray-400">
        {hasKey
          ? 'Each size is adapted from its assigned master by Claude AI. Calls run in batches of 3 to respect rate limits.'
          : 'Each size is adapted from its assigned master by the built-in auto-layout engine — free, no API needed. Optional: add an Anthropic API key (lock icon in the header) for AI-powered adaptation.'}
      </p>

      <div className="overflow-hidden rounded-xl border border-[#333]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#242424] text-gray-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">Size</th>
              <th className="px-4 py-2.5 font-medium">Source master</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="w-16 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sizes.map((s) => {
              const st = jobStatus[s.id] || { status: 'pending' };
              return (
                <tr key={s.id} className="border-t border-[#2c2c2c] bg-[#1f1f1f]">
                  <td className="px-4 py-2.5 text-[#F0F0F0]">
                    {s.name || 'Unnamed'}{' '}
                    <span className="text-gray-500">
                      {s.width}×{s.height}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={assignments[s.id] || ''}
                      disabled={generating}
                      onChange={(e) => onAssign(s.id, e.target.value)}
                      className="rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-[#7C5CFC]"
                    >
                      {masters.map((m) => (
                        <option key={m.masterId} value={m.masterId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge {...st} />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {st.status === 'done' && st.error && !generating && (
                      <button
                        onClick={() => onRetryOne(s.id)}
                        className="rounded border border-[#333] px-2 py-1 text-[10px] text-gray-300 hover:border-[#7C5CFC]"
                        title="Retry with AI"
                      >
                        ↻ Retry
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {progress && (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-gray-400">
            <span>
              Adapting {progress.done}/{progress.total} sizes…
            </span>
            <span>{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#2c2c2c]">
            <div
              className="h-full rounded-full bg-[#7C5CFC] transition-all duration-300"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          disabled={generating || !sizes.length}
          onClick={onGenerate}
          className="rounded-lg border border-[#7C5CFC] px-6 py-2.5 text-sm font-semibold text-[#b9a7ff] hover:bg-[#7C5CFC]/10 disabled:opacity-40"
        >
          {generating ? 'Generating…' : anyResults ? '↻ Regenerate all' : '✨ Generate all'}
        </button>
        <button
          disabled={!anyResults || generating}
          onClick={onContinue}
          className="rounded-lg bg-[#7C5CFC] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#6a4ce0] disabled:opacity-40"
        >
          Continue → Edit
        </button>
      </div>

    </div>
  );
}
