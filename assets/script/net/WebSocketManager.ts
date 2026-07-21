/**
 * WebSocket管理器
 * 负责与服务端的WebSocket通信
 * 支持字符串消息和二进制protobuf消息
 */

import { LogService } from '../utils/LogService';
import { NetworkOptimizer } from './NetworkOptimizer';
import { GameMessageHandler } from './GameMessageHandler';

export class WebSocketManager {
    private static _instance: WebSocketManager = null;
    private _ws: WebSocket = null;
    private _isConnected: boolean = false;
    private _reconnectAttempts: number = 0;
    private _maxReconnectAttempts: number = 5;
    private _reconnectDelay: number = 3000;
    private _heartbeatInterval: number = 10000; // 10秒，小于服务端的60秒超时
    private _heartbeatTimer: any = null;
    private _heartbeatResponseTimeout: number = 15000; // 心跳响应超时时间（15秒），避免服务端繁忙时误判断开
    private _heartbeatResponseTimer: any = null;
    private _lastHeartbeatSendTime: number = 0;
    private _heartbeatMonitorTimer: any = null; // 心跳监控定时器，确保心跳持续发送
    private _sequence: number = 0;
    private _url: string = '';
    private _userId: number = 0; // ✅ 新增：保存用户ID，用于心跳消息
    
    // 网络优化器
    private _optimizer: NetworkOptimizer = null;
    
    // 事件回调
    private _onConnected: () => void = null;
    private _onDisconnected: () => void = null;
    private _onError: (error: string) => void = null;
    private _onMessage: (data: any) => void = null;
    private _onHeartbeatTimeout: () => void = null;
    private _onReconnectFailed: () => void = null;
    
    // ✅ [新增] protobuf消息处理器
    private _messageHandler: GameMessageHandler = null;

    public static getInstance(): WebSocketManager {
        if (WebSocketManager._instance === null) {
            WebSocketManager._instance = new WebSocketManager();
        }
        return WebSocketManager._instance;
    }

    constructor() {
        this._optimizer = NetworkOptimizer.getInstance();
        this._messageHandler = new GameMessageHandler();
    }
    
    /**
     * 设置用户ID（用于心跳消息）
     */
    public setUserId(userId: number): void {
        this._userId = userId;
    }

    private _connectTimeoutTimer: any = null;
    private static readonly CONNECT_TIMEOUT_MS: number = 10000; // 10秒连接超时

