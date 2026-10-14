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
| `Space` | 핸드브레이크 (뒤 타이어 그립 0.3배 + `mass×6 N` 추가 제동) |
| `B` | 브레이크 보조 토글 (기본 켜짐 — 원본과 동일) |
| `R` | 리셋 (위치·속도·요·컨트롤러 상태 초기화) |

HUD: 좌상단에 속도(km/h), 활성 입력 소스, throttle/brake/steer 수치, 브레이크 보조 상태(`ABS`),
휠 락 표시(`LOCK F` / `LOCK R` / `LOCK F+R`). 화면 하단에 조작 안내.

## 2라운드에서 승격된 항목 ([자체설계] → [분석확인])

1라운드에서는 차종 튜닝 테이블의 개별 수치를 확인하지 못해 자체 기본값을 썼습니다.
2라운드 번들 직독(`index-CZ5aQSby.js`)으로 아래 값이 모두 확정되어 **실제 값으로 교체**했습니다.

| 항목 | 1라운드 (자체설계) | 2라운드 (분석확인) |
| --- | --- | --- |
| 질량 | 798 kg | **800 kg** (차종표 `kg`) |
| 휠베이스 / CG 위치 | `a 1.7` + `b 1.9` (3.6 m) | **`a 1.85` + `b 1.55` (3.4 m)** — `dims[3]`, formula 분기 CG z 오프셋 0.15 |
| 엔진 파워 | 735 kW | **695.2 kW** (`790 × 0.88`) |
| 최고 속도 | 95 m/s | **97.756 m/s (352 km/h)**, `maxSpeed = ×1.04 = 101.666` |
| 다운포스 계수 | 2.2 | **2.784** (`2.9 × 0.96`) |
| 공기저항 계수 | 0.9 | **0.51362** (번들 top-speed 역산) |
| 구름저항 계수 | 0.013 | **0.03** (formula 분기) |
| 타이어 마찰계수 | μ 1.6 공통 | **앞 1.75 / 뒤 1.8025** (`mu`, `mu × 1.03`) |
| 기계그립 계수 | 없음 | **`grip = [0.9, 0.95]`** |
| 제동 배분 | 0.6 | **0.56** (액티브 에어로 차량 분기) |
| 조향각 범위 | `0.42 / 0.12 / 42` | **`0.50 rad / 0.07 rad / 70 m/s`** (`tune.steer`) |
| CG 높이 / 바퀴 반지름 / 윤거 절반 | 없음 (rideHeight 0.35) | **0.33 m / 0.36 m / 0.8 m** |
| 핸드브레이크 뒤 그립 | ×0.3 (추정) | **×0.3** (`handbrakeGripFactor`) |
| 가용 파워 | 고정값 | **속도 함수** (ERS 테이퍼 `Rn(v)`) |
| 휠 락 | 없음 | **`요구제동력 > 그립한계 × 1.1 && |v| > 2`** |

## 분석에서 확인된 계산식 (원본에서 확인 → 그대로 재구현)

