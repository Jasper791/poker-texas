import { LogService } from './LogService';

/**
 * 错误级别枚举
 */
export enum ErrorLevel {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    FATAL = 'fatal'
}

/**
 * 错误类型枚举
 */
export enum ErrorType {
    NETWORK = 'network',
    GAME_LOGIC = 'game_logic',
    UI = 'ui',
    VALIDATION = 'validation',
    UNKNOWN = 'unknown'
}

/**
 * 游戏错误接口
 */
export interface GameError {
    code: string;
    message: string;
    type: ErrorType;
    level: ErrorLevel;
    timestamp: number;
    context?: Record<string, any>;
    originalError?: Error;
}

/**
 * 错误处理回调类型
 */
export type ErrorHandler = (error: GameError) => void;

/**
 * 统一错误处理服务
 * 提供统一的错误捕获、记录和分发机制
 */
export class ErrorService {
    private static _instance: ErrorService | null = null;
    private _handlers: Map<ErrorType, ErrorHandler[]> = new Map();
    private _globalHandlers: ErrorHandler[] = [];
    private _errorHistory: GameError[] = [];
    private readonly _maxHistorySize = 100;

    /**
     * 获取单例实例
     */
    static getInstance(): ErrorService {
        if (!ErrorService._instance) {
            ErrorService._instance = new ErrorService();
        }
        return ErrorService._instance;
    }

    /**
     * 私有构造函数
     */
    private constructor() {
        this._setupGlobalErrorHandlers();
    }

    /**
     * 设置全局错误监听
     */
    private _setupGlobalErrorHandlers(): void {
        // 监听未捕获的异常
        if (typeof window !== 'undefined') {
            window.addEventListener('error', (event) => {
                this.handleError({
                    code: 'UNCAUGHT_EXCEPTION',
                    message: event.message || 'Unknown error',
                    type: ErrorType.UNKNOWN,
                    level: ErrorLevel.ERROR,
                    timestamp: Date.now(),
                    originalError: event.error
                });
            });

            window.addEventListener('unhandledrejection', (event) => {
                this.handleError({
                    code: 'UNHANDLED_REJECTION',
                    message: event.reason?.toString() || 'Unhandled promise rejection',
                    type: ErrorType.UNKNOWN,
                    level: ErrorLevel.ERROR,
                    timestamp: Date.now(),
                    context: { promise: event.promise }
                });
            });
        }
    }

    /**
     * 处理错误
     */
    handleError(error: GameError): void {
        // 记录错误日志
        this._logError(error);

        // 保存到历史记录
        this._addToHistory(error);

        // 调用类型特定的处理器
        const typeHandlers = this._handlers.get(error.type) || [];
        typeHandlers.forEach(handler => {
            try {
                handler(error);
            } catch (e) {
                LogService.error('ErrorService', `Error handler failed: ${e}`);
            }
        });

        // 调用全局处理器
        this._globalHandlers.forEach(handler => {
            try {
                handler(error);
            } catch (e) {
                LogService.error('ErrorService', `Global error handler failed: ${e}`);
            }
        });
    }

    /**
     * 便捷方法 - 创建并处理网络错误
     */
    handleNetworkError(code: string, message: string, context?: Record<string, any>): void {
        this.handleError({
            code,
            message,
            type: ErrorType.NETWORK,
            level: ErrorLevel.ERROR,
            timestamp: Date.now(),
            context
        });
    }

    /**
     * 便捷方法 - 创建并处理游戏逻辑错误
     */
    handleGameLogicError(code: string, message: string, context?: Record<string, any>): void {
        this.handleError({
            code,
            message,
            type: ErrorType.GAME_LOGIC,
            level: ErrorLevel.WARNING,
            timestamp: Date.now(),
            context
        });
    }

    /**
     * 便捷方法 - 创建并处理 UI 错误
     */
    handleUIError(code: string, message: string, context?: Record<string, any>): void {
        this.handleError({
            code,
            message,
            type: ErrorType.UI,
            level: ErrorLevel.WARNING,
            timestamp: Date.now(),
            context
        });
    }

