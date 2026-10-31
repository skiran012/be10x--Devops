/** Reads the seeded ledger from JSON; stands in for the real server call. Failure is injectable for tests. */
export async function loadLedger() {
  const res = await fetch('data/seed.json');
  if (!res.ok) throw new Error('Could not load ledger');
  return res.json();
}
