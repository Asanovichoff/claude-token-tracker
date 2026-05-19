interface Tier {
  match: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
}

const TIERS: Tier[] = [
  { match: 'opus-4',   input: 15,   output: 75,   cacheWrite: 18.75, cacheRead: 1.50  },
  { match: 'sonnet-4', input: 3,    output: 15,   cacheWrite: 3.75,  cacheRead: 0.30  },
  { match: 'haiku-4',  input: 0.80, output: 4,    cacheWrite: 1.00,  cacheRead: 0.08  },
  { match: 'opus-3',   input: 15,   output: 75,   cacheWrite: 18.75, cacheRead: 1.50  },
  { match: 'sonnet-3', input: 3,    output: 15,   cacheWrite: 3.75,  cacheRead: 0.30  },
  { match: 'haiku-3',  input: 0.25, output: 1.25, cacheWrite: 0.31,  cacheRead: 0.03  },
];

const FALLBACK: Tier = { match: '', input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 };

function getTier(model: string | null | undefined): Tier {
  if (!model) return FALLBACK;
  const m = model.toLowerCase();
  return TIERS.find(t => m.includes(t.match)) ?? FALLBACK;
}

export function calcCost(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
  cacheCreateTokens: number,
  cacheReadTokens: number,
): CostBreakdown {
  const tier = getTier(model);
  const M = 1_000_000;
  const input       = (inputTokens       ?? 0) / M * tier.input;
  const output      = (outputTokens      ?? 0) / M * tier.output;
  const cacheCreate = (cacheCreateTokens ?? 0) / M * tier.cacheWrite;
  const cacheRead   = (cacheReadTokens   ?? 0) / M * tier.cacheRead;
  return { input, output, cacheCreate, cacheRead, total: input + output + cacheCreate + cacheRead };
}
