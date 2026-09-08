/**
 * time-series-chart.js
 * 600点固定描画のリアルタイム時系列グラフ（HTML5 Canvas実装）
 *
 * 仕様:
 * - 時間軸同期の3段トラック表示:
 *   - 上段: 風速 [m/s] (ラインチャート)
 *   - 中段: 風向 [deg] (点プロット / 散布図)
 *   - 下段: 気温 [℃] (ラインチャート)
 * - 600点固定配列（データ未達の左側は null で空白描画）
 * - 右端（index 599）が最新の1秒データ
 * - 時間スケール切替: 10分, 1時間, 6時間, 24時間, 7日間
 * - 風速スケール切替: 5, 10, 20, 30 m/s
 * - 気温スケール切替: -10〜+50℃ (default), -20〜+65℃ (max)
 */

import { TIME_SCALES, PLOT_COUNT } from '../data/aggregator.js';

export class TimeSeriesChart {
  /**
   * @param {HTMLElement} containerElement
   * @param {object} options
   */
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.timeScale = '10m';
    this.speedScale = 10; // 5, 10, 20, 30
    this.tempScale = 'default'; // 'default' (-10〜+50), 'max' (-20〜+65)

    this.onSpeedScaleChange = options.onSpeedScaleChange || null;
    this.onTempScaleChange = options.onTempScaleChange || null;
    this.onTimeScaleChange = options.onTimeScaleChange || null;

    this.plotData = new Array(PLOT_COUNT).fill(null);

    this.render();
    this._setupCanvas();
    this._bindEvents();

