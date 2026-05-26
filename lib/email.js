// lib/email.js — Email sending via SendGrid
//
// Two templates:
//   1. Confirmation — sent immediately when user creates an alert
//   2. Alert       — sent when price drops below user's target

const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM = process.env.SENDGRID_FROM_EMAIL || 'alerts@ayloai.com';
const APP_URL = process.env.APP_URL || 'https://ayloai.com/flights';

function fmtDate(s) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

function fmtLongDate(d) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
}

function fmtWindow(w) {
  return w === '3mo' ? 'Next 3 months'
       : w === '6mo' ? 'Next 6 months'
       : 'Next 12 months';
}

function routeDisplay(alert) {
  const orig = alert.origin_city || alert.origin;
  const dest = alert.destination_city || alert.destination;
  return `${orig} \u2192 ${dest}`;
}

const baseStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 15px; color: #202124; }
  .wrap { max-width: 560px; margin: 40px auto; padding: 0 16px 60px; }
  .card { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .hdr { padding: 28px 32px 20px; border-bottom: 1px solid #e0e0e0; }
  .brand { font-size: 17px; font-weight: 600; }
  .brand span { color: #1a73e8; font-weight: 400; }
  .hero { padding: 28px 32px; border-bottom: 1px solid #e0e0e0; }
  .label { font-size: 11px; font-weight: 600; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
  .title { font-size: 22px; font-weight: 500; letter-spacing: -0.3px; margin-bottom: 6px; }
  .sub { font-size: 14px; color: #70757a; line-height: 1.5; }
  .price { font-size: 40px; font-weight: 600; color: #188038; letter-spacing: -1px; line-height: 1; margin: 8px 0; }
  .flight { margin: 0 32px; background: #f1f8f1; border: 1.5px solid #188038; border-radius: 8px; padding: 16px; }
  .flight-dates { font-size: 15px; font-weight: 500; margin-bottom: 4px; }
  .flight-detail { font-size: 13px; color: #70757a; }
  .cta-wrap { padding: 24px 32px; text-align: center; border-bottom: 1px solid #e0e0e0; }
  .cta { display: inline-block; background: #1a73e8; color: #fff; text-decoration: none; padding: 13px 32px; border-radius: 24px; font-size: 15px; font-weight: 500; }
  .cta-note { font-size: 12px; color: #70757a; margin-top: 8px; }
  .details { padding: 20px 32px; border-bottom: 1px solid #e0e0e0; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
  .row:last-child { border-bottom: none; }
  .k { font-size: 12px; color: #70757a; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; }
  .v { font-size: 13px; }
  .v.alert-price { font-size: 16px; font-weight: 500; color: #1a73e8; }
  .steps { padding: 24px 32px; border-bottom: 1px solid #e0e0e0; }
  .step { display: flex; gap: 14px; margin-bottom: 14px; align-items: flex-start; }
  .step:last-child { margin-bottom: 0; }
  .step-num { width: 24px; height: 24px; border-radius: 50%; background: #e8f0fe; color: #1a73e8; font-size: 12px; font-weight: 600; text-align: center; line-height: 24px; flex-shrink: 0; margin-top: 1px; }
  .step-text { font-size: 14px; line-height: 1.5; }
  .expire { padding: 12px 32px; background: #fef7e0; border-bottom: 1px solid #e0e0e0; }
  .expire-text { font-size: 12px; color: #b06000; }
  .footer { padding: 20px 32px; }
  .footer-text { font-size: 12px; color: #9aa0a6; line-height: 1.7; }
  .footer-text a { color: #70757a; }
`;

async function sendConfirmation(alert) {
  const cancelUrl = `${APP_URL}/alert/${alert.id}`;
  const expiresDate = fmtLongDate(alert.expires_at);

  const subject = `Alert set \u2014 we're watching ${routeDisplay(alert)} for $${alert.target_price}`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${baseStyles}</style></head>
<body><div class="wrap"><div class="card">

  <div class="hdr"><div class="brand">Aylo <span>Flight Alert</span></div></div>

  <div class="hero">
    <div class="label">Alert confirmed</div>
    <div class="title">We're watching ${routeDisplay(alert)} for you.</div>
    <div class="sub">The moment a nonstop flight drops to $${alert.target_price} or below, we'll email you with the dates and a link to book.</div>
  </div>

  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-text">We check prices <strong>once a day</strong> for your route.</div></div>
    <div class="step"><div class="step-num">2</div><div class="step-text">When the price hits <strong>$${alert.target_price}</strong>, we email you immediately.</div></div>
    <div class="step"><div class="step-num">3</div><div class="step-text">You book directly on Google Flights. <strong>We don't charge a fee.</strong></div></div>
  </div>

  <div class="details">
    <div class="row"><span class="k">Route</span><span class="v">${routeDisplay(alert)}</span></div>
    <div class="row"><span class="k">Target price</span><span class="v alert-price">$${alert.target_price}</span></div>
    <div class="row"><span class="k">Stops</span><span class="v">Nonstop only</span></div>
    <div class="row"><span class="k">Trip length</span><span class="v">${alert.min_nights}\u2013${alert.max_nights} nights</span></div>
    <div class="row"><span class="k">Window</span><span class="v">${fmtWindow(alert.travel_window)}</span></div>
    <div class="row"><span class="k">Expires</span><span class="v">${expiresDate}</span></div>
  </div>

  <div class="expire">
    <div class="expire-text">This alert expires automatically in 30 days on ${expiresDate}.</div>
  </div>

  <div class="footer">
    <div class="footer-text">
      You're receiving this because you set a flight alert at <a href="${APP_URL}">ayloai.com/flights</a>. Your email address is used only to deliver this alert. We don't share it with anyone. You can <a href="${cancelUrl}">cancel this alert</a> any time.
    </div>
  </div>

</div></div></body></html>`;

  await send(alert.email, subject, html);
  console.log(`Confirmation sent -> ${alert.email}`);
}

async function sendAlertEmail(alert, match) {
  const cancelUrl = `${APP_URL}/alert/${alert.id}`;
  const bookUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${alert.origin} to ${alert.destination} on ${match.departure} returning ${match.return}`)}`;
  const nights = Math.round((new Date(match.return) - new Date(match.departure)) / 86400000);

  const subject = `${routeDisplay(alert)} dropped to $${match.price}`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${baseStyles}</style></head>
<body><div class="wrap"><div class="card">

  <div class="hdr"><div class="brand">Aylo <span>Flight Alert</span></div></div>

  <div class="hero">
    <div class="label">Price alert</div>
    <div class="title">${routeDisplay(alert)} dropped to</div>
    <div class="price">$${match.price}</div>
    <div class="sub">Below your target of $${alert.target_price}. Book before this changes.</div>
  </div>

  <div style="padding: 20px 0 0">
    <div class="flight">
      <div class="flight-dates">${fmtDate(match.departure)} \u2014 ${fmtDate(match.return)}</div>
      <div class="flight-detail">${nights} nights \u00b7 Nonstop</div>
    </div>
  </div>

  <div class="cta-wrap" style="padding-top: 20px;">
    <a href="${bookUrl}" class="cta">Search on Google Flights \u2192</a>
    <div class="cta-note">We don't charge a fee.</div>
  </div>

  <div class="details">
    <div class="row"><span class="k">Route</span><span class="v">${routeDisplay(alert)}</span></div>
    <div class="row"><span class="k">Your target</span><span class="v">$${alert.target_price}</span></div>
    <div class="row"><span class="k">Trip length</span><span class="v">${alert.min_nights}\u2013${alert.max_nights} nights</span></div>
    <div class="row"><span class="k">Window</span><span class="v">${fmtWindow(alert.travel_window)}</span></div>
  </div>

  <div class="footer">
    <div class="footer-text">
      You're receiving this because you set a flight alert at <a href="${APP_URL}">ayloai.com/flights</a>. Your email address is used only to deliver this alert. We don't share it with anyone. You can <a href="${cancelUrl}">cancel this alert</a> any time.
    </div>
  </div>

</div></div></body></html>`;

  await send(alert.email, subject, html);
  console.log(`Alert sent -> ${alert.email} (${routeDisplay(alert)} $${match.price})`);
}

async function send(to, subject, html) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[email disabled] would send to ${to}: ${subject}`);
    return;
  }
  await sgMail.send({
    to,
    from: { email: FROM, name: 'Aylo Flight Alert' },
    subject,
    html
  });
}

module.exports = { sendConfirmation, sendAlertEmail };
