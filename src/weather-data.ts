import {params} from "./params";
import {calculateGroundSunExposureIndex, calculateSolarElevation, lerp, range, rotate} from "./util";

const TAU = Math.PI * 2;

interface RawWeatherData {
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    precipitation_probability: number[];
    precipitation: number[];
    sunshine_duration: number[];
  };
  minutely_15: {
    time: string[];
    sun_incidence: number[];
    shortwave_radiation: number[];
    terrestrial_radiation: number[];
    sunshine_duration: number[];
    relative_humidity_2m: number[];
    precipitation: number[];
    apparent_temperature: number[];
  };
}
interface RawHour {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  precipitation_probability: number;
  precipitation: number;
  sunshine_duration: number;
}
interface RawQuarter {
  time: string;
  sun_incidence: number;
  shortwave_radiation: number;
  sunshine_duration: number;
  relative_humidity_2m: number;
  precipitation: number;
  apparent_temperature: number;
  freezing_level_height: number;
}
export interface WeatherData {
  byHour: HourlyData[]
}
interface HourlyData {
  date: Date;
  temperature: number;
  apparent_temperature: number;
  relative_humidity: number;
  precipitation_probability: number;
  precipitation: number;
  hour_index: number;
  sunshine: number;
  cloud_cover: number;
  cloud_cover_mid: number;
  cloud_cover_high: number;
  cloud_cover_by_alt: CloudCover[];
  thickest_alt: number;
  quarterly: QuarterlyData[];
}
interface CloudCover {
  altitude: number;
  cover: number;
}
interface QuarterlyData {
  date: Date;
  // halfway through the quarter
  mid_date: Date;
  quarter_index: number;
  hour_index: number;
  terrestrial_radiation: number;
  shortwave_radiation: number;
  sunshine_duration: number;
  relative_humidity: number;
  precipitation: number;
  apparent_temperature: number;
  sunshine: number;
  gsei: number;
  is_day: number | boolean;
  cloud_cover_by_alt: CloudCover[];
  cloud_cover_mid: number;
  cloud_cover_high: number;
  solar_elevation: number;
  thickest_alt: number;
  freezing_level_height: number;
}

