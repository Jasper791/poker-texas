import { LogService } from '../utils/LogService';
/**
 * 网络性能优化工具
 * 包含消息压缩、重连优化等功能
 */

export class NetworkOptimizer {
    private static _instance: NetworkOptimizer = null;
    
    // 消息压缩配置
    private _compressionEnabled: boolean = true;
    private _minSizeForCompression: number = 100; // 小于此大小的消息不压缩
    
    // 消息队列（用于批量发送）
    private _messageQueue: any[] = [];
    private _batchSendInterval: number = 50; // 批量发送间隔(ms)
    private _batchSendTimer: any = null;
    private _maxBatchSize: number = 10; // 单次批量最大消息数
    
    // 重连状态管理
    private _lastGameState: any = null;
    private _pendingMessages: Map<number, any> = new Map();
    private _messageTimeout: number = 8000; // 消息超时时间(ms)，缩短为8秒
    private _maxRetries: number = 3; // 最大重试次数
    private _nextSequence: number = 0; // 下一个消息序列号
    
    // 广播消息白名单 - 这些消息是服务端主动推送的，不需要客户端确认
    private _broadcastCmds: Set<number> = new Set([
        201,  // PLAYER_READY
        204,  // GAME_SETTLEMENT
        205,  // PLAYER_JOIN
        206,  // PLAYER_EXIT
        207,  // PLAYER_DISCONNECTED
        208,  // DEAL_BUTTON_SHOW_NOTIFY
        209,  // GAME_START_NOTIFY
        211,  // DEAL_CARDS_NOTIFY
        212,  // DEAL_COMPLETE
        215,  // NOTIFY_PLAYER_TURN
        216,  // PLAYER_ACTION_RESPONSE
        219,  // ROOM_END
        221,  // WAITING_CONFIRMATION
        222,  // PLAYER_ACTION_NOTIFY
        223,  // ACTION_COMPLETE
        224,  // DEAL_REQUEST
    ]);
    
    // 消息发送失败回调
    private _onMessageFailed: (message: any, retryable: boolean) => void = null;
    
    // 统计数据
    private _stats = {
        messagesSent: 0,
        messagesReceived: 0,
        bytesSent: 0,
        bytesReceived: 0,
        compressionsApplied: 0,
        reconnects: 0,
        lastHeartbeatRtt: 0
    };
    
    public static getInstance(): NetworkOptimizer {
        if (NetworkOptimizer._instance === null) {
            NetworkOptimizer._instance = new NetworkOptimizer();
        }
        return NetworkOptimizer._instance;
    }
    
    /**
     * 压缩消息（简单的字符串压缩）
     * @param message 原始消息对象
     * @returns 压缩后的消息对象
     */
    compressMessage(message: any): any {
        if (!this._compressionEnabled) {
            return message;
        }
        
        const jsonStr = JSON.stringify(message);
        const originalSize = jsonStr.length;
        
        // 小消息不压缩
        if (originalSize < this._minSizeForCompression) {
            return {
                ...message,
                _compressed: false
            };
        }
        
        // 使用简单的RLE压缩（适用于重复内容多的JSON）
        const compressed = this._simpleCompress(jsonStr);
        
        if (compressed.length < originalSize) {
            this._stats.compressionsApplied++;
            return {
                cmd: message.cmd,
                body: message.body,
                sequence: message.sequence,
                timestamp: message.timestamp,
                _compressed: true,
                _data: compressed,
                _originalSize: originalSize
            };
        }
        
        return {
            ...message,
            _compressed: false
        };
    }
    
    /**
     * 解压消息
     * @param message 压缩的消息对象
     * @returns 解压后的消息对象
     */
    decompressMessage(message: any): any {
        if (!message._compressed || !message._data) {
            return message;
        }
        
        const decompressed = this._simpleDecompress(message._data);
        try {
            return JSON.parse(decompressed);
        } catch (e) {
            LogService.error('NetworkOptimizer', `Failed to decompress message: ${e}`);
            return message;
        }
    }
    
