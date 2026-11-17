// Keyboard + mouse state. Drag orbits the camera, wheel zooms, click shoots/honks.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.down = new Set(); // keys pressed this frame (edge-triggered)
    this.dragDX = 0; this.dragDY = 0;
    this.wheel = 0;
    this.clicked = false;
    this.dragging = false;
    this.lastMouseAt = -10;
    this._lx = 0; this._ly = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.down.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; });

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true; this._lx = e.clientX; this._ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.dragDX += e.clientX - this._lx;
      this.dragDY += e.clientY - this._ly;
      this._lx = e.clientX; this._ly = e.clientY;
      this.lastMouseAt = performance.now() / 1000;
    });
    const endDrag = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', (e) => { endDrag(); this.clicked = true; });
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  }

  held(code) { return this.keys.has(code); }
  pressed(code) { return this.down.has(code); }
  axis() {
    let x = 0, y = 0;
    if (this.held('KeyA') || this.held('ArrowLeft')) x -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) x += 1;
    if (this.held('KeyW') || this.held('ArrowUp')) y += 1;
    if (this.held('KeyS') || this.held('ArrowDown')) y -= 1;
    return { x, y };
  }
  consumeDrag() { const d = { dx: this.dragDX, dy: this.dragDY }; this.dragDX = 0; this.dragDY = 0; return d; }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  consumeClick() { const c = this.clicked; this.clicked = false; return c; }
  // Call once per frame after the game has read inputs.
  endFrame() { this.down.clear(); }
}