    /**
     * 连接到WebSocket服务器
     * @param url WebSocket服务器地址
     */
    public connect(url: string): void {
        // 重置重连计数器（无论是否已连接，都重置计数器）
        this._reconnectAttempts = 0;
        
        if (this._isConnected) {
            return;
        }

        this._url = url;

        try {
            this._cancelConnectTimeout();
            
            this._connectTimeoutTimer = setTimeout(() => {
                if (!this._isConnected && this._ws) {
                    LogService.error('WebSocketManager', '❌ 连接超时，强制关闭连接');
                    this._ws.close();
                    this._ws = null;
                    
                    if (this._onError) {
                        this._onError('连接超时');
                    }
                    
                    this._attemptReconnect();
                }
            }, WebSocketManager.CONNECT_TIMEOUT_MS);
            
            this._ws = new WebSocket(url);

            this._ws.onopen = (event: Event) => {
                this._cancelConnectTimeout();
                this._isConnected = true;
                this._reconnectAttempts = 0;
                
                this._startHeartbeat();
                
                if (this._onConnected) {
                    this._onConnected();
                }
            };

            this._ws.onmessage = (event: MessageEvent) => {
                try {
                    if (!event.data) {
                        LogService.error('WebSocketManager', 'Invalid message data: null or undefined');
                        return;
                    }
                    
                    let parsedMessage: any = null;
                    let rawMessage: string = '';
                    
                    if (event.data instanceof ArrayBuffer) {
                        try {
                            parsedMessage = this._messageHandler.decodeMessage(event.data);
                        } catch (e) {
                            LogService.error('WebSocketManager', 'Failed to decode protobuf message:', e);
                            return;
                        }
                    } else if (typeof event.data === 'string') {
                        rawMessage = event.data.trim();
                        if (rawMessage === '') {
                            LogService.error('WebSocketManager', 'Empty message received');
                            return;
                        }
                        
                        try {
                            parsedMessage = JSON.parse(rawMessage);
                        } catch (parseError) {
                            LogService.error('WebSocketManager', 'Failed to parse JSON:', parseError);
                            LogService.error('WebSocketManager', 'Raw message:', rawMessage);
                            return;
                        }
                    } else {
                        LogService.error('WebSocketManager', 'Unsupported message type:', typeof event.data);
                        return;
                    }
                    
                    if (!parsedMessage || typeof parsedMessage !== 'object') {
                        LogService.error('WebSocketManager', 'Invalid message structure:', parsedMessage);
                        LogService.error('WebSocketManager', 'Raw message:', rawMessage || JSON.stringify(event.data));
                        return;
                    }
                    
                    const isHeartbeat = parsedMessage.cmd === 1 || parsedMessage.cmd === 2;
                    if (isHeartbeat) {
                        const serverTime = parsedMessage.body?.server_time;
                        this.handleHeartbeatResponse(serverTime);
                    }
                    
                    const sequence = parsedMessage.sequence !== undefined ? parsedMessage.sequence : parsedMessage.body?.sequence;
                    if (sequence !== undefined && sequence !== null && !isHeartbeat) {
                        this._optimizer.confirmMessage(sequence);
                    }
                    
                    if (typeof this._onMessage === 'function') {
                        try {
                            this._onMessage(parsedMessage);
                        } catch (callbackError) {
                            LogService.error('WebSocketManager', 'Error in message callback:', callbackError);
                            if (callbackError && typeof callbackError === 'object') {
                                LogService.error('WebSocketManager', 'Error stack:', callbackError.stack || 'No stack available');
                                LogService.error('WebSocketManager', 'Error message:', callbackError.message || 'No message');
                            }
                            LogService.error('WebSocketManager', 'Message that caused error:', JSON.stringify(parsedMessage));
                            LogService.error('WebSocketManager', 'Raw message that caused error:', rawMessage || 'N/A');
                        }
                    }
                } catch (error) {
                    LogService.error('WebSocketManager', 'WebSocket message processing error:', error);
                    if (error && typeof error === 'object') {
                        LogService.error('WebSocketManager', 'Error stack:', error.stack || 'No stack available');
                        LogService.error('WebSocketManager', 'Error message:', error.message || 'No message');
                    }
                }
            };

            this._ws.onclose = (event: CloseEvent) => {
                this._cancelConnectTimeout();
                this._isConnected = false;
                this._stopHeartbeat();
                
                if (this._onDisconnected) {
                    this._onDisconnected();
                }
                this._attemptReconnect();
            };

            this._ws.onerror = (event: Event) => {
                this._cancelConnectTimeout();
                LogService.error('WebSocketManager', 'WebSocket 错误:', event);
                if (this._onError) {
                    this._onError('WebSocket error');
                }
            };

        } catch (error) {
            this._cancelConnectTimeout();
            LogService.error('WebSocketManager', 'WebSocket connection error:', error);
            if (this._onError) {
                this._onError(error.toString());
            }
        }
    }

    private _cancelConnectTimeout(): void {
        if (this._connectTimeoutTimer != null) {
            clearTimeout(this._connectTimeoutTimer);
            this._connectTimeoutTimer = null;
        }
    }

    /**
     * 断开连接
     */
    public disconnect(): void {
        this._stopHeartbeat();
        
        if (this._ws) {
            try {
                if (this._ws.readyState === WebSocket.OPEN) {
                    this._ws.close();
                }
            } catch (e) {
                LogService.error('WebSocketManager', 'Error closing WebSocket:', e);
            }
            this._ws = null;
        }
        
        this._isConnected = false;
    }

