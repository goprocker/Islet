// Current weather from Open-Meteo (free, no key) for the city in settings.
// Only the city name (to find it) and its coordinates are sent.
let timer = null, place = null, generation = 0; // each poll() call starts a new generation

// WMO weather codes -> short label + emoji
function describe(code, day) {
  if (code === 0) return [day ? "☀️" : "🌙", "Clear"];
  if (code <= 2) return [day ? "🌤️" : "☁️", "Partly cloudy"];
  if (code === 3) return ["☁️", "Cloudy"];
  if (code === 45 || code === 48) return ["🌫️", "Fog"];
  if (code >= 51 && code <= 67) return ["🌧️", "Rain"];
  if (code >= 71 && code <= 77) return ["🌨️", "Snow"];
  if (code >= 80 && code <= 82) return ["🌦️", "Showers"];
  if (code >= 85 && code <= 86) return ["🌨️", "Snow showers"];
  if (code >= 95) return ["⛈️", "Thunderstorm"];
  return ["🌡️", ""];
}

async function locate(city) {
  if (place?.query === city) return place;
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city, count: 1 })}`);
  const hit = (await r.json()).results?.[0];
  place = hit ? { query: city, name: hit.name, lat: hit.latitude, lon: hit.longitude } : null;
  return place;
}

// the next 6 hours and the next 5 days, for the Weather tool
function forecast(data) {
  const h = data.hourly || {}, d = data.daily || {};
  const from = Math.max(0, (h.time || []).findIndex(t => t >= (data.current?.time || "")));
  const hours = (h.time || []).slice(from, from + 6).map((t, i) => ({ time: t.slice(11, 16), temp: Math.round(h.temperature_2m[from + i]), icon: describe(h.weather_code[from + i], h.is_day[from + i] === 1)[0] }));
  const days = (d.time || []).map((t, i) => ({ date: t, hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]), icon: describe(d.weather_code[i], true)[0] }));
  return { hours, days };
}

function poll(city, unit, onWeather) {
  clearInterval(timer);
  const gen = ++generation;
  if (!city) return onWeather(null);
  // replies from an older poll() (old city, or weather turned off) are dropped
  const publish = w => { if (gen === generation) onWeather(w); };
  const run = async () => {
    try {
      const p = await locate(city);
      if (!p) return publish({ error: `Couldn't find "${city}". Check weatherCity in settings.` });
      const q = new URLSearchParams({ latitude: p.lat, longitude: p.lon, current: "temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m", hourly: "temperature_2m,weather_code,is_day", daily: "weather_code,temperature_2m_max,temperature_2m_min", forecast_days: 5, timezone: "auto", temperature_unit: unit === "F" ? "fahrenheit" : "celsius" });
      const data = await (await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)).json(), c = data.current;
      const [icon, label] = describe(c.weather_code, c.is_day === 1);
      publish({ place: p.name, temp: Math.round(c.temperature_2m), unit: unit === "F" ? "F" : "C", icon, label, humidity: c.relative_humidity_2m, wind: Math.round(c.wind_speed_10m), ...forecast(data) });
    } catch (e) { console.warn("weather", e.message); }
  };
  run();
  timer = setInterval(run, 15 * 60 * 1000);
}

module.exports = { poll, forecast };
