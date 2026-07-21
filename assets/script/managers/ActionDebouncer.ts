/**
 * 防重复点击管理器
 * 提供按钮点击防抖机制和操作锁机制
 * 确保按钮操作不会重复触发，影响游戏流程
 */
import { LogService } from '../utils/LogService';

export class ActionDebouncer {
    private static instance: ActionDebouncer;
    
    // 点击时间记录（方法名 -> 上次点击时间）
    private clickTimestamps: Map<string, number> = new Map();
    
    // 操作锁（方法名 -> 是否已锁定）
    private actionLocks: Map<string, boolean> = new Map();
    
    // 默认防抖时间（毫秒）
    private defaultDebounceTime: number = 500;
    
    // 操作超时时间（毫秒），防止死锁
    private operationTimeout: number = 30000;

    private constructor() {}

    /**
     * 获取单例实例
     */
    static getInstance(): ActionDebouncer {
        if (!ActionDebouncer.instance) {
            ActionDebouncer.instance = new ActionDebouncer();
        }
        return ActionDebouncer.instance;
    }

    /**
     * 检查是否可以执行操作（防抖检查）
     * @param methodName 方法名
     * @param debounceTime 防抖时间（毫秒）
     */
    canExecute(methodName: string, debounceTime?: number): boolean {
        const now = Date.now();
        const lastClick = this.clickTimestamps.get(methodName) || 0;
        const timeDiff = now - lastClick;
        
        if (timeDiff < (debounceTime || this.defaultDebounceTime)) {
            return false;
        }
        
        // 检查操作锁
        if (this.isLocked(methodName)) {
            return false;
        }
        
        return true;
    }

    /**
     * 记录点击时间
     * @param methodName 方法名
     */
    recordClick(methodName: string): void {
        this.clickTimestamps.set(methodName, Date.now());
    }

    /**
     * 获取距离上次点击的时间
     * @param methodName 方法名
     */
    getTimeSinceLastClick(methodName: string): number {
        const lastClick = this.clickTimestamps.get(methodName) || 0;
        return Date.now() - lastClick;
    }

    /**
     * 锁定操作
     * @param methodName 方法名
     * @param timeout 超时时间（毫秒），默认使用 this.operationTimeout
     * @returns 是否成功锁定
     */
    lock(methodName: string, timeout?: number): boolean {
        if (this.actionLocks.get(methodName) === true) {
            return false;
        }
        
        this.actionLocks.set(methodName, true);
        
        // 设置自动解锁（防止死锁）
        const timeoutMs = timeout || this.operationTimeout;
        setTimeout(() => {
            if (this.actionLocks.get(methodName) === true) {
                LogService.warn('ActionDebouncer', `⚠️ 方法 ${methodName} 操作超时，自动解锁`);
                this.unlock(methodName);
            }
        }, timeoutMs);
        
        return true;
    }

    /**
     * 解锁操作
     * @param methodName 方法名
     */
    unlock(methodName: string): void {
        if (this.actionLocks.get(methodName) === true) {
            this.actionLocks.set(methodName, false);
        }
    }

    /**
     * 检查是否已锁定
     * @param methodName 方法名
     */
    isLocked(methodName: string): boolean {
        return this.actionLocks.get(methodName) === true;
    }

    /**
     * 重置所有状态
     */
    reset(): void {
        this.clickTimestamps.clear();
        this.actionLocks.clear();
    }

    /**
     * 重置指定方法的防抖状态
     * @param methodName 方法名
     */
    resetMethod(methodName: string): void {
        this.clickTimestamps.delete(methodName);
        this.actionLocks.delete(methodName);
    }

    /**
     * 设置默认防抖时间
     * @param time 毫秒
     */
    setDefaultDebounceTime(time: number): void {
        this.defaultDebounceTime = time;
    }

    /**
     * 获取默认防抖时间
     */
    getDefaultDebounceTime(): number {
        return this.defaultDebounceTime;
    }

