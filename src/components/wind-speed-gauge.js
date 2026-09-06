/**
 * wind-speed-gauge.js
 * リアルタイム風速メーター
 *
 * 仕様:
 * - リアルタイム表示
 * - 計測エラー (99.9m/s) 時のエラー警告表示
 * - 時間軸グラフの風速スケール（5, 10, 20, 30 m/s）と連動してスケールを動的変更
 */

export class WindSpeedGauge {
  /**
   * @param {HTMLElement} containerElement
   * @param {number} [initialMaxScale=10]
   */
  constructor(containerElement, initialMaxScale = 10) {
    this.container = containerElement;
    this.maxScale = initialMaxScale; // 5, 10, 20, 30
    this.currentSpeed = 0.0;
    this.isError = false;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="gauge-card wind-speed-card">
        <div class="gauge-header">
          <span class="gauge-title">風速 (WIND SPEED)</span>
          <span class="gauge-badge" id="speed-error-badge" style="display:none;">ERROR</span>
        </div>
        <div class="gauge-body">
          <svg class="speed-svg" viewBox="0 0 300 240" width="100%" height="100%">
            <defs>
              <!-- 速度バーのグラデーション -->
              <linearGradient id="speedGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#00f0ff" />
                <stop offset="50%" stop-color="#22c55e" />
                <stop offset="85%" stop-color="#eab308" />
                <stop offset="100%" stop-color="#ef4444" />
              </linearGradient>
              <linearGradient id="speedErrorGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ef4444" />
                <stop offset="100%" stop-color="#991b1b" />
              </linearGradient>
            </defs>

            <!-- 背景アークトラック (開始 -210度, 終了 30度 = 240度の円弧) -->
            <path id="speed-track-bg" class="speed-arc-track" />
            <!-- プログレスバー（実際の風速） -->
            <path id="speed-track-fill" class="speed-arc-fill" />

            <!-- 目盛り線と数値ラベル -->
            <g id="speed-ticks"></g>

            <!-- 針 -->
            <g id="speed-needle-group" style="transform-origin: 150px 170px; transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);">
              <polygon points="146,170 154,170 151,45 149,45" fill="#ffffff" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"/>
              <circle cx="150" cy="170" r="8" fill="#1e293b" stroke="#00f0ff" stroke-width="2.5" />
            </g>

            <!-- スケール表示 -->
            <text x="150" y="210" class="speed-scale-indicator" id="speed-scale-text">SCALE: 0 - 10 m/s</text>
          </svg>
        </div>

        <div class="gauge-footer">
          <div class="gauge-value-display">
            <span class="value-number" id="speed-val-text">--.-</span>
            <span class="value-unit">m/s</span>
          </div>
        </div>
      </div>
    `;

    this.trackBg = this.container.querySelector('#speed-track-bg');
    this.trackFill = this.container.querySelector('#speed-track-fill');
    this.ticksGroup = this.container.querySelector('#speed-ticks');
    this.needleGroup = this.container.querySelector('#speed-needle-group');
    this.scaleText = this.container.querySelector('#speed-scale-text');
    this.valText = this.container.querySelector('#speed-val-text');
    this.errorBadge = this.container.querySelector('#speed-error-badge');

    this._setupArc();
    this._drawTicks();
  }

  /**
   * 円弧のパス（中心: 150, 170, 半径: 110, 開始角: -210°, 終了角: 30°）
   * @private
   */
  _polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  }

  _describeArc(cx, cy, r, startAngle, endAngle) {
    const start = this._polarToCartesian(cx, cy, r, startAngle);
    const end = this._polarToCartesian(cx, cy, r, endAngle);
    const arcSweep = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${arcSweep} 1 ${end.x} ${end.y}`;
  }

  _setupArc() {
    const d = this._describeArc(150, 170, 110, -210, 30);
    this.trackBg.setAttribute('d', d);
  }

