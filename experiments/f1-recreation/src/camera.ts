import { MathUtils, Vector3 } from 'three';
import type { PerspectiveCamera, Quaternion } from 'three';

/**
 * 체이스(추적) 카메라.
 * 거리/높이/댐핑/FOV 수치는 원본 번들에서 확인된 값 그대로다. [분석확인]
 */

export interface ChaseCameraOptions {
  /** 차량 뒤쪽 거리 (m) [분석확인] */
  distance: number;
  /** 차량 기준 추가 높이 (m) [분석확인] */
  height: number;
  /** 주시점 높이 (m) [분석확인] */
  lookHeight: number;
  /** 주시점 전방 오프셋 (m) [분석확인] */
  lookAhead: number;
  /** 회전 추종 댐핑 계수 [분석확인] */
  rotationDamping: number;
  /** 기본 시야각 (deg) [분석확인] */
  baseFov: number;
  /** 최고속에서 추가되는 시야각 (deg) [분석확인] */
  speedFov: number;
}

export const DEFAULT_CHASE_CAMERA: ChaseCameraOptions = {
  distance: 6.8, // [분석확인]
  height: 2.6, // [분석확인]
  lookHeight: 1.1, // [분석확인]
  lookAhead: 3, // [분석확인]
  rotationDamping: 4.5, // [분석확인]
  baseFov: 62, // [분석확인]
  speedFov: 8, // [분석확인]
};

/** 높이 추종 댐핑 계수 [분석확인] */
const HEIGHT_DAMPING = 10;
/** FOV 추종 댐핑 계수 [분석확인] */
const FOV_DAMPING = 3;

const FORWARD = new Vector3(0, 0, -1);

export class ChaseCamera {
  readonly camera: PerspectiveCamera;
  readonly options: ChaseCameraOptions;

  /** 카메라가 추종 중인 요각 */
  yaw = 0;
  /** 카메라가 추종 중인 차량 높이 */
  height = 0;

  private readonly forward = new Vector3();
  private readonly lookTarget = new Vector3();

  constructor(camera: PerspectiveCamera, options: Partial<ChaseCameraOptions> = {}) {
    this.camera = camera;
    this.options = { ...DEFAULT_CHASE_CAMERA, ...options };
    this.camera.fov = this.options.baseFov;
    this.camera.updateProjectionMatrix();
  }

  /** 차량 자세에서 헤딩 추출. [분석확인] f = (0,0,-1)·q, carYaw = atan2(-f.x, -f.z) */
  carYaw(quaternion: Quaternion): number {
    const f = this.forward.copy(FORWARD).applyQuaternion(quaternion); // [분석확인]
    return Math.atan2(-f.x, -f.z); // [분석확인]
  }

  /** 보간 없이 즉시 차량 뒤로 스냅 */
  snap(position: Vector3, quaternion: Quaternion): void {
    this.yaw = this.carYaw(quaternion);
    this.height = position.y;
    this.camera.fov = this.options.baseFov;
    this.camera.updateProjectionMatrix();
    this.apply(position);
  }

  /**
   * @param speedRatio |전방속도| / 최고속도 (0~1)
   */
  update(position: Vector3, quaternion: Quaternion, speedRatio: number, dt: number): void {
    const o = this.options;

    // damp(k, dt) = 1 - exp(-k*dt) [분석확인]
    const rotationDamp = 1 - Math.exp(-o.rotationDamping * dt); // [분석확인]
    const heightDamp = 1 - Math.exp(-HEIGHT_DAMPING * dt); // [분석확인]
    const fovDamp = 1 - Math.exp(-FOV_DAMPING * dt); // [분석확인]

    // yaw += shortestAngleDiff(yaw, carYaw) * damp(4.5, dt) [분석확인]
    const diff = this.carYaw(quaternion) - this.yaw;
    const shortest = Math.atan2(Math.sin(diff), Math.cos(diff)); // 최단 각도차 [분석확인]
    this.yaw += shortest * rotationDamp; // [분석확인]
    this.height += (position.y - this.height) * heightDamp; // [분석확인]

    this.apply(position);

    // fovTarget = baseFov + speedFov * clamp(speedRatio,0,1)^1.5 [분석확인]
    const ratio = MathUtils.clamp(speedRatio, 0, 1); // [분석확인]
    const fovTarget = o.baseFov + o.speedFov * Math.pow(ratio, 1.5); // [분석확인]
    const fov = this.camera.fov + (fovTarget - this.camera.fov) * fovDamp; // [분석확인]
    if (Math.abs(fov - this.camera.fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * 카메라 위치/주시점 배치. [분석확인]
   *   position   = (car.x + sin(yaw)*distance, height + 2.6, car.z + cos(yaw)*distance)
   *   lookTarget = (car.x - sin(yaw)*lookAhead, height + 1.1, car.z - cos(yaw)*lookAhead)
   */
  private apply(position: Vector3): void {
    const o = this.options;
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    this.camera.position.set(
      position.x + sinYaw * o.distance, // [분석확인]
      this.height + o.height, // [분석확인]
      position.z + cosYaw * o.distance, // [분석확인]
    );
    this.lookTarget.set(
      position.x - sinYaw * o.lookAhead, // [분석확인]
      this.height + o.lookHeight, // [분석확인]
      position.z - cosYaw * o.lookAhead, // [분석확인]
    );
    this.camera.lookAt(this.lookTarget);
  }
}
