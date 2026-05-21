const cors = require('../../lib/cors');
const db = require('../../lib/db');
const { sendConfirmation } = require('../../lib/email');

function normalizeAirports(input) {
  if (!input) return '';
  return input.toUpperCase().split(',').map(s => s.trim()).filter(Boolean).sort().join(',');
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    email, origin, destination,
    origin_city, destination_city,
    min_nights, max_nights,
    travel_window, target_price
  } = req.body;

  if (!email || !isValidEmail(email))
    return res.status(400).json({ error: 'Invalid email' });
  if (!origin || !destination)
    return res.status(400).json({ error: 'Origin and destination required' });
  if (!Number.isInteger(min_nights) || !Number.isInteger(max_nights) || min_nights < 1 || max_nights < min_nights)
    return res.status(400).json({ error: 'Invalid trip length' });
  if (!['3mo', '6mo', '12mo'].includes(travel_window))
    return res.status(400).json({ error: 'Invalid travel_window' });
  if (!Number.isInteger(target_price) || target_price < 1)
    return res.status(400).json({ error: 'Invalid target_price' });

  const normOrigin = normalizeAirports(origin);
  const normDest = normalizeAirports(destination);

  if (normOrigin === normDest || normOrigin.split(',').some(c => normDest.includes(c)))
    return res.status(400).json({ error: 'Origin and destination overlap' });

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 3);

  try {
    const { rows } = await db.query(
      `INSERT INTO alerts
         (email, origin, destination, origin_city, destination_city,
          min_nights, max_nights, travel_window, target_price, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [email, normOrigin, normDest, origin_city || null, destination_city || null,
       min_nights, max_nights, travel_window, target_price, expiresAt]
    );
    const alert = rows[0];

    try {
      await sendConfirmation(alert);
    } catch (emailErr) {
      console.error(`Confirmation email failed for ${alert.id}:`, emailErr.message);
    }

    res.status(201).json({ id: alert.id });
  } catch (err) {
    console.error('Create alert error:', err.message);
    res.status(500).json({ error: 'Failed to create alert' });
  }
};