    /**
     * 简单的RLE压缩（Run-Length Encoding）
     */
    private _simpleCompress(str: string): string {
        let result = '';
        let i = 0;
        
        while (i < str.length) {
            let count = 1;
            while (i + count < str.length && str[i + count] === str[i] && count < 255) {
                count++;
            }
            
            if (count > 2) {
                result += `${count}×${str[i]}`;
            } else {
                result += str[i].repeat(count);
            }
            
            i += count;
        }
        
        return result;
    }
    
    /**
     * 简单的RLE解压
     */
    private _simpleDecompress(str: string): string {
        let result = '';
        let i = 0;
        
        while (i < str.length) {
            // 检查是否是压缩标记 (count×char)
            const match = str.slice(i).match(/^(\d+)×(.)/);
            if (match) {
                const count = parseInt(match[1], 10);
                result += match[2].repeat(count);
                i += match[0].length;
            } else {
                result += str[i];
                i++;
            }
        }
        
        return result;
    }
    
    /**
     * 添加消息到批量发送队列
     * @param message 消息对象
     */
    queueMessage(message: any): void {
        this._messageQueue.push(message);
        
        // 达到批量大小立即发送
        if (this._messageQueue.length >= this._maxBatchSize) {
            this._flushQueue();
        }
    }
    
    /**
     * 刷新消息队列
     */
    private _flushQueue(): void {
        if (this._messageQueue.length === 0) {
            return;
        }
        
        const messages = [...this._messageQueue];
        this._messageQueue = [];
        
        // 触发批量发送回调
        if (this._onBatchSend) {
            this._onBatchSend(messages);
        }
    }
    
    /**
     * 开始批量发送
     */
    startBatchSend(): void {
        if (this._batchSendTimer !== null) {
            return;
        }
        
        this._batchSendTimer = setInterval(() => {
            this._flushQueue();
        }, this._batchSendInterval);
    }
    
    /**
     * 停止批量发送
     */
    stopBatchSend(): void {
        if (this._batchSendTimer !== null) {
            clearInterval(this._batchSendTimer);
            this._batchSendTimer = null;
        }
        this._flushQueue();
    }
    
    // 批量发送回调
    private _onBatchSend: (messages: any[]) => void = null;
    
    /**
     * 设置批量发送回调
     */
    public setOnBatchSend(callback: (messages: any[]) => void): void {
        this._onBatchSend = callback;
    }
    
    /**
     * 保存游戏状态快照（用于重连恢复）
     */
    saveGameState(state: any): void {
        this._lastGameState = JSON.parse(JSON.stringify(state));
    }
    
    /**
     * 获取保存的游戏状态
     */
    getSavedGameState(): any {
        return this._lastGameState ? JSON.parse(JSON.stringify(this._lastGameState)) : null;
    }
    
    /**
     * 清除保存的游戏状态
     */
    clearGameState(): void {
        this._lastGameState = null;
    }
    
    /**
     * 获取下一个消息序列号
     */
    getNextSequence(): number {
        return this._nextSequence++;
    }
    
    /**
     * 判断消息是否是广播消息（不需要确认）
     * @param cmd 命令类型
     */
    isBroadcastMessage(cmd: number): boolean {
        return this._broadcastCmds.has(cmd);
    }
    
    /**
     * 记录待确认消息（仅非心跳消息）
     */
    addPendingMessage(sequence: number, message: any): void {
        if (!message || typeof message !== 'object') {
            return;
        }
        
        this._pendingMessages.set(sequence, {
            message,
            timestamp: Date.now(),
            retries: 0,
            lastRetryTime: 0,
            cmd: message.cmd || 0
        });
        
        this._startMessageTimeoutCheck(sequence);
    }
    
    private _startMessageTimeoutCheck(sequence: number): void {
        setTimeout(() => {
            this._checkMessageTimeout(sequence);
        }, this._messageTimeout);
    }
    
