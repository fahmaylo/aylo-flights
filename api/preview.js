const cors = require('../lib/cors');
const { fetchCalendarWindow, addDays, nightsBetween, fmt } = require('../lib/search');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { origin, destination, min_nights, max_nights } = req.query;

  if (!origin || !destination)
    return res.status(400).json({ error: 'origin and destination required' });

  const minN = parseInt(min_nights) || 5;
  const maxN = parseInt(max_nights) || 7;

  try {
    const now = new Date();
    const months = [];

    // Make 13 calls, one per month, sampling 9 departure days mid-month
    for (let m = 0; m < 13; m++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() + m, 1);
      // Sample mid-month: start on the 11th (or tomorrow if this month)
      let outboundStart;
      if (m === 0) {
        // This month: start tomorrow
        outboundStart = addDays(now, 1);
      } else {
        outboundStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 11);
      }

      const outboundEnd = addDays(outboundStart, 8); // 9 departure days (0-8)
      const returnStart = addDays(outboundStart, minN);

      const results = await fetchCalendarWindow(origin, destination, outboundStart, returnStart);

      // Filter to valid trip lengths and collect prices
      let low = null;
      let high = null;
      let cheapestDep = null;
      let cheapestRet = null;

      for (const r of results) {
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

      const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

      months.push({
        month: fmt(monthStart).slice(0, 7),
        label,
        low,
        high,
        cheapest_departure: cheapestDep,
        cheapest_return: cheapestRet
      });

      if (m < 12) await sleep(300);
    }

    // Filter out months with no data
    const validMonths = months.filter(m => m.low !== null);

    // Calculate suggested target (25th percentile of monthly lows)
    let suggestedTarget = null;
    if (validMonths.length > 0) {
      const lows = validMonths.map(m => m.low).sort((a, b) => a - b);
      const idx = Math.floor(lows.length * 0.25);
      suggestedTarget = lows[idx];
    }

    const overallLow = validMonths.length ? Math.min(...validMonths.map(m => m.low)) : null;
    const overallHigh = validMonths.length ? Math.max(...validMonths.map(m => m.high)) : null;

    res.json({
      months,
      overall_low: overallLow,
      overall_high: overallHigh,
      suggested_target: suggestedTarget,
      origin,
      destination
    });
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
};
