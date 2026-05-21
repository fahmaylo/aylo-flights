const cors = require('../lib/cors');
const { fetchCalendarWindow, addDays, nightsBetween } = require('../lib/search');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { origin, destination, min_nights, max_nights } = req.query;

  if (!origin || !destination)
    return res.status(400).json({ error: 'origin and destination required' });

  const minN = parseInt(min_nights) || 5;
  const maxN = parseInt(max_nights) || 7;

  try {
    const outboundStart = addDays(new Date(), 1);
    const returnStart = addDays(outboundStart, Math.max(minN, 1));

    const results = await fetchCalendarWindow(origin, destination, outboundStart, returnStart);

    // Group by departure date, find cheapest within trip-length range
    const byDate = {};
    for (const r of results) {
      if (!r.price || r.has_no_flights) continue;
      const n = nightsBetween(r.departure, r.return);
      if (n < minN || n > maxN) continue;
      if (!byDate[r.departure] || r.price < byDate[r.departure].price) {
        byDate[r.departure] = { date: r.departure, price: r.price, nights: n };
      }
    }

    const prices = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

    res.json({ prices, origin, destination });
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
};