    /**
     * 发送消息
     * @param cmd 命令类型
     * @param body 消息体
     */
    public sendMessage(cmd: number, body: any): void {
        const isHeartbeat = cmd === 1; // CommandType.HEARTBEAT = 1
        const isBroadcast = this._optimizer.isBroadcastMessage(cmd);
        
        if (!this._isConnected || !this._ws) {
            return;
        }

        if (this._ws.readyState !== WebSocket.OPEN) {
            return;
        }

        try {
            const sequence = this._optimizer.getNextSequence();
            const messageObj = {
                cmd: cmd,
                sequence: sequence,
                timestamp: Date.now(),
                sign: '',
                body: body
            };
            
            // 消息统计
            const jsonStr = JSON.stringify(messageObj);
            this._optimizer.updateStats('sent', jsonStr.length);
            
            // 只有请求-响应类型的消息才加入待确认队列
            // 心跳消息和广播消息不需要等待确认
            if (!isHeartbeat && !isBroadcast) {
                this._optimizer.addPendingMessage(sequence, messageObj);
            }
            
            // 暂时禁用压缩：服务端不支持压缩消息格式
            this._ws.send(jsonStr);
            
            // 非心跳消息打印日志
            if (!isHeartbeat) {
            }
        } catch (error) {
            LogService.error('WebSocketManager', '发送消息失败:', error);
        }
    }

    /**
     * 设置连接成功回调
     */
    public setOnConnected(callback: () => void): void {
        this._onConnected = callback;
    }

    /**
     * 设置断开连接回调
     */
    public setOnDisconnected(callback: () => void): void {
        this._onDisconnected = callback;
    }

    /**
     * 设置错误回调
     */
    public setOnError(callback: (error: string) => void): void {
        this._onError = callback;
    }

    /**
     * 设置消息回调
     */
    public setOnMessage(callback: (data: any) => void): void {
        this._onMessage = callback;
    }

    /**
     * ✅ [新增] 获取当前消息回调
     */
    public getOnMessage(): (data: any) => void {
        return this._onMessage;
    }

    /**
     * 是否已连接
     */
    public isConnected(): boolean {
        return this._isConnected;
    }



