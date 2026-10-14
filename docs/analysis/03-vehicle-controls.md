# 03 · 차량 조작 분석 (가속 · 브레이크 · 조향)

표기 규칙

- **[사실]** 번들 코드에서 직접 읽은 내용 (위치: `파일 @ UTF-16 오프셋`)
- **[관찰]** 실행 중 측정·확인한 내용
- **[추정]** 근거는 있으나 확증하지 못한 내용
- **[미확인]** 확인 실패

식별자는 모두 번들러가 축약한 이름이다(소스맵 없음). 아래에서는 역할에 맞는 이름을
괄호로 덧붙여 읽기 쉽게 했지만, **원본 이름이 아니라 이 분석이 붙인 별칭**이다.

---

## 1. 가속 기능 분석

### 1-1. 입력 수집 — `window` keydown/keyup

**[사실]** `Game-CGRrnhwj.js @ 10,330–11,300`

```js
var yn = [`KeyW`, `ArrowUp`],    bn = [`KeyS`, `ArrowDown`],
    xn = [`KeyA`, `ArrowLeft`],  Sn = [`KeyD`, `ArrowRight`],
    Cn = [`Space`],              wn = [`KeyR`],  Tn = [`KeyO`],
    En = new Set([...yn, ...bn, ...xn, ...Sn, ...Cn]);

var Dn = class {                                   // KeyboardSource
  id = `keyboard`;  down = new Set;  actions = [];
  constructor(e = window) {
    e.addEventListener(`keydown`, this.onKeyDown);
    e.addEventListener(`keyup`,   this.onKeyUp);
    e.addEventListener(`blur`,    this.onBlur);
  }
  read() {
    if (this.down.size === 0) return null;
    let e = (list) => +!!list.some(c => this.down.has(c));
    return { throttle: e(yn), brake: e(bn), steer: e(Sn) - e(xn), handbrake: e(Cn) };
  }
  onKeyDown = e => {
    En.has(e.code) && e.preventDefault();
    wn.includes(e.code) && !e.repeat && this.actions.push(`reset`);
    Tn.includes(e.code) && !e.repeat && this.actions.push(`overtake`);
    this.down.add(e.code);
  };
  onKeyUp = e => { this.down.delete(e.code); };
  onBlur  = () => { this.down.clear(); };
};
```

확정 사항

- 리스너는 **`window`** 에 붙는다. 캔버스가 아니다 (02 문서의 리스너 조사와 일치).
- 가속 = `KeyW` 또는 `ArrowUp`. **디지털 입력(0 또는 1)** 이다. 아날로그 값이 아니다.
- `R`(리셋)·`O`(오버테이크)는 `e.repeat === false`일 때만 **1회성 액션 큐**에 쌓인다.
  → 키를 눌러 두어도 반복 발동하지 않는다.
- `blur`에서 눌린 키를 전부 비운다 → 창 포커스를 잃으면 가속이 끊긴다.
- 게임패드 소스(`gn`)도 존재: `buttons[7]`=스로틀, `buttons[6]`=브레이크, `axes[0]`=조향,
  데드존 0.12를 적용한 뒤 `(|x|−0.12)/0.88`로 재정규화한다. **[사실]** `@ 8,980–9,300`

### 1-2. 입력 합성 — InputHub

**[사실]** `Game-CGRrnhwj.js @ 9,700–9,980`

```js
poll() {
  const e = this.state;  e.throttle = e.brake = e.steer = e.handbrake = 0;
  const actions = [];
  for (const src of this.sources) {
    actions.push(...src.consumeActions());
    const r = src.read();
    if (!r) continue;
    this.activeSource = src.id;
    e.throttle  = Math.max(e.throttle,  r.throttle);
    e.brake     = Math.max(e.brake,     r.brake);
    e.handbrake = Math.max(e.handbrake, r.handbrake);
    if (Math.abs(r.steer) > Math.abs(e.steer)) e.steer = r.steer;
  }
  return { input: e, actions };
}
```