    // ============================================
    // 便捷方法：包装操作函数
    // ============================================

    /**
     * 执行带防抖和锁的操作
     * @param methodName 方法名
     * @param action 操作函数
     * @param debounceTime 防抖时间（毫秒）
     * @param onSuccess 成功回调（可选）
     * @param onError 失败回调（可选）
     */
    executeWithProtection(
        methodName: string,
        action: () => void | Promise<void>,
        debounceTime?: number,
        onSuccess?: () => void,
        onError?: (error: string) => void
    ): void {
        // 检查是否可以执行
        if (!this.canExecute(methodName, debounceTime)) {
            onError?.('操作过于频繁，请稍后再试');
            return;
        }

        // 记录点击
        this.recordClick(methodName);

        // 尝试锁定
        if (!this.lock(methodName)) {
            onError?.('操作正在进行中');
            return;
        }

        try {
            // 执行操作
            const result = action();
            
            // 如果返回 Promise
            if (result instanceof Promise) {
                result
                    .then(() => {
                        onSuccess?.();
                    })
                    .catch((error) => {
                        LogService.error('ActionDebouncer', `操作 ${methodName} 执行出错: ${error}`);
                        onError?.(error.message || '操作执行失败');
                    })
                    .then(() => {
                        setTimeout(() => {
                            this.unlock(methodName);
                        }, 300);
                    });
            } else {
                onSuccess?.();
                // 延迟解锁
                setTimeout(() => {
                    this.unlock(methodName);
                }, 300);
            }
        } catch (error) {
            LogService.error('ActionDebouncer', `操作 ${methodName} 执行出错: ${error}`);
            this.unlock(methodName);
            onError?.(error.message || '操作执行失败');
        }
    }

    // ============================================
    // 游戏操作专用方法
    // ============================================

    /**
     * 检查是否可以弃牌
     */
    canFold(): boolean {
        return this.canExecute('fold');
    }

    /**
     * 执行弃牌操作
     */
    executeFold(action: () => void, onSuccess?: () => void, onError?: (error: string) => void): void {
        this.executeWithProtection('fold', action, undefined, onSuccess, onError);
    }

    /**
     * 检查是否可以跟注
     */
    canCall(): boolean {
        return this.canExecute('call');
    }

    /**
     * 执行跟注操作
     */
    executeCall(action: () => void, onSuccess?: () => void, onError?: (error: string) => void): void {
        this.executeWithProtection('call', action, undefined, onSuccess, onError);
    }

    /**
     * 检查是否可以加注
     */
    canRaise(): boolean {
        return this.canExecute('raise');
    }

    /**
     * 执行加注操作
     */
    executeRaise(action: () => void, onSuccess?: () => void, onError?: (error: string) => void): void {
        this.executeWithProtection('raise', action, undefined, onSuccess, onError);
    }

    /**
     * 检查是否可以看牌
     */
    canCheck(): boolean {
        return this.canExecute('check');
    }

    /**
     * 执行看牌操作
     */
    executeCheck(action: () => void, onSuccess?: () => void, onError?: (error: string) => void): void {
        this.executeWithProtection('check', action, undefined, onSuccess, onError);
    }

    /**
     * 检查是否可以全下
     */
    canAllIn(): boolean {
        return this.canExecute('allIn');
    }

    /**
     * 执行全下操作
     */
    executeAllIn(action: () => void, onSuccess?: () => void, onError?: (error: string) => void): void {
        this.executeWithProtection('allIn', action, undefined, onSuccess, onError);
    }

    /**
     * 检查是否可以下注
     */
    canBet(): boolean {
        return this.canExecute('bet');
    }

    /**
     * 执行下注操作
     */
    executeBet(action: () => void, onSuccess?: () => void, onError?: (error: string) => void): void {
        this.executeWithProtection('bet', action, undefined, onSuccess, onError);
    }
}