export function processWeatherData(raw: RawWeatherData) {
  const result: WeatherData = {
    byHour: [],
  }
  
  if (
    !Object.values(params.hourly_property_map).every(k => k in raw.hourly)
    || !Object.values(params.quarterly_property_map).every(k => k in raw.minutely_15)
  ) {
    throw new Error('missing properties in raw data')
  }

  // some values actually refer to previous data point
  {
    const quartlerly_prev: (keyof RawWeatherData['minutely_15'])[] = [
      'sunshine_duration',
      'precipitation',
      'terrestrial_radiation',
      'shortwave_radiation',
    ]

    for (const key of quartlerly_prev) {
      // rotate is technically incorrect, but we don't really care about the value at midnight the next day
      // @ts-ignore
      raw.minutely_15[key] = rotate(raw.minutely_15[key]);
    }

    const hourly_prev: (keyof RawWeatherData['hourly'])[] = [
      'precipitation',
      'precipitation_probability',
    ]

    for (const key of hourly_prev) {
      // rotate is technically incorrect, but we don't really care about the value at midnight the next day
      // @ts-ignore
      raw.hourly[key] = rotate(raw.hourly[key]);
    }
  }
  
  for (let i = 0; i < raw.hourly.time.length; ++i) {
    const time = new Date(raw.hourly.time[i]);

    // only display this hour +23hrs
    if (+time < Date.now() - 3600_000) {
      continue;
    }
    if (+time > Date.now() + 23 * 3600_000 ) {
      break;
    }
    
    const raw_hour = Object.fromEntries(
      Object.entries(raw.hourly)
        .map(([k, vs]) => [k, vs[i]])
      ) as object as RawHour;
    const raw_quarters = range(4).map(n => {
      const q = {
        ...Object.fromEntries(
            Object.entries(raw.minutely_15)
              .map(([k, vs]) => [k, vs[i*4 + n]])
          ),
        quarter_index: n,
      }
      return q;
    }) as object[] as RawQuarter[];
    
    const h = Object.fromEntries(
      Object.entries(params.hourly_property_map)
      .map(([k, v]) =>
        // @ts-ignore
        [k, raw_hour[v]]
      )) as object as HourlyData;

    h.date = time;
    h.hour_index = time.getHours();
    h.sunshine = raw_hour.sunshine_duration / 3600 * 100;
    
    const altitude_cover_map = [];
    let thickest_alt = 0;
    for (let p = params.cloud_max_hPa; p >= params.cloud_min_hPa; p -= params.cloud_resolution_hPa) {
      // @ts-ignore
      const cover = raw_hour[`cloud_cover_${p}hPa`];
      // @ts-ignore
      const altitude = raw_hour[`geopotential_height_${p}hPa`]!;
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

      // higher clouds have less chance of actually being thick, so lower cover weight.
      const alt_factor = (alt - params.cloud_start_alt) / (params.cloud_end_alt - params.cloud_start_alt);
      const weighed = max_cover * (1-alt_factor)**2;
        
      if (weighed > thickest_cover) {
        // important that we go from low to high clouds, so lower take precedence for rain.

        thickest_cover = weighed;
        thickest_alt = alt;
      }
    }
    h.thickest_alt = thickest_alt;
    
    h.quarterly = (raw_quarters
        .map(rq => Object.fromEntries(
          Object.entries(params.quarterly_property_map)
          .map(([k, v]) =>
            // @ts-ignore
            [k, rq[v]]))) as object as QuarterlyData[])
        .map((q,i) => {
          q as QuarterlyData;
          q.date = new Date(raw_quarters[i].time);
          q.mid_date = new Date(+q.date + 15 * 60_000);
          q.is_day = q.terrestrial_radiation > 0;
          q.sunshine = q.sunshine_duration / 3600 * 4 * 100;
          q.solar_elevation = calculateSolarElevation(q.mid_date); // deg
          q.gsei = calculateGroundSunExposureIndex(q.shortwave_radiation, q.terrestrial_radiation);
          q.quarter_index = i; 
          q.hour_index = h.hour_index;

          return q;
        }) as object[] as QuarterlyData[];
    
    result.byHour[h.hour_index] = h;
  }
  
  // calculations dependent on future forecast, e.g. quarterly clouds
  for(let hi = 0; hi < result.byHour.length; ++hi) {
    const h = result.byHour[hi];

    // daylight savings, hour skipped
    if (!h) continue;

    let nh = result.byHour[(hi + 1) % result.byHour.length];
    // due to daylight savings, it might be next next hour
    if (!nh) nh = result.byHour[(hi + 2) % result.byHour.length];

    for (let qi = 0; qi < 4; ++qi) {
      const q = h.quarterly[qi];
      const useful_hour = qi < 2 ? h : nh;
      
      q.cloud_cover_by_alt = useful_hour.cloud_cover_by_alt;
      q.cloud_cover_mid = useful_hour.cloud_cover_mid;
      q.cloud_cover_high = useful_hour.cloud_cover_high;

      q.thickest_alt = useful_hour.thickest_alt;
    }
  }

  // easier debugging
  (window as any).weather_data = result;

  return result;
}
export async function getWeatherData(tries = 0): Promise<WeatherData> {
  if (tries >= 2) {
    throw new Error('tried too many times');
  }
  if (params.use_demo_weather) {
    await (new Promise((r) => setTimeout(r, 100)));
    return genDemoWeather();
  }
  
  
  const raw = await getRawWeatherData();

  // easier debugging
  (window as any).raw_weather = raw;
  
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
function genDemoWeather(): WeatherData {
  const result: WeatherData = {
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
      cloud_cover: lerp(r(), 0, 100),
    } as object as HourlyData;
    
    h.quarterly = range(4).map((n) => {
      const offset = (n/4)/24;

      // TODO make demo weather work again
      const q: QuarterlyData = {
        date: new Date(`2025-3-21T${i}:${n*15}`),
        apparent_temperature: lerp(r(offset), -20, 50),
        terrestrial_radiation: lerp(Math.max(Math.sin((ratio + offset) * TAU - TAU/4),0), 0, 850),
        quarter_index: n,
        gsei: 0,
      } as QuarterlyData;
      // TODO make affected by clouds
      q.gsei = Math.min(q.terrestrial_radiation, 150) / 150 * 100;

      return q;
    });
    
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

      q.sunshine = Math.min(q.terrestrial_radiation, 100 - Math.max(cloud_cover - 50, 0));
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