→ 키보드/게임패드/터치가 **동시에 꽂혀 있어도 더 센 쪽이 이긴다**(max 합성).
`activeSource` 값은 HUD 디버그 패널의 `input` 항목에 그대로 표시된다.

**[관찰]** W 키를 누르기 전에는 HUD가 `input: none`, 누른 직후 `input: keyboard`로 바뀌었다
(`evidence/throttle-run.csv` 3번째 열).

### 1-3. 명령 변환 — VehicleController

**[사실]** `Game-CGRrnhwj.js @ 4,529,839–4,530,900` (클래스 `ic`)

```js
var rc = { rate: 1.9, returnRate: 1.4, highSpeedLock: 1.35 };   // "민첩 조향" 보정

update(input, forwardSpeed, dt) {
  const cfg = this.config, cmd = this.commands;
  cmd.drive = 0; cmd.brake = 0;

  if (input.throttle > 0)
    forwardSpeed < -1 ? cmd.brake = Math.max(cmd.brake, input.throttle)
                      : cmd.drive += input.throttle;
  if (input.brake > 0)
    forwardSpeed >  1 ? cmd.brake = Math.max(cmd.brake, input.brake)
                      : cmd.drive -= input.brake;
  cmd.handbrake = input.handbrake;

  const rate = cmd.brake > this.brakePressure ? 10 : 16;        // 압력 상승/해제 속도
  this.brakePressure += Math.max(-rate*dt, Math.min(rate*dt, cmd.brake - this.brakePressure));
  if (this.brakeRamp) cmd.brake = this.brakePressure;
  ...
}
```

여기서 확정되는 조작 규칙

| 상황 | W 입력 | S 입력 |
| --- | --- | --- |
| 전진 중 (`v > 1`) | 가속 (`drive += 1`) | **브레이크** |
| 거의 정지 (`−1 ≤ v ≤ 1`) | 가속 | **후진** (`drive -= 1`) |
| 후진 중 (`v < −1`) | **브레이크** | 후진 가속 |

→ 가속 키와 브레이크 키는 **진행 방향에 따라 역할이 바뀐다.** 별도의 후진 기어 키가 없다.

브레이크 압력은 즉시 100%가 되지 않고 **초당 10의 속도로 차오르고 16의 속도로 빠진다**.
즉 S를 눌렀을 때 완전 제동까지 약 0.1초가 걸린다(1.0 / 10).

### 1-4. 구동력 계산 — VehiclePhysics.step

**[사실]** `Game-CGRrnhwj.js @ 4,533,600–4,533,760`

```js
const c = Cc.dot(cc);             // forwardSpeed (m/s, 차체 전방 성분)
let u = 0;                        // 구동력(N)
if (e.drive > 0) {
  const t = Math.max(c, 1);                                    // 0 나눗셈 방지
  const r = Math.min(n.maxSpeed, this.speedCap);
  const i = 1 - Math.min(Math.max((c - r*0.985) / (r*0.015), 0), 1);   // 최고속 리미터
  const a = 1.07 + 0.09 * Math.max(0, 1 - c / (n.maxSpeed*0.3));       // 발진 토크 완화
  u = e.drive * Math.min(n.engineForce, this.availablePower / t) * i / a;
} else if (e.drive < 0) {
  const t = Math.min(Math.max(-c, 0) / n.maxReverseSpeed, 1);
  u = e.drive * n.reverseForce * (1 - t*t);                    // 후진 최고속 제한
}
this.drivePower = Math.max(0, u) * Math.max(c, 0);             // 실제 소모 파워(W)
```

읽어낸 의미

1. 구동력은 **두 값의 최솟값**이다.
   `engineForce`(접지가 받아낼 수 있는 최대 힘)와 `availablePower / v`(파워 제한).
   저속에서는 힘 제한, 고속에서는 파워 제한이 걸린다. 현실의 토크–파워 곡선과 같은 모양이다.
