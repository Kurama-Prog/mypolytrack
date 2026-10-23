import './styles/main.css';
import { Game } from './game/state';

const canvas = document.getElementById('game-canvas');
const uiHost = document.getElementById('ui');

if (!(canvas instanceof HTMLCanvasElement) || !uiHost) {
  throw new Error('[MyPolyTrack] missing canvas or UI host element');
}

try {
  new Game(canvas, uiHost);
} catch (error) {
  console.error(error);
  uiHost.innerHTML = `
    <div style="position:absolute;inset:0;display:grid;place-items:center;background:#0b1421;color:#fff;font-family:Montserrat,sans-serif;text-align:center;padding:24px">
      <div>
        <h1 style="font-size:20px;letter-spacing:.24em;margin-bottom:12px">WEBGL UNAVAILABLE</h1>
        <p style="font-size:12px;color:#a8b6cc;max-width:420px;line-height:1.8">
          MyPolyTrack needs WebGL2. Please enable hardware acceleration or try a
          recent version of Chrome, Edge, Firefox or Safari.
        </p>
      </div>
    </div>
  `;
}
