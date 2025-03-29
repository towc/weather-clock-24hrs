import { metersTohPa } from "./util";

const TAU = Math.PI * 2;

const TO_BE_DEFINED: number = NaN;

const params = {
  // weather config
  latitude: 48.1702,
  longitude: 17.2127,
  cache_weather_data: true,
  use_demo_weather: false,
  
  // general clock config
  startDate: new Date().toISOString(),
  showHands: true,
  progressTime: true,
  showSecHand: true,
  smoothSecHandMovement: false,
  timeSpeed: 1,

  // specific clock config
  radiusHour: TO_BE_DEFINED,
  radiusHourText: 46,
  radiusHourTextSmall: 44.5,
  sunDistance: TO_BE_DEFINED,
  sunRadius: TO_BE_DEFINED,
  hourTickLength: 2,
  hourTickSmallLength: 1.2,
  sixthTickLength: .8,
  sixthTickSmallLength: .5,
  sixthTickWidth: .2,
  sixthTickSmallWidth: .15,
  textSizeHour: 4,
  textSizeHourSmall: 2.8,
  phaseHour: TAU/4,
  backboardColor: '#eee',
  bgImage: false, // 'https://t2.ea.ltmcdn.com/en/posts/5/1/4/types_and_breeds_of_husky_dogs_1415_600_square.jpg',
  bgImageOpacity: .5,
  shadowCSS: "filter: drop-shadow(0 0 1px #0008);",
  
  // weather display config
  display_start_r: TO_BE_DEFINED,
  ground_h: 3,
  precipitation_max_h: 4,
  sky_h: 15,
  sun_h: 8,
  display_end_r: 50,
  
  // weather text config
  temperature_text_h: 2, temperature_text_s: 1.5,
  temperature_feels_like_text_h: 2, temperature_feels_like_text_s: 2,
  cover_text_h: 3, cover_text_s: 1.2,
  precipitation_text_h: 2, precipitation_text_s: 1,
  humidity_text_h: 2, humidity_text_s: 1,
  label_text_s: 1,
  
  // weather fetch config
  cloud_resolution_hPa: 25, // doesn't go any lower with open-meteo
  cloud_max_hPa: 1000,
  cloud_min_hPa: TO_BE_DEFINED,
  cloud_resolution: 250,
  cloud_start_alt: 140, // bratislava
  cloud_end_alt: 306 * 8, // readjusted later to be a multiple
  hourly_property_map: {
    temperature: 'temperature_2m',
    apparent_temperature: 'apparent_temperature',
    relative_humidity: 'relative_humidity_2m',
    precipitation_probability: 'precipitation_probability',
    precipitation: 'precipitation',
    cloud_cover: 'cloud_cover',
    visbility: 'visibility',
    wind_speed: 'wind_speed_10m',
  },
  quarterly_property_map: {
    // some are repeats from hourly. We can use hourly for displayed numbers, and quarterly for arcs
    terrestrial_radiation: 'terrestrial_radiation',
    shortwave_radiation: 'shortwave_radiation',
    sunshine_duration: 'sunshine_duration',
    relative_humidity: 'relative_humidity_2m',
    precipitation: 'precipitation',
    apparent_temperature: 'apparent_temperature',
    freezing_level_height: 'freezing_level_height',
  }
};

params.display_start_r = params.display_end_r - params.ground_h - params.sky_h - params.sun_h;
params.cloud_min_hPa = metersTohPa(params.cloud_end_alt + params.cloud_resolution);
params.sunDistance = params.display_end_r - params.sun_h/2;
params.sunRadius = params.sun_h/4;
params.radiusHour = params.display_end_r - params.sun_h;

{
  const cloud_steps = Math.floor((params.cloud_end_alt - params.cloud_start_alt) / params.cloud_resolution);
  params.cloud_end_alt = params.cloud_start_alt + params.cloud_resolution * cloud_steps;
}

(window as any).toggleSpeed = () => {
  params.timeSpeed = params.timeSpeed === 1 ? 1000 : 1
}

export { params };
