/**
 * aggregator.js
 * 時間軸グラフ用のデータ集約・ダウンサンプリングエンジン
 *
 * グラフ仕様:
 * - プロット点数は 600点 固定
 * - スケール:
 *   - 10m: 10分 (600秒) -> 1秒間隔 (Δt = 1)
 *   - 1h:  1時間 (3600秒) -> 6秒間隔 (Δt = 6)
 *   - 6h:  6時間 (21600秒) -> 36秒間隔 (Δt = 36)
 *   - 24h: 24時間 (86400秒) -> 144秒間隔 (Δt = 144)
 *   - 7d:  7日間 (604800秒) -> 1008秒間隔 (Δt = 1008)
 * - 600点に満たない左側の未到達部分は null
 * - 右端（インデックス599）は常に1秒ごとの最新データ
 * - Δt秒ごとにスクロールし、直近Δt秒間の平均値がインデックス598へ確定される
 * - 平均化ルール:
 *   - 風速・気温: 算術平均（計測エラー時は風速・風向を除外）
 *   - 風向: ベクトル平均（atan2(sum(sin), sum(cos))）
 */

export const TIME_SCALES = {
  '10m': { label: '10分間', durationSec: 600, intervalSec: 1 },
  '1h':  { label: '1時間',  durationSec: 3600, intervalSec: 6 },
  '6h':  { label: '6時間',  durationSec: 21600, intervalSec: 36 },
  '24h': { label: '24時間', durationSec: 86400, intervalSec: 144 },
  '7d':  { label: '7日間',  durationSec: 604800, intervalSec: 1008 }
};

export const PLOT_COUNT = 600;

/**
 * 角度配列のベクトル平均を計算する
 * @param {number[]} angles - 有効な角度(0-359)の配列
 * @returns {number|null} 0〜359の平均角度。データが空の場合はnull
 */
