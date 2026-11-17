// All sound is synthesized with WebAudio — no audio files, no network.
// The context is created on the first user gesture (menu button click).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null; this.engineOsc2 = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null;
    this._sirenHigh = false; this._sirenAt = 0;
    this._bassStep = 0; this._bassNext = 0;
    this._noiseBuf = null;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Noise buffer for gunshots / impacts.
    const len = this.ctx.sampleRate * 0.3;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Engine: two detuned saws through a lowpass, gain driven by speed.
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator(); this.engineOsc2.type = 'sawtooth'; this.engineOsc2.frequency.value = 82;
    this.engineOsc.connect(lp); this.engineOsc2.connect(lp);
    lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
    // Siren: square wave that alternates 700 / 950 Hz.
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'square'; this.sirenOsc.frequency.value = 700;
    const sg = this.ctx.createGain(); sg.gain.value = 0.5;
    this.sirenOsc.connect(sg); sg.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // speed 0..1, driving? — call every frame.
  engine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = driving ? 0.05 + speed01 * 0.09 : 0.0;
    this.engineGain.gain.setTargetAtTime(g, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(78 + speed01 * 195, t, 0.1);
  }

  // distance 0..1 (1 = nearest) to the closest police cruiser.
  siren(near01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this._sirenAt > 0.42) {
      this._sirenAt = t; this._sirenHigh = !this._sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this._sirenHigh ? 950 : 700, t, 0.05);
    }
    this.sirenGain.gain.setTargetAtTime(near01 * 0.10, t, 0.2);
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.15);
    this._blip(160, 0.1, 'sine', 0.4, 60);
  }

  thud() { this._blip(95, 0.16, 'sine', 0.5, 42); }
  punch() { this._blip(220, 0.07, 'square', 0.25, 120); }
  horn() { this._blip(370, 0.22, 'square', 0.16); this._blip(466, 0.22, 'square', 0.12); }
  pickup() { this._blip(660, 0.09, 'triangle', 0.3); setTimeout(() => this._blip(880, 0.12, 'triangle', 0.3), 90); }

  jingle() {
    if (!this.ctx) return;
    const notes = [440, 523, 659, 880];
    notes.forEach((n, i) => setTimeout(() => this._blip(n, 0.22, 'triangle', 0.32), i * 110));
  }

  // Quiet A-minor bassline loop: A1 A1 C2 E2 G1 E2 D2 E2, 8th notes at 100 BPM.
  bassline(now) {
    if (!this.ctx || this.muted) return;
    const stepDur = 60 / 100 / 2;
    if (now < this._bassNext) return;
    const notes = [55, 55, 65.41, 82.41, 49, 82.41, 73.42, 82.41];
    const n = notes[this._bassStep % notes.length];
    this._bassStep++;
    this._bassNext = now + stepDur;
    this._blip(n, stepDur * 0.9, 'triangle', 0.10);
  }
}
