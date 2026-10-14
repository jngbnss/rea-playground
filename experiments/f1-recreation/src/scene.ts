import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DEFAULT_VEHICLE } from './vehicle';

/**
 * 씬 구성: 지면 + 타원 트랙 참조물 + 조명 + 박스 기반 차량.
 * 외부 에셋/모델 없이 전부 프리미티브로만 만든다. 전방은 -Z 규약.
 */

/**
 * 타원 트랙 제원 [자체설계]
 * 최고속이 352 km/h(97.8 m/s)로 확정되면서 기존 320×210 m 로는 전개 구간이 모자랐다.
 * 최소 곡률반경은 장축 끝의 `B²/A = 320²/460 ≈ 222 m` → 97.8 m/s 에서 필요한 횡가속은
 * `v²/R ≈ 43 m/s²`, 그 속도의 그립 한계 `μ(mg + downforce·v²)/m ≈ 75 m/s²` 안쪽이다.
 */
export const TRACK = {
  /** X 반경 (m) */
  radiusX: 460,
  /** Z 반경 (m) */
  radiusZ: 320,
  /** 노면 폭 (m) */
  width: 28,
  /** 둘레 분할 수. 둘레 ≈ 2,470 m → 블록 간격 약 5.1 m */
  segments: 480,
  /** 출발 지점: 타원 θ=0 의 중앙선 */
  startX: 0,
  startZ: 320,
  /** 출발 헤딩: 전방 = +X (θ=0 의 접선) */
  startYaw: -Math.PI / 2,
} as const;

const UP = new Vector3(0, 1, 0);

