import { MathUtils, Quaternion, Vector3 } from 'three';
import type { DriveCommand } from './controller';

/**
 * 차량 상태와 적분기.
 *
 * 원본은 Rapier 레이캐스트 서스펜션 4륜 + Pacejka 매직포뮬러를 쓰지만,
 * 이 데모는 물리 엔진 없이 자전거 모델(bicycle model) 2륜 등가로 근사한다. [자체설계]
 * 종방향 구동/제동/저항 식과 타이어 매직포뮬러 곡선은 분석에서 확인된 식 그대로다. [분석확인]
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
 * 마찰원: 종방향으로 쓴 그립만큼 횡그립이 줄어든다. [자체설계]
 *   scale = sqrt(1 - min(used/capacity, 1)^2)
 */
function frictionCircleScale(used: number, capacity: number): number {
  if (capacity <= 0) return 0;
  const ratio = Math.min(used / capacity, 1); // [자체설계]
  return Math.sqrt(Math.max(0, 1 - ratio * ratio)); // [자체설계]
}

export interface VehicleParams {
  /** 질량 (kg) [자체설계] */
  mass: number;
  /** 무게중심 ~ 앞차축 거리 a (m) [자체설계] */
  frontAxle: number;
  /** 무게중심 ~ 뒷차축 거리 b (m) [자체설계] */
  rearAxle: number;
  /** 요 관성모멘트 Izz (kg·m²) [자체설계] */
  yawInertia: number;
  /** 가용 파워 (W) [자체설계] */
  enginePower: number;
  /** 최고 속도 (m/s) [자체설계] */
  maxSpeed: number;
  /** 추가 속도 리미터 (m/s). cap = min(maxSpeed, speedCap) [분석확인 구조 / 값 자체설계] */
  speedCap: number;
  /** 발진 G. engineForce = mass*G*launchG [분석확인] */
  launchG: number;
  /** 다운포스 계수 (N/(m/s)²) [자체설계] */
  downforce: number;
  /** 공기저항 계수 (N/(m/s)²) [자체설계] */
  dragCoefficient: number;
  /** 구름저항 계수 [자체설계] */
  rollingResistance: number;
  /** 타이어 마찰계수 μ [자체설계] */
  tireFriction: number;
  /** 최고 후진 속도 (m/s) [분석확인] */
  maxReverseSpeed: number;
  /** 전륜 제동 배분 [분석확인] */
  brakeBias: number;
  /** 뒤 타이어 그립 보정 배수 [자체설계] a<b 배치로 생기는 오버스티어를 상쇄 */
  rearGripBias: number;
  /** 핸드브레이크 추가 감속 G [자체설계] */
  handbrakeG: number;
  /** 핸드브레이크 시 뒤 타이어 그립 배수 [자체설계] */
  handbrakeRearGrip: number;
  /** 차체 중심 높이 (m) [자체설계] */
  rideHeight: number;
  /** 월드 이동 한계 (±m) [자체설계] */
  worldLimit: number;
}