2. 최고 속도 근처(`maxSpeed`의 98.5%~100%)에서 구동력이 선형으로 0까지 줄어든다 → 리미터.
3. `maxSpeed × 0.3` 미만에서는 구동력을 최대 `1.16`으로 나눈다 → **발진 시 휠스핀 완화**.
4. `availablePower`는 ERS(에너지 회수 장치)를 반영한 값이다:
   `this.physics.availablePower = this.ers.available(max(v,0), cmd.drive)` **[사실]** `@ 4,540,700`

### 1-5. 차량 설정값의 출처

**[사실]** `index-CZ5aQSby.js @ 38,500–38,900`, `Vn = 9.81` (`@ 35,206`)

```js
engineForce:       mass * 9.81 * (tune?.launchG ?? 1.4),
reverseForce:      mass * 5,
brakeForce:        mass * 9.81 * 4,
brakeBias:         activeAero ? 0.56 : 0.6,
handbrakeForce:    mass * 6,
maxSpeed:          limited ? topSpeed : topSpeed * 1.04,
maxReverseSpeed:   12,
dragCoefficient, rollingResistance, downforce,
frontGrip, rearGrip, frontFriction, rearFriction,
maxSteerLowSpeed:  tune.steer[0],
maxSteerHighSpeed: tune.steer[1],
steerFadeSpeed:    tune.steer[2],
steerRate:         3.4,
steerReturnRate:   5.8,
handbrakeGripFactor: 0.3,
```

- `engineForce = m·g·1.4` → 발진 가속도 상한이 **1.4 g**로 설계되어 있다.
- `brakeForce = m·g·4` → 제동력 상한은 **4 g** 상당(실제로는 타이어 그립이 먼저 한계).
- `steerRate = 3.4`, `steerReturnRate = 5.8` 두 값만 전 차종 공통 상수다. **[사실]**
- `maxSteerLowSpeed / maxSteerHighSpeed / steerFadeSpeed`의 **구체적 수치는 차종 데이터 테이블
  안에 있고 축약 변수로만 참조되어 개별 값을 확정하지 못했다.** → **[미확인]**

### 1-6. 실제 가속 계측 **[관찰 · REA 아님]**

CDP로 `KeyW`를 **rawKeyDown 상태로 유지**하며 HUD 속도계를 100 ms 간격으로 읽었다.
차량: Ferrari F1 2026 / 서킷: Melbourne / 그리드 20위 출발, 표준 레이스.

| 구간 | 결과 |
| --- | --- |
| 0 → 100 km/h | **약 2.9 초** (3,019 ms 시점 103 km/h) |
| 0 → 200 km/h | **약 5.4 초** (5,455 ms 시점 201 km/h) |
| 7.33 초 시점 | 265 km/h, 아직 증가 중 |

전체 샘플: `docs/evidence/throttle-run.csv` (70 샘플)

주의: 측정 중 FPS는 약 30–32였고 차량이 그리드에서 **잔디/자갈 구간으로 이탈**했다
(스크린샷 참조). 노면 그립 계수가 아스팔트와 다르므로 이 수치는 **최적 조건값이 아니다**.

---

## 2. 브레이크 기능 분석

**[사실]** `Game-CGRrnhwj.js @ 4,536,100–4,536,400` (바퀴 루프 내부)

```js
const k  = this.brakeAssist ? v : (n.brakeBias ?? 0.5);     // v = 조향륜 하중 비율
const A  = n.wheels.length / 2;
const j  = e.brake * n.brakeForce * this.brakeForceScale * (steerable ? k : 1-k) / A;
const ee = w * this.brakeGrip * (n.braking ?? 1);           // w = 그립 한계(= μ·하중)
const te = !this.brakeAssist && j > ee*1.1 && Math.abs(c) > 2;   // 휠 락
o.locked = te;
```

