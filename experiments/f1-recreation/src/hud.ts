import type { VehicleInput } from './input';

/**
 * HUD. 프레임워크 없이 순수 DOM 으로만 구성한다.
 * 스타일은 index.html 의 <style> 에 있고, 여기서는 구조 생성과 텍스트 갱신만 한다.
 */

const HELP_TEXT = 'W/↑ 가속 · S/↓ 브레이크·후진 · A/D 조향 · Space 핸드브레이크 · R 리셋';

export class Hud {
  private readonly root: HTMLElement;
  private readonly panel: HTMLDivElement;
  private readonly speedValue: HTMLSpanElement;
  private readonly sourceLine: HTMLDivElement;
  private readonly channelLine: HTMLDivElement;
  private readonly help: HTMLDivElement;

  private lastSpeed = Number.NaN;
  private lastSource = '';
  private lastChannels = '';

  constructor(root: HTMLElement = document.body) {
    this.root = root;

    this.panel = document.createElement('div');
    this.panel.className = 'hud hud-panel';

    const speedLabel = document.createElement('div');
    speedLabel.className = 'hud-speed';
    speedLabel.textContent = '속도';

    const speedRow = document.createElement('div');
    this.speedValue = document.createElement('span');
    this.speedValue.className = 'hud-speed-value';
    this.speedValue.textContent = '0';
    const unit = document.createElement('span');
    unit.className = 'hud-speed-unit';
    unit.textContent = 'km/h';
    speedRow.append(this.speedValue, unit);

    this.sourceLine = document.createElement('div');
    this.sourceLine.className = 'hud-source';
    this.sourceLine.textContent = '입력: none';

    this.channelLine = document.createElement('div');
    this.channelLine.className = 'hud-channels';
    this.channelLine.textContent = 'throttle 0.00 · brake 0.00 · steer +0.00';

    this.panel.append(speedLabel, speedRow, this.sourceLine, this.channelLine);

    this.help = document.createElement('div');
    this.help.className = 'hud hud-help';
    this.help.textContent = HELP_TEXT;

    this.root.append(this.panel, this.help);
  }

  dispose(): void {
    this.panel.remove();
    this.help.remove();
  }

  /**
   * @param speedKmh [분석확인] speedKmh = forwardSpeed * 3.6, 정수 반올림 표시
   * @param sources  활성 입력 소스 이름 (없으면 none)
   * @param frontLocked 앞축 휠 락 [분석확인] 요구제동력 > 그립한계*1.1 && |v| > 2
   * @param rearLocked  뒤축 휠 락
   */
  update(
    speedKmh: number,
    input: VehicleInput,
    sources: readonly string[],
    frontLocked: boolean,
    rearLocked: boolean,
  ): void {
    const rounded = Math.round(speedKmh); // [분석확인]
    if (rounded !== this.lastSpeed) {
      this.lastSpeed = rounded;
      this.speedValue.textContent = String(rounded);
    }

    const source = sources.length === 0 ? 'none' : sources.join(' + ');
    if (source !== this.lastSource) {
      this.lastSource = source;
      this.sourceLine.textContent = `입력: ${source}`;
    }

    const steer = input.steer >= 0 ? `+${input.steer.toFixed(2)}` : input.steer.toFixed(2);
    // 휠 락 표시 [자체설계: 표기 방식]
    const lock = frontLocked
      ? rearLocked
        ? ' · LOCK F+R'
        : ' · LOCK F'
      : rearLocked
        ? ' · LOCK R'
        : '';
    const channels =
      `throttle ${input.throttle.toFixed(2)} · brake ${input.brake.toFixed(2)} · steer ${steer}` +
      (input.handbrake > 0 ? ' · handbrake' : '') +
      lock;
    if (channels !== this.lastChannels) {
      this.lastChannels = channels;
      this.channelLine.textContent = channels;
    }
  }
}
