/** One-click examples for the Playground (hand-written, illustrative payloads). */

export interface CompareExample {
  id: string;
  title: string;
  blurb: string;
  before: unknown;
  after: unknown;
}

const user = {
  id: 4821,
  login: 'monsoon-dev',
  name: 'Asha Rao',
  email: 'asha@example.com',
  avatar_url: 'https://avatars.example.com/u/4821',
  created_at: '2019-07-14T09:12:44Z',
  plan: { name: 'pro', seats: 5 },
  tags: ['maintainer', 'speaker'],
};

export const COMPARE_EXAMPLES: CompareExample[] = [
  {
    id: 'removed',
    title: 'A field vanishes',
    blurb: 'The provider drops `email` from the user object. Code that reads it gets undefined.',
    before: user,
    after: { ...user, email: undefined },
  },
  {
    id: 'type',
    title: 'Ids become strings',
    blurb: 'A classic migration: numeric ids turn into strings, seats into a numeric string.',
    before: user,
    after: { ...user, id: '4821', plan: { name: 'pro', seats: '5' } },
  },
  {
    id: 'nullable',
    title: 'Nulls creep in',
    blurb: 'Avatar can now be null and timestamps lose their ISO format.',
    before: user,
    after: { ...user, avatar_url: null, created_at: '14/07/2019' },
  },
  {
    id: 'additive',
    title: 'Additive only',
    blurb: 'New fields appear; nothing existing moves. Safe for well-behaved clients.',
    before: user,
    after: { ...user, pronouns: 'she/her', plan: { ...user.plan, renews_at: '2026-11-01T00:00:00Z' } },
  },
  {
    id: 'arrays',
    title: 'Inside an array',
    blurb: 'Order line items change shape: price becomes an object, and qty goes missing from some items.',
    before: {
      order_id: 'ord_7f3k2',
      items: [
        { sku: 'TEA-ASSAM', qty: 2, price: 349.5 },
        { sku: 'TEA-DARJ', qty: 1, price: 520 },
      ],
      placed_at: '2026-10-22T18:30:00Z',
    },
    after: {
      order_id: 'ord_9x1b8',
      items: [
        { sku: 'TEA-ASSAM', qty: 2, price: { amount: 349.5, currency: 'INR' } },
        { sku: 'TEA-NILGIRI', price: { amount: 410, currency: 'INR' } },
      ],
      placed_at: '2026-10-23T07:05:00Z',
    },
  },
  {
    id: 'calm',
    title: 'Values change, shape holds',
    blurb: 'Different values, identical structure: clear skies. Driftwatch only compares shapes.',
    before: { base: 'USD', date: '2026-10-22', rates: { INR: 94.82, EUR: 0.89246, GBP: 0.74761 } },
    after: { base: 'USD', date: '2026-10-23', rates: { INR: 94.6, EUR: 0.8911, GBP: 0.7489 } },
  },
];

export function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
