import { LogService } from './LogService';

/**
 * 统一错误处理工具类
 * 用于统一处理错误记录、用户提示和错误上报
 */
export class ErrorHandler {
    private static _instance: ErrorHandler = null;
    private static _userMessageCallback: ((message: string, type: 'error' | 'warning' | 'info') => void) = null;
    private static _errorReportCallback: ((error: Error | string, context?: string) => void) = null;

    /**
     * 获取单例实例
     */
    public static get instance(): ErrorHandler {
        if (!this._instance) {
            this._instance = new ErrorHandler();
        }
        return this._instance;
    }

    /**
     * 设置用户提示回调
     * @param callback 用户提示回调函数
     */
    public static setUserMessageCallback(callback: (message: string, type: 'error' | 'warning' | 'info') => void): void {
        this._userMessageCallback = callback;
    }

    /**
     * 设置错误上报回调
     * @param callback 错误上报回调函数
     */
    public static setErrorReportCallback(callback: (error: Error | string, context?: string) => void): void {
        this._errorReportCallback = callback;
    }

    /**
     * 处理错误
     * @param error 错误对象或错误信息
     * @param context 错误上下文（用于追踪问题）
     */
    public static handle(error: Error | string, context?: string): void {
        const message = typeof error === 'string' ? error : (error.message || 'Unknown error');
        const errorStack = typeof error === 'string' ? null : error.stack;

        // 记录日志
        if (errorStack) {
            LogService.error(context || 'ErrorHandler', `${message}\n${errorStack}`);
        } else {
            LogService.error(context || 'ErrorHandler', message);
        }

        // 显示用户提示
        this.showUserMessage(message, 'error');

        // 上报错误
        this.reportError(error, context);
    }

    /**
     * 处理警告
     * @param message 警告信息
     * @param context 警告上下文
     */
    public static warn(message: string, context?: string): void {
        LogService.warn(context || 'ErrorHandler', message);
        this.showUserMessage(message, 'warning');
    }

    /**
     * 处理提示信息
     * @param message 提示信息
     * @param context 提示上下文
     */
    public static info(message: string, context?: string): void {
        LogService.info(context || 'ErrorHandler', message);
        this.showUserMessage(message, 'info');
    }

    /**
     * 显示用户提示
     * @param message 提示信息
     * @param type 提示类型
     */
    private static showUserMessage(message: string, type: 'error' | 'warning' | 'info'): void {
        if (this._userMessageCallback) {
            try {
                this._userMessageCallback(message, type);
            } catch (e) {
                LogService.error('ErrorHandler', '用户提示回调执行失败:', e);
            }
        } else {
        }
    }

    /**
     * 上报错误
     * @param error 错误对象或错误信息
     * @param context 错误上下文
     */
    private static reportError(error: Error | string, context?: string): void {
        if (this._errorReportCallback) {
            try {
                this._errorReportCallback(error, context);
            } catch (e) {
                LogService.error('ErrorHandler', '错误上报回调执行失败:', e);
            }
        }
    }

    /**
     * 安全执行函数（自动捕获并处理错误）
     * @param fn 要执行的函数
     * @param context 错误上下文
     * @param fallback 出错时的回退值
     */
    public static safeExecute<T>(fn: () => T, context?: string, fallback?: T): T | null {
        try {
            return fn();
        } catch (error) {
            this.handle(error, context);
            return fallback !== undefined ? fallback : null;
        }
    }

    /**
     * 安全执行异步函数（自动捕获并处理错误）
     * @param fn 要执行的异步函数
     * @param context 错误上下文
     * @param fallback 出错时的回退值
     */
    public static async safeExecuteAsync<T>(fn: () => Promise<T>, context?: string, fallback?: T): Promise<T | null> {
        try {
            return await fn();
        } catch (error) {
            this.handle(error, context);
            return fallback !== undefined ? fallback : null;
        }
    }

    /**
     * 断言检查
     * @param condition 断言条件
     * @param message 断言失败时的错误信息
     * @param context 错误上下文
     */
    public static assert(condition: boolean, message: string, context?: string): void {
        if (!condition) {
            this.handle(new Error(`Assertion failed: ${message}`), context || 'Assert');
        }
    }
}

// 导出便捷方法
export const handleError = ErrorHandler.handle;
export const handleWarn = ErrorHandler.warn;
export const handleInfo = ErrorHandler.info;
export const safeExecute = ErrorHandler.safeExecute;
export const safeExecuteAsync = ErrorHandler.safeExecuteAsync;
export const assert = ErrorHandler.assert;
