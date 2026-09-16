/**
 * Duplicate-transaction diagnostic.
 *
 * HOW TO RUN: open the app in a browser, log in, open DevTools → Console, and
 * paste this whole file in. It only reads; it changes nothing.
 *
 * WHY: "two identical rows" can come from four different mechanisms, and they
 * need opposite fixes. This tells you which one you have by looking at what the
 * pair actually shares:
 *
 *   SAME_CLOUD_ID   Two local rows pointing at ONE server record. A local-only
 *                   problem: the pull inserted a second copy of a row that was
 *                   already here. Nothing is wrong server-side.
 *
 *   DISTINCT_CLOUD_IDS  Two genuine server records. The server's content hash
 *                   (userId + amount + day + description) should have collapsed
 *                   these, so either they were written by a path that bypasses
 *                   it — a loan disbursement, goal contribution, investment or
 *                   gold purchase, all of which used to post with a NULL
 *                   dedupHash — or they predate the fix and need cleaning up.
 *
 *   ONE_UNLINKED    One row synced, one never pushed. A local write happened
 *                   twice, or a pull raced a pending push and could not match
 *                   the two up.
 *
 *   NONE_LINKED     Neither row ever reached the server: something wrote the
 *                   same transaction into Dexie twice.
 */
(async () => {
  const db = window.db;
  if (!db) {
    console.error('window.db is not available — run this on a logged-in app page.');
    return;
  }

  const rows = await db.transactions.toArray();
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const day = (d) => {
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? 'invalid-date' : t.toISOString().slice(0, 10);
  };

  // Same fingerprint the server dedups on, so a pair that lands in one bucket is
  // a pair the backend considers the same transaction.
  const contentKey = (r) =>
    [r.type, Number(r.amount ?? 0), norm(r.category), norm(r.description), day(r.date)].join('|');

  const buckets = new Map();
  for (const r of rows) {
    const k = contentKey(r);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }

  const classes = {
    SAME_CLOUD_ID: [],
    DISTINCT_CLOUD_IDS: [],
    ONE_UNLINKED: [],
    NONE_LINKED: [],
  };

  for (const [key, group] of buckets) {
    if (group.length < 2) continue;
    const linked = group.filter((r) => r.cloudId);
    const cloudIds = new Set(linked.map((r) => String(r.cloudId)));

    let cls;
    if (linked.length === 0) cls = 'NONE_LINKED';
    else if (linked.length < group.length) cls = 'ONE_UNLINKED';
    else if (cloudIds.size === 1) cls = 'SAME_CLOUD_ID';
    else cls = 'DISTINCT_CLOUD_IDS';

    classes[cls].push({
      key,
      count: group.length,
      ids: group.map((r) => r.id),
      cloudIds: group.map((r) => r.cloudId ?? null),
      clientRequestIds: group.map((r) => r.clientRequestId ?? null),
      dedupHashes: group.map((r) => (r.dedupHash ? String(r.dedupHash).slice(0, 12) : null)),
      syncStatus: group.map((r) => r.syncStatus ?? null),
      dates: group.map((r) => new Date(r.date).toISOString()),
      createdAt: group.map((r) => (r.createdAt ? new Date(r.createdAt).toISOString() : null)),
      sample: {
        type: group[0].type,
        amount: group[0].amount,
        category: group[0].category,
        description: group[0].description,
        importSource: group[0].importSource ?? null,
      },
    });
  }

  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem('KANAKU_sync_queue_v3') || '[]');
  } catch {
    /* ignore */
  }

  console.group('%cKanaku duplicate-transaction diagnostic', 'font-weight:bold');
  console.log('total transactions:', rows.length);
  console.log('never pushed (no cloudId):', rows.filter((r) => !r.cloudId).length);
  console.log('missing clientRequestId:', rows.filter((r) => !r.clientRequestId).length);
  console.log('pending sync queue items:', queue.length);
  console.table(
    Object.entries(classes).map(([name, groups]) => ({
      class: name,
      duplicateGroups: groups.length,
      extraRows: groups.reduce((n, g) => n + g.count - 1, 0),
    })),
  );
  for (const [name, groups] of Object.entries(classes)) {
    if (groups.length === 0) continue;
    console.group(`${name} — ${groups.length} group(s)`);
    console.log(groups.slice(0, 10));
    console.groupEnd();
  }
  console.groupEnd();

  return classes;
})();
