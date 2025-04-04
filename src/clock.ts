import {params} from "./params";
import { cloud_sr_by_alt, svgGauge, svgPolarText, toNearest} from "./util";

const TAU = Math.PI * 2;

export function drawClock() {
  return `
    <g id=printable>
    ${drawBackboard()}
    <g id=weather-elements></g>
    </g>
    ${params.showHands ? drawHands() : ''}
    ${drawTicks()}
    <g id=weather-text></g>
  `
}

function drawBackboard() {
  const r = 50
  let result = `
    <circle r=${r+(50-r)/2} fill="${params.backboardColor}" />
    <circle r=.1 fill=black />
  `;

  if (params.bgImage) {
    result += `
      <defs>
        <pattern id=bg-image patternUnits=userSpaceOnUse x=${-r} y=${-r} width=${2*r} height=${2*r}>
          <image href="${params.bgImage}" x=0 y=0 width=100 height=100 />
        </pattern>
      </defs>

      <circle r=${r+(50-r)/2} fill="url(#bg-image)" fill-opacity="${params.bgImageOpacity}" />
    `;
  }

  return result;
}

function drawTicks() {
  let result = '';
  for (let i = 0; i < 24; i++) {
    const angle = i/24 * TAU + params.phaseHour;
    const tickSize = i % 3 === 0 ? params.hourTickLength : params.hourTickSmallLength;

    const d = params.radiusHour + tickSize/2;
    const x = d * Math.cos(angle);
    const y = d * Math.sin(angle);

    const ed = d - tickSize;
    const ex = ed * Math.cos(angle);
    const ey = ed * Math.sin(angle);

    const is_small = i % 3 !== 0;
    const radiusText = is_small ? params.radiusHourTextSmall : params.radiusHourText;

    let tr = radiusText + tickSize/2 - params.hourTickLength/2;

    // accomodate for the 24 under
    if (i % 3 !== 0) tr += .8;

    const tx = tr * Math.cos(angle);
    const ty = tr * Math.sin(angle);
    const ts = i % 3 === 0 ? params.textSizeHour : params.textSizeHourSmall;

    const blend_mode = 'difference'
    const color = 'white';

    result += `
      <line
        x1="${x}" y1="${y}" x2="${ex}" y2="${ey}" stroke-width=".25" 
        stroke="${color}" style="mix-blend-mode: ${blend_mode}"
      />
      <text 
        x="${tx}" y="${ty}"
        text-anchor="middle" dominant-baseline="middle"
        font-size=${ts} fill="${color}" style="mix-blend-mode: ${blend_mode}"
      >
        ${i}
      </text>
    `

    if (i === 0) {
      const tx = (radiusText + 2.5) * Math.cos(angle);
      const ty = (radiusText + 2.5) * Math.sin(angle);

      result += `
        <text
          x="${tx}" y="${ty}"
          text-anchor="middle" dominant-baseline="middle"
          font-size=${params.textSizeHour*0.5} fill="${color}" style="mix-blend-mode: ${blend_mode}"
        >
          24
        </text>
      `
    }

    const nd = 6
    for (let d = 1; d < nd; ++d) {
      const da = angle + d/nd/24 * TAU;
      const size = d % 3 === 0 ? params.sixthTickLength : params.sixthTickSmallLength;
      const width = d % 3 === 0 ? params.sixthTickWidth : params.sixthTickSmallWidth;

      const sd = params.radiusHour - size/2;
      const sx = sd * Math.cos(da);
      const sy = sd * Math.sin(da);

      const ed = params.radiusHour + size/2;
      const ex = ed * Math.cos(da);
      const ey = ed * Math.sin(da);

      result += `
        <line
          x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke-width="${width}"
          stroke="${color}" style="mix-blend-mode: ${blend_mode}"
        />
      `
    }
  }

  return result;
}