    /**
     * 便捷方法 - 创建并处理验证错误
     */
    handleValidationError(code: string, message: string, context?: Record<string, any>): void {
        this.handleError({
            code,
            message,
            type: ErrorType.VALIDATION,
            level: ErrorLevel.INFO,
            timestamp: Date.now(),
            context
        });
    }

    /**
     * 注册错误处理器
     */
    registerHandler(type: ErrorType, handler: ErrorHandler): void {
        if (!this._handlers.has(type)) {
            this._handlers.set(type, []);
        }
        this._handlers.get(type)!.push(handler);
    }

    /**
     * 注册全局错误处理器
     */
    registerGlobalHandler(handler: ErrorHandler): void {
        this._globalHandlers.push(handler);
    }

    /**
     * 移除错误处理器
     */
    removeHandler(type: ErrorType, handler: ErrorHandler): void {
        const handlers = this._handlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * 移除全局错误处理器
     */
    removeGlobalHandler(handler: ErrorHandler): void {
        const index = this._globalHandlers.indexOf(handler);
        if (index > -1) {
            this._globalHandlers.splice(index, 1);
        }
    }

    /**
     * 获取错误历史
     */
    getErrorHistory(): GameError[] {
        return [...this._errorHistory];
    }

    /**
     * 清空错误历史
     */
    clearErrorHistory(): void {
        this._errorHistory = [];
    }

    /**
     * 记录错误日志
     */
    private _logError(error: GameError): void {
        const logMessage = `[${error.type.toUpperCase()}] ${error.code}: ${error.message}`;
        
        switch (error.level) {
            case ErrorLevel.INFO:
                LogService.info('ErrorService', logMessage, error.context);
                break;
            case ErrorLevel.WARNING:
                LogService.warn('ErrorService', logMessage, error.context);
                break;
            case ErrorLevel.ERROR:
            case ErrorLevel.FATAL:
                LogService.error('ErrorService', logMessage, error.context, error.originalError);
                break;
        }
    }

    /**
     * 添加到历史记录
     */
    private _addToHistory(error: GameError): void {
        this._errorHistory.push(error);
        
        // 限制历史记录大小
        if (this._errorHistory.length > this._maxHistorySize) {
            this._errorHistory.shift();
        }
    }

    /**
     * 创建安全包裹函数
     */
    wrapSafe<T extends (...args: any[]) => any>(
        fn: T,
        errorType: ErrorType = ErrorType.UNKNOWN,
        errorCode: string = 'WRAPPED_FUNCTION_ERROR'
    ): (...args: Parameters<T>) => ReturnType<T> | null {
        return (...args: Parameters<T>) => {
            try {
                return fn(...args);
            } catch (e) {
                this.handleError({
                    code: errorCode,
                    message: e instanceof Error ? e.message : String(e),
                    type: errorType,
                    level: ErrorLevel.ERROR,
                    timestamp: Date.now(),
                    originalError: e instanceof Error ? e : undefined
                });
                return null;
            }
        };
    }

    /**
     * 创建异步安全包裹函数
     */
    wrapAsyncSafe<T extends (...args: any[]) => Promise<any>>(
        fn: T,
        errorType: ErrorType = ErrorType.UNKNOWN,
        errorCode: string = 'ASYNC_WRAPPED_FUNCTION_ERROR'
    ): (...args: Parameters<T>) => Promise<ReturnType<T> | null> {
        return async (...args: Parameters<T>) => {
            try {
                return await fn(...args);
            } catch (e) {
                this.handleError({
                    code: errorCode,
                    message: e instanceof Error ? e.message : String(e),
                    type: errorType,
                    level: ErrorLevel.ERROR,
                    timestamp: Date.now(),
                    originalError: e instanceof Error ? e : undefined
                });
                return null;
            }
        };
    }
}
