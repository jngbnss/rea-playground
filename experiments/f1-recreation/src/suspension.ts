/**
 * 4륜 레이캐스트 서스펜션 (하중 전용 모델).
 *
 * 원본은 바퀴마다 아래로 레이를 쏘아 지면까지 거리를 재고, 스프링+댐퍼+안티롤바로
 * 수직 하중을 만든 뒤 그 하중을 타이어 모델에 넘긴다. [분석확인] `Game @ 4,534,300–4,535,000`
 *
 *   suspensionLength = max(timeOfImpact - wheelRadius, 0)
 *   압축             = restLength - suspensionLength
 *   하중             = stiffness*압축 + damping*감쇠속도
 *   if (반대쪽 접지)  하중 += antiRoll * (반대쪽 길이 - 이쪽 길이)
 *   wheel.load       = max(하중, 0)
 *
 * 이 데모는 지면이 완전한 평지라 레이캐스트 거리가 차체 자세만의 함수다. 따라서
 * 레이 발사 대신 차체의 상하(heave)·피치·롤 3자유도를 직접 적분해 같은 입력을 만든다.
 * 평면 운동(전·횡·요)은 `Vehicle` 쪽 자전거 모델이 그대로 담당한다 — 원본도 타이어·
 * 서스펜션·구동력 계산은 전부 JS에 있고 WASM은 적분만 한다. [분석확인] `03` 10절
 */

/** 바퀴 순서: 앞좌 · 앞우 · 뒤좌 · 뒤우 */
export const WHEEL_COUNT = 4;
export const FL = 0;
export const FR = 1;
export const RL = 2;
export const RR = 3;

/** 중력가속도 [분석확인] */
const G = 9.81;
/** 서스펜션 적분 서브스텝 [자체설계] 롤 고유진동수 5.2 Hz → 1/60 단일 스텝은 정확도 부족 */
const SUSPENSION_SUBSTEPS = 4;
/** heave 변위 안전 한계 (m) [자체설계] 수치 발산 방지 */
const HEAVE_LIMIT = 0.5;
/** 피치·롤 안전 한계 (rad) [자체설계] */
const ANGLE_LIMIT = 0.5;

export interface SuspensionParams {
  /** 질량 (kg) [분석확인] */
  mass: number;
  /** 무게중심 ~ 앞차축 거리 (m) [분석확인] */
  frontAxle: number;
  /** 무게중심 ~ 뒷차축 거리 (m) [분석확인] */
  rearAxle: number;
  /** 윤거 절반 (m) [분석확인] */
  trackHalf: number;
  /** 무게중심 높이 (m) [분석확인] tune.cgHeight = 0.33 */
  cgHeight: number;
  /** 스프링 강성 (N/m) [분석확인] mass * springPerKg(56) */
  stiffness: number;
  /** 댐퍼 감쇠 (N·s/m) [분석확인] mass * damperPerKg(3.25) */
  damping: number;
  /** 앞 안티롤바 (N/m) [분석확인] mass * antiRollPerKg[0](120) */
  antiRollFront: number;
  /** 뒤 안티롤바 (N/m) [분석확인] mass * antiRollPerKg[1](95) */
  antiRollRear: number;
  /** 서스펜션 자유장 (m) [분석확인] f1 tune.rest = 0.3 */
  restLength: number;
  /** 다운포스 전륜 배분 [분석확인] aeroBalance = activeAero ? 0.45 : ... */
  aeroBalance: number;
  /** 피치 관성모멘트 (kg·m²) [자체설계] 동역학 지수 1 가정 → m·a·b */
  pitchInertia: number;
  /** 롤 관성모멘트 (kg·m²) [자체설계] m·trackHalf² */
  rollInertia: number;
}

/**
 * 차체 3자유도(heave·pitch·roll)를 적분해 바퀴 4개의 수직 하중을 만든다.
 *
 * 부호 규약:
 *   heave  + = 차체가 위로
 *   pitch  + = 노즈 업 (가속 시)
 *   roll   + = 좌측이 위로 (좌선회 시 차체가 우측으로 기울 때)
 */
export class Suspension {
  readonly params: SuspensionParams;

  /** 바퀴별 수직 하중 (N). 외부에서는 읽기만 한다 */
  readonly loads = new Float64Array(WHEEL_COUNT);
  /** 바퀴별 서스펜션 압축량 (m) — 디버깅·시각화용 */
  readonly compressions = new Float64Array(WHEEL_COUNT);

  /** 정적 평형 상태의 바퀴별 압축량 (m) */
  private readonly staticCompression = new Float64Array(WHEEL_COUNT);
  /** 바퀴 종방향 위치 (m, 앞 +) */
  private readonly armLong = new Float64Array(WHEEL_COUNT);
  /** 바퀴 횡방향 위치 (m, 좌 +) */
  private readonly armLat = new Float64Array(WHEEL_COUNT);

  /** 평형 기준 상하 변위 (m) */
  heave = 0;
  heaveRate = 0;
  pitch = 0;
  pitchRate = 0;
  roll = 0;
  rollRate = 0;