확정 사항

- 제동력은 **앞/뒤로 `brakeBias`만큼 나뉘고, 다시 바퀴 수의 절반으로 나뉜다**.
  기본 배분은 앞 60% / 뒤 40%, 액티브 에어로 차량은 56% / 44%.
- **휠 락(잠김) 모델이 있다**: 요구 제동력이 그립 한계의 1.1배를 넘고 차속 2 m/s 초과면
  바퀴가 잠긴다. 단 `brakeAssist`(B 키로 토글, 화면 하단 안내에 `B 브레이크 보조` 표시)가
  켜져 있으면 잠기지 않고 하중 비율 기반 배분으로 대체된다. **[사실]**
- 핸드브레이크(Space)는 **뒤 타이어 그립을 `1 − (1−0.3)·handbrake`배로 낮춘다**
  → 최대 30%까지 떨어짐. 드리프트 유발용. **[사실]** `@ 4,535,900`

---

## 3. 조향 기능 분석

**[사실]** `Game-CGRrnhwj.js @ 4,530,400–4,530,860`

```js
// 입력 보간 (슬루율 제한)
const o = input.steer;                                           // -1 / 0 / +1
const s = Math.abs(o) < Math.abs(this.steer) || Math.sign(o) !== Math.sign(this.steer);
const c = this.agileSteering ? rc.rate : 1;                      // 1.9
const l = (s ? cfg.steerReturnRate * (this.agileSteering ? rc.returnRate : 1)
             : cfg.steerRate) * (s ? 1 : c) * dt;
this.steer += Math.max(-l, Math.min(l, o - this.steer));
cmd.steerAngle = this.steer * this.maxSteer(forwardSpeed);

// 속도에 따른 최대 조향각
maxSteer(v) {
  const n = Math.min(Math.abs(v) / cfg.steerFadeSpeed, 1);
  const r = n * (2 - n);                                          // ease-out 곡선
  const i = cfg.maxSteerHighSpeed * (this.agileSteering ? rc.highSpeedLock : 1);
  return cfg.maxSteerLowSpeed + (i - cfg.maxSteerLowSpeed) * r;
}
```

읽어낸 의미

1. **조향은 즉시 꺾이지 않는다.** 목표값(−1/0/+1)으로 초당 제한 속도만큼 접근한다.
   - 꺾을 때: `3.4 × 1.9 = 6.46 /s` → 0에서 최대 조향까지 약 **0.155초**
   - 되돌릴 때: `5.8 × 1.4 = 8.12 /s` → 약 **0.123초** (되돌리는 쪽이 더 빠르다)
2. **속도가 붙을수록 최대 조향각이 줄어든다.** 비율 `n = v / steerFadeSpeed`에 대해
   `n(2−n)`은 처음엔 가파르고 끝에서 평평해지는 곡선이라, 저속에서 각도가 급격히 줄고
   고속에서는 `maxSteerHighSpeed × 1.35`로 수렴한다.
3. 결과 `steerAngle`은 **라디안 단위 앞바퀴 조향각**이며, 물리 단계에서
   `Ec.setFromAxisAngle(sc, -steerAngle)`로 바퀴 전방 벡터를 회전시킨다. **[사실]** `@ 4,535,300`

---

## 4. 타이어·횡력 모델 (조향이 실제로 차를 돌리는 부분)

**[사실]** `Game-CGRrnhwj.js @ 4,531,116–4,531,195`

```js
var hc = 1.2, gc = 36, _c = 1.2, vc = .3;
function yc(e) {                                     // 정규화 타이어 횡력 곡선
  const t = gc * e;                                  // B·slip
  return Math.sin(_c * Math.atan(t - vc * (t - Math.atan(t))));
}
```

이것은 **Pacejka "매직 포뮬러"**의 표준형 `D·sin(C·atan(B·s − E·(B·s − atan(B·s))))`이고,
계수는 `B = 36`, `C = 1.2`, `E = 0.3`이다. **[사실]**

