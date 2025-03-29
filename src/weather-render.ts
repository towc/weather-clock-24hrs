import {params} from "./params";
import {cloud_er_by_alt as cloud_end_dist_by_alt, cloud_sr_by_alt as cloud_start_dist_by_alt, gradient, gradients, hourToAngle, lerp, sky_rgb, svgGauge, svgPolarText, toFixedOrSkip, toNearest} from "./util";
import {WeatherData} from "./weather-data";

const TAU = Math.PI * 2;

export function drawWeatherElements(weather: WeatherData, time: number) {
  let result = ``;
  const svg_patterns: Record<string, string> = {};
  let textResult = ``;

  if (weather.byHour.length === 0) {
    console.log('no weather data yet')
    return {
      svg: '',
      text: '',
    };
  }

  // TODO make timezone-indipendent. This will bite me in DST
  const nearest_hour_index = new Date(time - 3600_000/2).getHours();

  const last_nearest_hour_index = (nearest_hour_index + 23) % 24;
  const last_last_nearest_hour_index = (last_nearest_hour_index + 23) % 24;

  for (let hi = 0; hi < weather.byHour.length; ++hi) {
    const h = weather.byHour[hi];

    // in reality, the start angle should be 30mins before for hourly data
    // but it will create more confusion if I do that. Text is still correct
    const start_angle = hourToAngle(hi)
    const end_angle = hourToAngle(hi + 1) + .0001;

    // daylight savings, hour skipped
    if (!h) {
      result += svgGauge(start_angle, end_angle, params.display_start_r, params.display_end_r, 'black');

      const text_angle = (start_angle + end_angle) / 2;
      const text_line_angle = .08;
      const text_radius = lerp(.4, params.display_start_r, params.display_end_r);

      result += svgPolarText('daylight', text_radius, text_angle + text_line_angle/2, {
        color: 'white',
        size: 2,
        rotation: 90,
      });
      result += svgPolarText('savings', text_radius, text_angle - text_line_angle/2, {
        color: 'white',
        size: 2,
        rotation: 90,
      });
      
      continue;
    }

    const is_nearest_hour = nearest_hour_index === hi;
    const is_last_nearest_hour  = last_nearest_hour_index === hi;
    const is_last_last_nearest_hour = last_last_nearest_hour_index === hi;

    const render_text = !is_last_nearest_hour && !is_last_last_nearest_hour;


    let dr = params.display_start_r;
    const er_h = (height: number) => {
      dr += height;
      return dr;
    }
    let tr = params.display_start_r;
    const tr_h = (height: number) => {
      tr -= height;
      return tr;
    }

    // ground: gsei/temperature [°C]
    // displayed numbers are temperature, colors are apparent_temperature
    {
      const sr = dr;
      const er = er_h(params.ground_h);

      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, start_angle, end_angle);
        const qea = qsa + (.25/24 * TAU);

        const [hue, sat, light] = gradients(q.apparent_temperature, [
          [-10, 184, 50, 100],
          [0, 184, 50, 60],
          [40, 0, 50, 60],
        ])

        const gsei_factor = gradient(q.gsei, [
          [0, .4],
          [40, 1],
        ])

        const color = `hsl(${hue},${sat}%,${light * gsei_factor}%)`;

        result += svgGauge(qsa, qea, sr, er, color)
      }

      label('°C', Math.round(h.temperature) + '°', params.temperature_text_h, params.temperature_text_s, 'black');
      label('feels like',
        Math.round(h.apparent_temperature) + '°',
        params.temperature_feels_like_text_h,
        params.temperature_feels_like_text_s,
        'black');
    }


    const sky_sr = dr;
    // sky
    {

      er_h(params.sky_h);

      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, start_angle, end_angle);
        const qea = qsa + (.25/24 * TAU) + .001;

        const rgb = sky_rgb(q.solar_elevation)

        // go through clouds and transition between sky_color and gsei color depending on coverage at each level
        let shade_groups: { sr: number, er: number, cover: number, shade: number }[] = [];
        let cumulative_cover = 0;
        for (const { cover , altitude } of q.cloud_cover_by_alt) {
          const csr = cloud_start_dist_by_alt(altitude);
          const cer = cloud_end_dist_by_alt(altitude);

          shade_groups.unshift({ sr: csr, er: cer, cover, shade: 0 });
          cumulative_cover += cover;
        }

        if (cumulative_cover < 20) {
          // no significant clouds, shade comes from higher clouds, so paint from above

          for (let si = 0; si < shade_groups.length; ++si) {
            const group = shade_groups[si];

            if (si === 0) {
              group.shade = 1;
            }

            group.cover = 0;
          }
        }

        // consolidate with previous
        for (let si = 1; si < shade_groups.length; ++si) {
          const group = shade_groups[si];
          const prev = shade_groups[si - 1];

          if (group.cover === 0) {
            prev.sr = group.sr;
            shade_groups.splice(si, 1);
            --si;
            continue;
          }
        }

        if (cumulative_cover >= 20) {
          // calc shade 
          let cumulative_shade = 0;
          for (let si = 0; si < shade_groups.length; ++si) {
            const group = shade_groups[si];

            group.shade = cumulative_shade + (1 - cumulative_shade) * group.cover/cumulative_cover;
            cumulative_shade = group.shade;
          }

          // normalize
          const max_shade = shade_groups[shade_groups.length - 1].shade;
          for (let si = 0; si < shade_groups.length; ++si) {
            const group = shade_groups[si];

            group.shade /= max_shade;
          }

        }

        if (q.solar_elevation < 0) {
          shade_groups = [{ sr: sky_sr, er: dr, cover: 0, shade: 1 }];
        }

        const base_brightness = gradient(q.gsei, [
          [0, .5],
          [1, .6],
          [30, 1],
        ])
        for (const { sr, er, shade } of shade_groups) {
          const {r, g, b} = rgb;
          const brightness = lerp(shade, 1, base_brightness);
          const color = `rgb(${r * brightness}, ${g * brightness}, ${b * brightness})`;
          result += svgGauge(qsa, qea, sr, er, color);
        }
      }
    }

    // clouds
    {
      for (const q of h.quarterly) {
        const quarter_start_angle = lerp(q.quarter_index/4, start_angle, end_angle);
        const quarter_end_angle = quarter_start_angle + (.25/24 * TAU);

        const base_light = gradient(q.gsei, [
          [0, 50],
          [60, 100],
        ]);

        const cloud_stops = [
          [0, base_light, .9],
          [60, base_light, .9],
          [100, base_light, .6],
        ]
        const cloud_color = (cover: number) => {
          const [lgt, alp] = gradients(cover, cloud_stops);

          return `hsla(0,0%,${lgt}%,${alp})`;
        }

        for (const { cover, altitude } of q.cloud_cover_by_alt) {
          // const cover = Math.max(0, (((hi * 4 + q.quarter_index) / (24 * 4) * 100) |0) + Math.random() * 0 - 0);
          if (cover === 0) continue;

          const cloud_start_dist = cloud_start_dist_by_alt(altitude);
          const cloud_end_dist = cloud_end_dist_by_alt(altitude);

          const color = cloud_color(cover);

          const dots_horizontal = 4;
          const dots_vertical = 3;
          const dot_angle_step = (quarter_end_angle - quarter_start_angle) / dots_horizontal;
          const dot_dist_step = (cloud_end_dist - cloud_start_dist) / dots_vertical;

          for (let ci = 0; ci < dots_horizontal; ++ci) {
            const dot_angle = quarter_start_angle + (ci + .5) * dot_angle_step;

            for (let di = 0; di < dots_vertical; ++di) {
              let dot_dist = cloud_start_dist + (di + .5) * dot_dist_step;

              const dot_radius = gradient(cover, [
                [0, 0],
                [50, dot_dist_step / 2],
                [100, dot_dist_step],
              ])

              const cx = dot_dist * Math.cos(dot_angle);
              const cy = dot_dist * Math.sin(dot_angle);
              
              result += `
                <circle cx="${cx}" cy="${cy}" r="${dot_radius}" fill="${color}" />
              `
            }
          }
        }
      }

      const lgt_overall = gradient(h.cloud_cover, [
        [0, 100],
        [100, 60],
      ]);
      const display_value = h.cloud_cover > 5
        ? toNearest(h.cloud_cover, 5) + '%'
        : '';

      label('cover', display_value, params.cover_text_h, params.cover_text_s, `hsl(0,0%,${lgt_overall}%)`);
    }

    // precipitation [mm]
    {
      const confidence = gradient(h.precipitation_probability, [
        [0, .5],
        [100, 1],
      ]);

      for (const q of h.quarterly) {

        const qsa = lerp(q.quarter_index/4, start_angle, end_angle);
        const qea = qsa + (.25/24 * TAU);

        if (q.precipitation < 0.01) continue;

        // ensure enough contrast
        const light = gradient(q.gsei, [
          [0, 40],
          [60, 60],
        ]);

        // TODO change color based on if snow or rain or something else
        const color = `hsla(200, 100%, ${light}%, ${confidence})`;

        // mm pool [mm]
        {
          const max_height = params.ground_h;
          // /4 because quarterly
          const max_precip_shown = 10 /4;
          const height = Math.log(Math.min(q.precipitation, max_precip_shown) + 1) / Math.log(max_precip_shown + 1) * max_height;
          const qsr = sky_sr - height;
          const qer = sky_sr;

          result += svgGauge(qsa, qea, qsr, qer, color);
        }

        // drops from cloud
        {
          const der = cloud_start_dist_by_alt(q.thickest_alt);
          const dsr = der - gradient(q.precipitation, [
            [0, .5],
            [10, 1.5],
          ]);
          const dcr = (dsr + der) / 2;

          const drops = 4;
          const drop_size = (qea-qsa) * dcr / drops / 2;
          result += svgGauge(qsa, qea, dsr, der, color, `stroke-dasharray="${drop_size}" stroke-dashoffset="${drop_size*3/2}"`);
        }
      }

      const display_value = h.precipitation > .1 && h.precipitation_probability > 5
        ? toFixedOrSkip(h.precipitation, 1)
        : '';

      label('rain mm', display_value, params.precipitation_text_h, params.precipitation_text_s, 'hsl(200, 100%, 43%)');
    }

    // freezing level
    {
      const color = 'hsla(180, 100%, 83%, 1)';
      for (const q of h.quarterly) {
        const flh = q.freezing_level_height;
        if (flh > params.cloud_end_alt) continue;

        const qsa = lerp(q.quarter_index/4, start_angle, end_angle);
        const qea = qsa + (.25/24 * TAU);

        const dist = cloud_start_dist_by_alt(flh);
        const sr = dist - .1;
        const er = dist + .1;

        result += svgGauge(qsa, qea, sr, er, color, 'stroke-dasharray=".7"');
      }
    }

    // humidity
    {
      // TODO visualize?

      const color_stops = [
        [0, 30, 50, 70],
        [30, 30, 50, 50],
        [70, 180, 50, 50],
        [100, 180, 50, 30]
      ]

      const [hue, sat, lgt] = gradients(h.relative_humidity, color_stops)
      const textColor = `hsl(${hue}, ${sat}%, ${lgt}%)`;

      const display_humidity = ((h.relative_humidity / 5)|0)*5

      label('RH', display_humidity + '%', params.humidity_text_h, params.humidity_text_s, textColor);
    }

    // sun (visible in clear sky)
    {
      const sr = dr;
      const er = er_h(params.sun_h);


      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, start_angle, end_angle);
        const qea = qsa + (.25/24 * TAU);

        const [sat, lgt] = gradients(q.solar_elevation, [
          [0, 100, 0],
          [6, 90, 70],
        ]);

        const color = `hsl(50, ${sat}%, ${lgt}%)`;

        result += svgGauge(qsa, qea, sr, er, color)
      }
    }

    function label(name: string, value: string | number, height: number, size=1, color='black') {
      const tr = tr_h(height);
      if (is_nearest_hour) {
        textResult += svgPolarText(name, tr, start_angle - .1, {
          size: params.label_text_s,
          color: '#888',
          anchor: 'end',
          baseline: 'bottom',
          dx: -1,
          dy: -.2
        });
      }
      if (render_text) {
        textResult += svgPolarText(value, tr, start_angle, { size, color, baseline: 'middle' });
      }
    }
  }
  
  // fading/legend handled in clock.js so it moves with the hand

  const patterns_result = `<defs>${Object.values(svg_patterns).join('')}</defs>`;

  result = patterns_result + result;

  return {
    svg: result,
    text: textResult
  }
}
