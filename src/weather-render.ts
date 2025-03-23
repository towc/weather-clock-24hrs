import {params} from "./params";
import {cloud_er_by_alt, cloud_sr_by_alt, gradient, gradients, hourToAngle, lerp, svgGauge, svgPolarText, toFixedOrSkip} from "./util";
import {WeatherData} from "./weather-data";

const TAU = Math.PI * 2;

export function drawWeatherElements(weather: WeatherData, time: number) {
  let result = ``;
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

  for (const h of weather.byHour) {
    const is_nearest_hour = nearest_hour_index === h.hour_index;
    const is_last_nearest_hour  = last_nearest_hour_index === h.hour_index;
    const is_last_last_nearest_hour = last_last_nearest_hour_index === h.hour_index;

    const render_text = !is_last_nearest_hour && !is_last_last_nearest_hour;

    // in reality, the start angle should be 30mins before for hourly data
    // but it will create more confusion if I do that. Text is still correct
    const sa = hourToAngle(h.hour_index)
    const ea = hourToAngle(h.hour_index + 1) + .0001;

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

    // temperature [°C]
    // displayed numbers are temperature, colors are apparent_temperature
    {
      const sr = dr;
      const er = er_h(params.temperature_h);

      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, sa, ea);
        const qea = qsa + (.25/24 * TAU);

        const [hue, sat, light] = gradients(q.apparent_temperature, [
          [-10, 184, 50, 100],
          [0, 184, 50, 60],
          [40, 0, 50, 60],
        ])

        const color = `hsl(${hue},${sat}%,${light}%)`;

        result += svgGauge(qsa, qea, sr, er, color)
      }

      label('temp. [°C]', Math.round(h.temperature) + '°', params.temperature_text_h, params.temperature_text_s, 'black');
      label('feels like [°C]',
        Math.round(h.apparent_temperature) + '°',
        params.temperature_feels_like_text_h,
        params.temperature_feels_like_text_s,
        'black');
    }

    // ground/gsei
    {
      const sr = dr;
      const er = er_h(params.ground_h);


      const color_stops = [
        [0, 30, 30, 0],
        [50, 30, 30, 80],
        [100, 30, 30, 100],
      ]

      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, sa, ea);
        const qea = qsa + (.25/24 * TAU);

        const [hue, sat, lgt] = gradients(q.gsei, color_stops);
        const color = `hsl(${hue}, ${sat}%, ${lgt}%)`;

        result += svgGauge(qsa, qea, sr, er, color);
      }

    }


    const sky_sr = dr;
    // sky/sunshine
    {

      const sr = sky_sr;
      const er = er_h(params.sky_h);

      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, sa, ea);
        const qea = qsa + (.25/24 * TAU) + .001;

        const sky_brightness = gradient(q.solar_elevation, [
          [-6, 0],
          [12, 100],
        ])

        const stops = [
          [0, 20, 20],
          [.1, 80, 20],
          [100, 80, 80],
        ]

        // on and above clouds (not affected by clouds)
        const [sat, light] = gradients(sky_brightness, stops);
        const color = `hsl(200, ${sat}%, ${light}%)`;

        result += svgGauge(qsa, qea, sr, er, color);
      }
    }

    // clouds
    {
      const cloud_stops = [
        [0, 100, 0],
        [5, 100, 0],
        [100, 100, .95],
      ]
      const cloud_color = (cover: number) => {
        const [lgt, alp] = gradients(cover, cloud_stops);

        return `hsla(0,0%,${lgt}%,${alp})`;
      }

      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, sa, ea);
        const qea = qsa + (.25/24 * TAU);

        for (const { cover, altitude } of q.cloud_cover_by_alt) {
          if (cover <= 5) continue;

          const csr = cloud_sr_by_alt(altitude);
          const cer = cloud_er_by_alt(altitude);
          const color = cloud_color(cover);
          result += svgGauge(qsa, qea, csr, cer, color);
        }
      }

      const lgt_overall = gradient(h.cloud_cover, [
        [0, 100],
        [100, 60],
      ]);
      const display_value = h.cloud_cover > 5
        ? Math.round(h.cloud_cover) + '%'
        : '';

      label('cover [%]', display_value, params.cover_text_h, params.cover_text_s, `hsl(0,0%,${lgt_overall}%)`);
    }

    // precipitation [mm]
    {
      const sr = sky_sr;

      const confidence = gradient(h.precipitation_probability, [
        [0, .1],
        [100, 1],
      ]);

      // TODO change color based on if snow or rain or something else
      const color = `hsla(200, 100%, 40%, ${confidence})`;

      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, sa, ea);
        const qea = qsa + (.25/24 * TAU);

        if (q.precipitation < 0.01) continue;

        // mm pool [mm]
        {
          const height = gradient(q.precipitation, [
            [0, 0],
            [.1, .1],
            [2, 1],
            [10, 1.8],
          ]);
          const qer = sr + height;

          result += svgGauge(qsa, qea, sr, qer, color);
        }

        // drops from cloud
        {
          const dsr = cloud_sr_by_alt(q.thickest_alt);
          const der = dsr - gradient(q.precipitation, [
            [0, .5],
            [10, 1.5],
          ]);

          const dda = gradient(q.precipitation, [
            [0, .0075],
            [10, .0075],
          ])

          const drops = 3;
          for (let i = 0; i < drops; ++i) {
            const dca = lerp((i+.5)/drops, qsa, qea);
            const dsa = dca - dda/2;
            const dea = dca + dda/2;

            result += svgGauge(dsa, dea, der, dsr, color);
          }
        }
      }

      const display_value = h.precipitation > .1 && h.precipitation_probability > 5
        ? toFixedOrSkip(h.precipitation, 1)
        : '';

      label('precip. [mm]', display_value, params.precipitation_text_h, params.precipitation_text_s, 'hsl(200, 100%, 43%)');
    }

    // humidity
    {
      // TODO visualize?

      const color_stops = [
        [0, 50, 100],
        [100, 50, 30]
      ]

      const [sat, lgt] = gradients(h.relative_humidity, color_stops)
      const textColor = `hsl(180, ${sat}%, ${lgt}%)`;

      const display_humidity = ((h.relative_humidity / 5)|0)*5

      label('RH [%]', display_humidity + '%', params.humidity_text_h, params.humidity_text_s, textColor);
    }

    // sun (hitting atmosphere, not ground)
    // `terrestrial_radiation` is not a great metric, as it's 0 at civil twilight
    {
      const sr = dr;
      const er = er_h(params.sun_h);


      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, sa, ea);
        const qea = qsa + (.25/24 * TAU);

        const [sat, lgt] = gradients(q.solar_elevation, [
          [-12, 100, 0],
          [0, 100, 30],
          [6, 90, 70],
        ]);

        const color = `hsl(50, ${sat}%, ${lgt}%)`;

        result += svgGauge(qsa, qea, sr, er, color)
      }
    }

    function label(name: string, value: string | number, height: number, size=1, color='black') {
      const tr = tr_h(height);
      if (is_nearest_hour) {
        textResult += svgPolarText(name, tr, sa - .1, .8, '#888', 'end', -1, -.2);
      }
      if (render_text) {
        textResult += svgPolarText(value, tr, sa, size, color, 'middle');
      }
    }
  }
  
  // fading/legend handled in clock.js so it moves with the hand

  return {
    svg: result,
    text: textResult
  }
}
