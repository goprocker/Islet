// Current weather from Open-Meteo (free, no key) for the city in settings.
// Only the city name (to find it) and its coordinates are sent.
let timer = null, place = null;

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

function poll(city, unit, onWeather) {
  clearInterval(timer);
  if (!city) return onWeather(null);
  const run = async () => {
    try {
      const p = await locate(city);
      if (!p) return onWeather({ error: `Couldn't find "${city}". Check weatherCity in settings.` });
      const q = new URLSearchParams({ latitude: p.lat, longitude: p.lon, current: "temperature_2m,weather_code,is_day", temperature_unit: unit === "F" ? "fahrenheit" : "celsius" });
      const c = (await (await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)).json()).current;
      const [icon, label] = describe(c.weather_code, c.is_day === 1);
      onWeather({ place: p.name, temp: Math.round(c.temperature_2m), unit: unit === "F" ? "F" : "C", icon, label });
    } catch (e) { console.warn("weather", e.message); }
  };
  run();
  timer = setInterval(run, 15 * 60 * 1000);
}

module.exports = { poll };
