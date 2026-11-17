// HUD: stars, money, health, mission tracker, speed, prompts, toasts, crosshair,
// and the canvas minimap (roads, player arrow, traffic, flashing police, mission marker).
import { ROADS, WATER_X } from './city.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      stars: document.getElementById('stars'),
      money: document.getElementById('money'),
      healthfill: document.getElementById('healthfill'),
      mname: document.querySelector('#mission .mname'),
      mtext: document.querySelector('#mission .mtext'),
      mdist: document.querySelector('#mission .mdist'),
      speed: document.getElementById('speed'),
      prompt: document.getElementById('prompt'),
      toasts: document.getElementById('toasts'),
      crosshair: document.getElementById('crosshair'),
      wasted: document.getElementById('wasted'),
      busted: document.getElementById('busted'),
      minimap: document.getElementById('minimap'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this._toastAt = 0;
    this._lastStars = -1;
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }
  setHidden(h) { this.el.hud.classList.toggle('hidden', h); }

  setStars(n) {
    if (n === this._lastStars) return;
    this._lastStars = n;
    const spans = this.el.stars.querySelectorAll('span');
    spans.forEach((s, i) => s.classList.toggle('off', i >= n));
  }
  setMoney(v) { this.el.money.textContent = '$' + Math.floor(v).toLocaleString('en-US'); }
  setHealth(v) { this.el.healthfill.style.width = Math.max(0, Math.min(100, v)) + '%'; }
  setMission(name, text, distText) {
    this.el.mname.textContent = name;
    this.el.mtext.textContent = text;
    this.el.mdist.textContent = distText || '';
  }
  setSpeed(kmh, driving) {
    this.el.speed.classList.toggle('hidden', !driving);
    if (driving) this.el.speed.innerHTML = Math.round(kmh) + ' <small>km/h</small>';
  }
  setPrompt(html) {
    if (!html) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.innerHTML = html;
    this.el.prompt.classList.remove('hidden');
  }
  setCrosshair(on) { this.el.crosshair.classList.toggle('hidden', !on); }
  showWasted(on) { this.el.wasted.classList.toggle('hidden', !on); }
  showBusted(on) { this.el.busted.classList.toggle('hidden', !on); }

  toast(msg, ms = 2600) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    this.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), ms);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
  }

  drawMinimap(state) {
    const g = this.mm, W = 180, H = 180;
    const map = (v) => ((v + 288) / 576) * W;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0a0f1e'; g.fillRect(0, 0, W, H);
    // Water.
    g.fillStyle = '#12324e'; g.fillRect(map(WATER_X), 0, W - map(WATER_X), H);
    // Blocks.
    g.fillStyle = '#1e2b22';
    for (let bx = -200; bx <= 200; bx += 80) {
      for (let bz = -200; bz <= 200; bz += 80) {
        g.fillRect(map(bx - 32), map(bz - 32), 64 * W / 576, 64 * W / 576);
      }
    }
    // Roads.
    g.strokeStyle = '#4a4f58'; g.lineWidth = 5;
    for (const r of ROADS) {
      g.beginPath(); g.moveTo(map(r), 0); g.lineTo(map(r), H); g.stroke();
      g.beginPath(); g.moveTo(0, map(r)); g.lineTo(W, map(r)); g.stroke();
    }
    // Mission marker (pulsing purple).
    if (state.missionTarget) {
      const pulse = 5 + Math.sin(state.time * 4) * 2;
      g.fillStyle = '#a878ff';
      g.beginPath(); g.arc(map(state.missionTarget.x), map(state.missionTarget.z), pulse, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e0c8ff'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(map(state.missionTarget.x), map(state.missionTarget.z), pulse + 3, 0, Math.PI * 2); g.stroke();
    }
    // Traffic (white dots).
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of state.traffic) {
      g.fillRect(map(c.x) - 1.5, map(c.z) - 1.5, 3, 3);
    }
    // Police (flashing red/blue).
    const flash = Math.floor(state.time / 0.3) % 2 === 0;
    g.fillStyle = flash ? '#ff4444' : '#4488ff';
    for (const c of state.police) {
      g.beginPath(); g.arc(map(c.x), map(c.z), 3.5, 0, Math.PI * 2); g.fill();
    }
    // Player arrow (white triangle, rotated to heading).
    const px = map(state.px), pz = map(state.pz);
    g.save();
    g.translate(px, pz);
    g.rotate(state.heading); // heading 0 = +x; canvas y is down, matching world +z
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000000'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-5, 5); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
}
