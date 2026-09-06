/**
 * temperature-gauge.js
 * リアルタイム温度計コンポーネント
 *
 * 仕様:
 * - 0℃ と 25℃ の位置がひと目でわかるデザイン
 * - 華氏温度（℉）を小さく表示
 * - 範囲: -20.0℃ 〜 +65.0℃
 * - なめらかなバー伸縮アニメーション
 */

export class TemperatureGauge {
  /**
   * @param {HTMLElement} containerElement
   */
  constructor(containerElement) {
    this.container = containerElement;
    this.currentTempC = 0.0;
    this.minTemp = -20;
    this.maxTemp = 65;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="gauge-card temperature-card">
        <div class="gauge-header">
          <span class="gauge-title">気温 (TEMPERATURE)</span>
        </div>
        <div class="gauge-body temp-body-layout">
          <!-- 縦型温度計SVG -->
          <div class="thermometer-container">
            <svg class="thermometer-svg" viewBox="0 0 160 260" width="100%" height="100%">
              <defs>
                <linearGradient id="tempGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                  <stop offset="0%" stop-color="#0284c7" />   <!-- -20C 青 -->
                  <stop offset="23.5%" stop-color="#38bdf8" /><!-- 0C 水色 -->
                  <stop offset="53%" stop-color="#22c55e" />  <!-- 25C 緑 -->
                  <stop offset="75%" stop-color="#eab308" />  <!-- 40C 黄 -->
                  <stop offset="100%" stop-color="#ef4444" /> <!-- 65C 赤 -->
                </linearGradient>
              </defs>

              <!-- 温度計の管背景 -->
              <rect x="42" y="20" width="18" height="200" rx="9" fill="#1e293b" stroke="#334155" stroke-width="2" />
              <!-- 下部バルブ球 -->
              <circle cx="51" cy="225" r="18" fill="#1e293b" stroke="#334155" stroke-width="2" />

              <!-- 目盛り線（-20, -10, 0, 10, 20, 25, 30, 40, 50, 60, 65） -->
              <g class="temp-ticks">
                ${this._generateTicksHtml()}
              </g>

              <!-- 0℃ ハイライト線とラベル -->
              <g class="temp-special-mark mark-0c">
                <line x1="36" y1="${this._tempToY(0)}" x2="66" y2="${this._tempToY(0)}" stroke="#38bdf8" stroke-width="2.5" />
                <polygon points="32,${this._tempToY(0)} 37,${this._tempToY(0) - 4} 37,${this._tempToY(0) + 4}" fill="#38bdf8" />
                <text x="74" y="${this._tempToY(0) + 4}" class="temp-highlight-text text-freeze">0℃ (氷点)</text>
              </g>

              <!-- 25℃ ハイライト線とラベル -->
              <g class="temp-special-mark mark-25c">
                <line x1="36" y1="${this._tempToY(25)}" x2="66" y2="${this._tempToY(25)}" stroke="#22c55e" stroke-width="2.5" />
                <polygon points="32,${this._tempToY(25)} 37,${this._tempToY(25) - 4} 37,${this._tempToY(25) + 4}" fill="#22c55e" />
                <text x="74" y="${this._tempToY(25) + 4}" class="temp-highlight-text text-room">25℃ (適温)</text>
              </g>

              <!-- 液体バー（動的更新） -->
              <rect id="temp-liquid-bar" x="45" y="${this._tempToY(0)}" width="12" height="${220 - this._tempToY(0)}" rx="6" fill="url(#tempGrad)" />
              <circle cx="51" cy="225" r="14" fill="#0284c7" />
            </svg>
          </div>
        </div>

        <div class="gauge-footer temp-footer-layout">
          <div class="gauge-value-display">
            <span class="value-number" id="temp-c-text">--.-</span>
            <span class="value-unit">℃</span>
          </div>
          <div class="temp-fahrenheit-display">
            <span class="temp-f-label">華氏:</span>
            <span class="temp-f-value" id="temp-f-text">--.- ℉</span>
          </div>
        </div>
      </div>
    `;

    this.liquidBar = this.container.querySelector('#temp-liquid-bar');
    this.cText = this.container.querySelector('#temp-c-text');
    this.fText = this.container.querySelector('#temp-f-text');
  }

  /**
   * 気温（-20〜+65）をY座標（210〜25）に変換
   * @private
   */
  _tempToY(temp) {
    const yMin = 210; // -20℃
    const yMax = 25;  // +65℃
    const ratio = (temp - this.minTemp) / (this.maxTemp - this.minTemp);
    return yMin - ratio * (yMin - yMax);
  }

  _generateTicksHtml() {
    let html = '';
    for (let t = -20; t <= 65; t += 10) {
      const y = this._tempToY(t).toFixed(1);
      html += `
        <line x1="38" y1="${y}" x2="42" y2="${y}" stroke="#475569" stroke-width="1.5" />
        <text x="28" y="${(parseFloat(y) + 3).toFixed(1)}" text-anchor="end" class="temp-axis-text">${t}</text>
      `;
    }
    return html;
  }

  /**
   * 温度データを更新
   * @param {object} packet
   */
  update(packet) {
    if (!packet || !packet.isValid) return;

    this.currentTempC = packet.temperature;

    // 華氏計算: F = C * 1.8 + 32
    const tempF = this.currentTempC * 1.8 + 32;

    const sign = this.currentTempC >= 0 ? '+' : '';
    if (this.cText) {
      this.cText.textContent = `${sign}${this.currentTempC.toFixed(1)}`;
    }
    if (this.fText) {
      this.fText.textContent = `${tempF.toFixed(1)} ℉`;
    }

    // 液体バーの高さ更新
    const targetY = Math.max(25, Math.min(210, this._tempToY(this.currentTempC)));
    const bulbY = 225;
    const height = bulbY - targetY;

    if (this.liquidBar) {
      this.liquidBar.setAttribute('y', targetY.toFixed(1));
      this.liquidBar.setAttribute('height', height.toFixed(1));
    }
  }
}