export function calculateVectorMeanDirection(angles) {
  if (!angles || angles.length === 0) return null;

  let sumSin = 0;
  let sumCos = 0;

  for (const deg of angles) {
    const rad = (deg * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  }

  // ベクトルの長さがほぼ0の場合は直前の値またはnull
  if (Math.abs(sumSin) < 1e-7 && Math.abs(sumCos) < 1e-7) {
    return angles[0];
  }

  let meanRad = Math.atan2(sumSin, sumCos);
  let meanDeg = (meanRad * 180) / Math.PI;
  if (meanDeg < 0) meanDeg += 360;

  return Math.round(meanDeg) % 360;
}

/**
 * パケットの配列から平均プロット点({ speed, direction, temperature, isError, timestamp })を計算
 * @param {Array} packets
 * @returns {object|null}
 */
export function calculateAveragePoint(packets) {
  if (!packets || packets.length === 0) return null;

  const validSpeeds = [];
  const validDirs = [];
  const temps = [];

  let lastTimestamp = packets[packets.length - 1].timestamp;

  for (const p of packets) {
    if (!p.isValid) continue;

    temps.push(p.temperature);

    if (!p.isError) {
      validSpeeds.push(p.speed);
      validDirs.push(p.direction);
    }
  }

  if (temps.length === 0) return null;

  // 気温の算術平均
  const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;

  // 風速の算術平均（全件エラーの場合は null または 99.9）
  let avgSpeed = null;
  let avgDir = null;
  let isError = false;

  if (validSpeeds.length > 0) {
    avgSpeed = validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length;
    avgDir = calculateVectorMeanDirection(validDirs);
  } else {
    isError = true;
    avgSpeed = 99.9;
    avgDir = null;
  }

  return {
    timestamp: lastTimestamp,
    speed: avgSpeed !== null ? parseFloat(avgSpeed.toFixed(1)) : null,
    direction: avgDir,
    temperature: parseFloat(avgTemp.toFixed(1)),
    isError
  };
}

export class ChartAggregator {
  constructor(timeScaleKey = '10m') {
    this.timeScaleKey = timeScaleKey;
    this.config = TIME_SCALES[timeScaleKey] || TIME_SCALES['10m'];

    // 確定済みプロット配列 (最大599点)
    // 左端が古いデータ、右側が最新確定データ
    this.committedPoints = [];

    // 現在のインターバル期間内に受信した一時パケット群
    this.currentIntervalPackets = [];

    // 最新の未平均化リアルタイム生パケット（右端用）
    this.latestPacket = null;
  }

  /**
   * 時間スケールを変更
   * @param {string} newScaleKey ('10m', '1h', '6h', '24h', '7d')
   * @param {Array} historyPackets - スケール再構築用の過去全パケット配列（あれば）
   */
  setScale(newScaleKey, historyPackets = []) {
    if (!TIME_SCALES[newScaleKey]) return;
    this.timeScaleKey = newScaleKey;
    this.config = TIME_SCALES[newScaleKey];

    // 過去履歴パケットから再構築
    this.rebuildFromHistory(historyPackets);
  }

  /**
   * 1秒ごとに新しいパケットを追加
   * @param {object} packet - parsePacket の結果
   */
  addPacket(packet) {
    if (!packet || !packet.isValid) return;

    this.latestPacket = packet;
    this.currentIntervalPackets.push(packet);

    // インターバル秒数（Δt）に達したら平均を計算して確定点とする
    if (this.currentIntervalPackets.length >= this.config.intervalSec) {
      const avgPoint = calculateAveragePoint(this.currentIntervalPackets);
      if (avgPoint) {
        this.committedPoints.push(avgPoint);
        // 確定点は最大 599点 (インデックス 0〜598) に保つ
        if (this.committedPoints.length >= PLOT_COUNT) {
          this.committedPoints.shift();
        }
      }
      this.currentIntervalPackets = [];
    }
  }

  /**
   * グラフ描画用の 600点 固定配列を取得する
   * - インデックス 0〜598: 過去の確定平均データ（足りない左側は null）
   * - インデックス 599: 最新の1秒生パケット
   * @returns {Array<object|null>} 長さ600の配列
   */
  getPlotData() {
    const result = new Array(PLOT_COUNT).fill(null);

    // 最新パケット（右端 インデックス 599）
    if (this.latestPacket) {
      result[PLOT_COUNT - 1] = {
        timestamp: this.latestPacket.timestamp,
        speed: this.latestPacket.speed,
        direction: this.latestPacket.direction,
        temperature: this.latestPacket.temperature,
        isError: this.latestPacket.isError
      };
    }

    // 確定済みポイントをインデックス 598 から左へ逆順に埋める
    const count = Math.min(this.committedPoints.length, PLOT_COUNT - 1);
    for (let i = 0; i < count; i++) {
      const pointIndex = PLOT_COUNT - 2 - i;
      const dataIndex = this.committedPoints.length - 1 - i;
      result[pointIndex] = this.committedPoints[dataIndex];
    }

    return result;
  }

  /**
   * 過去ログから確定ポイントを再集計・再構築する（スケール変更時など）
   * @param {Array} packets - 時系列順の生パケット配列
   */
  rebuildFromHistory(packets) {
    this.committedPoints = [];
    this.currentIntervalPackets = [];
    this.latestPacket = null;

    if (!packets || packets.length === 0) return;

    const intervalSec = this.config.intervalSec;

    if (intervalSec === 1) {
      // 10分スケール: 直近600秒のパケットをそのまま確定点にする
      const startIdx = Math.max(0, packets.length - (PLOT_COUNT - 1));
      for (let i = startIdx; i < packets.length - 1; i++) {
        const p = packets[i];
        if (p.isValid) {
          this.committedPoints.push({
            timestamp: p.timestamp,
            speed: p.speed,
            direction: p.direction,
            temperature: p.temperature,
            isError: p.isError
          });
        }
      }
      this.latestPacket = packets[packets.length - 1];
      return;
    }

    // Δt > 1 の場合: パケットを Δt 秒ごとにチャンク分けして平均計算
    let chunk = [];
    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      if (!p.isValid) continue;

      chunk.push(p);
      if (chunk.length >= intervalSec) {
        const avg = calculateAveragePoint(chunk);
        if (avg) {
          this.committedPoints.push(avg);
          if (this.committedPoints.length >= PLOT_COUNT) {
            this.committedPoints.shift();
          }
        }
        chunk = [];
      }
    }

    this.currentIntervalPackets = chunk;
    this.latestPacket = packets[packets.length - 1];
  }
}