    private _checkMessageTimeout(sequence: number): void {
        const msgMeta = this._pendingMessages.get(sequence);
        if (!msgMeta) return;
        
        const now = Date.now();
        const elapsed = now - msgMeta.timestamp;
        
        if (elapsed > this._messageTimeout) {
            if (msgMeta.retries < this._maxRetries) {
                msgMeta.retries++;
                msgMeta.timestamp = Date.now();
                
                LogService.warn('NetworkOptimizer', `消息重试 ${msgMeta.retries}/${this._maxRetries}, sequence=${sequence}, cmd=${msgMeta.cmd}`);
                
                if (this._onMessageFailed) {
                    this._onMessageFailed(msgMeta.message, true);
                }
                
                const nextTimeout = this._messageTimeout * (msgMeta.retries + 1);
                setTimeout(() => {
                    this._checkMessageTimeout(sequence);
                }, nextTimeout);
            } else {
                LogService.error('NetworkOptimizer', `消息发送失败，已达最大重试次数, sequence=${sequence}, cmd=${msgMeta.cmd}`);
                this._pendingMessages.delete(sequence);
                
                if (this._onMessageFailed) {
                    this._onMessageFailed(msgMeta.message, false);
                }
            }
        }
    }
    
    /**
     * 确认消息已被处理
     */
    confirmMessage(sequence: number): boolean {
        const removed = this._pendingMessages.delete(sequence);
        if (removed) {
            LogService.debug('NetworkOptimizer', `消息已确认, sequence=${sequence}`);
        }
        return removed;
    }
    
    /**
     * 获取并清除超时消息
     */
    getAndClearTimeoutMessages(): any[] {
        const now = Date.now();
        const timeoutMessages: any[] = [];
        
        this._pendingMessages.forEach((value, key) => {
            if (now - value.timestamp > this._messageTimeout) {
                timeoutMessages.push(value.message);
                this._pendingMessages.delete(key);
            }
        });
        
        return timeoutMessages;
    }
    
    /**
     * 设置消息发送失败回调
     */
    setOnMessageFailed(callback: (message: any, retryable: boolean) => void): void {
        this._onMessageFailed = callback;
    }
    
    /**
     * 更新统计信息
     */
    updateStats(type: 'sent' | 'received', bytes: number): void {
        if (type === 'sent') {
            this._stats.messagesSent++;
            this._stats.bytesSent += bytes;
        } else {
            this._stats.messagesReceived++;
            this._stats.bytesReceived += bytes;
        }
    }
    
    /**
     * 更新心跳RTT
     */
    updateHeartbeatRtt(rtt: number): void {
        this._stats.lastHeartbeatRtt = rtt;
    }
    
    /**
     * 记录重连次数
     */
    recordReconnect(): void {
        this._stats.reconnects++;
    }
    
    /**
     * 获取统计数据
     */
    getStats(): any {
        return { ...this._stats };
    }
    
    /**
     * 重置统计
     */
    resetStats(): void {
        this._stats = {
            messagesSent: 0,
            messagesReceived: 0,
            bytesSent: 0,
            bytesReceived: 0,
            compressionsApplied: 0,
            reconnects: 0,
            lastHeartbeatRtt: 0
        };
    }
    
    /**
     * 清理所有资源（场景卸载时调用）
     * 清空待确认消息队列，重置序列号
     */
    cleanup(): void {
        this._pendingMessages.clear();
        this._nextSequence = 0;
        this._messageQueue = [];
        this._lastGameState = null;
        
        if (this._batchSendTimer) {
            clearInterval(this._batchSendTimer);
            this._batchSendTimer = null;
        }
        
        LogService.debug('NetworkOptimizer', '资源已清理');
    }
    
    /**
     * 设置压缩开关
     */
    setCompressionEnabled(enabled: boolean): void {
        this._compressionEnabled = enabled;
    }
    
    /**
     * 是否启用压缩
     */
    isCompressionEnabled(): boolean {
        return this._compressionEnabled;
    }
}
