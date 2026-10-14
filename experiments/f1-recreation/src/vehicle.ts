import { MathUtils, Quaternion, Vector3 } from 'three';
import type { DriveCommand } from './controller';
import { FL, FR, RL, RR, Suspension, WHEEL_COUNT } from './suspension';

/**
 * 차량 상태와 적분기.
 *
 * 원본은 Rapier 레이캐스트 서스펜션 4륜 + Pacejka 매직포뮬러를 쓰지만,
 * 이 데모는 물리 엔진 없이 자전거 모델(bicycle model) 2륜 등가로 근사한다. [자체설계]
 * 종방향 구동/제동/저항 식, 차량 제원, ERS 테이퍼, 휠 락 판정은 분석에서 확인된 값 그대로다. [분석확인]
 * 원본의 액티브 에어로(직선 주행 시 drag/downforce 를 Gn 쪽으로 보간)는 구현하지 않는다. [자체설계]
 *
 * 좌표 규약 (three.js 오른손 좌표계, Y 업):
 *   전방 F = (-sin(yaw), 0, -cos(yaw))   // yaw=0 이면 -Z
 *   좌측 L = (-cos(yaw), 0, +sin(yaw))
 *   yaw 가 커지면 좌회전, yawRate / steerAngle 도 좌회전이 +.
 */

/** 중력가속도 [분석확인] */
const G = 9.81;
/** 매직포뮬러 강성 계수 [분석확인] */
const MF_B = 36;
/** 횡방향 적분 서브스텝 수 [자체설계] - 타이어 강성이 커서 1/60 한 번으론 발산한다 */
const LATERAL_SUBSTEPS = 8;
/** 슬립각 분모 보호 하한 (m/s) [자체설계] */
const SLIP_SPEED_FLOOR = 3;
/** 이 속도 이하는 운동학 모델 100% [자체설계] */
const KINEMATIC_BLEND_LOW = 1;
/** 이 속도 이상은 동역학(타이어) 모델 100% [자체설계] */
const KINEMATIC_BLEND_HIGH = 8;
/** ERS 테이퍼: 이 속도(km/h) 이하는 MGU-K 전개 100% [분석확인] Rn(v) */
const ERS_FULL_KMH = 290;
/** ERS 테이퍼: 이 속도(km/h)에서 MGU-K 전개 0% [분석확인] */
const ERS_ZERO_KMH = 355;
/** ERS 테이퍼 구간 폭 (km/h) [분석확인] (355 - 290) */
const ERS_TAPER_SPAN = 65;
/** 휠 락 판정 여유 계수 [분석확인] 요구제동력 > 그립한계 * 1.1 */
const LOCK_MARGIN = 1.1;
/** 휠 락 판정 최소 속도 (m/s) [분석확인] |v| > 2 */
const LOCK_SPEED = 2;
/** 잠긴 바퀴의 횡력 배수 [분석확인] `D *= .25` */
const LOCK_LATERAL_FACTOR = 0.25;
/** 잠긴 바퀴의 그립 용량 배수 [분석확인] `w *= .8` */
const LOCK_CAPACITY_FACTOR = 0.8;
/** 잠긴 바퀴의 제동력 배수 [분석확인] `j = ee * .8` */
const LOCK_BRAKE_FACTOR = 0.8;
/** 액티브 에어로 열림 시 항력 배수 [분석확인] Gn = { drag: .7, downforce: .55 } @ index 35,366 */
const ACTIVE_AERO_DRAG = 0.7;
/** 액티브 에어로 열림 시 다운포스 배수 [분석확인] */
const ACTIVE_AERO_DOWNFORCE = 0.55;
/** 액티브 에어로 열림 램프 시간 (s) [분석확인] zc = 0.5 @ Game 4,540,186 */
const AERO_OPEN_TIME = 0.5;
/** 액티브 에어로 닫힘 램프 시간 (s) [분석확인] Bc = 0.15 */
const AERO_CLOSE_TIME = 0.15;
/** 액티브 에어로 열림 허용 조향각 (rad) [분석확인] Vc = 0.03 */
const AERO_STEER_LIMIT = 0.03;
/** 액티브 에어로 열림 허용 브레이크 압력 [분석확인] brake < 0.05 */
const AERO_BRAKE_LIMIT = 0.05;
/** 직선 판정 요레이트 한계 (rad/s) [자체설계] 원본 straightZone(트랙 곡률 사전계산) 대체 */
const STRAIGHT_YAW_RATE = 0.05;

const UP = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Z = new Vector3(0, 0, 1);
/** 자세 합성용 스크래치 (프레임당 할당 0) */
const TILT_PITCH = new Quaternion();
const TILT_ROLL = new Quaternion();