> **매직 포뮬러**: 타이어의 미끄러짐 각도(슬립)와 발생하는 옆 방향 힘의 관계를 나타내는
> 경험식. 슬립이 커지면 힘이 올라가다가 정점을 지나 다시 떨어지는 곡선을 만든다.
> 이 곡선 덕분에 "한계를 넘으면 미끄러진다"는 느낌이 생긴다.

사용 위치 **[사실]** `@ 4,536,000–4,536,200`

```js
const T = Math.atan2(l, Math.max(Math.abs(c), 1.5));   // 슬립각 (저속 분모 보호 1.5)
const E = Math.abs(l) * this.massPerWheel * b / dt;    // 속도 소거에 필요한 힘 상한
const D = -Math.sign(l) * Math.min(w * yc(Math.abs(T)), E);   // 실제 횡력
```

→ 횡력은 `매직포뮬러 × 수직하중` 과 `이번 스텝에 속도를 0으로 만드는 힘` 중 **작은 쪽**.
두 번째 항이 수치 폭발을 막는 안전장치다.

## 5. 서스펜션·접지 (레이캐스트 방식)

**[사실]** `@ 4,534,300–4,535,000`

```js
const o = i.castRayAndGetNormal(this.ray, d, true, undefined, Gs, undefined, r);
a.grounded = !!o;
a.suspensionLength = o ? Math.max(o.timeOfImpact - n.wheelRadius, 0) : n.suspensionRestLength;
...
const 압축 = restLength - suspensionLength;
const 감쇠속도 = -mc.dot(sc);
let 하중 = stiffness*압축 + damping*감쇠속도;
if (반대쪽 바퀴 접지) 하중 += antiRoll*(반대쪽 길이 - 이쪽 길이);   // 안티롤바
wheel.load = Math.max(하중, 0);
```

- 바퀴마다 아래로 레이를 쏘아 지면까지 거리를 재고, 스프링+댐퍼로 수직 하중을 만든다.
- 앞/뒤 안티롤바 계수가 각각 `mass × 15`, `mass × 12`(기본값)로 설정된다 **[사실]** `index @ 38,300`.
- 다운포스가 하중에 더해진다: `normalLoad ≈ m·g + downforce·v²`, 그리고
  `h = 1 + (mechGrip − 1) × (m·g) / (m·g + downforce·v²)` 형태로 기계 그립 비중을 보정한다.

## 6. 화면 반영

**[사실]** `@ 4,540,480–4,541,200`

```js
get speedKmh() { return this.physics.forwardSpeed * 3.6; }

snapshot() {                                   // 매 fixedUpdate 직전
  this.prevPos.copy(this.currPos);  this.prevQuat.copy(this.currQuat);
  this.physics.getPose(this.currPos, this.currQuat);
}
render(alpha) {
  const t = this.visual.root;
  t.position.lerpVectors(this.prevPos, this.currPos, alpha);
  t.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
  this.visual.updateWheels(this.physics.wheels);
  this.visual.setBrake?.(this.controller.commands.brake, this.physics.speed);
}
```

- **물리 60 Hz, 렌더는 모니터 주사율**. 둘 사이는 `alpha` 선형/구면 보간으로 메운다.
- HUD 속도계는 `Game-CGRrnhwj.js @ 4,517,950`에서 생성된다:
  `div.speedo > div.value` + `div.unit("km/h")` + `div.gear` + `div.rpm`.
- 리셋(R): `Scene.fixedUpdate`에서 `actions.includes("reset")` → `this.resetPlayer()` +
  `this.lapTimer.invalidate()` (랩타임 무효 처리). **[사실]** `@ 4,778,601`

## 7. 카메라

**[사실]** `Game-CGRrnhwj.js @ 1,640`(기본값) 및 `@ 6,043`(갱신 로직)

