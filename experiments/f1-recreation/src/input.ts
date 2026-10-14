/**
 * 입력 레이어.
 * - KeyboardSource: window 키 이벤트를 눌림 Set 으로 유지하는 입력 소스
 * - InputHub: 여러 소스를 하나의 입력으로 합성
 * 키 바인딩/합성 규칙은 원본 번들에서 확인된 값을 그대로 사용한다.
 */

export interface VehicleInput {
  /** 0 또는 1 (아날로그 소스를 붙이면 0~1) */
  readonly throttle: number;
  readonly brake: number;
  /** -1(좌) ~ +1(우) */
  readonly steer: number;
  readonly handbrake: number;
}

export const NEUTRAL_INPUT: VehicleInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: 0,
};

/** 1회성 액션. 다음 fixedUpdate 에서 소비된다. [분석확인] */
export type OneShotAction = 'reset';

export interface InputSource {
  readonly name: string;
  sample(): VehicleInput;
  consumeActions(): readonly OneShotAction[];
  dispose(): void;
}

interface KeyBindings {
  readonly throttle: readonly string[];
  readonly brake: readonly string[];
  readonly left: readonly string[];
  readonly right: readonly string[];
  readonly handbrake: readonly string[];
  readonly reset: readonly string[];
}

/** 키 바인딩 [분석확인] */
export const KEY_BINDINGS: KeyBindings = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  reset: ['KeyR'],
};

/** 데모가 가로채는 전체 키 코드(브라우저 기본 동작 차단 대상) */
const OWNED_CODES: Record<string, true> = {};
for (const codes of Object.values(KEY_BINDINGS)) {
  for (const code of codes) OWNED_CODES[code] = true;
}

const EMPTY_ACTIONS: readonly OneShotAction[] = [];

export class KeyboardSource implements InputSource {
  readonly name = 'keyboard';

  /** 현재 눌려 있는 키 코드 (런타임 삽입/삭제라 Set) */
  private readonly pressed = new Set<string>();
  private readonly actions: OneShotAction[] = [];
  private readonly target: Window;

  constructor(target: Window = window) {
    this.target = target;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.pressed.clear();
    this.actions.length = 0;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (OWNED_CODES[event.code] !== true) return;
    // 데모가 소유한 키는 브라우저 기본 동작(스크롤 등)을 막는다. [분석확인]
    event.preventDefault();
    // 리셋은 오토리핏(e.repeat)을 무시하고 1회만 큐에 넣는다. [분석확인]
    if (KEY_BINDINGS.reset.includes(event.code) && !event.repeat) {
      this.actions.push('reset');
    }
    this.pressed.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (OWNED_CODES[event.code] !== true) return;
    event.preventDefault();
    this.pressed.delete(event.code);
  };

  /** 포커스를 잃으면 눌린 키를 전부 해제한다(키 고착 방지). [분석확인] */
  private readonly onBlur = (): void => {
    this.pressed.clear();
  };

  /** 바인딩 중 하나라도 눌려 있으면 1 (원본의 `+pressed(CODES)` 와 동일) */
  private held(codes: readonly string[]): number {
    for (const code of codes) {
      if (this.pressed.has(code)) return 1;
    }
    return 0;
  }

  sample(): VehicleInput {
    // throttle/brake/handbrake = 눌림 여부(0|1), steer = 우 - 좌 [분석확인]
    return {
      throttle: this.held(KEY_BINDINGS.throttle),
      brake: this.held(KEY_BINDINGS.brake),
      steer: this.held(KEY_BINDINGS.right) - this.held(KEY_BINDINGS.left),
      handbrake: this.held(KEY_BINDINGS.handbrake),
    };
  }

  consumeActions(): readonly OneShotAction[] {
    if (this.actions.length === 0) return EMPTY_ACTIONS;
    return this.actions.splice(0, this.actions.length);
  }
}

/**
 * 여러 입력 소스를 하나로 합성한다. [분석확인]
 * - throttle / brake / handbrake: 최댓값
 * - steer: 절대값이 큰 쪽이 승리
 * 활성(0이 아닌 값을 낸) 소스 이름은 HUD 표시에 사용한다.
 */
export class InputHub {
  private readonly sources: InputSource[] = [];
  private readonly active: string[] = [];
  private readonly actionBuffer: OneShotAction[] = [];

  add(source: InputSource): this {
    this.sources.push(source);
    return this;
  }

  dispose(): void {
    for (const source of this.sources) source.dispose();
    this.sources.length = 0;
  }

  /** 직전 sample() 에서 실제로 입력을 낸 소스 이름들 */
  get activeSources(): readonly string[] {
    return this.active;
  }

  sample(): VehicleInput {
    this.active.length = 0;
    let throttle = 0;
    let brake = 0;
    let handbrake = 0;
    let steer = 0;

    for (const source of this.sources) {
      const value = source.sample();
      throttle = Math.max(throttle, value.throttle); // [분석확인]
      brake = Math.max(brake, value.brake); // [분석확인]
      handbrake = Math.max(handbrake, value.handbrake); // [분석확인]
      if (Math.abs(value.steer) > Math.abs(steer)) steer = value.steer; // [분석확인]

      if (value.throttle !== 0 || value.brake !== 0 || value.steer !== 0 || value.handbrake !== 0) {
        this.active.push(source.name);
      }
    }

    return { throttle, brake, steer, handbrake };
  }

  consumeActions(): readonly OneShotAction[] {
    this.actionBuffer.length = 0;
    for (const source of this.sources) {
      for (const action of source.consumeActions()) this.actionBuffer.push(action);
    }
    return this.actionBuffer;
  }
}