/**
 * Pacejka 매직포뮬러 (슬립각 → 정규화 횡력 0~1). [분석확인]
 *   F(s) = sin(1.2 * atan(B*s - 0.3*(B*s - atan(B*s)))),  B = 36
 */
export function magicFormula(slip: number): number {
  const bs = MF_B * slip; // [분석확인]
  return Math.sin(1.2 * Math.atan(bs - 0.3 * (bs - Math.atan(bs)))); // [분석확인]
}

/**
 * ERS(MGU-K) 전개 테이퍼. [분석확인]
 *   Rn(v) = kmh <= 290 ? 1 : max(0, (355 - kmh) / 65)
 * 290 km/h 까지는 전량 전개, 355 km/h 에서 0 이 된다.
 */
export function ersTaper(speed: number): number {
  const kmh = Math.abs(speed) * 3.6; // [분석확인]
  if (kmh <= ERS_FULL_KMH) return 1; // [분석확인]
  return Math.max(0, (ERS_ZERO_KMH - kmh) / ERS_TAPER_SPAN); // [분석확인]
}

export interface VehicleParams {
  /** 질량 (kg) [분석확인] 차종표 kg = 800 */
  mass: number;
  /** 무게중심 ~ 앞차축 거리 a (m) [분석확인] wheelBase/2 + 0.15 (formula 분기 CG z 오프셋) */
  frontAxle: number;
  /** 무게중심 ~ 뒷차축 거리 b (m) [분석확인] wheelBase/2 - 0.15 */
  rearAxle: number;
  /** 요 관성모멘트 Izz (kg·m²) [자체설계] 원본은 Rapier 강체가 자동 계산 */
  yawInertia: number;
  /** 무게중심 높이 (m) [분석확인] tune.cgHeight */
  cgHeight: number;
  /** 바퀴 반지름 (m) [분석확인] tune.wheelRadius */
  wheelRadius: number;
  /** 윤거 절반 (m) [분석확인] dims[1]/2 - 0.15 */
  trackHalf: number;
  /** 엔진 파워 (W) [분석확인] kw * 1000 * 드라이브트레인 효율 0.88 */
  enginePower: number;
  /** MGU-K 파워 (W) [분석확인] 350 kW * 0.88. ERS 테이퍼가 걸리는 몫 */
  mgukPower: number;
  /** 최고 속도 (m/s) [분석확인] 번들 이분탐색 결과 */
  topSpeed: number;
  /** 물리 최고 속도 (m/s) [분석확인] topSpeed * 1.04 */
  maxSpeed: number;
  /** 추가 속도 리미터 (m/s). cap = min(maxSpeed, speedCap) [분석확인 구조 / 값 자체설계] */
  speedCap: number;
  /** 발진 G. engineForce = mass*G*launchG [분석확인] */
  launchG: number;
  /** 다운포스 계수 (N/(m/s)²) [분석확인] tune.downforce * 차종보정 */
  downforce: number;
  /** 공기저항 계수 (N/(m/s)²) [분석확인] 번들 top-speed 역산식 */
  dragCoefficient: number;
  /** 구름저항 계수 [분석확인] formula 분기 */
  rollingResistance: number;
  /** 앞 타이어 마찰계수 [분석확인] tune.mu */
  frontFriction: number;
  /** 뒤 타이어 마찰계수 [분석확인] tune.mu * 1.03 */
  rearFriction: number;
  /** 앞 기계그립 계수 [분석확인] tune.grip[0] */
  frontGrip: number;
  /** 뒤 기계그립 계수 [분석확인] tune.grip[1] */
  rearGrip: number;
  /** 제동 그립 보정 [분석확인] 차종보정 braking */
  brakingModifier: number;
  /** 제동 요구치 배수 [분석확인] brakeForceScale = 1.5 */
  brakeForceScale: number;
  /** 제동 그립 배수 [분석확인] brakeGrip = 1.2 */
  brakeGripMultiplier: number;
  /** 기계그립 보정 계수 [분석확인] 차종보정 grip (mechGrip) */
  mechGrip: number;
  /** 구동 접지 보정 [분석확인] 차종보정 traction */
  tractionModifier: number;
  /** 최고 후진 속도 (m/s) [분석확인] */
  maxReverseSpeed: number;
  /** 전륜 제동 배분 [분석확인] 액티브 에어로 차량 분기 */
  brakeBias: number;
  /** 핸드브레이크 추가 제동력 (N) [분석확인] handbrakeForce = mass * 6 */
  handbrakeForce: number;
  /** 핸드브레이크 시 뒤 타이어 그립 배수 [분석확인] handbrakeGripFactor */
  handbrakeRearGrip: number;
  /** 차체 중심 높이 (m) [분석확인] = wheelRadius, 바퀴가 지면에 닿는 높이 */
  rideHeight: number;
  /** 다운포스 전륜 배분 [분석확인] aeroBalance = activeAero ? 0.45 : 0.5 - cgZ/L */
  aeroBalance: number;
  /** 서스펜션 강성 (N/m) [분석확인] mass * springPerKg(56) */
  suspensionStiffness: number;
  /** 서스펜션 감쇠 (N·s/m) [분석확인] mass * damperPerKg(3.25) */
  suspensionDamping: number;
  /** 앞 안티롤바 (N/m) [분석확인] mass * antiRollPerKg[0](120) */
  antiRollFront: number;
  /** 뒤 안티롤바 (N/m) [분석확인] mass * antiRollPerKg[1](95) */
  antiRollRear: number;
  /** 서스펜션 자유장 (m) [분석확인] f1 tune.rest = 0.3 */
  suspensionRestLength: number;
  /** 피치 관성모멘트 (kg·m²) [자체설계] 동역학 지수 1 가정 m·a·b */
  pitchInertia: number;
  /** 롤 관성모멘트 (kg·m²) [자체설계] m·trackHalf² */
  rollInertia: number;
  /** 월드 이동 한계 (±m) [자체설계] */
  worldLimit: number;
}

