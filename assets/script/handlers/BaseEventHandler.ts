/**
 * 事件处理器基类
 * 提供通用的事件处理功能
 */
import { LogService } from '../utils/LogService';

export abstract class BaseEventHandler {
    protected _handlerName: string;
    protected _isInitialized: boolean = false;

    constructor(handlerName: string) {
        this._handlerName = handlerName;
    }

    /**
     * 初始化处理器
     */
    abstract init(): void;

    /**
     * 销毁处理器
     */
    abstract destroy(): void;

    /**
     * 记录事件日志
     * @param eventName 事件名称
     * @param data 事件数据
     */
    protected logEvent(eventName: string, data?: any): void {
        if (data) {
        } else {
        }
    }

    /**
     * 记录错误日志
     * @param error 错误信息
     * @param data 额外数据
     */
    protected logError(error: string, data?: any): void {
        if (data) {
            LogService.error(this._handlerName, error, data);
        } else {
            LogService.error(this._handlerName, error);
        }
    }

    /**
     * 获取处理器名称
     */
    getHandlerName(): string {
        return this._handlerName;
    }

    /**
     * 是否已经初始化
     */
    isInitialized(): boolean {
        return this._isInitialized;
    }
}
