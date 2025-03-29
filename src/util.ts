import { params } from './params'; 

const TAU = Math.PI * 2;

type Stops = [number, number][]
type Multistops = number[][]
export function gradients(value: number, stops: Multistops) {
  // @ts-ignore
  const [K, ...Vs] = stops[0];
  return Vs.map((_,i) =>
    gradient(value, stops.map(s => [s[0], s[i+1]])));
}
export function gradient(value: number, stops: Stops) {
  const [K, V] = [0, 1]
  if (value < stops[0][K]) {
    return stops[0][V]
  }
  
  for (let i = 1; i < stops.length; ++i) {
    const curr = stops[i]
    
    if (value > curr[K]) continue;
      
    const prev = stops[i-1]
    const ratio = unlerp(value, prev[K], curr[K]);
    return lerp(ratio, prev[V], curr[V])
  }
  
  return stops[stops.length - 1][V];
}
export function lerp(ratio: number, s: number, e: number) {
  const d = e - s;
  return s + d*ratio;
}
export function unlerp(v: number, s: number, e: number) {
  return (v-s)/(e-s);
}
interface SvgPolartextOpts {
  size?: number;
  color?: string;
  anchor?: string;
  baseline?: string;
  dx?: number;
  dy?: number;
  rotation?: number;
}
export function svgPolarText(text: string | number, r: number, a: number, opts: SvgPolartextOpts = {}) {
  const {
    size = 1,
    color = "black",
    anchor = "middle",
    baseline = "middle",
    dx = 0,
    dy = 0,
    rotation = 0,
  } = opts;
  const x = r * Math.cos(a);
  const y = r * Math.sin(a);
  
  const deg = (a/TAU * 360) % 360;
  
  // switching sides causes more confusion than help
  // if (deg > .01 && deg <= 179.99) {
  //   if (anchor === "end") anchor = "start";
  //   else if (anchor === "start" ) anchor = "end";
  // }
  // const align_deg = deg > 0.01 && deg <= 179.99 ? -90 : 90;
  
  return `
    <g transform="translate(${x}, ${y}) rotate(${deg})">
      <text text-anchor="${anchor}" dominant-baseline="${baseline}"
            font-size=${size} fill="${color}"
            transform="rotate(${90 + rotation})"
            dx="${dx}" dy="${dy}"
            >
        ${text}
      </text>
    </g>
  `
}
export function svgText(text: string | number, cx: number, cy: number, size=1, color="black") {
  return `
    <text x="${cx}" y="${cy}"
          text-anchor="middle" dominant-baseline="middle"
          font-size=${size} fill="${color}">
      ${text}
    </text>
  `
}
export function svgGauge(sa: number, ea: number, sr: number, er: number, color: string, props: string = '') {
  er += .05;
  ea += .001;
  const w = er - sr;
  const a = ea - sa;

  // using transform instead of drawing arc at location so patterns are still polar
  return `
    <path 
      d="${svgArc(0, 0, sr+w/2, 0, a)}" 
      stroke="${color}" stroke-width=${w} fill=none
      transform="rotate(${radToDeg(sa)})"
      ${props}
    />
  `
}
export function svgArc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterClockwise=false, move_or_line='M') {
  // modified from https://github.com/gliffy/canvas2svg/blob/master/canvas2svg.js#L1008
  
  // in canvas no circle is drawn if no angle is provided.
  if (startAngle === endAngle) {
      return;
  }
  startAngle = startAngle % TAU;
  endAngle = endAngle % TAU;
  if (startAngle === endAngle) {
      //circle time! subtract some of the angle so svg is happy (svg elliptical arc can't draw a full circle)
      endAngle = ((endAngle + TAU) - 0.001 * (counterClockwise ? -1 : 1)) % TAU;
  }
  
  let endX = x+radius*Math.cos(endAngle),
      endY = y+radius*Math.sin(endAngle),
      startX = x+radius*Math.cos(startAngle),
      startY = y+radius*Math.sin(startAngle),
      sweepFlag = counterClockwise ? 0 : 1,
      largeArcFlag = 0,
      diff = endAngle - startAngle;

  // https://github.com/gliffy/canvas2svg/issues/4
  if (diff < 0) {
      diff += TAU;
  }

  if (counterClockwise) {
      largeArcFlag = diff > TAU/2 ? 0 : 1;
  } else {
      largeArcFlag = diff > TAU/2 ? 1 : 0;
  }
  
  const [r, sx, sy, ex, ey] =
        [radius, startX, startY, endX, endY].map(x => x.toFixed(3));

  const result = `
    ${move_or_line} ${sx} ${sy}
    A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${ex} ${ey}
  `
  
  return result
}
export function hourToAngle(hour_index: number) {
   return hour_index / 24 * TAU + TAU/4;
}
// (1.1).toFixed(4) === "1.1000" instead of "1.1"
// (1).toFixed(4) === "1.0000" instead of "1"
export function toFixedOrSkip(n: number, p: number) {
  const fixed = n.toFixed(p);
  const regex_result = n.toFixed(p).match(/^(\d+\.\d+?)0*$/);
  if (!regex_result) return fixed;
  
  const [_, might_trail_once] = regex_result;
  if (might_trail_once.endsWith('.0')) return might_trail_once.split('.')[0];
  return might_trail_once;
}
export function range(n: number) {
  return Array(n).fill(0).map((_,i) => i)
}
export function degToRad(deg: number) { return deg * (Math.PI / 180); }
export function radToDeg(rad: number) { return rad * (180 / Math.PI); }
export function calculateSolarElevation(date: Date) {
    const { latitude, longitude } = params;
    // modified from chatgpt
    
    const dayOfYear = Math.floor((+date - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
    const hourUTC = date.getUTCHours() + date.getMinutes() / 60;
    
    // Equation of Time correction (approximate, in minutes)
   const B = degToRad((360 / 365) * (dayOfYear - 81));
    const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    
    // Local Solar Time without time zone offset
    const solarTimeOffset = (4 * longitude) / 60; // Convert minutes to hours
    const localSolarTime = hourUTC + solarTimeOffset + EoT / 60;
    
    // Solar declination angle (approximate formula)
    const declination = 23.45 * Math.sin(degToRad((360 / 365) * (dayOfYear - 81)));
    
    // Hour angle (15 degrees per hour from solar noon)
    const hourAngle = 15 * (localSolarTime - 12);
    
    // Convert values to radians
    const latRad = degToRad(latitude);
    const decRad = degToRad(declination);
    const haRad = degToRad(hourAngle);
    
    // Solar elevation angle formula
    const sinElevation = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
    const elevation = radToDeg(Math.asin(sinElevation));
    
    return elevation; // Ensure no negative elevation (i.e., nighttime)
}
export function calculateGroundSunExposureIndex(shortwave_radiation: number, terrestrial_radiation: number) {
  // modified from chatgpt
  const I_actual = shortwave_radiation;
  const I_TOA = terrestrial_radiation;
    
  if (I_TOA <= 0) {
      return 0; // No sunlight at night or invalid TOA radiation
  }
  
  // max shortwave/max terrestrial
  // in practice varies depending on season too
  const bratislava_constant = 685/925;
  const GSEI = I_actual / I_TOA * bratislava_constant;

  // exponent not physical, but for visual purposes is more intuitive
  return GSEI * 100;
} 
export function hPaToMeters(pressure: number) {
  const P0 = 1013.25;  // Standard sea-level pressure in hPa
  const T0 = 288.15;   // Standard sea-level temperature in Kelvin (15°C)
  const L = 0.0065;    // Temperature lapse rate (K/m)
  const R = 8.3144598; // Universal gas constant (J/(mol·K))
  const g = 9.80665;   // Gravity (m/s²)
  const M = 0.0289644; // Molar mass of Earth's air (kg/mol)

  return ((T0 / L) * (1 - Math.pow(pressure / P0, (R * L) / (g * M))));
}
export function metersTohPa(altitude: number): number {
  const P0 = 1013.25;  // Standard sea-level pressure in hPa
  const T0 = 288.15;   // Standard sea-level temperature in Kelvin (15°C)
  const L = 0.0065;    // Temperature lapse rate (K/m)
  const R = 8.3144598; // Universal gas constant (J/(mol·K))
  const g = 9.80665;   // Gravity (m/s²)
  const M = 0.0289644; // Molar mass of Earth's air (kg/mol)

  return P0 * Math.pow(1 - (L * altitude) / T0, (g * M) / (R * L));
}

export function cloud_sr_by_alt(alt: number) {
  const sky_sr = params.display_start_r + params.ground_h;
  return gradient(alt, [
      [params.cloud_start_alt, sky_sr],
      [params.cloud_end_alt + params.cloud_resolution, sky_sr + params.sky_h],
    ])
}
export function cloud_er_by_alt(alt: number) {
  return cloud_sr_by_alt(alt + params.cloud_resolution)
}
export function sky_rgb(solarElevation: number): {r: number, g: number, b: number} {
  // modified from ChatGPT

  // Clamp solar elevation between -10 and 90 degrees for smooth transition
  const clampedElevation = Math.max(-10, Math.min(90, solarElevation));
  
  // Normalize to range [0,1] where -10 -> 0 and 90 -> 1
  const t = gradient(clampedElevation, [
      [-10, 0],
      [10, 1],
  ]);

  // Interpolate RGB values based on elevation
  // Night (deep blue) to Sunrise/Sunset (orange-pink) to Day (bright blue)
  let r = 255 * Math.max(0, Math.min(1, -4 * Math.pow(t - 0.5, 2) + 1)) * (1 - t); // Reduce red component at noon
  let g = 180 * Math.sqrt(t); // Greenish-blue component, more in daytime
  let b = 255 * Math.sqrt(t); // Blue intensity, stronger in daytime

  // dark blue at night
  g += gradient(solarElevation, [
    [-10, 10],
    [0, 0],
  ]);
  r += gradient(solarElevation, [
    [-10, 10],
    [0, 0],
  ]);

  if (solarElevation < 0) {
    const night_sat = .8;

    r = lerp(r/255, 0, 255 * night_sat);
    g = lerp(g/255, 0, 255 * night_sat);
    b = lerp(b/255, 0, 255 * night_sat);

    b += gradient(solarElevation, [
      [-90, 50],
      [-10, 50],
      [0, 0],
    ]);
  }
  
  return {r, g, b};
}
export function toNearest(n: number, step: number): number {
  return Math.round(n / step) * step
}
