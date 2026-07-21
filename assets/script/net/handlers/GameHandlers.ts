import { LogService } from '../../utils/LogService';
import { IMessageHandler } from '../MessageDispatcher';

/**
 * 游戏开始通知处理器
 */
export class GameStartHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('GameStartHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 发牌通知处理器
 */
export class DealCardsHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('DealCardsHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 玩家回合通知处理器
 */
export class PlayerTurnHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('PlayerTurnHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 玩家操作通知处理器
 */
export class PlayerActionHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('PlayerActionHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 玩家操作响应处理器
 */
export class PlayerActionResponseHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('PlayerActionResponseHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 游戏结算处理器
 */
export class GameSettlementHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('GameSettlementHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 玩家准备处理器
 */
export class PlayerReadyHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('PlayerReadyHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 玩家退出处理器
 */
export class PlayerExitHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('PlayerExitHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 继续游戏响应处理器
 */
export class ContinueGameHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('ContinueGameHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * AI决策响应处理器
 */
export class AIDecisionHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('AIDecisionHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}

/**
 * 错误消息处理器
 */
export class ErrorHandler implements IMessageHandler {
    private _callback: ((data: any) => void) | null = null;

    constructor(callback?: (data: any) => void) {
        this._callback = callback || null;
    }

    public handle(data: any): void {
        const errorMsg = data.message || data.msg || '未知错误';
        LogService.error('ErrorHandler', '收到错误消息:', errorMsg, data);

        if (this._callback) {
            try {
                this._callback(data);
            } catch (error) {
                LogService.error('ErrorHandler', '回调执行失败:', error);
            }
        }
    }

    public setCallback(callback: (data: any) => void): void {
        this._callback = callback;
    }
}