export const DEFAULT_VEHICLE: VehicleParams = {
  mass: 798, // [자체설계] F1 최소 중량에서 따온 데모 기본값
  frontAxle: 1.7, // [자체설계] wheelBase 3.6 = 1.7 + 1.9
  rearAxle: 1.9, // [자체설계]
  yawInertia: 798 * 1.9, // [자체설계] Izz = mass * 1.9
  enginePower: 735000, // [자체설계] 약 1000마력
  maxSpeed: 95, // [자체설계] 342 km/h
  speedCap: 95, // [자체설계]
  launchG: 1.4, // [분석확인]
  downforce: 2.2, // [자체설계]
  dragCoefficient: 0.9, // [자체설계]
  rollingResistance: 0.013, // [자체설계]
  tireFriction: 1.6, // [자체설계]
  maxReverseSpeed: 12, // [분석확인]
  brakeBias: 0.6, // [분석확인]
  rearGripBias: 1.2, // [자체설계]
  handbrakeG: 1.5, // [자체설계]
  handbrakeRearGrip: 0.3, // [자체설계]
  rideHeight: 0.35, // [자체설계]
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

    // --- 접지/저항 [분석확인] ---
    // normalLoad = mass*G + downforce*v², drag = Cd*v², rolling = Crr*normalLoad
    const normalLoad = p.mass * G + p.downforce * speed * speed; // [분석확인]
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
      driveForce =
        (command.drive * Math.min(engineForce, p.enginePower / vEff) * limiterFade) / launchDiv; // [분석확인]
    } else if (command.drive < 0) {
      const t = MathUtils.clamp(Math.max(-vx, 0) / p.maxReverseSpeed, 0, 1); // [분석확인]
      driveForce = command.drive * (p.mass * 5) * (1 - t * t); // [분석확인] reverseForce = mass * 5
    }

    // --- 제동력 [분석확인] brakeForce = mass*G*4, 핸드브레이크는 추가 제동 [자체설계] ---
    const brakeDemand =
      command.brake * (p.mass * G * 4) + command.handbrake * (p.mass * G * p.handbrakeG);
    // 타이어가 낼 수 있는 종방향 한계. 저속에선 4G 제동이 불가능하고 다운포스가 붙으면 가능해진다. [자체설계]
    const tractionLimit = p.tireFriction * normalLoad; // [자체설계]
    const brakeForce = Math.min(brakeDemand, tractionLimit); // [자체설계]
    driveForce = MathUtils.clamp(driveForce, -tractionLimit, tractionLimit); // [자체설계]

    // 진행 반대 방향으로 걸리는 힘의 합
    const resistForce = dragForce + rollingForce + brakeForce;
    const longForce = driveForce - Math.sign(vx) * resistForce; // [자체설계] 1D 합력

    // 종방향 가속도 = 합력/mass, 회전 좌표계 보정항(yawRate*vy) 포함 [자체설계]
    const vxBefore = vx;
    vx += (longForce / p.mass + yawRate * vy) * dt;
    // 저항/제동만으로 차가 뒤로 밀리지 않도록 0에서 멈춘다. [자체설계]
    if (command.drive === 0 && vxBefore !== 0 && Math.sign(vx) !== Math.sign(vxBefore)) vx = 0;

    // --- 횡방향: 자전거 모델 + 매직포뮬러 [자체설계 구조 / 곡선은 분석확인] ---
    const loadFront = (normalLoad * p.rearAxle) / wheelBase; // [자체설계] 정하중 배분
    const loadRear = (normalLoad * p.frontAxle) / wheelBase; // [자체설계]
    const muFront = p.tireFriction; // [자체설계]
    // 뒤 타이어 그립: a<b 로 생기는 오버스티어 경향 보정 × 핸드브레이크 시 0.3배 [자체설계]
    const muRear =
      p.tireFriction * p.rearGripBias * (1 - (1 - p.handbrakeRearGrip) * command.handbrake);

    // 마찰원: 축별 "순" 종방향 타이어력만큼 횡그립이 줄어든다.
    // 제동은 brakeBias=0.6 으로 [분석확인], 구동력은 축하중 비례로 분배한다
    // (원본은 4륜 레이캐스트에 구동력을 나눠 주므로 그 근사). 적용 방식은 [자체설계]
    // 구동과 제동은 서로 반대 방향이라 합이 아니라 차로 상쇄시켜야 한다. [자체설계]
    const brakeSign = vx >= 0 ? 1 : -1;
    const longFront =
      (driveForce * loadFront) / normalLoad - brakeSign * brakeForce * p.brakeBias; // [자체설계]
    const longRear =
      (driveForce * loadRear) / normalLoad - brakeSign * brakeForce * (1 - p.brakeBias); // [자체설계]
    const gripFront = frictionCircleScale(Math.abs(longFront), muFront * loadFront); // [자체설계]
    const gripRear = frictionCircleScale(Math.abs(longRear), muRear * loadRear); // [자체설계]

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