    private _startHeartbeat(): void {
        this._stopHeartbeat();
        this._sendHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            this._sendHeartbeat();
        }, this._heartbeatInterval);
        LogService.info('WebSocketManager', '💓 心跳已启动，间隔=' + this._heartbeatInterval + 'ms');
        this._startHeartbeatMonitor();
    }
    
    /**
     * ✅ [新增] 启动心跳监控
     * 定期检查心跳是否正常运行，防止因场景切换或其他原因导致心跳停止
     */
    private _startHeartbeatMonitor(): void {
        if (this._heartbeatMonitorTimer != null) {
            clearInterval(this._heartbeatMonitorTimer);
        }
        
        this._heartbeatMonitorTimer = setInterval(() => {
            if (this._isConnected && this._heartbeatTimer == null) {
                LogService.warn('WebSocketManager', '⚠️ 检测到心跳已停止，自动重启心跳');
                this._startHeartbeat();
            }
            
            if (this._isConnected && this._lastHeartbeatSendTime > 0) {
                const elapsed = Date.now() - this._lastHeartbeatSendTime;
                if (elapsed > this._heartbeatInterval * 2) {
                    LogService.warn('WebSocketManager', '⚠️ 心跳发送间隔异常，已超过预期时间: ' + elapsed + 'ms');
                }
            }
        }, this._heartbeatInterval / 2);
    }
    
    private _stopHeartbeatMonitor(): void {
        if (this._heartbeatMonitorTimer != null) {
            clearInterval(this._heartbeatMonitorTimer);
            this._heartbeatMonitorTimer = null;
        }
    }
    
    /**
     * ✅ [新增] 公共方法：重启心跳（用于场景切换后恢复心跳）
     * 确保在任何场景下心跳都能持续发送
     */
    public restartHeartbeat(): void {
        if (this._isConnected) {
            this._startHeartbeat();
            LogService.debug('WebSocketManager', '💓 心跳已重启');
        } else {
            LogService.warn('WebSocketManager', '⚠️ 无法重启心跳：连接未建立');
        }
    }
    
    /**
     * ✅ [新增] 检查心跳是否正在运行
     */
    public isHeartbeatRunning(): boolean {
        return this._heartbeatTimer != null;
    }

    private _stopHeartbeat(): void {
        if (this._heartbeatTimer != null) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
        if (this._heartbeatResponseTimer != null) {
            clearTimeout(this._heartbeatResponseTimer);
            this._heartbeatResponseTimer = null;
        }
        this._stopHeartbeatMonitor();
    }
    
    private _startHeartbeatResponseTimer(): void {
        if (this._heartbeatResponseTimer != null) {
            clearTimeout(this._heartbeatResponseTimer);
        }
        
        this._heartbeatResponseTimer = setTimeout(() => {
            LogService.error('WebSocketManager', '❌ 心跳响应超时，连接可能已断开');
            this._optimizer.recordReconnect();
            
            // 触发心跳超时回调
            if (this._onHeartbeatTimeout) {
                this._onHeartbeatTimeout();
            }
            
            // 尝试重连
            this._isConnected = false;
            this._stopHeartbeat();
            if (this._ws) {
                try {
                    this._ws.close();
                } catch (e) {
                    LogService.error('WebSocketManager', '关闭超时连接失败:', e);
                }
            }
            this._attemptReconnect();
        }, this._heartbeatResponseTimeout);
    }
    
    private _stopHeartbeatResponseTimer(): void {
        if (this._heartbeatResponseTimer != null) {
            clearTimeout(this._heartbeatResponseTimer);
            this._heartbeatResponseTimer = null;
        }
    }

    private _sendHeartbeat(): void {
        if (this._isConnected) {
            this._lastHeartbeatSendTime = Date.now();
            const heartbeat = {
                client_time: this._lastHeartbeatSendTime,
                userId: this._userId
            };
            
            this.sendMessage(1, heartbeat); // CommandType.HEARTBEAT = 1
            
            LogService.debug('WebSocketManager', `💓 发送心跳: userId=${this._userId}, time=${this._lastHeartbeatSendTime}`);
            
            this._startHeartbeatResponseTimer();
        }
    }
    
    /**
     * 处理心跳响应（当收到心跳响应时调用）
     */
    public handleHeartbeatResponse(serverTime: number): void {
        this._stopHeartbeatResponseTimer();
        
        if (this._lastHeartbeatSendTime > 0) {
            const rtt = Date.now() - this._lastHeartbeatSendTime;
            this._optimizer.updateHeartbeatRtt(rtt);
            LogService.debug('WebSocketManager', `💓 收到心跳响应, serverTime=${serverTime}, RTT=${rtt}ms`);
        }
    }

    private static readonly RECONNECT_BASE_DELAY_MS: number = 1000; // 初始重连延迟
    private static readonly RECONNECT_MAX_DELAY_MS: number = 30000; // 最大重连延迟

    private _attemptReconnect(): void {
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            LogService.error('WebSocketManager', '已达到最大重连次数');
            if (this._onReconnectFailed) {
                this._onReconnectFailed();
            }
            return;
        }

        this._reconnectAttempts++;
        this._optimizer.recordReconnect();

        const delay = Math.min(
            WebSocketManager.RECONNECT_BASE_DELAY_MS * Math.pow(2, this._reconnectAttempts - 1),
            WebSocketManager.RECONNECT_MAX_DELAY_MS
        );

        LogService.info('WebSocketManager', `🔄 第${this._reconnectAttempts}次重连，延迟${delay}ms`);

        setTimeout(() => {
            this.connect(this._url);
        }, delay);
    }
    
    /**
     * 设置心跳超时回调
     */
    public setOnHeartbeatTimeout(callback: () => void): void {
        this._onHeartbeatTimeout = callback;
    }
    
    /**
     * 设置重连失败回调（达到最大重连次数时触发）
     */
    public setOnReconnectFailed(callback: () => void): void {
        this._onReconnectFailed = callback;
    }
    
    /**
     * 获取网络统计信息
     */
    public getNetworkStats(): any {
        return this._optimizer.getStats();
    }
    
    /**
     * 重置网络统计
     */
    public resetNetworkStats(): void {
        this._optimizer.resetStats();
    }
}
