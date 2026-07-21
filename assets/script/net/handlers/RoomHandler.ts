import { LogService } from '../../utils/LogService';
import { IMessageHandler } from '../MessageDispatcher';

/**
 * 创建房间响应处理器
 */
export class CreateRoomHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('CreateRoomHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 加入房间响应处理器
 */
export class JoinRoomHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('JoinRoomHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 退出房间响应处理器
 */
export class ExitRoomHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('ExitRoomHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}
