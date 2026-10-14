/**
 * 고정 타임스텝 루프.
 * 원본(https://jngbnss.github.io/f1/) 번들에서 확인된 누산기 기반 구조를 그대로 재현한다.
 */

export interface LoopCallbacks {
  /** 물리 1스텝. dt 는 항상 fixedDt. */
  fixedUpdate(dt: number): void;
  /** 프레임 단위 갱신. alpha = 누산기 잔량 / fixedDt (0~1 보간 계수). */
  update(frameDt: number, alpha: number): void;
  /** 드로우 콜. */
  render(): void;
}

export class FixedStepLoop {
  /** 물리 스텝 길이 1/60초 [분석확인] */
  readonly fixedDt = 1 / 60;
  /** 한 프레임에 허용하는 최대 물리 스텝 수 [분석확인] */
  readonly maxSubSteps = 5;
  /** 한 프레임이 가질 수 있는 최대 경과 시간(초) [분석확인] */
  readonly maxFrameDelta = 0.25;

  private readonly callbacks: LoopCallbacks;
  private accumulator = 0;
  private last = 0;
  private rafId = 0;

  /** 루프 구동 여부 */
  running = false;

  /** 직전 프레임에서 실제로 돌린 물리 스텝 수 (디버그/스모크 테스트용) */
  lastSubSteps = 0;
  /** 직전 프레임의 보간 계수 */
  lastAlpha = 0;
  /** 시작 이후 누적 물리 스텝 수 */
  totalSteps = 0;

  constructor(callbacks: LoopCallbacks) {
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private readonly onFrame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.onFrame);
    this.tick(now);
  };

  /**
   * 한 프레임 처리. [분석확인]
   *   frame = min((now - last)/1000, 0.25)
   *   accumulator += frame
   *   while accumulator >= fixedDt && n < maxSubSteps: fixedUpdate(fixedDt); accumulator -= fixedDt; n++
   *   if n === maxSubSteps: accumulator = 0          // 스파이럴 오브 데스 방지
   *   update(frame, accumulator / fixedDt); render()
   */
  tick(now: number): void {
    const frame = Math.min((now - this.last) / 1000, this.maxFrameDelta); // [분석확인]
    this.last = now;
    this.accumulator += frame; // [분석확인]

    let n = 0;
    while (this.accumulator >= this.fixedDt && n < this.maxSubSteps) {
      this.callbacks.fixedUpdate(this.fixedDt); // [분석확인]
      this.accumulator -= this.fixedDt;
      n += 1;
    }
    if (n === this.maxSubSteps) {
      // 따라잡지 못한 프레임: 누산기를 버려 스파이럴을 끊는다. [분석확인]
      this.accumulator = 0;
    }

    const alpha = this.accumulator / this.fixedDt; // [분석확인] 보간 계수
    this.lastSubSteps = n;
    this.lastAlpha = alpha;
    this.totalSteps += n;

    this.callbacks.update(frame, alpha); // [분석확인]
    this.callbacks.render(); // [분석확인]
  }
}
