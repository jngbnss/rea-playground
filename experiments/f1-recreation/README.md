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

HUD: 좌상단에 속도(km/h), 활성 입력 소스, throttle/brake/steer 수치, 휠 락 표시(`LOCK F` / `LOCK R` / `LOCK F+R`). 화면 하단에 조작 안내.

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
| 키 바인딩 | `W/↑`, `S/↓`, `A/←`, `D/→`, `Space`, `R` / keydown·keyup·blur, 소유 키 `preventDefault()`, blur 시 전체 해제 | `src/input.ts` |
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
| 접지/저항 | `normalLoad = mass*G + downforce*v²`, `drag = Cd*v²`, `rolling = Crr*normalLoad`, `downforce = 2.9*0.96 = 2.784`, `Cd = 0.51362`, `Crr = 0.03` | `src/vehicle.ts` |
| 정하중 배분 | `staticFront = b/(a+b) = 0.456`, `staticRear = a/(a+b) = 0.544` | `src/vehicle.ts` |
| 타이어 계수 | `frontFriction = mu = 1.75`, `rearFriction = mu*1.03 = 1.8025`, `grip = [0.9, 0.95]`, 제동 보정 `braking = 1.02` | `src/vehicle.ts` |
| 기계그립 보정 | `h = 1 + (grip - 1) * (mass*G) / normalLoad` → 다운포스가 붙을수록 1 로 수렴 | `src/vehicle.ts` |
| 축별 제동 한계 | `축 제동력 = min(요구치, μ_axis · 축하중 · braking)`, 요구치는 `brakeBias` 배분 | `src/vehicle.ts` |
| 휠 락 | `locked = 요구제동력 > 그립한계 * 1.1 && |v| > 2` | `src/vehicle.ts` |
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
| 종방향 하중 이동 | `ΔW = mass · ax · cgHeight / wheelBase`, `frontLoad = max(0, staticFront·normalLoad - ΔW)`, `rearLoad = max(0, staticRear·normalLoad + ΔW)` | 표준 1차 하중이동 식. `ax` 는 **직전 스텝의 실측 종가속도**(1/60 s 지연)를 쓴다 — 제동력→하중→제동력 내부 반복이 필요 없고 60 Hz 에서 지연이 16.7 ms 뿐이라 수렴 반복보다 단순하다 / `src/vehicle.ts` |
| 다운포스 배분 | 다운포스도 정하중과 같은 비율(`staticFront`/`staticRear`)로 축에 나눈다 | 원본의 에어로 밸런스 수치는 확인되지 않음 / `src/vehicle.ts` |
| 종방향 적분 | `v̇x = ΣF/mass + r·vy`, 저항·제동은 진행 반대 방향. 제동만으로 역주행하지 않도록 0 에서 고정 | 회전 좌표계 보정 / `src/vehicle.ts` |
| 구동 접지 한계 | 구동력을 **뒤축** 그립 `μ_rear · rearLoad` 로 클램프 (RWD 는 [분석확인]) | 원본은 구동력을 강체에 직접 거는 방식이라 접지 한계가 없다. 가속 시 하중이 뒤로 실려 한계가 커지는 효과를 살림 / `src/vehicle.ts` |
| 마찰원 | `scale = sqrt(1 - min(|축별 순 종방향력|/용량, 1)²)`. 구동력은 전부 뒤축, 제동은 축별 값, **구동−제동은 서로 상쇄** | 원본은 4륜에 힘을 나눠 주므로 그 근사. 합산하면 핸드브레이크+가속 시 조향이 사라진다 / `src/vehicle.ts` |
| 휠 락 페널티 | 잠긴 축의 횡력에 `×0.35` | 판정식은 [분석확인], 잠긴 뒤 횡력이 얼마나 남는지는 미확인 / `src/vehicle.ts` |
| 핸드브레이크 추가 제동 | 뒤축 요구 제동력에 `mass*G*1.5` 가산 | 원본에서 확인된 것은 그립 0.3배뿐 / `src/vehicle.ts` |
| 액티브 에어로 | 구현하지 않음 (`drag`/`downforce` 를 `Gn = {0.7, 0.55}` 쪽으로 보간하는 분기 생략) | 발동 조건(직선+무제동+소조향)의 임계값이 확인되지 않음 / `src/vehicle.ts` |
| 차종 보정 미적용분 | `grip 0.985`, `traction 0.97`, `tyreWear 0.95` 는 적용하지 않음 (`downforce 0.96`·`drag 0.94` 는 확정 수치에 이미 반영, `braking 1.02` 는 제동 그립에 적용) | 적용 지점이 번들에서 확인되지 않음. 타이어 마모 모델도 없음 / `src/vehicle.ts` |
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
  vehicle.ts     차량 상태 · 종방향/횡방향 적분 · 타이어 매직포뮬러
  camera.ts      ChaseCamera (요/높이/FOV 지수 댐핑)
  hud.ts         순수 DOM HUD
  scene.ts       three.js 씬 · 지면 · 타원 트랙 · 박스 차량
```

## 디버그 훅

`window.__demo` 로 `{ vehicle, loop, reset() }` 가 노출됩니다.

```js
__demo.vehicle.speedKmh              // 현재 속도 (km/h)
__demo.vehicle.forwardSpeed          // 전방 속도 (m/s)
__demo.vehicle.longAccel             // 종가속도 (m/s²) — 하중 이동 입력값
__demo.vehicle.frontLocked           // 앞축 휠 락 여부
__demo.vehicle.rearLocked            // 뒤축 휠 락 여부
__demo.vehicle.availablePower(v)     // ERS 테이퍼가 적용된 가용 파워 (W)
__demo.vehicle.position              // 월드 위치
__demo.loop.totalSteps               // 누적 물리 스텝 수
__demo.reset()                       // R 키와 동일
```

## 알려진 한계

- 서스펜션/피치·롤, 횡방향 하중 이동, 휠스핀(슬립률), 기어·RPM, 랩타임은 구현하지 않았습니다.
  종방향 하중 이동과 휠 락은 2라운드에서 구현했습니다.
- 액티브 에어로(직선에서 `drag`/`downforce` 를 낮추는 분기)를 구현하지 않아,
  확정된 `topSpeed 352 km/h` 보다 낮은 **약 329 km/h** 에서 속도가 수렴합니다
  (ERS 테이퍼로 290 km/h 이상에서 파워가 줄어드는 반면 항력은 그대로이기 때문).
- 지면은 완전한 평지이며 트랙 이탈 판정(그립 저하)이 없습니다. 커브 블록은 시각 참조물입니다.
- 브레이크 보조(원본 `B` 키)가 없어 전제동 시 양축이 쉽게 잠깁니다
  (`brakeForce = 4 g` 요구 > 타이어 그립 한계).
