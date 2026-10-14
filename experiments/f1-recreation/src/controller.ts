import { MathUtils } from 'three';
import type { VehicleInput } from './input';

/**
 * 입력(키 상태) → 차량 명령(구동/제동/조향각) 변환기.
 * 램프 속도, 슬루율, 고속 조향 축소 곡선은 원본 번들에서 확인된 식을 그대로 옮겼다.
 */

export interface DriveCommand {
  /** +1 전진 구동 ~ -1 후진 구동 */
  drive: number;
  /** 0~1, 램프가 적용된 브레이크 압력 */
  brake: number;
  /** 0~1 */
  handbrake: number;
  /** 라디안. 입력 규약상 +가 우측 조향 */
  steerAngle: number;
}

export interface SteeringTuning {
  /** 조향 입력 슬루율 (1/s) [분석확인] */
  readonly steerRate: number;
  /** 조향 복귀 슬루율 (1/s) [분석확인] */
  readonly steerReturnRate: number;
  /** 저속 최대 조향각 (rad) [분석확인] tune.steer[0] */
  readonly maxSteerLowSpeed: number;
  /** 고속 최대 조향각 (rad) [분석확인] tune.steer[1] */
  readonly maxSteerHighSpeed: number;
  /** 조향각이 고속값으로 수렴하는 기준 속도 (m/s) [분석확인] tune.steer[2] */
  readonly steerFadeSpeed: number;
}

export const DEFAULT_STEERING: SteeringTuning = {
  steerRate: 3.4, // [분석확인]
  steerReturnRate: 5.8, // [분석확인]
  maxSteerLowSpeed: 0.5, // [분석확인] f1 튜닝 steer[0] = 0.50 rad (28.6°)
  maxSteerHighSpeed: 0.07, // [분석확인] f1 튜닝 steer[1] = 0.07 rad, 포화값은 ×1.35 = 0.0945
  steerFadeSpeed: 70, // [분석확인] f1 튜닝 steer[2] = 70 m/s (252 km/h)
};

/** 민첩 핸들링 프리셋 배수 [분석확인] */
const AGILE = {
  rate: 1.9,
  returnRate: 1.4,
  highSpeedLock: 1.35,
} as const;

/** 브레이크 압력 상승/하강 램프 (1/s) [분석확인] */
const BRAKE_RISE_RATE = 10;
const BRAKE_FALL_RATE = 16;

/** 전/후진 판정 데드존 (m/s) [분석확인] */
const DIRECTION_DEADZONE = 1;

export class VehicleController {
  readonly tuning: SteeringTuning;

  /** 정규화 조향 상태 (-1 ~ +1). 슬루율 제한을 거친 값 */
  steerNormalized = 0;
  /** 램프가 적용된 브레이크 압력 (0 ~ 1) */
  brakePressure = 0;
  /** 최종 조향각 (rad, +우측) */
  steerAngle = 0;

  /** 매 프레임 재사용하는 명령 버퍼 (프레임당 할당 0) */
  private readonly command: DriveCommand = {
    drive: 0,
    brake: 0,
    handbrake: 0,
    steerAngle: 0,
  };

  constructor(tuning: SteeringTuning = DEFAULT_STEERING) {
    this.tuning = tuning;
  }

  reset(): void {
    this.steerNormalized = 0;
    this.brakePressure = 0;
    this.steerAngle = 0;
    this.command.drive = 0;
    this.command.brake = 0;
    this.command.handbrake = 0;
    this.command.steerAngle = 0;
  }

  /**
   * 속도에 따른 최대 조향각. [분석확인]
   *   n  = min(|v| / steerFadeSpeed, 1)
   *   r  = n * (2 - n)                                  // ease-out
   *   hi = maxSteerHighSpeed * AGILE.highSpeedLock
   *   return maxSteerLowSpeed + (hi - maxSteerLowSpeed) * r
   */
  maxSteer(forwardSpeed: number): number {
    const t = this.tuning;
    const n = Math.min(Math.abs(forwardSpeed) / t.steerFadeSpeed, 1); // [분석확인]
    const r = n * (2 - n); // [분석확인] ease-out
    const hi = t.maxSteerHighSpeed * AGILE.highSpeedLock; // [분석확인]
    return t.maxSteerLowSpeed + (hi - t.maxSteerLowSpeed) * r; // [분석확인]
  }

  /**
   * @param forwardSpeed 차체 전방 속도 (m/s, 전진이 +)
   * @returns 내부에서 재사용되는 명령 객체 (다음 호출에서 덮어써짐)
   */
  update(input: VehicleInput, forwardSpeed: number, dt: number): DriveCommand {
    let drive = 0;
    let brake = 0;

    // 가속 입력: 후진 중(-1 m/s 미만)이면 제동으로 해석 [분석확인]
    if (input.throttle > 0) {
      if (forwardSpeed < -DIRECTION_DEADZONE) brake = Math.max(brake, input.throttle);
      else drive += input.throttle;
    }
    // 브레이크 입력: 전진 중(+1 m/s 초과)이면 제동, 아니면 후진 구동 [분석확인]
    if (input.brake > 0) {
      if (forwardSpeed > DIRECTION_DEADZONE) brake = Math.max(brake, input.brake);
      else drive -= input.brake;
    }

    // 브레이크 압력 램프: 상승 10/s, 하강 16/s [분석확인]
    const rate = brake > this.brakePressure ? BRAKE_RISE_RATE : BRAKE_FALL_RATE;
    this.brakePressure += MathUtils.clamp(brake - this.brakePressure, -rate * dt, rate * dt); // [분석확인]
    brake = this.brakePressure;

    // 조향 슬루율 제한: 복귀 방향이면 returnRate, 아니면 rate [분석확인]
    const steer = this.steerNormalized;
    const returning =
      Math.abs(input.steer) < Math.abs(steer) || Math.sign(input.steer) !== Math.sign(steer); // [분석확인]
    const limit =
      (returning
        ? this.tuning.steerReturnRate * AGILE.returnRate
        : this.tuning.steerRate * AGILE.rate) * dt; // [분석확인]
    this.steerNormalized += MathUtils.clamp(input.steer - steer, -limit, limit); // [분석확인]
    this.steerAngle = this.steerNormalized * this.maxSteer(forwardSpeed); // [분석확인]

    const command = this.command;
    command.drive = drive;
    command.brake = brake;
    command.handbrake = input.handbrake; // [분석확인]
    command.steerAngle = this.steerAngle;
    return command;
  }
}
