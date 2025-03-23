import {params} from "./params";
import {cloud_er_by_alt, cloud_sr_by_alt, gradient, gradients, hourToAngle, lerp, svgGauge, svgPolarText, toFixedOrSkip} from "./util";

const TAU = Math.PI * 2;

export function drawWeatherElements(weather, time) {
  let result = ``;
  let textResult = ``;

  if (weather.byHour.length === 0) {
    console.log('no weather data yet')
    return result;
  }

  // TODO make timezone-indipendent
  const current_hour_index = new Date(time - 3600_000).getHours();

  for (const h of weather.byHour) {
    const is_current_hour = current_hour_index === h.hour_index;
    const is_last_hour = current_hour_index === (h.hour_index + 1) % 24;
    const is_one_before_last_hour = current_hour_index === (h.hour_index + 2) % 24;
    const render_text = !is_one_before_last_hour && !is_last_hour;

    // in reality, the start angle should be 30mins before for hourly data
    // but it will create more confusion if I do that. Text is still correct
    const sa = hourToAngle(h.hour_index)
    const ea = hourToAngle(h.hour_index + 1) + .0001;
    const ca = (sa+ea)/2;

    let dr = params.display_start_r;
    const er_h = (h) => {
      dr += h;
      return dr;
    }

    // temperature [°C]
    // displayed numbers are temperature, colors are apparent_temperature
    {
      const sr = dr;
      const er = er_h(params.temperature_h);

      const tr = 17.5;

      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, sa, ea);
        const qea = qsa + (.25/24 * TAU);

        const [hue, sat, light] = gradients(q.apparent_temperature, [
          [-10, 184, 50, 100],
          [0, 184, 50, 60],
          [40, 0, 50, 60],
        ])

        const color = `hsl(${hue},${sat}%,${light}%)`;

        if (!is_last_hour) {
          result += svgGauge(qsa, qea, sr, er, color)
        }
      }

      label('temp. [°C]', tr);

      if (render_text) {
        textResult += svgPolarText(Math.round(h.temperature) + '°', tr, sa, 2);
      }
    }

    // ground/humidity
    {
      const sr = dr;
      const er = er_h(params.ground_h);

      const tr = 15.7;

      const color_stops = [
        [0, 50, 60],
        [100, 100, 15]
      ]

      for (const q of h.quarterly) {
        const qsa = lerp(q.quarter_index/4, sa, ea);
        const qea = qsa + (.25/24 * TAU);

        const [sat, lgt] = gradients(q.relative_humidity, color_stops);
        const color = `hsl(30, ${sat}%, ${lgt}%)`;

        if (!is_last_hour) {
          result += svgGauge(qsa, qea, sr, er, color);
        }
      }

      const [sat, lgt] = gradients(h.relative_humidity, color_stops)
      const textColor = `hsl(30, ${sat - 20}%, ${lgt}%)`;

      const display_humidity = ((h.relative_humidity / 5)|0)*5

      label('rel. hum. [%]', tr);

      if (render_text) {
        textResult += svgPolarText(display_humidity + '%', tr, sa, 1, textColor)
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

        const cr = sky_sr + params.sky_h; // cloud_sr_by_alt(q.thickest_alt);

        const stops = [
          [0, 20, 20],
          [.1, 80, 20],
          [100, 80, 80],
        ]

        // below clouds (affected by clouds)
        { 
          const [sat, light] = gradients(q.gsei, stops);
          const color = `hsl(200, ${sat}%, ${light}%)`;

          result += svgGauge(qsa, qea, sr, cr, color);
        }

        // on and above clouds (not affected by clouds)
        // commented out, hard to figure out shading with 1000ft cloud precision
        // {
        //   const [sat, light] = gradients(q.sun, stops);
        //   const color = `hsl(200, ${sat}%, ${light}%)`;

        //   result += svgGauge(qsa, qea, cr, er, color);
        // }
      }
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

      const tr = 14;

      label('precip. [mm]', tr);

      if (h.precipitation > .1 && h.precipitation_probability > 5 && render_text) {
        textResult += svgPolarText(toFixedOrSkip(h.precipitation, 1) , tr, sa, 1, 'hsl(200, 100%, 43%)');
      }
    }

    // clouds
    {
      const tr = 12;

      const cloud_stops = [
        [0, 100, 0],
        [5, 100, 0],
        [100, 100, .95],
      ]
      const cloud_color = (cover) => {
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

      label('cover [%]', tr);

      if (h.cloud_cover > 5 && render_text) {
        const lgt_overall = gradient(h.cloud_cover, [
          [0, 100],
          [100, 60],
        ]);
        textResult += svgPolarText((h.cloud_cover|0) + '%', tr, sa, 1, `hsl(0,0%,${lgt_overall}%)`)
      }
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
          [-18, 100, 0],
          [0, 100, 30],
          [6, 90, 70],
        ]);

        const color = `hsl(50, ${sat}%, ${lgt}%)`;

        result += svgGauge(qsa, qea, sr, er, color)
      }
    }

    function label(text, r, size = .8, color = '#888') {
      if (is_current_hour) {
        textResult += svgPolarText(text, r, sa - .2, size, color, 'end');
      }
    }
  }
  
  // fading/legend handled in clock.js so it moves with the hand

  result += textResult;

  return result;
}