export interface DemoScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  /** 보간된 포즈가 적용되는 차량 루트 */
  readonly car: Group;
  /** 앞바퀴 비주얼 조향각 (rad, 물리 규약 + 가 좌회전) */
  setSteerAngle(angle: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** 박스 기반 F1 형상 */
function createCar(): { group: Group; frontWheels: Mesh[] } {
  const group = new Group();

  const bodyMaterial = new MeshStandardMaterial({
    color: 0xd8232a,
    roughness: 0.45,
    metalness: 0.1,
  });
  const darkMaterial = new MeshStandardMaterial({ color: 0x15171c, roughness: 0.6, metalness: 0.2 });
  const tyreMaterial = new MeshStandardMaterial({ color: 0x101114, roughness: 0.95 });
  const accentMaterial = new MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.4 });

  const add = (
    geometry: BoxGeometry,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // 모노코크 / 노즈 / 엔진커버
  add(new BoxGeometry(0.92, 0.3, 3.4), bodyMaterial, 0, 0.1, 0.1);
  add(new BoxGeometry(0.46, 0.2, 1.7), bodyMaterial, 0, 0.04, -2.35);
  add(new BoxGeometry(0.62, 0.36, 1.5), bodyMaterial, 0, 0.3, 1.0);
  // 콕핏 보호대(헤일로 느낌)
  add(new BoxGeometry(0.56, 0.26, 0.9), darkMaterial, 0, 0.33, -0.45);
  // 사이드포드
  add(new BoxGeometry(0.34, 0.3, 1.5), darkMaterial, 0.56, 0.1, 0.35);
  add(new BoxGeometry(0.34, 0.3, 1.5), darkMaterial, -0.56, 0.1, 0.35);
  // 프런트 윙 / 리어 윙
  add(new BoxGeometry(1.6, 0.07, 0.5), accentMaterial, 0, -0.14, -3.05);
  add(new BoxGeometry(0.12, 0.42, 0.22), darkMaterial, 0, 0.45, 2.15);
  add(new BoxGeometry(1.15, 0.08, 0.42), accentMaterial, 0, 0.66, 2.15);
  add(new BoxGeometry(0.06, 0.3, 0.42), darkMaterial, 0.57, 0.5, 2.15);
  add(new BoxGeometry(0.06, 0.3, 0.42), darkMaterial, -0.57, 0.5, 2.15);

  // 바퀴: 앞 z=-1.85, 뒤 z=+1.55 (CG 기준 a/b), 좌우 ±0.8 (윤거 절반), 지름 0.72 [분석확인]
  const { frontAxle, rearAxle, trackHalf, wheelRadius } = DEFAULT_VEHICLE;
  const wheelSize = wheelRadius * 2;
  const frontWheelGeometry = new BoxGeometry(0.3, wheelSize, wheelSize);
  const rearWheelGeometry = new BoxGeometry(0.38, wheelSize, wheelSize);
  const frontWheels = [
    add(frontWheelGeometry, tyreMaterial, trackHalf, 0, -frontAxle),
    add(frontWheelGeometry, tyreMaterial, -trackHalf, 0, -frontAxle),
  ];
  add(rearWheelGeometry, tyreMaterial, trackHalf, 0, rearAxle);
  add(rearWheelGeometry, tyreMaterial, -trackHalf, 0, rearAxle);

  // 섀도맵 없이 쓰는 접지 그림자 대용. 크기는 차종표 dims 의 전폭×전장 [분석확인]
  const shadow = new Mesh(
    new PlaneGeometry(1.9, 5.4),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -wheelRadius;
  group.add(shadow);

  return { group, frontWheels };
}

/**
 * 타원 노면 지오메트리. XZ 평면의 띠를 삼각형 2개씩 이어 만든다.
 * 중앙선 p(θ) = (A·sinθ, B·cosθ), 바깥 법선 n = normalize((B·sinθ, A·cosθ)). [자체설계]
 */
function buildEllipseRing(
  radiusX: number,
  radiusZ: number,
  width: number,
  segments: number,
): BufferGeometry {
  const vertexCount = segments * 6;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const half = width / 2;

  // side = +1 바깥 가장자리, -1 안쪽 가장자리
  const writePoint = (offset: number, theta: number, side: number): void => {
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const nx = radiusZ * sin;
    const nz = radiusX * cos;
    const len = Math.hypot(nx, nz) || 1;
    positions[offset] = radiusX * sin + (nx / len) * half * side;
    positions[offset + 1] = 0;
    positions[offset + 2] = radiusZ * cos + (nz / len) * half * side;
    normals[offset] = 0;
    normals[offset + 1] = 1;
    normals[offset + 2] = 0;
  };

  for (let i = 0; i < segments; i += 1) {
    const t0 = (i / segments) * Math.PI * 2;
    const t1 = ((i + 1) / segments) * Math.PI * 2;
    const base = i * 18;
    // 위에서 봤을 때 앞면이 되도록 (outer0, outer1, inner0) / (inner0, outer1, inner1)
    writePoint(base, t0, 1);
    writePoint(base + 3, t1, 1);
    writePoint(base + 6, t0, -1);
    writePoint(base + 9, t0, -1);
    writePoint(base + 12, t1, 1);
    writePoint(base + 15, t1, -1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  return geometry;
}

/** 타원 트랙: 노면 + 좌우 커브 블록 + 스타트 라인 + 외곽 구조물 */
function createTrack(): Group {
  const group = new Group();
  const { radiusX, radiusZ, width, segments } = TRACK;

  const asphalt = new Mesh(
    buildEllipseRing(radiusX, radiusZ, width, segments),
    new MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.95 }),
  );
  asphalt.position.y = 0.02;
  group.add(asphalt);

  // 커브(kerb) 블록: 안/바깥 가장자리에 빨강·흰색 교차. 인스턴싱으로 드로우콜 1회.
  const kerbs = new InstancedMesh(
    new BoxGeometry(0.9, 0.12, 3.2),
    new MeshStandardMaterial({ roughness: 0.7 }),
    segments * 2,
  );
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const red = new Color(0xd62828);
  const white = new Color(0xf5f5f5);
  const half = width / 2;

  for (let i = 0; i < segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const px = radiusX * sin;
    const pz = radiusZ * cos;
    const nx = radiusZ * sin;
    const nz = radiusX * cos;
    const nLen = Math.hypot(nx, nz) || 1;
    const ux = nx / nLen;
    const uz = nz / nLen;
    // 접선 (A·cosθ, -B·sinθ) 방향으로 블록 정렬
    quaternion.setFromAxisAngle(UP, Math.atan2(radiusX * cos, -radiusZ * sin));

    const color = i % 2 === 0 ? red : white;

    position.set(px + ux * half, 0.06, pz + uz * half);
    matrix.compose(position, quaternion, scale);
    kerbs.setMatrixAt(i * 2, matrix);
    kerbs.setColorAt(i * 2, color);

    position.set(px - ux * half, 0.06, pz - uz * half);
    matrix.compose(position, quaternion, scale);
    kerbs.setMatrixAt(i * 2 + 1, matrix);
    kerbs.setColorAt(i * 2 + 1, color);
  }
  kerbs.instanceMatrix.needsUpdate = true;
  if (kerbs.instanceColor !== null) kerbs.instanceColor.needsUpdate = true;
  group.add(kerbs);

  // 스타트/피니시 라인
  const startLine = new Mesh(
    new BoxGeometry(1.4, 0.02, width),
    new MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 }),
  );
  startLine.position.set(TRACK.startX, 0.05, TRACK.startZ);
  group.add(startLine);

  // 외곽 구조물: 속도감을 주는 참조물
  const standCount = 20;
  const stands = new InstancedMesh(
    new BoxGeometry(26, 9, 8),
    new MeshStandardMaterial({ color: 0x343b49, roughness: 0.9 }),
    standCount,
  );
  for (let i = 0; i < standCount; i += 1) {
    const theta = (i / standCount) * Math.PI * 2 + 0.2;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    position.set((radiusX + 52) * sin, 4.5, (radiusZ + 52) * cos);
    quaternion.setFromAxisAngle(UP, Math.atan2(radiusX * cos, -radiusZ * sin));
    matrix.compose(position, quaternion, scale);
    stands.setMatrixAt(i, matrix);
  }
  stands.instanceMatrix.needsUpdate = true;
  group.add(stands);

  return group;
}

export function createDemoScene(container: HTMLElement): DemoScene {
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const skyColor = new Color(0x111d33);
  scene.background = skyColor;
  // 트랙이 커진 만큼 포그 시작/끝도 늘린다 [자체설계]
  scene.fog = new Fog(skyColor, 420, 2200);

  const camera = new PerspectiveCamera(62, width / height, 0.1, 4000);
  camera.position.set(0, 4, 12);

  scene.add(new HemisphereLight(0xa9ccff, 0x2a3140, 1.35));
  const sun = new DirectionalLight(0xffffff, 1.5);
  sun.position.set(160, 220, 90);
  scene.add(sun);

  const ground = new Mesh(
    new PlaneGeometry(4000, 4000),
    new MeshStandardMaterial({ color: 0x1e232c, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new GridHelper(4000, 200, 0x46526a, 0x303a4b);
  grid.position.y = 0.01;
  scene.add(grid);

  scene.add(createTrack());

  const { group: car, frontWheels } = createCar();
  scene.add(car);

  return {
    scene,
    camera,
    renderer,
    car,
    setSteerAngle(angle: number): void {
      // 물리 조향각(+좌회전)을 그대로 앞바퀴 로컬 yaw 로 사용 [자체설계]
      for (const wheel of frontWheels) wheel.rotation.y = angle;
    },
    resize(nextWidth: number, nextHeight: number): void {
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight, false);
    },
    dispose(): void {
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
