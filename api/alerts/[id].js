const cors = require('../../lib/cors');
const db = require('../../lib/db');

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query('SELECT * FROM alerts WHERE id = $1', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Alert not found' });

      const a = rows[0];
      res.json({
        id: a.id,
        email: a.email.replace(/(.{2}).+(@.+)/, '$1\u2022\u2022\u2022$2'),
        origin: a.origin,
        destination: a.destination,
        origin_city: a.origin_city,
        destination_city: a.destination_city,
        min_nights: a.min_nights,
        max_nights: a.max_nights,
        travel_window: a.travel_window,
        target_price: a.target_price,
        created_at: a.created_at,
        expires_at: a.expires_at,
        last_polled_at: a.last_polled_at,
        last_best_price: a.last_best_price,
        last_best_departure: a.last_best_departure,
        last_best_return: a.last_best_return,
        active: new Date(a.expires_at) > new Date()
      });
    } catch (err) {
      console.error('Get alert error:', err.message);
      res.status(500).json({ error: 'Failed to fetch alert' });
    }

  } else if (req.method === 'DELETE') {
    try {
      const { rowCount } = await db.query('DELETE FROM alerts WHERE id = $1', [id]);
      if (!rowCount) return res.status(404).json({ error: 'Alert not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('Cancel alert error:', err.message);
      res.status(500).json({ error: 'Failed to cancel alert' });
    }

  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