```js
var qt = { distance: 6.8, height: 2.6, lookHeight: 1.1, lookAhead: 3,
           rotationDamping: 4.5, baseFov: 62, speedFov: 8 };
var ln = (k, dt) => 1 - Math.exp(-k * dt);         // 프레임 독립 감쇠

updateChase(target, speedRatio, dt) {
  this.yaw    += 각도차(this.yaw, 차량요) * ln(4.5, dt);
  this.height += (target.position.y - this.height) * ln(10, dt);
  const a = Math.sin(this.yaw), o = Math.cos(this.yaw);
  this.camera.position.set(x + a*distance, this.height + height, z + o*distance);
  this.lookTarget.set  (x - a*lookAhead, this.height + lookHeight, z - o*lookAhead);
  this.camera.lookAt(this.lookTarget);
  const s = baseFov + speedFov * Math.min(Math.max(speedRatio,0),1) ** 1.5;
  this.camera.fov += (s - this.camera.fov) * ln(3, dt);
}
```

- **카메라는 차량에 고정되지 않는다.** 차량의 요(yaw)를 지수 감쇠로 **따라간다** →
  급회전 시 카메라가 살짝 늦게 따라오는 특유의 느낌.
- 속도가 오르면 FOV가 62°에서 최대 70°까지 **1.5제곱 곡선**으로 넓어진다 → 속도감.
- 카메라 모드 7종: `chase, far, tcam, cockpit, driver, nose, tv` (C 키로 순환). **[사실]**
- 흔들림(shake) 레벨 4단계 `[0, 0.5, 1, 1.6]`, 세 개의 사인파를 합성해 생성.

---

## 8. 요약 — 사실과 추정의 구분

| 항목 | 상태 |
| --- | --- |
| 키 코드 매핑 (W/S/A/D/Space/R/O) | **[사실]** |
| 리스너 대상이 `window`인 것 | **[사실]** + **[관찰]** |
| 입력 max 합성 규칙 | **[사실]** |
| 전진/후진에 따른 W·S 역할 전환 | **[사실]** |
| 브레이크 압력 램프 10/16 | **[사실]** |
| 구동력 공식 (파워/힘 최솟값, 리미터, 발진 완화) | **[사실]** |
| `engineForce = m·g·1.4`, `brakeForce = m·g·4` | **[사실]** |
| 조향 슬루율 3.4 / 5.8, 보정 1.9 / 1.4 / 1.35 | **[사실]** |
| `maxSteer` 속도 페이드 곡선 `n(2−n)` | **[사실]** |
| `maxSteerLowSpeed / HighSpeed / FadeSpeed` 실제 수치 | **[사실]** · 2라운드 확정 (아래 9절) |
| 매직 포뮬러 B=36, C=1.2, E=0.3 | **[사실]** |
| 고정 스텝 1/60 · 최대 5 서브스텝 · 보간 렌더 | **[사실]** |
| 체이스 카메라 상수 전체 | **[사실]** |
| 0→100 km/h 약 2.9초 | **[관찰]** (노면 이탈 상태, 최적값 아님) |
| Rapier WASM 내부 적분 방식 | **[미확인]** (WASM 바이너리 미분석) |
| 차종별 튜닝 테이블의 개별 수치 | **[사실]** · 2라운드 확정 (아래 9절) |
| Rapier WASM **호출 경계** 목록 | **[사실]** · 2라운드 확정 (10절) |

---

## 9. 2라운드 추가 확정 — 차종 튜닝 테이블 (1라운드 [미확인] 해소)

1라운드에서 "차종 데이터 테이블 안에 있고 축약 변수로만 참조되어 확정 못 함"이라고 적었던
값들을 전부 찾아냈다. 근거는 동일한 번들 파일(`index-CZ5aQSby.js`, sha256 `01f6873977d93ea5…`)이다.

### 9-1. 바디 튜닝 프리셋 `Zn` **[사실]** `@ 35,330–36,900`