export const DEFAULT_VEHICLE: VehicleParams = {
  mass: 800, // [분석확인] 차종표 kg
  frontAxle: 1.85, // [분석확인] 3.4/2 + 0.15
  rearAxle: 1.55, // [분석확인] 3.4/2 - 0.15 → wheelBase 3.4
  yawInertia: 800 * 1.55, // [자체설계] Izz = mass * b = 1,240 kg·m²
  cgHeight: 0.33, // [분석확인] tune.cgHeight
  wheelRadius: 0.36, // [분석확인] tune.wheelRadius
  trackHalf: 0.8, // [분석확인] 1.9/2 - 0.15
  enginePower: 695200, // [분석확인] 790*1000*0.88
  mgukPower: 308000, // [분석확인] 350*1000*0.88
  topSpeed: 97.756, // [분석확인] 352 km/h
  maxSpeed: 101.666, // [분석확인] topSpeed * 1.04
  speedCap: 97.756, // [자체설계] 리미터 기준선을 topSpeed 로 둔다 (원본은 세션별 가변)
  launchG: 1.4, // [분석확인] engineForce = 800*9.81*1.4 = 10,987.2 N
  downforce: 2.784, // [분석확인] 2.9 * 0.96
  dragCoefficient: 0.51362, // [분석확인] 번들 top-speed 역산
  rollingResistance: 0.03, // [분석확인] formula 분기
  frontFriction: 1.75, // [분석확인] tune.mu
  rearFriction: 1.8025, // [분석확인] tune.mu * 1.03
  frontGrip: 0.9, // [분석확인] tune.grip[0]
  rearGrip: 0.95, // [분석확인] tune.grip[1]
  brakingModifier: 1.02, // [분석확인] 차종보정 braking
  maxReverseSpeed: 12, // [분석확인]
  brakeBias: 0.56, // [분석확인] 액티브 에어로 차량 분기
  brakeForceScale: 1.5, // [분석확인] physics.brakeForceScale
  brakeGripMultiplier: 1.2, // [분석확인] physics.brakeGrip = hc = 1.2
  mechGrip: 0.985, // [분석확인] 차종보정 grip
  tractionModifier: 0.97, // [분석확인] 차종보정 traction
  handbrakeForce: 800 * 6, // [분석확인] 4,800 N
  handbrakeRearGrip: 0.3, // [분석확인] handbrakeGripFactor
  rideHeight: 0.36, // [분석확인] = wheelRadius
  aeroBalance: 0.45, // [분석확인] 액티브 에어로 차량 분기 (index @ 38,825)
  suspensionStiffness: 800 * 56, // [분석확인] 44,800 N/m
  suspensionDamping: 800 * 3.25, // [분석확인] 2,600 N·s/m
  antiRollFront: 800 * 120, // [분석확인] 96,000 N/m
  antiRollRear: 800 * 95, // [분석확인] 76,000 N/m
  suspensionRestLength: 0.3, // [분석확인] f1 tune.rest
  pitchInertia: 800 * 1.85 * 1.55, // [자체설계] 2,294 kg·m²
  rollInertia: 800 * 0.8 * 0.8, // [자체설계] 512 kg·m²
  worldLimit: 1900, // [자체설계] 지면 4000×4000 안쪽
};