  constructor(params: SuspensionParams) {
    this.params = params;
    const p = params;
    const wheelBase = p.frontAxle + p.rearAxle;
    // 정하중 배분 — 앞축은 b/L, 뒤축은 a/L. 축 하중을 좌우로 절반씩 나눈다. [분석확인]
    const staticFront = ((p.rearAxle / wheelBase) * p.mass * G) / 2;
    const staticRear = ((p.frontAxle / wheelBase) * p.mass * G) / 2;

    this.armLong[FL] = p.frontAxle;
    this.armLong[FR] = p.frontAxle;
    this.armLong[RL] = -p.rearAxle;
    this.armLong[RR] = -p.rearAxle;
    this.armLat[FL] = p.trackHalf;
    this.armLat[FR] = -p.trackHalf;
    this.armLat[RL] = p.trackHalf;
    this.armLat[RR] = -p.trackHalf;

    // 평형 압축량 = 정하중 / 강성. 이 상태를 heave = pitch = roll = 0 으로 둔다.
    this.staticCompression[FL] = staticFront / p.stiffness;
    this.staticCompression[FR] = staticFront / p.stiffness;
    this.staticCompression[RL] = staticRear / p.stiffness;
    this.staticCompression[RR] = staticRear / p.stiffness;

    this.reset();
  }

  reset(): void {
    this.heave = 0;
    this.heaveRate = 0;
    this.pitch = 0;
    this.pitchRate = 0;
    this.roll = 0;
    this.rollRate = 0;
    for (let i = 0; i < WHEEL_COUNT; i += 1) {
      this.compressions[i] = this.staticCompression[i];
      this.loads[i] = this.staticCompression[i] * this.params.stiffness;
    }
  }

  /**
   * 한 고정 스텝만큼 차체 자세를 적분하고 바퀴 하중을 갱신한다.
   *
   * @param longAccel   차체 종가속도 (m/s², 가속 +) — 직전 스텝 실측값
   * @param lateralAccel 차체 횡가속도 (m/s², 좌 +) — 직전 스텝 실측값
   * @param downforce   총 다운포스 (N, 아래 방향 크기)
   */
  step(longAccel: number, lateralAccel: number, downforce: number, dt: number): void {
    const p = this.params;
    const subDt = dt / SUSPENSION_SUBSTEPS;
    const weight = p.mass * G;
    // 다운포스는 앞/뒤 축 위치에 aeroBalance 비율로 걸린다. [분석확인]
    const downForceFront = downforce * p.aeroBalance; // [분석확인]
    const downForceRear = downforce * (1 - p.aeroBalance); // [분석확인]
    // 다운포스가 만드는 피치 모멘트 (노즈 업 +): 앞축 하향력은 노즈 다운, 뒤축은 노즈 업
    const aeroPitch = -downForceFront * p.frontAxle + downForceRear * p.rearAxle; // [자체설계: 적용 방식]
    // 타이어 종·횡력이 노면(높이 0)에서 걸려 CG(h) 둘레로 만드는 관성 모멘트 [자체설계: 표준 강체식]
    const inertialPitch = p.mass * longAccel * p.cgHeight; // [자체설계]
    const inertialRoll = p.mass * lateralAccel * p.cgHeight; // [자체설계]

    for (let sub = 0; sub < SUSPENSION_SUBSTEPS; sub += 1) {
      let sumLoad = 0;
      let pitchMoment = aeroPitch + inertialPitch;
      let rollMoment = inertialRoll;

      for (let i = 0; i < WHEEL_COUNT; i += 1) {
        // 차체 마운트의 상하 변위와 그 속도
        const lift = this.heave + this.pitch * this.armLong[i] + this.roll * this.armLat[i];
        const liftRate =
          this.heaveRate + this.pitchRate * this.armLong[i] + this.rollRate * this.armLat[i];
        // 차체가 올라가면 압축이 풀린다 (평지라 지면 높이는 상수)
        this.compressions[i] = this.staticCompression[i] - lift;
        // 하중 = 강성*압축 + 감쇠*압축속도 [분석확인]
        this.loads[i] = p.stiffness * this.compressions[i] - p.damping * liftRate; // [분석확인]
      }

      // 안티롤바: 같은 축 반대쪽 바퀴보다 더 눌린 쪽이 하중을 더 받는다. [분석확인]
      //   하중 += antiRoll * (반대쪽 길이 - 이쪽 길이) = antiRoll * (이쪽 압축 - 반대쪽 압축)
      const rollBarFront = p.antiRollFront * (this.compressions[FL] - this.compressions[FR]); // [분석확인]
      const rollBarRear = p.antiRollRear * (this.compressions[RL] - this.compressions[RR]); // [분석확인]
      this.loads[FL] += rollBarFront;
      this.loads[FR] -= rollBarFront;
      this.loads[RL] += rollBarRear;
      this.loads[RR] -= rollBarRear;

      for (let i = 0; i < WHEEL_COUNT; i += 1) {
        // 서스펜션은 당기지 못한다 — 음수 하중은 0 (휠 리프트). [분석확인]
        if (this.loads[i] < 0) this.loads[i] = 0; // [분석확인]
        sumLoad += this.loads[i];
        pitchMoment += this.loads[i] * this.armLong[i];
        rollMoment += this.loads[i] * this.armLat[i];
      }

      // 차체 3자유도 적분 (semi-implicit Euler) [자체설계: 원본은 Rapier 강체가 담당]
      this.heaveRate += ((sumLoad - weight - downforce) / p.mass) * subDt; // [자체설계]
      this.pitchRate += (pitchMoment / p.pitchInertia) * subDt; // [자체설계]
      this.rollRate += (rollMoment / p.rollInertia) * subDt; // [자체설계]
      this.heave += this.heaveRate * subDt;
      this.pitch += this.pitchRate * subDt;
      this.roll += this.rollRate * subDt;
    }

    // 수치 안전장치 [자체설계]
    if (
      !Number.isFinite(this.heave) ||
      !Number.isFinite(this.pitch) ||
      !Number.isFinite(this.roll) ||
      Math.abs(this.heave) > HEAVE_LIMIT ||
      Math.abs(this.pitch) > ANGLE_LIMIT ||
      Math.abs(this.roll) > ANGLE_LIMIT
    ) {
      this.reset();
    }
  }
}
