/**
 * aiAdapter.js — adapts a master layout to a target size using the Claude API,
 * with a deterministic geometric fallback when the API is unavailable or errors.
 *
 * All calls run directly from the browser (no backend), which requires the
 * `anthropic-dangerous-direct-browser-access` header for CORS.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const BATCH_SIZE = 3; // batch AI calls to avoid rate limits

// ---------- prompt ----------

function buildPrompt(master, target) {
  const slimElements = master.elements.map((el) => {
    const out = {
      id: el.id,
      type: el.type,
      role: el.role,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
    };
    if (el.type === 'text') {
      out.text = el.text;
      out.fontSize = el.fontSize;
      out.align = el.align;
    }
    return out;
  });

  return `You are a professional banner layout designer.

I have a master banner layout with these specs:
- Master size: ${master.width}px × ${master.height}px
- Elements: ${JSON.stringify(slimElements)}

I need to adapt this layout to a NEW size: ${target.width}px × ${target.height}px

RULES (must follow strictly):
1. Elements with role "background" must fill 100% of the new size (x:0, y:0, width:${target.width}, height:${target.height})
2. Logo must maintain its relative position (same corner/edge as in master) and proportional size
3. Text elements must maintain relative proportions — scale font size proportionally to the smaller dimension ratio
4. CTA buttons must remain fully visible and legible
5. No element may overflow outside the canvas boundaries (0,0 to ${target.width},${target.height})
6. Maintain the visual hierarchy and reading order of the master
7. For very wide-to-tall or tall-to-wide changes, reflow text blocks to fit but preserve content
8. Return ONLY a valid JSON object, no explanation, no markdown.

Return JSON in exactly this format:
{
  "elements": [
    {
      "id": "el_001",
      "x": 0,
      "y": 0,
      "width": ${target.width},
      "height": ${target.height},
      "fontSize": 18
    }
  ]
}
Only include fields that change. Keep the same element IDs as the master. Include every element of the master in the response.`;
}

// ---------- response parsing ----------

function extractJSON(text) {
  // strip markdown fences if the model added them despite instructions
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object in AI response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ---------- geometry helpers ----------

export function clampElements(elements, W, H) {
  return elements.map((el) => {
    const out = { ...el };
    out.width = Math.max(4, Math.min(out.width, W));
    out.height = Math.max(4, Math.min(out.height, H));
    out.x = Math.max(0, Math.min(out.x, W - out.width));
    out.y = Math.max(0, Math.min(out.y, H - out.height));
    if (out.type === 'text') out.fontSize = Math.max(6, out.fontSize || 12);
    return out;
  });
}

/**
 * Deterministic fallback: scale relative to master with anchor preservation.
 * Used when the API key is missing or a call fails (user can retry with AI).
 */
export function fallbackAdapt(master, target) {
  const sx = target.width / master.width;
  const sy = target.height / master.height;
  const sMin = Math.min(sx, sy);

  const adapted = master.elements.map((el) => {
    const out = { ...el };
    if (el.role === 'background') {
      out.x = 0;
      out.y = 0;
      out.width = target.width;
      out.height = target.height;
      return out;
    }
    // scale size by the smaller ratio (preserve aspect), position by relative center
    const cx = (el.x + el.width / 2) / master.width;
    const cy = (el.y + el.height / 2) / master.height;
    out.width = el.width * sMin;
    out.height = el.height * sMin;
    out.x = cx * target.width - out.width / 2;
    out.y = cy * target.height - out.height / 2;
    if (el.type === 'text') {
      out.fontSize = Math.max(7, el.fontSize * sMin);
      // give reflowed text room when the orientation flips drastically
      out.width = Math.min(target.width * 0.95, Math.max(out.width, el.fontSize * sMin * 3));
    }
    return out;
  });
  return clampElements(adapted, target.width, target.height);
}

function mergeOverrides(master, target, overrides) {
  const byId = new Map();
  for (const o of overrides || []) {
    if (o && o.id) byId.set(o.id, o);
  }
  const merged = master.elements.map((el) => {
    const o = byId.get(el.id) || {};
    const out = { ...el };
    for (const key of ['x', 'y', 'width', 'height', 'fontSize', 'align']) {
      if (o[key] !== undefined && o[key] !== null) {
        const v = key === 'align' ? o[key] : Number(o[key]);
        if (key === 'align' || Number.isFinite(v)) out[key] = v;
      }
    }
    if (typeof o.text === 'string' && o.text.trim()) out.text = o.text;
    return out;
  });
  return clampElements(merged, target.width, target.height);
}

// ---------- API ----------

export async function adaptLayoutWithAI(master, target, apiKey, { signal } = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildPrompt(master, target) }],
    }),
  });

  if (!response.ok) {
    let message = `API error (HTTP ${response.status})`;
    try {
      const err = await response.json();
      if (err?.error?.message) message = err.error.message;
    } catch {
      /* keep generic message */
    }
    const e = new Error(message);
    e.status = response.status;
    throw e;
  }

  const data = await response.json();
  if (data.stop_reason === 'refusal') throw new Error('The model declined this request.');
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const json = extractJSON(text);
  return mergeOverrides(master, target, json.elements);
}

// ---------- orchestration ----------

/**
 * Adapt one (master → size) job. Returns a banner result object; never throws —
 * errors are reported on the result so the UI can offer per-size retry.
 */
export async function adaptOne(job, apiKey) {
  const { master, size } = job;
  const base = {
    id: job.id,
    name: size.name,
    width: size.width,
    height: size.height,
    masterId: master.masterId,
  };
  if (!apiKey) {
    return {
      ...base,
      elements: fallbackAdapt(master, size),
      usedFallback: true,
      error: 'No API key set — used geometric scaling. Add a key and retry for AI adaptation.',
    };
  }
  try {
    const elements = await adaptLayoutWithAI(master, size, apiKey);
    return { ...base, elements, usedFallback: false, error: null };
  } catch (err) {
    return {
      ...base,
      elements: fallbackAdapt(master, size),
      usedFallback: true,
      error: err.message || 'AI adaptation failed',
    };
  }
}

/**
 * Run all jobs in batches of BATCH_SIZE, reporting progress as
 * onProgress(completedCount, total, latestResult).
 */
export async function runAdaptations(jobs, apiKey, onProgress) {
  const results = [];
  let done = 0;
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const settled = await Promise.all(batch.map((job) => adaptOne(job, apiKey)));
    for (const result of settled) {
      done += 1;
      results.push(result);
      if (onProgress) onProgress(done, jobs.length, result);
    }
  }
  return results;
}

export { MODEL };