export class Vehicle {
  readonly params: VehicleParams;

  /** 월드 위치 = 렌더 보간의 curr 포즈 */
  readonly position = new Vector3();
  /** 월드 자세 = 렌더 보간의 curr 포즈 */
  readonly quaternion = new Quaternion();
  /** 직전 fixedUpdate 시작 시점의 위치 (렌더 보간의 prev 포즈) [분석확인] */
  readonly prevPosition = new Vector3();
  /** 직전 fixedUpdate 시작 시점의 자세 [분석확인] */
  readonly prevQuaternion = new Quaternion();
  /** 월드 좌표 속도 (읽기 전용 용도) */
  readonly velocity = new Vector3();

  /** 헤딩 (rad, + 가 좌회전) */
  yaw = 0;
  /** 요 각속도 (rad/s) */
  yawRate = 0;
  /** 차체 전방 속도 (m/s, 전진 +) */
  forwardSpeed = 0;
  /** 차체 횡방향 속도 (m/s, 좌측 +) */
  lateralSpeed = 0;
  /** 물리 기준 조향각 (rad, + 가 좌회전) */
  steerAngle = 0;
  /** 직전 스텝의 종가속도 (m/s²). 하중 이동 계산 입력 [자체설계] */
  longAccel = 0;
  /** 앞축 휠 락 여부 [분석확인] */
  frontLocked = false;
  /** 뒤축 휠 락 여부 [분석확인] */
  rearLocked = false;
  /** 액티브 에어로 전개율 0~1 [분석확인] aeroMode */
  aeroMode = 0;
  /** 직전 스텝의 타이어 횡가속도 (m/s², 좌 +). 롤 하중이동 입력 [자체설계] */
  lateralAccel = 0;
  /** 4륜 서스펜션 — 바퀴별 수직 하중 공급원 */
  readonly suspension: Suspension;
  /** 바퀴별 휠 락 여부 [분석확인] 원본은 바퀴 단위로 판정한다 */
  readonly wheelLocked = [false, false, false, false];
  /** 바퀴별 제동력 (N) */
  private readonly wheelBrake = new Float64Array(WHEEL_COUNT);
  /** 브레이크 보조 (B 키). 원본 기본값은 켜짐 [분석확인] `brakeAssist = !0` */
  brakeAssist = true;
  /** 직전 스텝의 앞축 타이어 횡력 (N). 마찰타원 입력 [자체설계: 1스텝 지연] */
  prevLateralFront = 0;
  /** 직전 스텝의 뒤축 타이어 횡력 (N) */
  prevLateralRear = 0;

  /** 리셋 기준 위치 */
  readonly startPosition = new Vector3();
  /** 리셋 기준 헤딩 */
  startYaw = 0;

  constructor(params: Partial<VehicleParams> = {}) {
    this.params = { ...DEFAULT_VEHICLE, ...params };
    const p = this.params;
    this.suspension = new Suspension({
      mass: p.mass,
      frontAxle: p.frontAxle,
      rearAxle: p.rearAxle,
      trackHalf: p.trackHalf,
      cgHeight: p.cgHeight,
      stiffness: p.suspensionStiffness,
      damping: p.suspensionDamping,
      antiRollFront: p.antiRollFront,
      antiRollRear: p.antiRollRear,
      restLength: p.suspensionRestLength,
      aeroBalance: p.aeroBalance,
      pitchInertia: p.pitchInertia,
      rollInertia: p.rollInertia,
    });
    this.reset();
  }

  get wheelBase(): number {
    return this.params.frontAxle + this.params.rearAxle;
  }

  /** 계기판용 속도 (km/h). [분석확인] speedKmh = forwardSpeed * 3.6 */
  get speedKmh(): number {
    return this.forwardSpeed * 3.6; // [분석확인]
  }

  /**
   * 속도에 따른 가용 파워 (W). 원본 `zn()`. [분석확인]
   *   availablePower(v) = enginePower - mgukPower + mgukPower * Rn(v)
   * 290 km/h 이하 695.2 kW, 355 km/h 이상 387.2 kW.
   */
  availablePower(speed: number): number {
    const p = this.params;
    return p.enginePower - p.mgukPower + p.mgukPower * ersTaper(speed); // [분석확인]
  }

  setStart(x: number, z: number, yaw: number): void {
    this.startPosition.set(x, this.params.rideHeight, z);
    this.startYaw = yaw;
    this.reset();
  }

