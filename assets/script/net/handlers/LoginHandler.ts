import { LogService } from '../../utils/LogService';
import { IMessageHandler } from '../MessageDispatcher';
import { ResponseCode } from '../../types';

/**
 * 登录响应处理器
 */
export class LoginHandler implements IMessageHandler {
    private _onSuccess: ((data: any) => void) | null = null;
    private _onFailed: ((error: string) => void) | null = null;

    constructor(options?: {
        onSuccess?: (data: any) => void;
        onFailed?: (error: string) => void;
    }) {
        if (options) {
            this._onSuccess = options.onSuccess || null;
            this._onFailed = options.onFailed || null;
        }
    }

    public handle(data: any): void {

        if (data.code === ResponseCode.SUCCESS) {
            if (this._onSuccess) {
                try {
                    this._onSuccess(data);
                } catch (error) {
                    LogService.error('LoginHandler', '成功回调执行失败:', error);
                }
            }
        } else {
            const errorMsg = data.message || data.msg || '登录失败';
            if (this._onFailed) {
                try {
                    this._onFailed(errorMsg);
                } catch (error) {
                    LogService.error('LoginHandler', '失败回调执行失败:', error);
                }
            }
            LogService.warn('LoginHandler', '登录失败:', errorMsg);
        }
    }

    public setOnSuccess(callback: (data: any) => void): void {
        this._onSuccess = callback;
    }

    public setOnFailed(callback: (error: string) => void): void {
        this._onFailed = callback;
    }
}
