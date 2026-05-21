const db = require('../lib/db');
const { fetchRoute, filterForAlert, travelWindowToMonths } = require('../lib/search');
const { sendAlertEmail } = require('../lib/email');

module.exports = async (req, res) => {
  // Verify cron secret (Vercel sends this automatically for cron invocations)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const start = Date.now();
  console.log(`[${new Date().toISOString()}] Starting daily poll...`);

  const { rows: alerts } = await db.query(
    'SELECT * FROM alerts WHERE expires_at > NOW() ORDER BY created_at ASC'
  );

  console.log(`Found ${alerts.length} active alert(s).`);
  if (!alerts.length) {
    return res.json({ status: 'ok', alerts: 0, emails: 0 });
  }

  // Group by route
  const routes = {};
  for (const a of alerts) {
    const key = `${a.origin}|${a.destination}`;
    if (!routes[key]) routes[key] = [];
    routes[key].push(a);
  }

  console.log(`Grouped into ${Object.keys(routes).length} unique route(s).`);

  let emailsSent = 0;
  let errors = 0;

  for (const [key, group] of Object.entries(routes)) {
    const [origin, destination] = key.split('|');
    const maxMonths = Math.max(...group.map(a => travelWindowToMonths(a.travel_window)));
    const minNights = Math.min(...group.map(a => a.min_nights));

    console.log(`Processing ${origin}->${destination} (${maxMonths} months, ${group.length} alert(s))...`);

    let allResults;
    try {
      allResults = await fetchRoute(origin, destination, maxMonths, minNights);
    } catch (err) {
      console.error(`  Failed to fetch route: ${err.message}`);
      errors++;
      continue;
    }

    if (!allResults.length) {
      console.log('  No results returned for this route.');
      continue;
    }

    for (const alert of group) {
      try {
        const matches = filterForAlert(allResults, alert);
        if (!matches.length) {
          console.log(`  Alert ${alert.id.slice(0, 8)}: no matches in trip-length window`);
          continue;
        }

        const cheapest = matches.reduce((a, b) => a.price < b.price ? a : b);

        await db.query(
          `UPDATE alerts SET last_polled_at = NOW(), last_best_price = $1,
           last_best_departure = $2, last_best_return = $3 WHERE id = $4`,
          [cheapest.price, cheapest.departure, cheapest.return, alert.id]
        );

        if (cheapest.price <= alert.target_price) {
          const alreadyEmailedToday = alert.last_emailed_at &&
            (new Date() - new Date(alert.last_emailed_at)) < 22 * 60 * 60 * 1000;

          if (alreadyEmailedToday) {
            console.log(`  Alert ${alert.id.slice(0, 8)}: already emailed in last 22h, skipping`);
            continue;
          }

          await sendAlertEmail(alert, cheapest);
          await db.query('UPDATE alerts SET last_emailed_at = NOW() WHERE id = $1', [alert.id]);
          emailsSent++;
        } else {
          console.log(`  Alert ${alert.id.slice(0, 8)}: cheapest $${cheapest.price} above target $${alert.target_price}`);
        }
      } catch (err) {
        console.error(`  Error processing alert ${alert.id}: ${err.message}`);
        errors++;
      }
    }
  }

  const dur = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Poll complete in ${dur}s — ${emailsSent} email(s) sent, ${errors} error(s).`);

  res.json({ status: 'ok', alerts: alerts.length, emails: emailsSent, errors, duration: `${dur}s` });
};