function drawHands() {
  
  let result = `<g id=hand-hour>`;
  
  const small_fade_angle = -(15/60)/24*TAU;
  // fade when nearing 24hrs
  {
    const fade_hours = 1;
    const full_faded_hours = 2;
    const visible_behind_hours = .25;

    const fade_angle = fade_hours / 24 * TAU + .01;
    const full_faded_angle = full_faded_hours / 24 * TAU;
    const visible_behind_angle = visible_behind_hours / 24 * TAU;

    const full_fade_start_angle = -visible_behind_angle - full_faded_angle;
    const fade_start_angle = full_fade_start_angle - fade_angle;

    const iterations = 20;
    const fa = fade_angle / iterations;
    
    const sr = params.display_start_r - .1;
    const er = params.display_end_r - params.sun_h + .01;

    const color = (alpha=1) => `rgba(238, 238, 238, ${alpha})`;

    // fade transition
    for (let i = 0; i < iterations; ++i) {
      const sa = fade_start_angle + fa * i;
      // TODO figure out smoother fade
      const ea = sa + fa - .0001;

      const alpha = -Math.cos(i/iterations * TAU/2) / 2 + .5;

      result += svgGauge(sa, ea, sr, er, color(alpha));
    }

    // full fade
    {
      const fsa = full_fade_start_angle - .01;
      const fea = small_fade_angle

      result += svgGauge(fsa, fea, sr, er, color());

      // small fade
      //result += svgGauge(fea, 0, sr, er, color(0));
    }
  }
  
  // legend
  {
    const ha = small_fade_angle;
    const ea = ha - ((10/60)/24*TAU);
    let dr = params.display_start_r;
    const nr = (height: number) => {
      dr += height;
      return dr;
    }

    label('temperature', params.ground_h, 1);
    
    const dr_before_sky = dr;
    let alt_oddness = 0;
    for (let alt = params.cloud_start_alt + params.cloud_resolution; alt <= params.cloud_end_alt; alt += params.cloud_resolution) {
      ++alt_oddness;
      if (alt_oddness % 2 === 1) continue;

      const lcr = cloud_sr_by_alt(alt);
      const lea = ea + (3/60)/24*TAU;

      const lsx = lcr * Math.cos(lea);
      const lsy = lcr * Math.sin(lea);

      const lex = lcr * Math.cos(ha);
      const ley = lcr * Math.sin(ha);

      const display_alt = toNearest(alt - params.cloud_start_alt, 50);

      result += svgPolarText(display_alt + ' m', lcr, lea - (3/60)/24*TAU, {
        size: 1.4,
        color: '#555',
        anchor: 'end',
        rotation: -4,
      })
      result += `
        <path
          d="M ${lsx} ${lsy} L ${lex} ${ley}"
          fill="none" stroke="#ccc" stroke-width="0.1"
        />
      `

      // height indicator for rest of clock
      result += svgGauge(small_fade_angle, TAU + small_fade_angle - .22, lcr, lcr + .01, '#0005')
    }
    dr = dr_before_sky + params.sky_h;

    result += svgPolarText('sun', params.display_end_r - 1, 0, { color: '#555', size: 1.2 })

    function label(text: string, height: number, size=1.2, color='#555') {
      const lsr = dr;
      const ler = nr(height);
      const lcr = (lsr + ler) / 2;

      const lsx = lsr * Math.cos(ha);
      const lsy = lsr * Math.sin(ha);

      const lcx = lcr * Math.cos(ea + .01);
      const lcy = lcr * Math.sin(ea + .01);

      const lex = ler * Math.cos(ha);
      const ley = ler * Math.sin(ha);

      const dx = text === 'sun' ? -1 : 0;

      result += svgPolarText(text, lcr, ea, { size, color, anchor: 'end', dx })
      if (text !== 'sun') {
        result += `
          <path
            d="M ${lsx} ${lsy} L ${lcx} ${lcy} L ${lex} ${ley}"
            fill="none" stroke="#ccc" stroke-width="0.1"
          />
        `
      }
    }
  }
  
  // hand proper
  {
    // circle distance
    const cd = params.sunDistance;
    // circle radius
    const cr = params.sunRadius;
    
    const sx = params.display_start_r;
    const ex = cd - cr;
    const w = .2;
    result += `
      <line
        x1="${sx}" y1=0 x2=${ex} y2=0
        stroke-width="${w}"
        stroke="#f66"
      />
      <circle 
          cx=${cd} cy=0 r=${cr}
          fill="white" style="mix-blend-mode: difference; cursor:pointer"
          onclick="toggleSpeed()"
      />
    `
  }

  // cap at center
  {
    result += `
      </g>
      <circle cx=0 cy=0 r=1.3 fill=#f8f8f8 stroke-width=.1 stroke=#aaa
          onclick="resetWeatherCache()" style="cursor:pointer" />
    `;
  }
  
  return result;
}

export function updateHands(state: object, msSinceStartOfDay: number) {
  const period = 1000 * 60 * 60 * 24;
  const angle = (msSinceStartOfDay % period) / period * TAU + params.phaseHour;
  const angleDeg = angle / TAU * 360;

  document.getElementById('hand-hour')!.setAttribute('transform', `rotate(${angleDeg})`);

  // @ts-ignore
  state.lastUpdate = msSinceStartOfDay;
}