  reset(): void {
    this.position.copy(this.startPosition);
    this.position.y = this.params.rideHeight;
    this.yaw = this.startYaw;
    this.yawRate = 0;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.steerAngle = 0;
    this.longAccel = 0;
    this.frontLocked = false;
    this.rearLocked = false;
    this.lateralAccel = 0;
    this.aeroMode = 0;
    this.prevLateralFront = 0;
    this.prevLateralRear = 0;
    this.suspension.reset();
    for (let i = 0; i < WHEEL_COUNT; i += 1) {
      this.wheelLocked[i] = false;
      this.wheelBrake[i] = 0;
    }
    this.velocity.set(0, 0, 0);
    this.quaternion.setFromAxisAngle(UP, this.yaw);
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
  }

  /**
   * 액티브 에어로 전개율 갱신. [분석확인] `Game-CGRrnhwj.js @ 4,541,495`
   *   open     = straightZone && brake < 0.05 && |steerAngle| < 0.03
   *   aeroMode = open ? min(1, m + dt/0.5) : max(0, m - dt/0.15)
   * 원본의 `straightZone` 은 트랙 중심선 곡률로 미리 계산한 구간 배열을
   * `nearestIndex(position)` 로 조회한 값이다 (`@ 4,565,795`). 이 데모에는 트랙
   * 스플라인이 없어 요레이트 임계로 대체한다. [자체설계]
   */
  updateActiveAero(brake: number, steerAngle: number, dt: number): void {
    const straightZone = Math.abs(this.yawRate) < STRAIGHT_YAW_RATE; // [자체설계]
    const open =
      straightZone && brake < AERO_BRAKE_LIMIT && Math.abs(steerAngle) < AERO_STEER_LIMIT; // [분석확인]
    this.aeroMode = open
      ? Math.min(1, this.aeroMode + dt / AERO_OPEN_TIME) // [분석확인]
      : Math.max(0, this.aeroMode - dt / AERO_CLOSE_TIME); // [분석확인]
  }

  fixedUpdate(command: DriveCommand, dt: number): void {
    const p = this.params;
    const wheelBase = p.frontAxle + p.rearAxle;

    // 렌더 보간을 위해 직전 포즈 보관 [분석확인]
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);

    // 입력 규약(+우측)과 월드 yaw 규약(+좌측)이 반대라 부호를 뒤집는다. [자체설계]
    this.steerAngle = -command.steerAngle;
    const delta = this.steerAngle;

    let vx = this.forwardSpeed;
    let vy = this.lateralSpeed;
    let yawRate = this.yawRate;
    const speed = Math.hypot(vx, vy);

    // --- 액티브 에어로: 전개율로 항력·다운포스를 보간한다 [분석확인] ---
    this.updateActiveAero(command.brake, command.steerAngle, dt); // [분석확인]
    const aeroDragScale = 1 + (ACTIVE_AERO_DRAG - 1) * this.aeroMode; // [분석확인]
    const aeroDownScale = 1 + (ACTIVE_AERO_DOWNFORCE - 1) * this.aeroMode; // [분석확인]

    // --- 수직하중: 바퀴 4개의 서스펜션이 만든다 ---
    // 다운포스 = downforce * activeAero.downforce * v² [분석확인]
    const downforce = p.downforce * aeroDownScale * speed * speed; // [분석확인]
    // normalLoad = mass*G + downforce*v² — 구름저항·기계그립 보정의 기준값 [분석확인]
    const normalLoad = p.mass * G + downforce; // [분석확인]
    // 직전 스텝의 실측 종·횡가속도로 차체 자세를 적분한다 (1스텝 지연). [자체설계]
    this.suspension.step(this.longAccel, this.lateralAccel, downforce, dt);
    const loads = this.suspension.loads;
    const loadRear = loads[RL] + loads[RR];

    // 바퀴 마찰계수 μ = friction × surfaceGrip × tyreGrip × h  [분석확인] `Game @ 4,536,353`
    //   h = 1 + (mechGrip - 1) * (mass*G) / (mass*G + downforce*v²)   ← mechGrip 은 차종보정 grip
    // 노면 그립(surfaceGrip)·타이어 마모(tyreGrip)는 데모 미구현이라 1 이다. [자체설계: 생략]
    const mechBlend = 1 + (p.mechGrip - 1) * ((p.mass * G) / normalLoad); // [분석확인]
    // 핸드브레이크는 뒤 타이어의 μ 와 기계그립을 함께 떨어뜨린다 (원본은 b, x 양쪽에 곱한다) [분석확인]
    const handbrakeFactor = 1 - (1 - p.handbrakeRearGrip) * command.handbrake; // [분석확인]
    const muFront = p.frontFriction * mechBlend; // [분석확인]
    const muRear = p.rearFriction * mechBlend * handbrakeFactor; // [분석확인]
    // 기계그립 계수는 μ 가 아니라 "이번 스텝에 횡속도를 소거하는 힘" 상한에 쓰인다 [분석확인]
    const gripFront = p.frontGrip; // [분석확인]
    const gripRear = p.rearGrip * handbrakeFactor; // [분석확인]