| 항목 | 계산식 / 상수 | 구현 위치 |
| --- | --- | --- |
| 고정 타임스텝 | `fixedDt = 1/60`, `maxSubSteps = 5`, `frame = min(Δt, 0.25)` | `src/loop.ts` |
| 스파이럴 방지 | 서브스텝이 `maxSubSteps` 에 도달하면 `accumulator = 0` | `src/loop.ts` |
| 렌더 보간 | `alpha = accumulator / fixedDt`, `lerpVectors(prev, curr, alpha)`, `slerpQuaternions(prevQ, currQ, alpha)` | `src/loop.ts`, `src/main.ts` |
| 키 바인딩 | `W/↑`, `S/↓`, `A/←`, `D/→`, `Space`, `B`, `R` / keydown·keyup·blur, 소유 키 `preventDefault()`, blur 시 전체 해제 | `src/input.ts` |
| 입력 읽기 | `throttle = +pressed`, `brake = +pressed`, `steer = +right - +left`, `handbrake = +pressed` | `src/input.ts` |
| 1회성 액션 | `R` 은 `e.repeat === false` 일 때만 큐에 push → 다음 fixedUpdate 에서 consume | `src/input.ts`, `src/main.ts` |
| 입력 합성 | throttle/brake/handbrake 는 `max`, steer 는 절대값이 큰 쪽 | `src/input.ts` |
| 전/후진 판정 | throttle 입력 시 `forwardSpeed < -1` 이면 제동, brake 입력 시 `forwardSpeed > 1` 이면 제동 | `src/controller.ts` |
| 브레이크 램프 | `rate = brake > brakePressure ? 10 : 16`, `brakePressure += clamp(Δ, ±rate*dt)` | `src/controller.ts` |
| 조향 슬루율 | `returning = |in| < |steer| ‖ sign 불일치`, `limit = (returning ? 5.8*1.4 : 3.4*1.9) * dt` | `src/controller.ts` |
| 최대 조향각 | `n = min(|v|/steerFadeSpeed, 1)`, `r = n(2-n)`, `hi = maxSteerHighSpeed*1.35`, `low + (hi-low)*r` | `src/controller.ts` |
| 조향 튜닝값 | `maxSteerLowSpeed = 0.50 rad`, `maxSteerHighSpeed = 0.07 rad`, `steerFadeSpeed = 70 m/s` → 고속 포화값 `0.0945 rad` | `src/controller.ts` |
| 민첩 프리셋 | `AGILE = { rate: 1.9, returnRate: 1.4, highSpeedLock: 1.35 }` | `src/controller.ts` |
| 차량 제원 | `mass 800 kg`, `dims = [전장 5.4, 전폭 1.9, 전고 0.95, 휠베이스 3.4]`, `윤거 절반 = 1.9/2 - 0.15 = 0.8`, `wheelRadius 0.36`, `cgHeight 0.33`, 구동 RWD | `src/vehicle.ts`, `src/scene.ts` |
| CG 위치 | formula 분기 z 오프셋 0.15 → `a = 3.4/2 + 0.15 = 1.85`, `b = 3.4/2 - 0.15 = 1.55` | `src/vehicle.ts` |
| 파워트레인 | `enginePower = 790 kW × 1000 × 0.88 = 695,200 W`, `mgukPower = 350 kW × 1000 × 0.88 = 308,000 W` | `src/vehicle.ts` |
| ERS 테이퍼 | `Rn(v) = kmh ≤ 290 ? 1 : max(0, (355 - kmh)/65)`, `availablePower(v) = enginePower - mgukPower + mgukPower·Rn(v)` | `src/vehicle.ts` |
| 구동력 | `vEff = max(v,1)`, `cap = min(maxSpeed, speedCap)`, `limiterFade = 1 - clamp((v - cap*0.985)/(cap*0.015),0,1)`, `launchDiv = 1.07 + 0.09*max(0, 1 - v/(maxSpeed*0.3))`, `F = drive * min(engineForce, availablePower(v)/vEff) * limiterFade / launchDiv` | `src/vehicle.ts` |
| 후진력 | `t = clamp(max(-v,0)/maxReverseSpeed,0,1)`, `F = drive * reverseForce * (1 - t²)` | `src/vehicle.ts` |
| 구동 상수 | `G = 9.81`, `engineForce = 800*9.81*1.4 = 10,987.2 N`, `brakeForce = 800*9.81*4 = 31,392 N`, `reverseForce = mass*5 = 4,000 N`, `maxReverseSpeed = 12`, `brakeBias = 0.56` | `src/vehicle.ts` |
| 속도 상한 | `topSpeed = 97.756 m/s (352 km/h)`, `maxSpeed = topSpeed * 1.04 = 101.666 m/s` | `src/vehicle.ts` |
| 접지/저항 | `normalLoad = mass*G + downforce*activeAero.downforce*v²`, `drag = Cd*activeAero.drag*v²`, `rolling = Crr*normalLoad`, `downforce = 2.9*0.96 = 2.784`, `Cd = 0.51362`, `Crr = 0.03` | `src/vehicle.ts` |
| 액티브 에어로 | `open = straightZone && brake < 0.05 && |steerAngle| < 0.03`, `aeroMode = open ? min(1, m + dt/0.5) : max(0, m - dt/0.15)`, `drag ×= 1 + (0.7-1)·m`, `downforce ×= 1 + (0.55-1)·m` | `src/vehicle.ts` |
| 서스펜션 상수 | `stiffness = mass*56 = 44,800 N/m`, `damping = mass*3.25 = 2,600 N·s/m`, `antiRollFront = mass*120 = 96,000`, `antiRollRear = mass*95 = 76,000 N/m`, `rest = 0.3 m` (F1 전용값이 기본 15/12를 덮어쓴다) | `src/suspension.ts` |
| 바퀴 하중 | `load = stiffness*압축 + damping*압축속도 + antiRoll*(이쪽 압축 - 반대쪽 압축)`, `load = max(load, 0)` | `src/suspension.ts` |
| 다운포스 배분 | 앞 `aeroBalance = 0.45`, 뒤 `0.55` — 축 위치에 각각 건다 | `src/suspension.ts` |
| 정하중 배분 | `staticFront = b/(a+b) = 0.456`, `staticRear = a/(a+b) = 0.544` | `src/vehicle.ts` |
| 타이어 계수 | `μ = frontFriction(1.75) / rearFriction(1.8025) × h`, 제동 보정 `braking = 1.02`. `tune.grip [0.9, 0.95]` 는 μ 가 아니라 **횡력 상한 `E`** 에 쓰인다 | `src/vehicle.ts` |
| 기계그립 보정 | `h = 1 + (mechGrip(0.985) - 1) * (mass*G) / normalLoad` → 다운포스가 붙을수록 1 로 수렴 | `src/vehicle.ts` |
| 바퀴별 제동 요구치 | `j = brake · brakeForce · brakeForceScale(1.5) · (앞 ? k : 1−k) / 2`, `k = brakeAssist ? clamp(앞하중비, 0.45, 0.75) : brakeBias` | `src/vehicle.ts` |
| 제동 그립 한계 | `ee = μ · 바퀴하중 · brakeGrip(1.2) · braking(1.02)` | `src/vehicle.ts` |
| 마찰타원 | `hypot(횡력/w, (구동−제동)/M) > 1` 이면 세 힘을 같은 비율로 축소. `M = 제동 우세면 ee, 아니면 w · traction(0.97)` | `src/vehicle.ts` |
| 횡력 상한 | `F = min(w · 매직포뮬러(|α|), E)`, `E = |바퀴 좌표계 횡속도| · massPerWheel · 기계그립 / dt` | `src/vehicle.ts` |
| 휠 락 페널티 | 잠기면 `w ×= 0.8`, 횡력 `×= 0.25`, 제동력 `= ee × 0.8` | `src/vehicle.ts` |
| 브레이크 보조 | 기본 켜짐. 켜져 있으면 **락이 발생하지 않고** 배분이 하중 비율로 바뀐다 (`B` 키 토글) | `src/vehicle.ts`, `src/input.ts` |
| 핸드브레이크 추가 제동 | 뒤 두 바퀴에 `handbrakeForce(= mass×6) / 2` 씩 | `src/vehicle.ts` |
| 휠 락 | `locked = !brakeAssist && 바퀴별 요구제동력 > ee * 1.1 && |v| > 2` (바퀴 단위 판정) | `src/vehicle.ts` |
| 핸드브레이크 | 뒤 타이어 그립 `× (1 - (1 - 0.3)*handbrake)` (`handbrakeGripFactor = 0.3`) | `src/vehicle.ts` |
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
| 요 관성모멘트 | `Izz = mass · b = 1,240 kg·m²` | 원본은 Rapier 강체가 형상에서 자동 계산해 값이 드러나지 않음 / `src/vehicle.ts` |
| 차체 3자유도 | 4륜 서스펜션의 스프링·댐퍼·안티롤바 식은 [분석확인]이지만, 그 힘으로 움직이는 **차체 heave·pitch·roll 적분**은 자체 설계. `m·z̈ = ΣF - mg - D`, `I_θ·θ̈ = ΣF·x + m·ax·h + 에어로 모멘트`, `I_φ·φ̈ = ΣF·y + m·ay·h` (semi-implicit Euler, 4 서브스텝) | 원본은 Rapier 강체가 적분한다. 평지라 레이캐스트 거리가 차체 자세만의 함수여서 레이 발사 없이 같은 입력을 만든다 / `src/suspension.ts` |
| 피치·롤 관성모멘트 | `I_θ = m·a·b = 2,294`, `I_φ = m·trackHalf² = 512 kg·m²` | 원본은 Rapier가 형상에서 자동 계산 / `src/suspension.ts` |
| 하중이동 입력 가속도 | 피치는 `longForce/mass`, 롤은 타이어 횡력 `ΣFy/mass` 만 쓴다 (회전 좌표계 항 `yawRate·vy`, `-yawRate·vx` 제외). 직전 스텝 값을 쓰므로 1/60 s 지연 | 속도차로 계산하면 스핀 중 가짜 가속도가 피치를 폭주시킨다 (`docs/errors.md` E-018) / `src/vehicle.ts` |
| 종방향 적분 | `v̇x = ΣF/mass + r·vy`, 저항·제동은 진행 반대 방향. 제동만으로 역주행하지 않도록 0 에서 고정 | 회전 좌표계 보정 / `src/vehicle.ts` |
| 마찰타원 적용 시점 | 원본은 그 스텝의 횡력 `D` 로 `hypot(D/w, re/M)` 을 계산하지만, 데모는 횡력을 서브스텝 루프에서 나중에 구하므로 **직전 스텝의 축 횡력**을 바퀴당으로 나눠 쓴다 (1/60 s 지연) | 식 자체는 [분석확인], 지연만 자체 설계 / `src/vehicle.ts` |
| 횡력 상한 축 환산 | 원본은 바퀴 단위 `massPerWheel`, 데모는 자전거 모델이라 축 단위 `mass/2` 로 환산 | 2륜 등가 모델의 귀결 / `src/vehicle.ts` |
| 액티브 에어로 직선 판정 | 원본 `straightZone`(트랙 중심선 곡률 사전계산 배열) 대신 `|yawRate| < 0.05 rad/s` 로 대체 | 데모에는 트랙 스플라인·중심선 인덱스가 없다. 나머지 조건(`brake < 0.05`, `|steer| < 0.03 rad`)과 램프(0.5 s / 0.15 s), 배수(`×0.7` / `×0.55`)는 전부 [분석확인] / `src/vehicle.ts` |
| 차종 보정 미적용분 | `tyreWear 0.95` 와 타이어 마모·노면 그립(`surfaceGrip`)은 적용하지 않음 (`grip 0.985` → `mechGrip`, `traction 0.97` → 마찰타원 `M`, `braking 1.02` → 제동 그립, `downforce 0.96`·`drag 0.94` → 확정 수치에 반영) | 마모·노면 모델 자체가 없다. 라운드 5 제동 격차의 남은 후보 / `src/vehicle.ts` |
| 속도 리미터 기준 | `speedCap = topSpeed` | 원본 `speedCap` 은 세션별 가변값이라 기본값이 불명 / `src/vehicle.ts` |
| 수치 안정화 | 횡방향 8 서브스텝, 슬립각 분모 하한 3 m/s, `|vx| 1~8 m/s` 구간은 운동학 모델(`r = vx·tanδ/L`, `vy = r·b`)과 블렌딩, 후진은 운동학 100% | 타이어 강성(B=36)이 커서 1/60 단일 스텝으로는 발산 / `src/vehicle.ts` |
| 조향 부호 | 입력 `steer` 는 +가 우측, 월드 `yaw` 는 +가 좌측이라 물리에 넣을 때 부호 반전 | three.js 좌표 규약 / `src/vehicle.ts` |
| 월드 | 평지 고정(`y = rideHeight = wheelRadius`), 4000×4000 지면, `±1900 m` 경계 클램프 | / `src/vehicle.ts`, `src/scene.ts` |
| 트랙 | 타원 중앙선 `p(θ) = (460·sinθ, 320·cosθ)`, 폭 28 m, 둘레 약 2,470 m | 최고속 확정(352 km/h)으로 320×210 m 는 좁아 확대. 최소 곡률반경 `B²/A ≈ 222 m` 로, 실측 고속 선회 반경 161 m(306 km/h)보다 여유가 있다 / `src/scene.ts` |