`steer: [maxSteerLowSpeed, maxSteerHighSpeed, steerFadeSpeed]` — 단위는 rad, rad, m/s.

| 바디 | μ | downforce | steer (low / high / fade) | grip (front/rear) |
| --- | ---: | ---: | --- | --- |
| hatch | 1.02* | 0.04* | 0.60 / 0.120 / 42 | 0.85 / 0.90 |
| coupe | 1.12 | 0.08 | 0.58 / 0.105 / 48 | — |
| roadster | 1.08 | 0.03 | 0.60 / 0.110 / 46 | — |
| mid | 1.18 | 0.14 | 0.56 / 0.100 / 50 | — |
| gt3 | 1.45 | 0.95 | 0.55 / 0.085 / 55 | 0.88 / 0.92 |
| supercar | 1.28 | 0.35 | 0.54 / 0.085 / 58 | 0.88 / 0.92 |
| lmp | 1.60 | 2.00 | 0.50 / 0.072 / 66 | 0.90 / 0.95 |
| **f1** | **1.75** | **2.90** | **0.50 / 0.070 / 70** | **0.90 / 0.95** |
| openwheel | 1.60 | 2.00 | 0.50 / 0.075 / 66 | 0.90 / 0.95 |
| indy | 1.62 | 2.30 | 0.50 / 0.070 / 70 | 0.90 / 0.95 |
| fe | 1.38 | 1.00 | 0.52 / 0.080 / 62 | 0.90 / 0.95 |

\* `hatch`는 베이스(`Xn`)이고 `sedan`/`wagon`은 휠 반경만 다른 파생형이다.

F1 전용 추가값: `cgHeight 0.33`, `antiRollPerKg [120, 95]`, `wheelRadius 0.36`,
`springPerKg 56`, `damperPerKg 3.25`, `rest 0.3`.

→ **F1의 고속 포화 조향각은 `0.07 × 1.35 = 0.0945 rad` (약 5.4°)** 이다.
  `steerFadeSpeed = 70 m/s(252 km/h)`이므로 조향각 축소가 매우 늦게까지 진행된다.

### 9-2. 차량 데이터 테이블 **[사실]** `@ 42,947`

```js
var cr = (cls, rows) => rows.map(([id, brand, model, body, kw, kg, top, drive,
                                   dims, engine, color, accent, limited]) => ({ … }));
var lr = [5.4, 1.9, 0.95, 3.4];     // 전장, 전폭, 전고, 휠베이스 (F1 공통)
var ur = cr(`formula`, [
  [`f1-ferrari`,  `Ferrari`,  `F1 2026`, `f1`, 790, 800, 348, `RWD`, lr, `f1`, …],
  [`f1-mercedes`, `Mercedes`, `F1 2026`, `f1`, 785, 800, 347, `RWD`, lr, `f1`, …],
  [`f1-redbull`,  `Red Bull`, `F1 2026`, `f1`, 765, 800, 343, `RWD`, lr, `f1`, …],
  …10개 팀
]);
```

Ferrari 기준: **790 kW · 800 kg · 표기 최고속 348 km/h · RWD · 휠베이스 3.4 m**.

차량별 특성 보정 `dr["f1-ferrari"]` **[사실]**:
`{ downforce: 0.96, drag: 0.94, grip: 0.985, traction: 0.97, braking: 1.02, tyreWear: 0.95 }`
(라벨: `최고속도 · 파워 / 저속 트랙션 약함`)

### 9-3. ERS(MGU-K) 파워 테이퍼 **[사실]** `@ 33,421`

```js
function Rn(v, overtake = false) {
  const kmh = v * 3.6;
  const start = overtake ? 337 : 290;
  return kmh <= start ? 1 : Math.max(0, (355 - kmh) / (355 - start));
}
function zn(cfg, v, overtake) {           // availablePower
  return cfg.enginePower - cfg.mgukPower + cfg.mgukPower * Rn(v, overtake);
}
```

