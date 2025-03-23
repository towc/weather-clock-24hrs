import {params} from "./params";
import {calculateGroundSunExposureIndex, calculateSolarElevation, gradient, lerp, range} from "./util";

const TAU = Math.PI * 2;

export function processWeatherData(raw) {
  const result = {
    byHour: [],
  }
  
  if (
    !Object.values(params.hourly_property_map).every(k => k in raw.hourly)
    || !Object.values(params.quarterly_property_map).every(k => k in raw.minutely_15)
  ) {
    throw new Error('missing properties in raw data')
  }
  
  for (let i = 0; i < raw.hourly.time.length; ++i) {
    const time = new Date(raw.hourly.time[i]);

    // only display this hour +23hrs
    if (time < Date.now() - 3600_000) {
      continue;
    }
    if (time > Date.now() + 23 * 3600_000 ) {
      break;
    }
    
    const raw_hour = Object.fromEntries(
      Object.entries(raw.hourly)
        .map(([k, vs]) => [k, vs[i]])
      );
    const raw_quarters = range(4).map(n => {
      const q = {
        ...Object.fromEntries(
            Object.entries(raw.minutely_15)
              .map(([k, vs]) => [k, vs[i*4 + n]])
          ),
        quarter_index: n,
      }
      return q;
    });
    
    const prev_hour_res = result.byHour[result.byHour.length - 1];
    
    const hour = time.getHours()
    
    const h = Object.fromEntries(Object.entries(params.hourly_property_map).map(([k, v]) => [k, raw_hour[v]] ))
    h.date = time;
    h.hour_index = time.getHours();
    h.sunshine = raw_hour.sunshine_duration / 3600 * 100;
    
    const altitude_cover_map = [];
    let thickest_alt = 0;
    for (let p = params.cloud_max_hPa; p >= params.cloud_min_hPa; p -= params.cloud_resolution_hPa) {
      const cover = raw_hour[`cloud_cover_${p}hPa`];
      // technically ASL and not AGL, but resolution is low enough that doesn't matter for our purposes
      const altitude = raw_hour[`geopotential_height_${p}hPa`];
      altitude_cover_map.push({ altitude, cover });
    }

    h.cloud_cover_by_alt = [];
    let thickest_cover = 0;
    for (let alt = params.cloud_start_alt; alt <= params.cloud_end_alt; alt += params.cloud_resolution) {
      const start = alt;
      const end = alt + params.cloud_resolution;
      const all_in_range = altitude_cover_map.filter(({ altitude }) => start < altitude && altitude <= end);
      const max_cover = all_in_range.reduce((acc, { cover }) => Math.max(acc, cover), 0);
      h.cloud_cover_by_alt.push({ altitude: alt, cover: max_cover });

      if (max_cover > thickest_cover) {
        // important that we go from low to high clouds, so lower take precedence for rain.

        // higher clouds have less chance of actually being thick, so lower cover weight.
        const weighed = max_cover * gradient(alt, [
          [params.cloud_start_alt, 1],
          [params.cloud_end_alt, 0],
        ]);
        
        thickest_cover = weighed;
        thickest_alt = alt;
      }
    }
    h.thickest_alt = thickest_alt;
    
    h.quarterly = raw_quarters
        .map(rq => Object.fromEntries(Object.entries(params.quarterly_property_map).map(([k, v]) => [k, rq[v]])))
        .map((q,i) => {
          q.date = new Date(raw_quarters[i].time);
          q.is_day = q.sun_incidence > 0;
          q.sunshine = q.sunshine_duration / 3600 * 4 * 100;
          q.sun = Math.min(q.sun_incidence, 400) / 400 * 100;
          q.solar_elevation = calculateSolarElevation(q.date); // deg
          q.gsei = calculateGroundSunExposureIndex(q.shortwave_radiation, q.sun_incidence, q.date);
          q.quarter_index = i; 
          q.hour_index = h.hour_index;

          return q;
        });
    
    result.byHour[hour] = h;
  }
  
  // calculations dependent on future forecast, e.g. quarterly clouds
  for(let hi = 0; hi < result.byHour.length; ++hi) {
    const h = result.byHour[hi];
    const nh = result.byHour[(hi + 1) % result.byHour.length];
    
    for (let qi = 0; qi < 4; ++qi) {
      const q = h.quarterly[qi];
      // useful hour
      const uh = qi < 2 ? h : nh;
      
      q.cloud_cover_by_alt = uh.cloud_cover_by_alt;
      q.thickest_alt = uh.thickest_alt;
    }
  }

  return result;
}
export async function getWeatherData(tries = 0) {
  if (tries >= 3) {
    throw new Error('tried too many times');
  }
  if (params.use_demo_weather) {
    await (new Promise((r) => setTimeout(r, 100)));
    return genDemoWeather();
  }
  
  
  const raw = await getRawWeatherData();
  
  try {

    return processWeatherData(raw);
  } catch (e) {
    // might have been bad cache
    params.cache_weather_data = false;
    const res = await getWeatherData(tries + 1);
    params.cache_weather_data = true;
    return res;
  }
}
function genDemoWeather() {
  const result = {
    byHour: [],
  }
  
  for (let i = 0; i < 24; ++i) {
    const ratio = i / 24;
    const r = (ratio_offset=0, d=.05) =>
      Math.min(Math.max(
        ratio + ratio_offset + Math.random() * d * 2 - d,
        0), 1);

    const h = {
      time: `2025-3-21T${i}:00`,
      temperature: lerp(r(), -20, 50),
      precipitation_probability: lerp((r(.01) * 4)%1, 10, 100),
      cloud_cover_low: Math.max(Math.sin(r(0,.1) * TAU * 4), 0) * 100,
      cloud_cover_mid: Math.max(Math.sin(r(0,.1) * TAU * 4), 0) * 100,
      cloud_cover_high: Math.max(Math.sin(r(0,.1) * TAU * 4), 0) * 100,
      visibility: lerp(r(), 0, 10),
      wind_speed: lerp(r(), 0, 20),
      hour_index: i % 24,
    };
    
    // not technically true
    h.cloud_cover = Math.max(
      h.cloud_cover_low,
      Math.max(h.cloud_cover_mid,
               h.cloud_cover_high));
    
    h.quarterly = range(4).map((n) => {
      const offset = (n/4)/24;

      const q = {
        time: `2025-3-21T${i}:${n*15}`,
        // TODO CONTINUE FROM HERE calc gsei instead of using sunshine_duration
        apparent_temperature: lerp(r(offset), -20, 50),
        sun_incidence: lerp(Math.max(Math.sin((ratio + offset) * TAU - TAU/4),0), 0, 850),
        quarter_index: n,
      }
      q.sun = Math.min(q.sun_incidence, 150) / 150 * 100;
      // TODO make affected by clouds
      q.gsei = q.sunshine;

      return q;
    })
    
    result.byHour[i] = h;
  }
  
  // some values depend on hours that hadn't been calculated
  for (let hi = 0; hi < result.byHour.length; ++hi) {
    const h = result.byHour[hi];
    const nh = result.byHour[(hi + 1) % 24];
    
    const ratio = hi / 24;
    const r = (ratio_offset=0, d=.05) =>
      Math.min(Math.max(
        ratio + ratio_offset + Math.random() * d * 2 - d,
        0), 1);
    
    for (let qi = 0; qi < 4; ++qi) {
      const offset = qi/4/24;
      
      const q = h.quarterly[qi];
      
      const cloud_cover = qi >= 2 ? nh.cloud_cover : h.cloud_cover;

      q.sunshine = Math.min(q.sun, 100 - Math.max(cloud_cover - 50, 0));
      q.is_day = q.sunshine > 0;
      q.precipitation = cloud_cover > 80 
        ? Math.max(Math.sin((r(offset,.01) * 2) * TAU * 4) * cloud_cover / 100 * 5 + 5, 0) 
        : 0;
      q.relative_humidity = lerp(r(offset), q.precipitation > .1 ? 50 : 0, 100);
    }
    
    h.precipitation = h.quarterly.reduce((sum, q) => sum + q.precipitation, 0) / 4;
    h.relative_humidity = h.quarterly.reduce((sum, q) => sum + q.relative_humidity, 0) / 4;
  }
  
  return result;
}
async function getRawWeatherData() {
  if (params.cache_weather_data) {
    try {
      if (!localStorage.raw_weather) throw new Error('no data saved');
      const oldData = JSON.parse(localStorage.raw_weather);
      const minutesCache = 20;
      if (Date.now() < oldData.timestamp + minutesCache * 60_000) {
        // a bit wasteful, but if it's not compatible, this will error so we can fetch it again
        processWeatherData(oldData);
        
        return oldData;
      }
    } catch (e) {
      console.log('failed getting or using cached data:');
      console.error(e);
    }
  }
  
  const hourly_params = Object.values(params.hourly_property_map);
  
  for (let p = params.cloud_max_hPa; p >= params.cloud_min_hPa; p -= params.cloud_resolution_hPa) {
    hourly_params.push(
      `cloud_cover_${p}hPa`,
      `geopotential_height_${p}hPa`,
    )
  }
  
  const url_params = {
    latitude: params.latitude,
    longitude: params.longitude,
    // no cloud cover for 15-minutely, and can use overall values to display numbers
    hourly: hourly_params.join(','),
    minutely_15: Object.values(params.quarterly_property_map).join(','),
    timezone: "auto",
    forecast_days: 2, 
  }
  const request_url = 'https://api.open-meteo.com/v1/forecast?' + Object.entries(url_params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  
  const raw_weather = await fetch(request_url).then(r => r.json());
  
  raw_weather.timestamp = Date.now();

  localStorage.raw_weather = JSON.stringify(raw_weather);
  
  return raw_weather;
}