### 폐기한 자체설계: `rearGripBias`

1라운드에는 뒤 타이어 그립에 `×1.2` 보정을 넣었습니다. 당시 CG 배치가 `a 1.7 < b 1.9`,
즉 **앞이 무거운** 배치(앞하중 52.8%)라 뒤가 먼저 포화돼 스핀하는 것을 상쇄하기 위한 튜닝이었습니다.
2라운드에서 확정된 배치는 `a 1.85 > b 1.55` 로 뒤바뀌어 **뒤하중이 54.4%** 이고,
확정된 마찰계수도 뒤가 더 높습니다(`1.8025 > 1.75`). 즉 원본 수치 자체가 이미 언더스티어 쪽이라
보정이 불필요해져 **제거**했습니다. 306 km/h 에서 조향을 짧게 넣었을 때 요레이트가
0.53 rad/s 까지 올랐다가 잔류 없이 0 으로 돌아오는 것을 실측해 안정성을 확인했습니다.

## 파일 구조

```
src/
  main.ts        부트스트랩 · 루프 콜백 배선 · window.__demo 노출
  loop.ts        고정 타임스텝 루프 (누산기 + 보간 alpha)
  input.ts       KeyboardSource + InputHub (입력 합성, 1회성 액션 큐)
  controller.ts  VehicleController (입력 → 구동/제동/조향각 명령)
  vehicle.ts     차량 상태 · 종방향/횡방향 적분 · 타이어 매직포뮬러 · 액티브 에어로
  suspension.ts  4륜 서스펜션 (차체 heave/pitch/roll → 바퀴별 수직 하중)
  camera.ts      ChaseCamera (요/높이/FOV 지수 댐핑)
  hud.ts         순수 DOM HUD
  scene.ts       three.js 씬 · 지면 · 타원 트랙 · 박스 차량
```

