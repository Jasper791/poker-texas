import { LogService } from '../utils/LogService';
import { CommandType } from './Protocol';

/**
 * 消息处理器接口
 * 所有消息处理器必须实现此接口
 */
export interface IMessageHandler {
    handle(data: any): void;
}

/**
 * 消息分发器
 * 统一管理网络消息的处理
 */
export class MessageDispatcher {
    private static _instance: MessageDispatcher = null;
    private static _handlers: Map<number, IMessageHandler> = new Map();
    private static _fallbackHandler: IMessageHandler | null = null;
    private static _enabled: boolean = true;

    /**
     * 获取单例实例
     */
    public static getInstance(): MessageDispatcher {
        if (!this._instance) {
            this._instance = new MessageDispatcher();
        }
        return this._instance;
    }

    /**
     * 启用/禁用消息分发
     */
    public static setEnabled(enabled: boolean): void {
        this._enabled = enabled;
    }

    /**
     * 注册消息处理器
     * @param cmd 命令类型
     * @param handler 消息处理器
     */
    public static register(cmd: number, handler: IMessageHandler): void {
        if (this._handlers.has(cmd)) {
            LogService.warn('MessageDispatcher', `命令${cmd}已存在处理器，将被覆盖`);
        }
        this._handlers.set(cmd, handler);
    }

    /**
     * 批量注册消息处理器
     * @param handlers 处理器映射 { cmd: handler }
     */
    public static registerAll(handlers: Map<number, IMessageHandler>): void {
        handlers.forEach((handler, cmd) => {
            this.register(cmd, handler);
        });
    }

    /**
     * 移除消息处理器
     * @param cmd 命令类型
     */
    public static unregister(cmd: number): void {
        if (this._handlers.delete(cmd)) {
        }
    }

    /**
     * 设置兜底处理器（处理未注册的消息）
     */
    public static setFallbackHandler(handler: IMessageHandler): void {
        this._fallbackHandler = handler;
    }

    /**
     * 分发消息
     * @param cmd 命令类型
     * @param data 消息数据
     */
    public static dispatch(cmd: number, data: any): void {
        if (!this._enabled) {
            return;
        }

        const handler = this._handlers.get(cmd);
        if (handler) {
            try {
                handler.handle(data);
            } catch (error) {
                LogService.error('MessageDispatcher', `处理消息失败: ${this.getCommandName(cmd)}`, error);
            }
        } else if (this._fallbackHandler) {
            try {
                this._fallbackHandler.handle(data);
            } catch (error) {
                LogService.error('MessageDispatcher', `兜底处理器失败: ${this.getCommandName(cmd)}`, error);
            }
        } else {
        }
    }

    /**
     * 检查是否已注册某个命令的处理器
     */
    public static hasHandler(cmd: number): boolean {
        return this._handlers.has(cmd);
    }

    /**
     * 获取所有已注册的命令
     */
    public static getRegisteredCommands(): number[] {
        return Array.from(this._handlers.keys());
    }

    /**
     * 清空所有处理器
     */
    public static clear(): void {
        this._handlers.clear();
        this._fallbackHandler = null;
    }

    /**
     * 获取命令名称（用于日志）
     */
    private static getCommandName(cmd: number): string {
        for (const key in CommandType) {
            if ((CommandType as any)[key] === cmd) {
                return key;
            }
        }
        return `UNKNOWN_${cmd}`;
    }
}

/**
 * 便利函数：创建一个简单的消息处理器
 */
export function createHandler(handlerFn: (data: any) => void): IMessageHandler {
    return {
        handle: handlerFn
    };
}