    // --- 저항 [분석확인] drag = Cd * activeAero.drag * v², rolling = Crr*normalLoad ---
    const dragForce = p.dragCoefficient * aeroDragScale * speed * speed; // [분석확인]
    const rollingForce = p.rollingResistance * normalLoad; // [분석확인]

    // --- 종방향 구동력 [분석확인] ---
    const engineForce = p.mass * G * p.launchG; // [분석확인]
    let driveDemand = 0;
    if (command.drive > 0) {
      const vEff = Math.max(vx, 1); // [분석확인]
      const cap = Math.min(p.maxSpeed, p.speedCap); // [분석확인]
      const limiterFade = 1 - MathUtils.clamp((vx - cap * 0.985) / (cap * 0.015), 0, 1); // [분석확인]
      const launchDiv = 1.07 + 0.09 * Math.max(0, 1 - vx / (p.maxSpeed * 0.3)); // [분석확인]
      // 파워는 고정값이 아니라 ERS 테이퍼가 걸린 속도 함수다 [분석확인]
      driveDemand =
        (command.drive * Math.min(engineForce, this.availablePower(vx) / vEff) * limiterFade) /
        launchDiv; // [분석확인]
    } else if (command.drive < 0) {
      const t = MathUtils.clamp(Math.max(-vx, 0) / p.maxReverseSpeed, 0, 1); // [분석확인]
      driveDemand = command.drive * (p.mass * 5) * (1 - t * t); // [분석확인] reverseForce = mass * 5
    }

    // --- 바퀴별 제동 요구치 [분석확인] `Game @ 4,536,503` ---
    //   k = brakeAssist ? clamp(앞하중비, 0.45, 0.75) : brakeBias
    //   j = brake * brakeForce * brakeForceScale(1.5) * (앞 ? k : 1-k) / (바퀴수/2)
    const totalLoad = loads[FL] + loads[FR] + loadRear;
    const frontShare =
      totalLoad > 0 ? MathUtils.clamp((loads[FL] + loads[FR]) / totalLoad, 0.45, 0.75) : 0.5; // [분석확인]
    const bias = this.brakeAssist ? frontShare : p.brakeBias; // [분석확인]
    const brakeDemand = command.brake * (p.mass * G * 4) * p.brakeForceScale; // [분석확인]
    const demandFront = (brakeDemand * bias) / 2; // [분석확인]
    // 핸드브레이크는 뒤 두 바퀴에 handbrakeForce(= mass*6) 의 절반씩 더해진다 [분석확인]
    const demandRear =
      (brakeDemand * (1 - bias)) / 2 + (command.handbrake * p.handbrakeForce) / 2; // [분석확인]

    // --- 바퀴별 힘 해석: 제동·구동·횡력을 마찰타원으로 함께 깎는다 [분석확인] ---
    const lockable = Math.abs(vx) > LOCK_SPEED; // [분석확인]
    const driveSign = Math.sign(vx || 1);
    let frontBrake = 0;
    let rearBrake = 0;
    let driveForce = 0;
    let lateralFront = 0;
    let lateralRear = 0;
    for (let i = 0; i < WHEEL_COUNT; i += 1) {
      const isFront = i === FL || i === FR;
      // w = μ * 수직하중 — 타이어가 낼 수 있는 힘의 기준값 [분석확인]
      let capacity = (isFront ? muFront : muRear) * loads[i]; // [분석확인]
      // 제동 그립 한계 ee = w * brakeGrip(1.2) * braking(1.02) [분석확인]
      const brakeGrip = capacity * p.brakeGripMultiplier * p.brakingModifier; // [분석확인]
      let demand = isFront ? demandFront : demandRear;
      // 구동은 RWD → 뒤 두 바퀴가 절반씩 [분석확인]
      let drive = isFront ? 0 : driveDemand / 2; // [분석확인]
      let lateralScale = 1;
      // 휠 락은 브레이크 보조가 꺼져 있을 때만 일어난다 [분석확인]
      const locked = !this.brakeAssist && lockable && demand > brakeGrip * LOCK_MARGIN; // [분석확인]
      this.wheelLocked[i] = locked;
      if (locked) {
        capacity *= LOCK_CAPACITY_FACTOR; // [분석확인] w *= 0.8
        lateralScale = LOCK_LATERAL_FACTOR; // [분석확인] 횡력 *= 0.25
        demand = brakeGrip * LOCK_BRAKE_FACTOR; // [분석확인] j = ee * 0.8
      }
      // 마찰타원: hypot(횡력/w, 순종방향력/M) > 1 이면 세 힘을 같은 비율로 줄인다 [분석확인]
      //   M = j > O ? ee : w * traction
      // 횡력은 직전 스텝의 축 횡력을 바퀴당으로 나눠 추정한다 (1스텝 지연). [자체설계: 적용 시점]
      const lateral =
        ((isFront ? this.prevLateralFront : this.prevLateralRear) / 2) * lateralScale; // [자체설계]
      const net = drive - demand * driveSign;
      const longCapacity = demand > drive ? brakeGrip : capacity * p.tractionModifier; // [분석확인]
      if (capacity > 0 && longCapacity > 0) {
        const ellipse = Math.hypot(lateral / capacity, net / longCapacity); // [분석확인]
        if (ellipse > 1) {
          const scale = 1 / ellipse; // [분석확인]
          demand *= scale;
          drive *= scale;
          lateralScale *= scale;
        }
      }
      this.wheelBrake[i] = demand;
      if (isFront) {
        frontBrake += demand;
        lateralFront += capacity * lateralScale;
      } else {
        rearBrake += demand;
        driveForce += drive;
        lateralRear += capacity * lateralScale;
      }
    }
    this.frontLocked = this.wheelLocked[FL] || this.wheelLocked[FR];
    this.rearLocked = this.wheelLocked[RL] || this.wheelLocked[RR];
    const brakeForce = frontBrake + rearBrake;