    window.addEventListener('resize', () => {
      this._resizeCanvas();
      this.draw();
    });

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this._resizeCanvas();
        this.draw();
      });
      this.resizeObserver.observe(this.wrapper);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="chart-panel">
        <div class="chart-controls-bar">
          <div class="control-group">
            <span class="control-label">時間スケール:</span>
            <div class="btn-group" id="time-scale-group">
              <button type="button" class="btn-scale active" data-scale="10m">10分間</button>
              <button type="button" class="btn-scale" data-scale="1h">1時間</button>
              <button type="button" class="btn-scale" data-scale="6h">6時間</button>
              <button type="button" class="btn-scale" data-scale="24h">24時間</button>
              <button type="button" class="btn-scale" data-scale="7d">7日間</button>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">風速スケール:</span>
            <div class="btn-group" id="speed-scale-group">
              <button type="button" class="btn-scale" data-speed="5">5 m/s</button>
              <button type="button" class="btn-scale active" data-speed="10">10 m/s</button>
              <button type="button" class="btn-scale" data-speed="20">20 m/s</button>
              <button type="button" class="btn-scale" data-speed="30">30 m/s</button>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">気温スケール:</span>
            <div class="btn-group" id="temp-scale-group">
              <button type="button" class="btn-scale active" data-temp="default">-10〜+50℃</button>
              <button type="button" class="btn-scale" data-temp="max">-20〜+65℃</button>
            </div>
          </div>
        </div>

        <div class="chart-canvas-wrapper" id="chart-canvas-wrapper">
          <canvas id="time-series-canvas"></canvas>
        </div>
      </div>
    `;

    this.canvas = this.container.querySelector('#time-series-canvas');
    this.wrapper = this.container.querySelector('#chart-canvas-wrapper');
    this.ctx = this.canvas.getContext('2d');
  }

  _setupCanvas() {
    this._resizeCanvas();
    this.draw();
  }

  _resizeCanvas() {
    const rect = this.wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(300, Math.floor(rect.width));
    const height = Math.max(160, Math.floor(rect.height || 360));

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.width = width;
    this.height = height;
  }

  _bindEvents() {
    // 時間スケールボタン
    const timeBtns = this.container.querySelectorAll('#time-scale-group .btn-scale');
    timeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        timeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.timeScale = btn.getAttribute('data-scale');
        if (this.onTimeScaleChange) {
          this.onTimeScaleChange(this.timeScale);
        }
        this.draw();
      });
    });

    // 風速スケールボタン
    const speedBtns = this.container.querySelectorAll('#speed-scale-group .btn-scale');
    speedBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        speedBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.speedScale = parseInt(btn.getAttribute('data-speed'), 10);
        if (this.onSpeedScaleChange) {
          this.onSpeedScaleChange(this.speedScale);
        }
        this.draw();
      });
    });

    // 気温スケールボタン
    const tempBtns = this.container.querySelectorAll('#temp-scale-group .btn-scale');
    tempBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tempBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.tempScale = btn.getAttribute('data-temp');
        if (this.onTempScaleChange) {
          this.onTempScaleChange(this.tempScale);
        }
        this.draw();
      });
    });
  }

  /**
   * データを設定して再描画
   * @param {Array<object|null>} plotData - 600点の配列
   */
  updateData(plotData) {
    if (plotData && plotData.length === PLOT_COUNT) {
      this.plotData = plotData;
      this.draw();
    }
  }

  /**
   * チャート全体の描画
   */
  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // レイアウト計算
    const marginLeft = 60;
    const marginRight = 25;
    const marginTop = 20;
    const marginBottom = 35;
    const plotWidth = w - marginLeft - marginRight;
    const plotTotalHeight = h - marginTop - marginBottom;

    // 3段分割（各段の高さと隙間）
    const gap = 15;
    const trackHeight = (plotTotalHeight - gap * 2) / 3;

    // トラック座標
    const tSpeed = {
      name: '風速 [m/s]',
      top: marginTop,
      height: trackHeight,
      bottom: marginTop + trackHeight,
      yMin: 0,
      yMax: this.speedScale,
      color: '#00f0ff',
      fillColor: 'rgba(0, 240, 255, 0.08)'
    };

    const tDir = {
      name: '風向 [deg]',
      top: marginTop + trackHeight + gap,
      height: trackHeight,
      bottom: marginTop + trackHeight * 2 + gap,
      yMin: 0,
      yMax: 359,
      color: '#eab308'
    };

    let tempMin = this.tempScale === 'max' ? -20 : -10;
    let tempMax = this.tempScale === 'max' ? 65 : 50;

    const tTemp = {
      name: '気温 [℃]',
      top: marginTop + (trackHeight + gap) * 2,
      height: trackHeight,
      bottom: marginTop + (trackHeight + gap) * 2 + trackHeight,
      yMin: tempMin,
      yMax: tempMax,
      color: '#f43f5e',
      fillColor: 'rgba(244, 63, 94, 0.08)'
    };

    // 背景グリッドと各トラック枠の描画
    [tSpeed, tDir, tTemp].forEach((track) => {
      this._drawTrackBackground(ctx, track, marginLeft, plotWidth);
    });

    // データプロット
    this._drawSpeedTrack(ctx, tSpeed, marginLeft, plotWidth);
    this._drawDirectionTrack(ctx, tDir, marginLeft, plotWidth);
    this._drawTemperatureTrack(ctx, tTemp, marginLeft, plotWidth);

    // 横軸（時間軸ラベル・境界線）の描画
    this._drawTimeAxis(ctx, marginLeft, plotWidth, tTemp.bottom, marginTop);
  }

  _drawTrackBackground(ctx, track, marginLeft, plotWidth) {
    // 背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.fillRect(marginLeft, track.top, plotWidth, track.height);

    // 外枠
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(marginLeft, track.top, plotWidth, track.height);

    // トラック名ラベル
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = track.color;
    ctx.textAlign = 'left';
    ctx.fillText(track.name, marginLeft + 8, track.top + 14);

    // Y軸目盛り線 & ラベル（3〜5本）
    const steps = 4;
    ctx.textAlign = 'right';
    ctx.font = '10px monospace';

    for (let i = 0; i <= steps; i++) {
      const val = track.yMin + (track.yMax - track.yMin) * (i / steps);
      const y = track.bottom - track.height * (i / steps);

      // グリッド線
      ctx.strokeStyle = i === 0 || i === steps ? '#334155' : 'rgba(51, 65, 85, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(marginLeft + plotWidth, y);
      ctx.stroke();

      // 目盛り数値
      ctx.fillStyle = '#94a3b8';
      let valLabel = val.toFixed(0);
      if (track.name.includes('気温') && val > 0) valLabel = `+${valLabel}`;
      ctx.fillText(valLabel, marginLeft - 6, y + 3);
    }
  }

  /**
   * X座標の計算（index 0〜599）
   */
  _getX(index, marginLeft, plotWidth) {
    return marginLeft + (index / (PLOT_COUNT - 1)) * plotWidth;
  }

  /**
   * Y座標の計算
   */
  _getY(val, track) {
    const ratio = (val - track.yMin) / (track.yMax - track.yMin);
    return track.bottom - ratio * track.height;
  }

  /**
   * 風速トラックの描画（なめらかなライン）
   */
  _drawSpeedTrack(ctx, track, marginLeft, plotWidth) {
    const points = [];

    for (let i = 0; i < PLOT_COUNT; i++) {
      const p = this.plotData[i];
      if (p && p.speed !== null && !p.isError) {
        points.push({
          x: this._getX(i, marginLeft, plotWidth),
          y: Math.max(track.top, Math.min(track.bottom, this._getY(p.speed, track)))
        });
      } else {
        if (points.length > 0) {
          this._renderLine(ctx, points, track.color, track.fillColor, track.bottom);
          points.length = 0;
        }
      }
    }

    if (points.length > 0) {
      this._renderLine(ctx, points, track.color, track.fillColor, track.bottom);
    }

    // 最新値ハイライト（右端）
    const latest = this.plotData[PLOT_COUNT - 1];
    if (latest && latest.speed !== null) {
      const lx = this._getX(PLOT_COUNT - 1, marginLeft, plotWidth);
      if (latest.isError) {
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('ERR (99.9)', lx - 6, track.top + 14);
      } else {
        const ly = this._getY(latest.speed, track);
        ctx.fillStyle = track.color;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${latest.speed.toFixed(1)} m/s`, lx - 6, track.top + 14);
      }
    }
  }

  /**
   * 風向トラックの描画（点プロット / 散布図、ラインで繋がない）
   */
  _drawDirectionTrack(ctx, track, marginLeft, plotWidth) {
    ctx.fillStyle = track.color;

    for (let i = 0; i < PLOT_COUNT; i++) {
      const p = this.plotData[i];
      if (p && p.direction !== null && !p.isError) {
        const x = this._getX(i, marginLeft, plotWidth);
        const y = Math.max(track.top, Math.min(track.bottom, this._getY(p.direction, track)));
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 最新値ハイライト
    const latest = this.plotData[PLOT_COUNT - 1];
    if (latest && latest.direction !== null && !latest.isError) {
      const lx = this._getX(PLOT_COUNT - 1, marginLeft, plotWidth);
      const ly = this._getY(latest.direction, track);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = track.color;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${String(latest.direction).padStart(3, '0')}°`, lx - 6, track.top + 14);
    }
  }

  /**
   * 気温トラックの描画（なめらかなライン）
   */
  _drawTemperatureTrack(ctx, track, marginLeft, plotWidth) {
    const points = [];

    for (let i = 0; i < PLOT_COUNT; i++) {
      const p = this.plotData[i];
      if (p && p.temperature !== null) {
        points.push({
          x: this._getX(i, marginLeft, plotWidth),
          y: Math.max(track.top, Math.min(track.bottom, this._getY(p.temperature, track)))
        });
      } else {
        if (points.length > 0) {
          this._renderLine(ctx, points, track.color, track.fillColor, track.bottom);
          points.length = 0;
        }
      }
    }

    if (points.length > 0) {
      this._renderLine(ctx, points, track.color, track.fillColor, track.bottom);
    }

    // 最新値ハイライト
    const latest = this.plotData[PLOT_COUNT - 1];
    if (latest && latest.temperature !== null) {
      const lx = this._getX(PLOT_COUNT - 1, marginLeft, plotWidth);
      const ly = this._getY(latest.temperature, track);
      ctx.fillStyle = track.color;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      const sign = latest.temperature >= 0 ? '+' : '';
      ctx.fillText(`${sign}${latest.temperature.toFixed(1)} ℃`, lx - 6, track.top + 14);
    }
  }

  /**
   * ラインと塗りつぶしを描画
   */
  _renderLine(ctx, points, strokeColor, fillColor, bottomY) {
    if (points.length < 2) {
      if (points.length === 1) {
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // 塗りつぶしグラデーション
    if (fillColor) {
      ctx.lineTo(points[points.length - 1].x, bottomY);
      ctx.lineTo(points[0].x, bottomY);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 時間軸（横軸）ラベルの描画
   */
  _drawTimeAxis(ctx, marginLeft, plotWidth, axisY, topY) {
    const scaleInfo = TIME_SCALES[this.timeScale] || TIME_SCALES['10m'];
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';

    // 左端（過去時刻ラベル）
    ctx.textAlign = 'left';
    ctx.fillText(`-${scaleInfo.label}前`, marginLeft, axisY + 18);

    // 中央目盛り（中間時間）
    ctx.textAlign = 'center';
    ctx.fillText(`-${this._getMidLabel(scaleInfo.durationSec)}前`, marginLeft + plotWidth / 2, axisY + 18);

    // 右端（現在時刻）
    ctx.textAlign = 'right';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('現在', marginLeft + plotWidth, axisY + 18);

    // 時間の垂直ガイドライン
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(marginLeft + plotWidth / 2, topY);
    ctx.lineTo(marginLeft + plotWidth / 2, axisY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _getMidLabel(sec) {
    const midSec = sec / 2;
    if (midSec < 60) return `${midSec}秒`;
    if (midSec < 3600) return `${Math.round(midSec / 60)}分`;
    if (midSec < 86400) return `${(midSec / 3600).toFixed(1)}時間`;
    return `${(midSec / 86400).toFixed(1)}日`;
  }
}