## 디버그 훅

`window.__demo` 로 `{ vehicle, loop, reset() }` 가 노출됩니다.

```js
__demo.vehicle.speedKmh              // 현재 속도 (km/h)
__demo.vehicle.forwardSpeed          // 전방 속도 (m/s)
__demo.vehicle.longAccel             // 종가속도 (m/s²) — 피치 하중이동 입력값
__demo.vehicle.lateralAccel          // 타이어 횡가속도 (m/s²) — 롤 하중이동 입력값
__demo.vehicle.aeroMode              // 액티브 에어로 전개율 (0~1)
__demo.vehicle.suspension.loads      // 바퀴별 수직 하중 [FL, FR, RL, RR] (N)
__demo.vehicle.suspension.pitch      // 차체 피치 (rad, + 노즈업)
__demo.vehicle.suspension.roll       // 차체 롤 (rad, + 좌측 위)
__demo.vehicle.wheelLocked           // 바퀴별 락 여부 [FL, FR, RL, RR]
__demo.vehicle.frontLocked           // 앞축 휠 락 여부 (앞 두 바퀴 OR)
__demo.vehicle.rearLocked            // 뒤축 휠 락 여부 (뒤 두 바퀴 OR)
__demo.vehicle.availablePower(v)     // ERS 테이퍼가 적용된 가용 파워 (W)
__demo.vehicle.position              // 월드 위치
__demo.loop.totalSteps               // 누적 물리 스텝 수
__demo.vehicle.brakeAssist           // 브레이크 보조 상태 (B 키, 기본 true)
__demo.reset()                       // R 키와 동일
```