    // 진행 반대 방향으로 걸리는 힘의 합
    const resistForce = dragForce + rollingForce + brakeForce;
    const longForce = driveForce - Math.sign(vx) * resistForce; // [자체설계] 1D 합력

    // 종방향 가속도 = 합력/mass, 회전 좌표계 보정항(yawRate*vy) 포함 [자체설계]
    const vxBefore = vx;
    vx += (longForce / p.mass + yawRate * vy) * dt;
    // 저항/제동만으로 차가 뒤로 밀리지 않도록 0에서 멈춘다.
    // 원본은 바퀴별로 `제동 임펄스 ≤ |v| * massPerWheel` 로 같은 일을 한다. [분석확인: 의도]
    if (command.drive === 0 && vxBefore !== 0 && Math.sign(vx) !== Math.sign(vxBefore)) vx = 0;
    // 피치 하중이동 입력은 "타이어·공기력이 만든" 종가속도만 쓴다. [자체설계]
    // 회전 좌표계 보정항(yawRate*vy)까지 넣으면 스핀 중 가짜 가속도가 피치를 폭주시킨다.
    this.longAccel = longForce / p.mass;

    // --- 횡방향: 자전거 모델 + 매직포뮬러 [자체설계 구조 / 곡선은 분석확인] ---
    const subDt = dt / LATERAL_SUBSTEPS;
    const cosDelta = Math.cos(delta);
    const tanDelta = Math.tan(delta);
    let lateralAccelSum = 0;

