# F1 재현 데모 (REA 분석 기반)

[`https://jngbnss.github.io/f1/`](https://jngbnss.github.io/f1/) 를 역공학 분석(REA)해서 얻은 **계산식과 상수**만을 근거로 다시 만든 웹 레이싱 데모입니다.
원본 소스코드는 복사하지 않았고, 분석으로 확인한 수식/상수만 재구현했습니다.
분석으로 확인되지 않은 부분은 직접 설계했으며, 코드 주석과 아래 표에서 `[분석확인]` / `[자체설계]` 로 구분합니다.

- 스택: Vite + TypeScript(strict) + three.js r186
- 물리 엔진 없음(원본의 Rapier 대신 자전거 모델로 근사), 외부 3D 에셋 없음(박스 프리미티브만)

## 실행 방법

```bash
cd experiments/f1-recreation
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 타입 검사(tsc --noEmit) + 프로덕션 번들 → dist/
npm run preview  # 빌드 결과 미리보기
```

## 조작법

| 키 | 동작 |
| --- | --- |
| `W` / `↑` | 가속 (후진 중이면 제동) |
| `S` / `↓` | 제동 (정지/저속이면 후진) |
| `A` / `←` · `D` / `→` | 좌/우 조향 |
| `Space` | 핸드브레이크 (뒤 타이어 그립 0.3배 + 추가 제동) |
| `R` | 리셋 (위치·속도·요·컨트롤러 상태 초기화) |

HUD: 좌상단에 속도(km/h), 활성 입력 소스, throttle/brake/steer 수치. 화면 하단에 조작 안내.

## 분석에서 확인된 계산식 (원본에서 확인 → 그대로 재구현)

| 항목 | 계산식 / 상수 | 구현 위치 |
| --- | --- | --- |
| 고정 타임스텝 | `fixedDt = 1/60`, `maxSubSteps = 5`, `frame = min(Δt, 0.25)` | `src/loop.ts` |
| 스파이럴 방지 | 서브스텝이 `maxSubSteps` 에 도달하면 `accumulator = 0` | `src/loop.ts` |
| 렌더 보간 | `alpha = accumulator / fixedDt`, `lerpVectors(prev, curr, alpha)`, `slerpQuaternions(prevQ, currQ, alpha)` | `src/loop.ts`, `src/main.ts` |
| 키 바인딩 | `W/↑`, `S/↓`, `A/←`, `D/→`, `Space`, `R` / keydown·keyup·blur, 소유 키 `preventDefault()`, blur 시 전체 해제 | `src/input.ts` |
| 입력 읽기 | `throttle = +pressed`, `brake = +pressed`, `steer = +right - +left`, `handbrake = +pressed` | `src/input.ts` |
| 1회성 액션 | `R` 은 `e.repeat === false` 일 때만 큐에 push → 다음 fixedUpdate 에서 consume | `src/input.ts`, `src/main.ts` |
| 입력 합성 | throttle/brake/handbrake 는 `max`, steer 는 절대값이 큰 쪽 | `src/input.ts` |
| 전/후진 판정 | throttle 입력 시 `forwardSpeed < -1` 이면 제동, brake 입력 시 `forwardSpeed > 1` 이면 제동 | `src/controller.ts` |
| 브레이크 램프 | `rate = brake > brakePressure ? 10 : 16`, `brakePressure += clamp(Δ, ±rate*dt)` | `src/controller.ts` |
| 조향 슬루율 | `returning = |in| < |steer| ‖ sign 불일치`, `limit = (returning ? 5.8*1.4 : 3.4*1.9) * dt` | `src/controller.ts` |
| 최대 조향각 | `n = min(|v|/steerFadeSpeed, 1)`, `r = n(2-n)`, `hi = maxSteerHighSpeed*1.35`, `low + (hi-low)*r` | `src/controller.ts` |
| 민첩 프리셋 | `AGILE = { rate: 1.9, returnRate: 1.4, highSpeedLock: 1.35 }` | `src/controller.ts` |
| 구동력 | `vEff = max(v,1)`, `cap = min(maxSpeed, speedCap)`, `limiterFade = 1 - clamp((v - cap*0.985)/(cap*0.015),0,1)`, `launchDiv = 1.07 + 0.09*max(0, 1 - v/(maxSpeed*0.3))`, `F = drive * min(engineForce, power/vEff) * limiterFade / launchDiv` | `src/vehicle.ts` |
| 후진력 | `t = clamp(max(-v,0)/maxReverseSpeed,0,1)`, `F = drive * reverseForce * (1 - t²)` | `src/vehicle.ts` |
| 구동 상수 | `G = 9.81`, `engineForce = mass*G*1.4`, `brakeForce = mass*G*4`, `reverseForce = mass*5`, `maxReverseSpeed = 12`, `brakeBias = 0.6` | `src/vehicle.ts` |
| 접지/저항 | `normalLoad = mass*G + downforce*v²`, `drag = Cd*v²`, `rolling = Crr*normalLoad` | `src/vehicle.ts` |
| 타이어 곡선 | 매직포뮬러 `F(s) = sin(1.2*atan(B*s - 0.3*(B*s - atan(B*s))))`, `B = 36` | `src/vehicle.ts` |
| 체이스 카메라 | `distance 6.8 / height 2.6 / lookHeight 1.1 / lookAhead 3 / rotationDamping 4.5 / baseFov 62 / speedFov 8` | `src/camera.ts` |
| 카메라 댐핑 | `damp(k,dt) = 1 - exp(-k*dt)`, yaw k=4.5, height k=10, fov k=3 | `src/camera.ts` |
| 카메라 배치 | `pos = (x + sin(yaw)*distance, height + 2.6, z + cos(yaw)*distance)`, `look = (x - sin(yaw)*lookAhead, height + 1.1, z - cos(yaw)*lookAhead)` | `src/camera.ts` |
| 차량 헤딩 | `f = (0,0,-1)·quaternion`, `carYaw = atan2(-f.x, -f.z)` | `src/camera.ts` |
| FOV | `fovTarget = baseFov + speedFov * clamp(speedRatio,0,1)^1.5` | `src/camera.ts` |
| HUD 속도 | `speedKmh = forwardSpeed * 3.6`, 정수 반올림 + `km/h` | `src/hud.ts` |

## 자체 설계한 계산식 (분석으로 확인되지 않아 직접 설계)

| 항목 | 설계 내용 | 이유 / 구현 위치 |
| --- | --- | --- |
| 횡방향 모델 | 자전거 모델(2륜 등가): `αf = atan2(vy + r·a, |vx|) - δ`, `αr = atan2(vy - r·b, |vx|)`, `Fy = -sign(α)·μ·하중·F(|α|)`, `ṙ = (a·Fyf·cosδ - b·Fyr)/Izz` | 원본은 Rapier 4륜 레이캐스트 서스펜션. 물리 엔진 금지 조건이라 2륜 등가로 근사 / `src/vehicle.ts` |
| 조향각 범위 | `maxSteerLowSpeed = 0.42 rad`, `maxSteerHighSpeed = 0.12 rad`, `steerFadeSpeed = 42 m/s` | 원본은 차종표에서 읽어오며 개별 값 미확인. 곡선 식 자체는 [분석확인] / `src/controller.ts` |
| 차량 제원 | `mass 798`, `a 1.7`, `b 1.9` (wheelBase 3.6), `Izz = mass*1.9`, `power 735 kW`, `maxSpeed 95 m/s`, `downforce 2.2`, `Cd 0.9`, `Crr 0.013`, `μ 1.6` | 원본 차종표 미확인 → F1 실차 수치 기반 기본값 / `src/vehicle.ts` |
| 종방향 적분 | `v̇x = ΣF/mass + r·vy`, 저항·제동은 진행 반대 방향. 제동만으로 역주행하지 않도록 0 에서 고정 | 회전 좌표계 보정 / `src/vehicle.ts` |
| 접지 한계 | `tractionLimit = μ·normalLoad` 로 제동력·구동력을 클램프 | 저속에서 4G 제동은 불가능, 다운포스가 붙으면 가능 / `src/vehicle.ts` |
| 마찰원 | `scale = sqrt(1 - min(|축별 순 종방향력|/용량, 1)²)`. 제동은 `brakeBias` 로, 구동력은 축하중 비례로 분배하고 **구동−제동은 서로 상쇄** | 원본은 4륜에 구동력을 나눠 주므로 그 근사. 합산하면 핸드브레이크+가속 시 조향이 사라진다 / `src/vehicle.ts` |
| 하중 배분 | `loadFront = normalLoad·b/L`, `loadRear = normalLoad·a/L` (정하중, 이동하중 없음) | / `src/vehicle.ts` |
| 뒤 그립 보정 | `rearGripBias = 1.2` | `a < b` 배치라 뒤가 먼저 포화되어 스핀한다. 게임 튜닝으로 상쇄 / `src/vehicle.ts` |
| 핸드브레이크 | 뒤 타이어 그립 `×0.3` + 추가 제동 `mass*G*1.5` | 추가 제동값은 미확인 / `src/vehicle.ts` |
| 수치 안정화 | 횡방향 8 서브스텝, 슬립각 분모 하한 3 m/s, `|vx| 1~8 m/s` 구간은 운동학 모델(`r = vx·tanδ/L`, `vy = r·b`)과 블렌딩, 후진은 운동학 100% | 타이어 강성(B=36)이 커서 1/60 단일 스텝으로는 발산 / `src/vehicle.ts` |
| 조향 부호 | 입력 `steer` 는 +가 우측, 월드 `yaw` 는 +가 좌측이라 물리에 넣을 때 부호 반전 | three.js 좌표 규약 / `src/vehicle.ts` |
| 월드 | 평지 고정(`y = rideHeight`), 4000×4000 지면, `±1900 m` 경계 클램프 | / `src/vehicle.ts`, `src/scene.ts` |
| 트랙 | 타원 중앙선 `p(θ) = (320·sinθ, 210·cosθ)`, 폭 24 m, 바깥 법선 `normalize((B·sinθ, A·cosθ))` 로 커브 블록 배치. 좌회전 방향 오벌 | 300 km/h 선회가 가능한 크기 / `src/scene.ts` |

## 파일 구조

```
src/
  main.ts        부트스트랩 · 루프 콜백 배선 · window.__demo 노출
  loop.ts        고정 타임스텝 루프 (누산기 + 보간 alpha)
  input.ts       KeyboardSource + InputHub (입력 합성, 1회성 액션 큐)
  controller.ts  VehicleController (입력 → 구동/제동/조향각 명령)
  vehicle.ts     차량 상태 · 종방향/횡방향 적분 · 타이어 매직포뮬러
  camera.ts      ChaseCamera (요/높이/FOV 지수 댐핑)
  hud.ts         순수 DOM HUD
  scene.ts       three.js 씬 · 지면 · 타원 트랙 · 박스 차량
```

## 디버그 훅

`window.__demo` 로 `{ vehicle, loop, reset() }` 가 노출됩니다.

```js
__demo.vehicle.speedKmh      // 현재 속도 (km/h)
__demo.vehicle.forwardSpeed  // 전방 속도 (m/s)
__demo.vehicle.position      // 월드 위치
__demo.loop.totalSteps       // 누적 물리 스텝 수
__demo.reset()               // R 키와 동일
```

## 알려진 한계

- 서스펜션/피치·롤, 종방향 하중 이동, 휠스핀(슬립률), 기어·RPM, 랩타임은 구현하지 않았습니다.
- 지면은 완전한 평지이며 트랙 이탈 판정(그립 저하)이 없습니다. 커브 블록은 시각 참조물입니다.
- 원본의 차종표 수치는 분석으로 확인되지 않아 조향각 범위·차량 제원은 자체 기본값입니다.