## 알려진 한계

- 휠스핀(슬립률), 기어·RPM, 랩타임, 타이어 마모(`tyres.grip`), 노면별 그립(`surfaceGrip`),
  하중 민감도(`x *= 1 - 0.08*(load/avgLoad - 1)`)는 구현하지 않았습니다.
  종방향 하중 이동과 휠 락은 2라운드, **4륜 서스펜션·액티브 에어로는 4라운드**,
  **브레이크 보조와 바퀴별 힘 해석(마찰타원·횡력 상한)은 5라운드**에 구현했습니다.
- 제동은 이제 원본보다 **빠릅니다**: 186 km/h → 정지가 보조 ON 에서 1.94 s (원본 2.10 s, −7.6 %),
  보조 OFF 에서 2.35 s. 남은 차이의 후보는 위에서 1 로 둔 `surfaceGrip`·타이어 마모 계수입니다.
- 액티브 에어로의 직선 판정은 원본처럼 트랙 곡률 구간 배열이 아니라 요레이트 임계(`< 0.05 rad/s`)입니다.
  전력 가속 시 **약 347 km/h** 에서 수렴합니다 (이론값 348.5, 원본 코드 유도값 352 km/h).
- 지면은 완전한 평지이며 트랙 이탈 판정(그립 저하)이 없습니다. 커브 블록은 시각 참조물입니다.
