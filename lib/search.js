// lib/search.js — SearchAPI Google Flights Calendar integration
//
// For each route (origin -> destination), fetches a series of 14-day windows
// covering the travel window. Each call covers 14 outbound days x 14 return
// days = 196 combinations, safely under the 200-combo limit.

const API_KEY = process.env.SEARCHAPI_KEY;
const BASE = 'https://www.searchapi.io/api/v1/search';
const MOCK = process.env.MOCK_MODE === 'true';

function fmt(d) {
  return d.toISOString().split('T')[0];
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function nightsBetween(dep, ret) {
  return Math.round((new Date(ret) - new Date(dep)) / 86400000);
}

function travelWindowToMonths(w) {
  return w === '3mo' ? 3 : w === '6mo' ? 6 : 12;
}

async function fetchCalendarWindow(origin, destination, outboundStart, returnStart) {
  if (MOCK) return mockCalendarData(outboundStart);

  const outboundEnd = addDays(outboundStart, 13);
  const returnEnd = addDays(returnStart, 13);

  const params = new URLSearchParams({
    engine: 'google_flights_calendar',
    departure_id: origin,
    arrival_id: destination,
    flight_type: 'round_trip',
    stops: 'nonstop',
    outbound_date: fmt(outboundStart),
    return_date: fmt(returnStart),
    outbound_date_start: fmt(outboundStart),
    outbound_date_end: fmt(outboundEnd),
    return_date_start: fmt(returnStart),
    return_date_end: fmt(returnEnd),
    api_key: API_KEY
  });

  const url = `${BASE}?${params}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const data = await res.json();
      if (data.error) {
        console.error(`  SearchAPI error: ${data.error}`);
        return [];
      }
      return data.calendar || [];
    } catch (err) {
      console.error(`  Fetch error (attempt ${attempt}/2): ${err.message}`);
      if (attempt < 2) await sleep(2000 * attempt);
    }
  }
  return [];
}

// Returns an array of { departure, return, price } covering monthsAhead months.
// minNights controls the return-window offset so short trips aren't missed.
async function fetchRoute(origin, destination, monthsAhead, minNights = 5) {
  const start = addDays(new Date(), 1);
  const end = new Date();
  end.setMonth(end.getMonth() + monthsAhead);

  const all = [];
  let callsUsed = 0;
  let current = new Date(start);

  while (current < end) {
    const outboundStart = new Date(current);
    const returnStart = addDays(outboundStart, Math.max(minNights, 1));

    const results = await fetchCalendarWindow(origin, destination, outboundStart, returnStart);
    all.push(...results);
    callsUsed++;

    current = addDays(current, 14);
    if (current < end) await sleep(300);
  }

  console.log(`  ${origin}->${destination}: ${callsUsed} calls, ${all.length} combos collected`);
  return all;
}

// Filter a route's results for a specific alert's criteria
function filterForAlert(allResults, alert) {
  const now = new Date();
  const windowEnd = new Date();
  windowEnd.setMonth(windowEnd.getMonth() + travelWindowToMonths(alert.travel_window));

  return allResults.filter(r => {
    if (r.has_no_flights || !r.price) return false;
    const dep = new Date(r.departure);
    if (dep < now || dep > windowEnd) return false;
    const n = nightsBetween(r.departure, r.return);
    return n >= alert.min_nights && n <= alert.max_nights;
  });
}

function mockCalendarData(outboundStart) {
  const results = [];
  for (let dep = 0; dep < 14; dep++) {
    for (let nights = 5; nights <= 10; nights++) {
      const depDate = addDays(outboundStart, dep);
      const retDate = addDays(depDate, nights);
      const isDeal = (dep + nights) % 7 === 0;
      results.push({
        departure: fmt(depDate),
        return: fmt(retDate),
        price: isDeal ? 850 + (dep * 5) : 1100 + (dep * 10)
      });
    }
  }
  return results;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { fetchRoute, fetchCalendarWindow, filterForAlert, travelWindowToMonths, nightsBetween, addDays, fmt };
