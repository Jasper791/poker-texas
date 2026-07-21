/**
 * 网络事件处理器
 * 负责处理网络消息相关的事件
 */
import { BaseEventHandler } from './BaseEventHandler';
import { LogService } from '../utils/LogService';

export class NetworkEventHandler extends BaseEventHandler {
    private _messageCallbacks: Map<string, Function[]> = new Map();
    private _reconnectAttempts: number = 0;
    private _maxReconnectAttempts: number = 5;

    constructor() {
        super('NetworkEventHandler');
    }

    /**
     * 初始化网络事件处理器
     */
    init(): void {
        if (this._isInitialized) {
            //LogService.warn(this._handlerName, '已经初始化过，跳过');
            return;
        }

        this._reconnectAttempts = 0;
        this._isInitialized = true;
    }

    /**
     * 销毁网络事件处理器
     */
    destroy(): void {
        this._messageCallbacks.clear();
        this._reconnectAttempts = 0;
        this._isInitialized = false;
        //LogService.info(this._handlerName, '网络事件处理器已销毁');
    }

    /**
     * 处理网络消息
     */
    handleMessage(messageType: string, messageData: any): void {
        this.logEvent('NETWORK_MESSAGE', { type: messageType, data: messageData });
        
        const callbacks = this._messageCallbacks.get(messageType);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(messageData);
                } catch (error) {
                    this.logError(`网络消息处理错误: ${messageType}`, error);
                }
            });
        }
    }

    /**
     * 处理连接成功事件
     */
    onConnectSuccess(): void {
        this._reconnectAttempts = 0;
        this.logEvent('CONNECT_SUCCESS');
    }

    /**
     * 处理连接失败事件
     */
    onConnectFailure(error: any): void {
        this.logEvent('CONNECT_FAILURE', error);
    }

    /**
     * 处理断线事件
     */
    onDisconnect(reason: string): void {
        this.logEvent('DISCONNECT', { reason });
    }

    /**
     * 处理重连事件
     */
    onReconnect(): void {
        this._reconnectAttempts++;
        this.logEvent('RECONNECT', { attempt: this._reconnectAttempts });
    }

    /**
     * 注册网络消息回调
     * @param messageType 消息类型
     * @param callback 回调函数
     */
    onMessage(messageType: string, callback: Function): void {
        if (!this._messageCallbacks.has(messageType)) {
            this._messageCallbacks.set(messageType, []);
        }
        this._messageCallbacks.get(messageType)!.push(callback);
    }

    /**
     * 注销网络消息回调
     * @param messageType 消息类型
     * @param callback 回调函数
     */
    offMessage(messageType: string, callback: Function): void {
        const callbacks = this._messageCallbacks.get(messageType);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 检查是否可以继续重连
     */
    canReconnect(): boolean {
        return this._reconnectAttempts < this._maxReconnectAttempts;
    }

    /**
     * 重置重连计数
     */
    resetReconnectCount(): void {
        this._reconnectAttempts = 0;
    }
}
