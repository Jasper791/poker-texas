import { LogService } from '../../utils/LogService';
import { IMessageHandler } from '../MessageDispatcher';

/**
 * 玩家加入处理器
 */
export class PlayerJoinHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('PlayerJoinHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}