  /**
   * 目盛り線と目盛り数値を描画
   * @private
   */
  _drawTicks() {
    const cx = 150;
    const cy = 170;
    const rOuter = 125;
    const rInnerMajor = 115;
    const rInnerMinor = 119;
    const rText = 98;

    const startAngle = -210;
    const totalAngle = 240; // -210 to 30

    const max = this.maxScale;
    // ステップ数: 5m/sなら5分割, 10m/sなら10分割, 20m/sなら10分割(2刻み), 30m/sなら6分割(5刻み)
    let majorSteps = 10;
    if (max === 5) majorSteps = 5;
    if (max === 20) majorSteps = 10;
    if (max === 30) majorSteps = 6;

    let html = '';

    for (let i = 0; i <= majorSteps; i++) {
      const fraction = i / majorSteps;
      const angle = startAngle + fraction * totalAngle;
      const val = (max * fraction).toFixed(max === 5 ? 0 : 0);

      const pOuter = this._polarToCartesian(cx, cy, rOuter, angle);
      const pInner = this._polarToCartesian(cx, cy, rInnerMajor, angle);
      const pText = this._polarToCartesian(cx, cy, rText, angle);

      html += `<line x1="${pOuter.x.toFixed(1)}" y1="${pOuter.y.toFixed(1)}" x2="${pInner.x.toFixed(1)}" y2="${pInner.y.toFixed(1)}" stroke="#64748b" stroke-width="2" />`;
      html += `<text x="${pText.x.toFixed(1)}" y="${(pText.y + 4).toFixed(1)}" text-anchor="middle" class="speed-tick-text">${val}</text>`;
    }

    this.ticksGroup.innerHTML = html;
    if (this.scaleText) {
      this.scaleText.textContent = `SCALE: 0 - ${this.maxScale} m/s`;
    }
  }

  /**
   * スケール上限（5, 10, 20, 30）を変更する
   * @param {number} newMax
   */
  setScale(newMax) {
    if (newMax !== this.maxScale) {
      this.maxScale = newMax;
      this._drawTicks();
      this._updateVisuals();
    }
  }

  /**
   * 風速データを更新
   * @param {object} packet
   */
  update(packet) {
    if (!packet || !packet.isValid) return;

    this.isError = packet.isError;
    this.currentSpeed = packet.speed;

    this._updateVisuals();
  }

  _updateVisuals() {
    if (this.isError) {
      if (this.errorBadge) this.errorBadge.style.display = 'inline-block';
      if (this.valText) {
        this.valText.textContent = '99.9';
        this.valText.classList.add('error-text');
      }
      if (this.trackFill) {
        // エラー時はフルスケール赤表示
        const d = this._describeArc(150, 170, 110, -210, 30);
        this.trackFill.setAttribute('d', d);
        this.trackFill.setAttribute('stroke', 'url(#speedErrorGrad)');
      }
      if (this.needleGroup) {
        this.needleGroup.style.transform = `rotate(30deg)`;
      }
      return;
    }

    if (this.errorBadge) this.errorBadge.style.display = 'none';
    if (this.valText) {
      this.valText.textContent = this.currentSpeed.toFixed(1);
      this.valText.classList.remove('error-text');
    }

    // 速度比率 (0.0 〜 1.0)
    const ratio = Math.max(0, Math.min(1.0, this.currentSpeed / this.maxScale));
    const startAngle = -210;
    const currentAngle = startAngle + ratio * 240;

    if (this.trackFill) {
      if (ratio > 0.005) {
        const d = this._describeArc(150, 170, 110, startAngle, currentAngle);
        this.trackFill.setAttribute('d', d);
        this.trackFill.setAttribute('stroke', 'url(#speedGrad)');
      } else {
        this.trackFill.setAttribute('d', '');
      }
    }

    if (this.needleGroup) {
      // 針の初期位置は上(0度)。-210度は上から-120度
      // 針角度 = currentAngle + 90度
      const needleDeg = currentAngle + 90;
      this.needleGroup.style.transform = `rotate(${needleDeg}deg)`;
    }
  }
}
