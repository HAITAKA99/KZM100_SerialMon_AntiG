/**
 * serial-manager.js
 * Web Serial API の接続・データ受信管理、およびデモモード（シミュレータ）
 */

import { parsePacket } from './packet-parser.js';

export class SerialManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.isConnected = false;
    this.isDemoMode = false;
    this.demoTimer = null;

    // コールバック
    this.onPacketReceived = null;
    this.onStatusChange = null;
    this.onError = null;

    // デモ用内部状態
    this.demoState = {
      speed: 4.5,
      direction: 45,
      temperature: 22.5,
      errorCountDown: 0,
      isSimulatingError: false
    };
  }

  /**
   * ブラウザがWeb Serial APIをサポートしているか
   * @returns {boolean}
   */
  static isSupported() {
    return 'serial' in navigator;
  }

  /**
   * シリアルポートを選択して接続する
   */
  async connect() {
    if (this.isDemoMode) {
      this.stopDemo();
    }

    if (!SerialManager.isSupported()) {
      throw new Error('お使いのブラウザはWeb Serial APIに対応していません。Google ChromeまたはMicrosoft Edgeをご利用ください。');
    }

    try {
      this._updateStatus('requesting');
      // ユーザーにシリアルポートを選択させる
      this.port = await navigator.serial.requestPort();

      // ボーレート 9600bps でポートを開く
      await this.port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 255
      });

      this.isConnected = true;
      this._updateStatus('connected');

      // 受信ループ開始
      this._readLoop();
    } catch (err) {
      this.isConnected = false;
      this.port = null;
      this._updateStatus('disconnected');
      if (err.name !== 'NotFoundError') { // ユーザーキャンセル以外のエラー
        if (this.onError) this.onError(err);
      }
      throw err;
    }
  }

  /**
   * シリアル接続を切断する
   */
  async disconnect() {
    if (this.isDemoMode) {
      this.stopDemo();
      return;
    }

    if (!this.isConnected && !this.port) return;

    this.isConnected = false;

    try {
      if (this.reader) {
        await this.reader.cancel();
      }
      if (this.readableStreamClosed) {
        await this.readableStreamClosed.catch(() => {});
      }
      if (this.port) {
        await this.port.close();
      }
    } catch (err) {
      console.warn('Disconnect error:', err);
    } finally {
      this.reader = null;
      this.readableStreamClosed = null;
      this.port = null;
      this._updateStatus('disconnected');
    }
  }

  /**
   * シリアルポートからの読み取りループ
   * @private
   */
  async _readLoop() {
    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    let buffer = '';

    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          buffer += value;
          const lines = buffer.split(/\r?\n/);
          // 最後の未完成の行を残す
          buffer = lines.pop();

          for (const line of lines) {
            if (line.trim()) {
              this._handleRawLine(line);
            }
          }
        }
      }
    } catch (err) {
      if (this.isConnected) {
        console.error('Serial read error:', err);
        if (this.onError) this.onError(err);
      }
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
      }
      this.disconnect();
    }
  }

  /**
   * 1行の受信文字列を処理
   * @private
   */
  _handleRawLine(line) {
    const packet = parsePacket(line);
    if (packet && this.onPacketReceived) {
      this.onPacketReceived(packet);
    }
  }

  /**
   * デモモード（シミュレータ）の開始
   */
  startDemo() {
    if (this.isConnected) {
      this.disconnect();
    }
    this.isDemoMode = true;
    this._updateStatus('demo');

    // 1秒間隔でパケットを生成
    this.demoTimer = setInterval(() => {
      this._generateDemoPacket();
    }, 1000);
    // 即時1回目を発行
    this._generateDemoPacket();
  }

  /**
   * デモモードの停止
   */
  stopDemo() {
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
    this.isDemoMode = false;
    this._updateStatus('disconnected');
  }

  /**
   * エラーパケット（99.9m/s）を強制的に注入する（テスト用）
   */
  injectDemoError(durationSeconds = 3) {
    this.demoState.isSimulatingError = true;
    this.demoState.errorCountDown = durationSeconds;
  }

  /**
   * デモパケットの生成
   * フォーマット: 00.0[m/s],000,+00.0
   * @private
   */
  _generateDemoPacket() {
    const s = this.demoState;

    let speedStr;
    let dirStr;
    let tempStr;

    if (s.isSimulatingError && s.errorCountDown > 0) {
      s.errorCountDown--;
      if (s.errorCountDown <= 0) s.isSimulatingError = false;
      speedStr = '99.9'; // エラー値固定
    } else {
      // たまに低確率(1/60)でランダムに1秒だけエラーを発生させる
      if (Math.random() < 0.015) {
        speedStr = '99.9';
      } else {
        // 風速のランダムウォーク: 0.5〜18.0 m/s 程度
        const deltaSpeed = (Math.random() - 0.48) * 0.8;
        s.speed = Math.max(0.2, Math.min(28.0, s.speed + deltaSpeed));
        speedStr = s.speed.toFixed(1).padStart(4, '0');
      }
    }

    // 風向のランダムウォーク: 0〜359度
    const deltaDir = (Math.random() - 0.5) * 12;
    s.direction = (s.direction + deltaDir + 360) % 360;
    dirStr = Math.round(s.direction).toString().padStart(3, '0');

    // 気温のゆるやかな変動: 18.0〜28.0℃
    const deltaTemp = (Math.random() - 0.5) * 0.1;
    s.temperature = Math.max(10.0, Math.min(35.0, s.temperature + deltaTemp));
    const sign = s.temperature >= 0 ? '+' : '-';
    tempStr = sign + Math.abs(s.temperature).toFixed(1).padStart(4, '0');

    const line = `${speedStr}[m/s],${dirStr},${tempStr}`;
    this._handleRawLine(line);
  }

  /**
   * 状態変化を通知
   * @private
   */
  _updateStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status, {
        isConnected: this.isConnected,
        isDemoMode: this.isDemoMode
      });
    }
  }
}
