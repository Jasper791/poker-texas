import { LogService } from '../../utils/LogService';
import { IMessageHandler } from '../MessageDispatcher';

/**
 * 游戏状态同步处理器
 */
export class GameStateSyncHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('GameStateSyncHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}
