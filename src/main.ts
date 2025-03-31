import './style.css'
import { params } from './params';
import { drawClock, updateHands } from './clock';
import { getWeatherData } from './weather-data';
import { drawWeatherElements } from './weather-render';

let activeRenderId: null | number = null;
const svg = document.getElementById('svg')!;

const isIFrame = window.location !== window.parent.location;
const isDev = window.location.hostname === 'localhost';

async function run() {
  const computed = {
    startDate: (() => {
      const date = new Date(params.startDate);
      return date.getTime()// - date.getTimezoneOffset() * 1000 * 60;
    })(),
    realStart: Date.now(),
  }

  const state = {
    drawn: false,
    lastUpdate: 0,
    lastWeatherUpdate: 0,
    computed,
  }

  svg.setAttribute('viewBox', '-50 -50 100 100');

  svg.style.width = isDev ? '674px' : Math.min(window.innerWidth, window.innerHeight) + 'px';

  if (isIFrame) {
    // if not in an iframe

    svg.style.filter = 'drop-shadow(0 0 10px rgba(0,0,0,0.5))';
  }
  
  const renderId = Math.random();
  activeRenderId = renderId;
  
  function render(time: number) {
    if (!state.drawn) {
      svg.innerHTML = drawClock();
      state.drawn = true;
    }

    const date = new Date(time);
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const msSinceStartOfDay = time - startOfDay.getTime();

    if (params.showHands) {
      updateHands(state, msSinceStartOfDay);
    }

    const redraw_weather_every_s = 60;
    if (time > state.lastWeatherUpdate + redraw_weather_every_s * 1000) {
      updateWeatherElements(msSinceStartOfDay);
      state.lastWeatherUpdate = time;
    }

    if (params.progressTime && activeRenderId === renderId) {
      setTimeout(() => {
        const elapsed = Date.now() - computed.realStart;
        render(computed.startDate + elapsed * params.timeSpeed)
      }, 1000);
    }
  }

  render(Date.now());
  
  async function updateWeatherElements(msSinceStartOfDay: number) {
    const weather = await getWeatherData();
    
    const drawn = drawWeatherElements(weather, msSinceStartOfDay);

    document.getElementById('weather-elements')!.innerHTML = drawn.svg;
    document.getElementById('weather-text')!.innerHTML = drawn.text;
  }
}

run();


(window as any).resetWeatherCache = () => {
  svg.innerHTML = `
    <span>
    resetting weather cache
    </span>`;
  localStorage.raw_weather = '';
  run();
}

// if ('dat' in window) {
//   const gui = new dat.GUI();
// 
//   gui.add({ 'random time': () => {
//     params.startDate = new Date(Math.random() * 1000 * 60 * 60 * 24 * 365 * 60).toISOString();
//     run();
//   }}, 'random time');
//   
//   gui.add({ 'save svg': () => {
//     const fullSvgString = `
//       <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox='-50 -50 100 100'>
//         ${document.getElementById('printable').innerHTML}
//       </svg>
//     `
//     
//     let a = document.createElement("a");
//     if (typeof a.download !== "undefined") a.download = 'clock.svg';
//     a.href = URL.createObjectURL(new Blob([fullSvgString], {
//         type: "application/octet-stream"
//     }));
//     a.dispatchEvent(new MouseEvent("click"));
//   }}, 'save svg');
// 
//   for (const key of Object.keys(params)) {
//     if (typeof params[key] === 'object') continue;
//     
//     const ctrl = gui.add(params, key).onChange((value) => {
//       params[key] = value;
//       run();
//     });
// 
//     if (key === 'startDate') {
//       ctrl.listen();
//     }
//   }
//   
//   gui.close();
// }

