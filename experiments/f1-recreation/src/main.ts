import { ChaseCamera } from './camera';
import { VehicleController } from './controller';
import { InputHub, KeyboardSource, NEUTRAL_INPUT } from './input';
import type { VehicleInput } from './input';
import { FixedStepLoop } from './loop';
import { createDemoScene, TRACK } from './scene';
import { Hud } from './hud';
import { Vehicle } from './vehicle';

/** 스모크 테스트/디버깅용으로 노출하는 전역 API */
export interface DemoApi {
  readonly vehicle: Vehicle;
  readonly loop: FixedStepLoop;
  reset(): void;
}

declare global {
  interface Window {
    __demo?: DemoApi;
  }
}

const container = document.getElementById('app');
if (container === null) throw new Error('#app 컨테이너를 찾지 못했습니다.');

const view = createDemoScene(container);
const vehicle = new Vehicle();
vehicle.setStart(TRACK.startX, TRACK.startZ, TRACK.startYaw);

const controller = new VehicleController();
const input = new InputHub().add(new KeyboardSource());
const chase = new ChaseCamera(view.camera);
const hud = new Hud(document.body);

let lastInput: VehicleInput = NEUTRAL_INPUT;

function reset(): void {
  vehicle.reset();
  controller.reset();
  lastInput = NEUTRAL_INPUT;
  view.car.position.copy(vehicle.position);
  view.car.quaternion.copy(vehicle.quaternion);
  view.setSteerAngle(0);
  chase.snap(vehicle.position, vehicle.quaternion);
}

const loop = new FixedStepLoop({
  fixedUpdate(dt: number): void {
    // 1회성 액션(R 리셋)은 물리 스텝 시작 시 소비한다. [분석확인]
    for (const action of input.consumeActions()) {
      if (action === 'reset') reset();
    }
    const sample = input.sample();
    lastInput = sample;
    const command = controller.update(sample, vehicle.forwardSpeed, dt);
    vehicle.fixedUpdate(command, dt);
  },

  update(frameDt: number, alpha: number): void {
    // 이전/현재 물리 포즈를 alpha 로 보간해 렌더 포즈를 만든다. [분석확인]
    view.car.position.lerpVectors(vehicle.prevPosition, vehicle.position, alpha); // [분석확인]
    view.car.quaternion.slerpQuaternions(vehicle.prevQuaternion, vehicle.quaternion, alpha); // [분석확인]
    view.setSteerAngle(vehicle.steerAngle);

    const speedRatio = Math.abs(vehicle.forwardSpeed) / vehicle.params.maxSpeed;
    chase.update(view.car.position, view.car.quaternion, speedRatio, frameDt);
    hud.update(vehicle.speedKmh, lastInput, input.activeSources);
  },

  render(): void {
    view.renderer.render(view.scene, view.camera);
  },
});

window.addEventListener('resize', () => {
  view.resize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1));
});

reset();
loop.start();

window.__demo = { vehicle, loop, reset };