    for (let i = 0; i < LATERAL_SUBSTEPS; i += 1) {
      // 저속에서 발산하지 않도록 분모를 하한으로 보호 [자체설계]
      const vxSafe = Math.max(Math.abs(vx), SLIP_SPEED_FLOOR);
      // 슬립각 [자체설계: 자전거 모델]
      const alphaF = Math.atan2(vy + yawRate * p.frontAxle, vxSafe) - delta;
      const alphaR = Math.atan2(vy - yawRate * p.rearAxle, vxSafe);
      // 타이어 횡력 = -sign(α) * min(횡그립용량 * F(|α|), E) [분석확인] `Game @ 4,536,200`
      //   E = |바퀴 좌표계 횡속도| * massPerWheel * 기계그립 / dt
      //   = 이번 스텝에 그 미끄러짐을 완전히 없애는 데 필요한 힘. 그보다 큰 힘은 낼 수 없다.
      //   원본은 바퀴 단위라 massPerWheel, 여기서는 축 단위라 mass/2 를 쓴다. [자체설계: 축 환산]
      //   앞바퀴는 조향각만큼 돌아가 있으므로 바퀴 좌표계로 변환해야 한다 — 차체 좌표계로 쓰면
      //   직진 중 조향 시 횡속도가 0 이라 상한이 0 이 되어 차가 전혀 돌지 않는다.
      const sinDelta = Math.sin(delta);
      const lateralSpeedFront = (vy + yawRate * p.frontAxle) * cosDelta - vx * sinDelta; // [자체설계: 축 환산]
      const lateralSpeedRear = vy - yawRate * p.rearAxle; // [자체설계: 자전거 모델]
      const killFront = (Math.abs(lateralSpeedFront) * (p.mass / 2) * gripFront) / subDt; // [분석확인]
      const killRear = (Math.abs(lateralSpeedRear) * (p.mass / 2) * gripRear) / subDt; // [분석확인]
      const fyFront =
        -Math.sign(alphaF) * Math.min(lateralFront * magicFormula(Math.abs(alphaF)), killFront);
      const fyRear =
        -Math.sign(alphaR) * Math.min(lateralRear * magicFormula(Math.abs(alphaR)), killRear);
      // 다음 스텝의 마찰타원 계산에 쓸 축 횡력 [자체설계: 1스텝 지연]
      this.prevLateralFront = Math.abs(fyFront);
      this.prevLateralRear = Math.abs(fyRear);

      // yawRate += (a*Fyf*cos(δ) - b*Fyr)/Izz * dt [자체설계]
      const yawAccel = (p.frontAxle * fyFront * cosDelta - p.rearAxle * fyRear) / p.yawInertia;
      // 타이어가 만든 순수 횡가속 — 롤 하중이동 입력으로 쓴다 [자체설계]
      const tireLateral = (fyFront * cosDelta + fyRear) / p.mass;
      lateralAccelSum += tireLateral;
      // 횡가속 = 타이어 횡가속 - yawRate*vx (회전 좌표계) [자체설계]
      const lateralAccel = tireLateral - yawRate * vx;

      vy += lateralAccel * subDt;
      yawRate += yawAccel * subDt;

      // 저속/후진 구간은 운동학 자전거 모델로 블렌딩해 수치 발산을 막는다. [자체설계]
      //   kinYawRate = vx * tan(δ) / wheelBase,  kinVy = kinYawRate * b
      const kinYawRate = (vx * tanDelta) / wheelBase; // [자체설계]
      const kinLateral = kinYawRate * p.rearAxle; // [자체설계]
      const blend = MathUtils.clamp(
        (vx - KINEMATIC_BLEND_LOW) / (KINEMATIC_BLEND_HIGH - KINEMATIC_BLEND_LOW),
        0,
        1,
      ); // [자체설계]
      yawRate = kinYawRate + (yawRate - kinYawRate) * blend; // [자체설계]
      vy = kinLateral + (vy - kinLateral) * blend; // [자체설계]

      this.yaw += yawRate * subDt;
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      // 월드 이동 = 전방(-sin,0,-cos)*vx + 좌측(-cos,0,+sin)*vy [자체설계: 좌표 규약]
      this.position.x += (-sinYaw * vx - cosYaw * vy) * subDt;
      this.position.z += (-cosYaw * vx + sinYaw * vy) * subDt;
    }
    this.lateralAccel = lateralAccelSum / LATERAL_SUBSTEPS; // [자체설계]

    // 수치 안전장치: NaN 이 생기면 정지 상태로 되돌린다. [자체설계]
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(yawRate)) {
      this.reset();
      return;
    }

    this.forwardSpeed = vx;
    this.lateralSpeed = vy;
    this.yawRate = yawRate;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)); // [-π, π] 정규화

    // 차체 높이는 서스펜션 heave 만큼 움직인다 [자체설계: 원본은 강체가 담당]
    this.position.y = p.rideHeight + this.suspension.heave;
    const limit = p.worldLimit;
    if (this.position.x < -limit || this.position.x > limit) {
      this.position.x = MathUtils.clamp(this.position.x, -limit, limit);
      this.forwardSpeed *= 0.5;
    }
    if (this.position.z < -limit || this.position.z > limit) {
      this.position.z = MathUtils.clamp(this.position.z, -limit, limit);
      this.forwardSpeed *= 0.5;
    }

    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    this.velocity.set(
      -sinYaw * this.forwardSpeed - cosYaw * this.lateralSpeed,
      0,
      -cosYaw * this.forwardSpeed + sinYaw * this.lateralSpeed,
    );
    // 자세 = 요 × 피치 × 롤. 피치/롤은 서스펜션이 만든 차체 기울기다. [자체설계: 적용 방식]
    this.quaternion.setFromAxisAngle(UP, this.yaw);
    TILT_PITCH.setFromAxisAngle(AXIS_X, this.suspension.pitch); // + = 노즈 업
    TILT_ROLL.setFromAxisAngle(AXIS_Z, -this.suspension.roll); // roll + = 좌측이 위로
    this.quaternion.multiply(TILT_PITCH).multiply(TILT_ROLL);
  }
}