→ **290 km/h까지는 전력(全力), 355 km/h에서 MGU-K 기여가 0**이 되는 선형 테이퍼.
오버테이크 모드(`O` 키)에서는 테이퍼 시작점이 337 km/h로 밀린다.
이것이 1-4절의 `availablePower`가 상수가 아닌 이유다.

### 9-4. 설정값 전체 재계산 (번들의 식을 그대로 실행한 결과)

전역 상수 **[사실]**: `G = 9.81`, 드라이브트레인 효율 `0.88`, formula 구름저항 `0.03`,
MGU-K 정격 `350 kW`, 액티브 에어로 `{ drag: 0.7, downforce: 0.55 }`,
기준속 `Jn = 345/3.6`, 기준출력 `qn = 760 kW`, 다운포스 민감도 `Yn = 0.5`.

| 설정값 | 계산 결과 | 유도 |
| --- | ---: | --- |
| `enginePower` | 695,200 W | `790 kW × 0.88` |
| `mgukPower` | 308,000 W | `350 kW × 0.88` |
| `rollingResistance` | 0.03 | formula 분기 |
| `downforce` | 2.784 | `2.9 × 0.96` |
| `dragCoefficient` | 0.51362 | 번들의 최고속 역산식 + traits 보정 |
| 최종 `topSpeed` | 97.756 m/s = **352 km/h** | 번들의 40회 이분탐색 |
| `maxSpeed` | 101.666 m/s | `topSpeed × 1.04` |
| `engineForce` | 10,987 N | `800 × 9.81 × 1.4` |
| `brakeForce` | 31,392 N | `800 × 9.81 × 4` |
| `brakeBias` | 0.56 | 액티브 에어로 차량 |
| `frontFriction / rearFriction` | 1.75 / 1.8025 | `μ`, `μ × 1.03` |

흥미로운 점: 테이블의 표기 최고속은 348 km/h인데, 특성 보정을 반영해 번들이 **다시 풀어낸**
최고속은 352 km/h다. 즉 **표기값은 입력이고 실제값은 계산 결과**다 (`e.top`을 덮어쓴다).

## 10. Rapier(WASM) 호출 경계 **[사실]**

WASM 내부는 여전히 **[미확인]**이지만, JS가 WASM에 무엇을 요구하는지는 전부 셀 수 있다.
`Game-CGRrnhwj.js`에서 호출되는 Rapier API와 등장 횟수:

| API | 횟수 | 쓰임 |
| --- | ---: | --- |
| `castRay` | 24 | 지형·충돌 질의 |
| `applyImpulse` | 14 | 충격량 적용 |
| `castRayAndGetNormal` | 12 | **서스펜션 레이캐스트** (법선 필요) |
| `createCollider` | 12 | 콜라이더 생성 |
| `linvel` | 11 | 선속도 읽기 |
| `setTranslation` / `setRotation` | 11 / 9 | 리셋·텔레포트 |
| `createRigidBody` | 8 | 강체 생성 |
| `wakeUp` | 8 | 슬립 해제 |
| `intersectionsWithRay` / `contactPair` | 6 / 6 | 충돌 이벤트 |
| `applyImpulseAtPoint` | 5 | **바퀴 위치에 서스펜션·타이어 힘 적용** |
| `angvel` | 5 | 각속도 읽기 |
| `applyTorqueImpulse` | 3 | 자세 보정 |
| `world.step` | 1 | 월드 적분 (고정 timestep) |

→ 차량 물리의 실체는 **"JS가 매 고정 스텝마다 바퀴 4개 위치에 충격량을 꽂아 넣고,
Rapier는 그 결과를 적분만 한다"** 는 구조다. 타이어 모델·서스펜션·구동력은 전부 JS에 있다.
이것이 1라운드에서 JS만 읽고도 조작 로직을 복원할 수 있었던 이유다.
