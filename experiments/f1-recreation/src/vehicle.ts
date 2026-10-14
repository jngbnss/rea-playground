import { MathUtils, Quaternion, Vector3 } from 'three';
import type { DriveCommand } from './controller';

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
/** 잠긴 축의 횡그립 배수 [자체설계] 락 = 슬라이딩 마찰로 전환되어 횡력이 거의 사라진다 */
const LOCKED_LATERAL_GRIP = 0.35;

const UP = new Vector3(0, 1, 0);

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

/**
 * 마찰원: 종방향으로 쓴 그립만큼 횡그립이 줄어든다. [자체설계]
 *   scale = sqrt(1 - min(used/capacity, 1)^2)
 */
function frictionCircleScale(used: number, capacity: number): number {
  if (capacity <= 0) return 0;
  const ratio = Math.min(used / capacity, 1); // [자체설계]
  return Math.sqrt(Math.max(0, 1 - ratio * ratio)); // [자체설계]
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
  /** 최고 후진 속도 (m/s) [분석확인] */
  maxReverseSpeed: number;
  /** 전륜 제동 배분 [분석확인] 액티브 에어로 차량 분기 */
  brakeBias: number;
  /** 핸드브레이크 추가 감속 G [자체설계] */
  handbrakeG: number;
  /** 핸드브레이크 시 뒤 타이어 그립 배수 [분석확인] handbrakeGripFactor */
  handbrakeRearGrip: number;
  /** 차체 중심 높이 (m) [분석확인] = wheelRadius, 바퀴가 지면에 닿는 높이 */
  rideHeight: number;
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
  handbrakeG: 1.5, // [자체설계] 추가 제동값은 미확인
  handbrakeRearGrip: 0.3, // [분석확인] handbrakeGripFactor
  rideHeight: 0.36, // [분석확인] = wheelRadius
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

  /** 리셋 기준 위치 */
  readonly startPosition = new Vector3();
  /** 리셋 기준 헤딩 */
  startYaw = 0;

  constructor(params: Partial<VehicleParams> = {}) {
    this.params = { ...DEFAULT_VEHICLE, ...params };
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
    this.velocity.set(0, 0, 0);
    this.quaternion.setFromAxisAngle(UP, this.yaw);
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
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

    // --- 수직하중과 종방향 하중 이동 ---
    // normalLoad = mass*G + downforce*v² [분석확인]
    const normalLoad = p.mass * G + p.downforce * speed * speed; // [분석확인]
    // 정하중 배분 staticFront = b/(a+b), staticRear = a/(a+b) [분석확인: a=1.85, b=1.55]
    const staticFront = p.rearAxle / wheelBase; // [분석확인]
    const staticRear = p.frontAxle / wheelBase; // [분석확인]
    // 종가속도에 의한 이동량 ΔW = mass*ax*cgHeight/wheelBase [자체설계: 표준 1차 하중이동 식]
    // ax 는 직전 스텝에서 실제로 난 종가속도를 쓴다. 반복 수렴 대신 1스텝 지연을 택했다.
    // (dt = 1/60 에서 지연이 16.7 ms 뿐이고, 제동력→하중→제동력 내부 반복이 필요 없다.) [자체설계]
    const loadTransfer = (p.mass * this.longAccel * p.cgHeight) / wheelBase; // [자체설계]
    // 가속(ax>0)이면 뒤로, 제동(ax<0)이면 앞으로 옮겨간다. 음수 하중은 0 으로 클램프.
    const loadFront = Math.max(0, staticFront * normalLoad - loadTransfer); // [자체설계]
    const loadRear = Math.max(0, staticRear * normalLoad + loadTransfer); // [자체설계]

    // 기계그립 비중 보정 h = 1 + (grip - 1) * (mass*G) / normalLoad [분석확인]
    // 다운포스가 붙을수록 1 로 수렴한다 = 고속에서는 에어로 그립이 지배한다.
    const mechLoadRatio = (p.mass * G) / normalLoad; // [분석확인]
    const muFront = p.frontFriction * (1 + (p.frontGrip - 1) * mechLoadRatio); // [분석확인]
    // 핸드브레이크는 뒤 타이어 그립을 최대 0.3 배까지 떨어뜨린다 [분석확인]
    const muRear =
      p.rearFriction *
      (1 + (p.rearGrip - 1) * mechLoadRatio) *
      (1 - (1 - p.handbrakeRearGrip) * command.handbrake); // [분석확인]

    // --- 저항 [분석확인] drag = Cd*v², rolling = Crr*normalLoad ---
    const dragForce = p.dragCoefficient * speed * speed; // [분석확인]
    const rollingForce = p.rollingResistance * normalLoad; // [분석확인]

    // --- 종방향 구동력 [분석확인] ---
    const engineForce = p.mass * G * p.launchG; // [분석확인]
    let driveForce = 0;
    if (command.drive > 0) {
      const vEff = Math.max(vx, 1); // [분석확인]
      const cap = Math.min(p.maxSpeed, p.speedCap); // [분석확인]
      const limiterFade = 1 - MathUtils.clamp((vx - cap * 0.985) / (cap * 0.015), 0, 1); // [분석확인]
      const launchDiv = 1.07 + 0.09 * Math.max(0, 1 - vx / (p.maxSpeed * 0.3)); // [분석확인]
      // 파워는 고정값이 아니라 ERS 테이퍼가 걸린 속도 함수다 [분석확인]
      driveForce =
        (command.drive * Math.min(engineForce, this.availablePower(vx) / vEff) * limiterFade) /
        launchDiv; // [분석확인]
    } else if (command.drive < 0) {
      const t = MathUtils.clamp(Math.max(-vx, 0) / p.maxReverseSpeed, 0, 1); // [분석확인]
      driveForce = command.drive * (p.mass * 5) * (1 - t * t); // [분석확인] reverseForce = mass * 5
    }
    // 구동은 RWD [분석확인] → 뒤축 그립으로 제한한다. 가속 시 하중이 뒤로 실려 한계가 커진다. [자체설계]
    const rearTraction = muRear * loadRear; // [자체설계]
    driveForce = MathUtils.clamp(driveForce, -rearTraction, rearTraction); // [자체설계]

    // --- 축별 제동력: brakeForce = mass*G*4 를 brakeBias 로 배분 [분석확인] ---
    const brakeTotal = command.brake * (p.mass * G * 4); // [분석확인]
    const frontDemand = brakeTotal * p.brakeBias; // [분석확인]
    // 핸드브레이크 추가 제동은 뒤축에만 더한다 [자체설계]
    const rearDemand =
      brakeTotal * (1 - p.brakeBias) + command.handbrake * (p.mass * G * p.handbrakeG);
    // 축별 그립 한계 = μ * 축하중 * 제동 보정 [분석확인]
    const frontBrakeGrip = muFront * loadFront * p.brakingModifier; // [분석확인]
    const rearBrakeGrip = muRear * loadRear * p.brakingModifier; // [분석확인]
    // 휠 락: 요구 제동력 > 그립한계 * 1.1 && |v| > 2 [분석확인]
    const lockable = Math.abs(vx) > LOCK_SPEED; // [분석확인]
    this.frontLocked = lockable && frontDemand > frontBrakeGrip * LOCK_MARGIN; // [분석확인]
    this.rearLocked = lockable && rearDemand > rearBrakeGrip * LOCK_MARGIN; // [분석확인]
    // 실제 제동력은 축별로 요구치와 그립 한계의 최솟값 [분석확인]
    const frontBrake = Math.min(frontDemand, frontBrakeGrip); // [분석확인]
    const rearBrake = Math.min(rearDemand, rearBrakeGrip); // [분석확인]
    const brakeForce = frontBrake + rearBrake;

    // 진행 반대 방향으로 걸리는 힘의 합
    const resistForce = dragForce + rollingForce + brakeForce;
    const longForce = driveForce - Math.sign(vx) * resistForce; // [자체설계] 1D 합력

    // 종방향 가속도 = 합력/mass, 회전 좌표계 보정항(yawRate*vy) 포함 [자체설계]
    const vxBefore = vx;
    vx += (longForce / p.mass + yawRate * vy) * dt;
    // 저항/제동만으로 차가 뒤로 밀리지 않도록 0에서 멈춘다. [자체설계]
    if (command.drive === 0 && vxBefore !== 0 && Math.sign(vx) !== Math.sign(vxBefore)) vx = 0;
    // 다음 스텝 하중 이동에 쓸 실측 종가속도 [자체설계]
    this.longAccel = (vx - vxBefore) / dt;

    // 마찰원: 축별 "순" 종방향 타이어력만큼 횡그립이 줄어든다.
    // 구동력은 RWD 라 전부 뒤축, 제동은 위에서 구한 축별 값. 구동과 제동은 서로 반대
    // 방향이라 합이 아니라 차로 상쇄시킨다. 적용 방식은 [자체설계]
    // 잠긴 축은 슬라이딩 마찰로 넘어가 횡력이 거의 사라진다. [자체설계]
    const brakeSign = vx >= 0 ? 1 : -1;
    const longFront = -brakeSign * frontBrake; // [자체설계]
    const longRear = driveForce - brakeSign * rearBrake; // [자체설계]
    const gripFront =
      frictionCircleScale(Math.abs(longFront), muFront * loadFront) *
      (this.frontLocked ? LOCKED_LATERAL_GRIP : 1); // [자체설계]
    const gripRear =
      frictionCircleScale(Math.abs(longRear), muRear * loadRear) *
      (this.rearLocked ? LOCKED_LATERAL_GRIP : 1); // [자체설계]

    // --- 횡방향: 자전거 모델 + 매직포뮬러 [자체설계 구조 / 곡선은 분석확인] ---
    const subDt = dt / LATERAL_SUBSTEPS;
    const cosDelta = Math.cos(delta);
    const tanDelta = Math.tan(delta);

    for (let i = 0; i < LATERAL_SUBSTEPS; i += 1) {
      // 저속에서 발산하지 않도록 분모를 하한으로 보호 [자체설계]
      const vxSafe = Math.max(Math.abs(vx), SLIP_SPEED_FLOOR);
      // 슬립각 [자체설계: 자전거 모델]
      const alphaF = Math.atan2(vy + yawRate * p.frontAxle, vxSafe) - delta;
      const alphaR = Math.atan2(vy - yawRate * p.rearAxle, vxSafe);
      // 타이어 횡력 = -sign(α) * μ * 하중 * F(|α|) [분석확인: 매직포뮬러 곡선]
      const fyFront = -Math.sign(alphaF) * muFront * loadFront * gripFront * magicFormula(Math.abs(alphaF));
      const fyRear = -Math.sign(alphaR) * muRear * loadRear * gripRear * magicFormula(Math.abs(alphaR));

      // yawRate += (a*Fyf*cos(δ) - b*Fyr)/Izz * dt [자체설계]
      const yawAccel = (p.frontAxle * fyFront * cosDelta - p.rearAxle * fyRear) / p.yawInertia;
      // 횡가속 = (Fyf*cos(δ) + Fyr)/m - yawRate*vx (회전 좌표계) [자체설계]
      const lateralAccel = (fyFront * cosDelta + fyRear) / p.mass - yawRate * vx;

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

    // 수치 안전장치: NaN 이 생기면 정지 상태로 되돌린다. [자체설계]
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(yawRate)) {
      this.reset();
      return;
    }

    this.forwardSpeed = vx;
    this.lateralSpeed = vy;
    this.yawRate = yawRate;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)); // [-π, π] 정규화

    // 평지 주행: y 고정, 월드 경계 밖으로 나가지 않도록 클램프 [자체설계]
    this.position.y = p.rideHeight;
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
    this.quaternion.setFromAxisAngle(UP, this.yaw);
  }
}
