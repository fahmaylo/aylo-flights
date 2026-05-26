const cors = require('../lib/cors');
const db = require('../lib/db');
const { fetchCalendarWindow, addDays, nightsBetween, fmt } = require('../lib/search');

const CACHE_TTL_HOURS = 12;
const CONCURRENCY = 4;

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { origin, destination, min_nights, max_nights } = req.query;

  if (!origin || !destination)
    return res.status(400).json({ error: 'origin and destination required' });

  const minN = parseInt(min_nights) || 5;
  const maxN = parseInt(max_nights) || 7;
  const cacheKey = `${origin}|${destination}|${minN}|${maxN}`;

  // Check cache
  try {
    const cached = await db.query(
      `SELECT data FROM preview_cache
       WHERE cache_key = $1 AND created_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'`,
      [cacheKey]
    );
    if (cached.rows.length) {
      return res.json(cached.rows[0].data);
    }
  } catch (err) {
    // Cache miss or DB unavailable — continue to fetch fresh data
    console.error('Cache read error:', err.message);
  }

  try {
    const now = new Date();

    // Build all 13 month tasks
    const tasks = [];
    for (let m = 0; m < 13; m++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() + m, 1);
      let outboundStart;
      if (m === 0) {
        // Start at least 14 days out, but stay in the current month
        const twoWeeks = addDays(now, 14);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        outboundStart = twoWeeks <= endOfMonth ? twoWeeks : addDays(endOfMonth, -6);
      } else {
        outboundStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 11);
      }
      const returnStart = addDays(outboundStart, minN);
      const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

      tasks.push({ m, monthStart, outboundStart, returnStart, label });
    }

    // Run in parallel batches
    const months = new Array(13);
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(t => fetchCalendarWindow(origin, destination, t.outboundStart, t.returnStart))
      );

      for (let j = 0; j < batch.length; j++) {
        const t = batch[j];
        const calResults = results[j];

        let low = null, high = null, cheapestDep = null, cheapestRet = null;

        for (const r of calResults) {
          if (!r.price || r.has_no_flights) continue;
          const n = nightsBetween(r.departure, r.return);
          if (n < minN || n > maxN) continue;

          if (low === null || r.price < low) {
            low = r.price;
            cheapestDep = r.departure;
            cheapestRet = r.return;
          }
          if (high === null || r.price > high) {
            high = r.price;
          }
        }

        months[t.m] = {
          month: fmt(t.monthStart).slice(0, 7),
          label: t.label,
          low,
          high,
          cheapest_departure: cheapestDep,
          cheapest_return: cheapestRet
        };
      }
    }

    const validMonths = months.filter(m => m.low !== null);

    let suggestedTarget = null;
    if (validMonths.length > 0) {
      const lows = validMonths.map(m => m.low).sort((a, b) => a - b);
      const idx = Math.floor(lows.length * 0.25);
      suggestedTarget = lows[idx];
    }

    const overallLow = validMonths.length ? Math.min(...validMonths.map(m => m.low)) : null;
    const overallHigh = validMonths.length ? Math.max(...validMonths.map(m => m.high)) : null;

    const payload = {
      months,
      overall_low: overallLow,
      overall_high: overallHigh,
      suggested_target: suggestedTarget,
      origin,
      destination
    };

    // Write to cache
    try {
      await db.query(
        `INSERT INTO preview_cache (cache_key, data, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET data = $2, created_at = NOW()`,
        [cacheKey, JSON.stringify(payload)]
      );
    } catch (err) {
      console.error('Cache write error:', err.message);
    }

    res.json(payload);
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
};
