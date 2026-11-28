/*
 * وضع إعادة التشغيل: يعيد تشغيل الشموع من نقطة محددة بسرعات مختلفة،
 * بحيث يمكن التدرّب على القرار قبل أن تُكشف بقية الشموع.
 */

export class Replay {
  constructor({ onFrame, onState }) {
    this.full = [];
    this.index = 0;
    this.playing = false;
    this.speed = 1; // شمعة في الثانية × المعامل
    this.timer = null;
    this.onFrame = onFrame;
    this.onState = onState;
    this.active = false;
  }

  start(bars, startIndex) {
    this.full = bars;
    this.active = true;
    const min = Math.min(40, Math.max(10, Math.floor(bars.length * 0.1)));
    this.index = Math.max(min, startIndex ?? Math.floor(bars.length * 0.6));
    this.playing = false;
    this._emit();
  }

  stop() {
    this.pause();
    this.active = false;
    this._emit();
  }

  get visibleBars() {
    return this.full.slice(0, this.index + 1);
  }

  play() {
    if (!this.active || this.playing) return;
    this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      if (this.index >= this.full.length - 1) {
        this.pause();
        return;
      }
      this.index++;
      this._emit();
      this.timer = setTimeout(tick, Math.max(40, 700 / this.speed));
    };
    this.timer = setTimeout(tick, Math.max(40, 700 / this.speed));
    this._emit();
  }

  pause() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this._emit();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  step(n = 1) {
    if (!this.active) return;
    this.pause();
    this.index = Math.max(5, Math.min(this.full.length - 1, this.index + n));
    this._emit();
  }

  seekRatio(r) {
    if (!this.active) return;
    this.index = Math.max(5, Math.round((this.full.length - 1) * r));
    this._emit();
  }

  setSpeed(s) {
    this.speed = s;
    this._emit();
  }

  _emit() {
    if (this.onFrame) this.onFrame(this.visibleBars, this.index);
    if (this.onState)
      this.onState({
        active: this.active,
        playing: this.playing,
        index: this.index,
        total: this.full.length,
        speed: this.speed,
        bar: this.full[this.index],
      });
  }
}
