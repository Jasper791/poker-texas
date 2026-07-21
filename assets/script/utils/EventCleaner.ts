import { _decorator, Component, Node } from 'cc';
import { LogService } from './LogService';

/**
 * 事件监听器记录
 */
interface EventListenerRecord {
    target: any;
    event: string;
    callback: Function;
    context?: any;
    once?: boolean;
}

/**
 * 定时器记录
 */
interface TimerRecord {
    id: number;
    type: 'schedule' | 'setTimeout' | 'setInterval';
}

/**
 * 事件监听器清理器
 * 用于自动管理事件监听器的添加和移除，避免内存泄漏
 */
export class EventCleaner {
    private static _nextTimerId: number = 1;
    private static _timers: Map<number, any> = new Map();

    private _listeners: EventListenerRecord[] = [];
    private _timers: TimerRecord[] = [];
    private _cleaned: boolean = false;
    private _ownerName: string = '';

    /**
     * 创建事件清理器
     * @param ownerName 所有者名称（用于日志追踪）
     */
    constructor(ownerName: string = 'Unknown') {
        this._ownerName = ownerName;
    }

    /**
     * 添加事件监听器
     */
    on(target: any, event: string, callback: Function, context?: any): void {
        if (this._cleaned) {
            LogService.warn('EventCleaner', `[${this._ownerName}] 已清理，忽略事件添加`);
            return;
        }

        target.on(event, callback, context);
        this._listeners.push({
            target,
            event,
            callback,
            context,
            once: false
        });
    }

    /**
     * 添加一次性事件监听器
     */
    once(target: any, event: string, callback: Function, context?: any): void {
        if (this._cleaned) {
            LogService.warn('EventCleaner', `[${this._ownerName}] 已清理，忽略事件添加`);
            return;
        }

        target.once(event, callback, context);
        this._listeners.push({
            target,
            event,
            callback,
            context,
            once: true
        });
    }

    /**
     * 移除特定事件监听器
     */
    off(target: any, event: string, callback: Function, context?: any): void {
        target.off(event, callback, context);
        this._listeners = this._listeners.filter(l =>
            !(l.target === target && l.event === event && l.callback === callback)
        );
    }

    /**
     * 添加定时器（schedule）
     */
    schedule(target: Component, callback: Function, interval?: number, repeat?: number, delay?: number): void {
        if (this._cleaned) {
            LogService.warn('EventCleaner', `[${this._ownerName}] 已清理，忽略定时器添加`);
            return;
        }

        target.schedule(callback, interval, repeat, delay);
        this._timers.push({
            id: EventCleaner._nextTimerId++,
            type: 'schedule'
        });
    }

    /**
     * 添加一次性定时器（setTimeout）
     */
    setTimeout(callback: Function, delay: number): number {
        if (this._cleaned) {
            LogService.warn('EventCleaner', `[${this._ownerName}] 已清理，忽略定时器添加`);
            return -1;
        }

        const timerId = setTimeout(callback, delay);
        const id = EventCleaner._nextTimerId++;
        this._timers.push({ id, type: 'setTimeout' });
        EventCleaner._timers.set(id, timerId);
        return id;
    }

    /**
     * 添加周期性定时器（setInterval）
     */
    setInterval(callback: Function, interval: number): number {
        if (this._cleaned) {
            LogService.warn('EventCleaner', `[${this._ownerName}] 已清理，忽略定时器添加`);
            return -1;
        }

        const timerId = setInterval(callback, interval);
        const id = EventCleaner._nextTimerId++;
        this._timers.push({ id, type: 'setInterval' });
        EventCleaner._timers.set(id, timerId);
        return id;
    }

    /**
     * 清除定时器
     */
    clearTimer(id: number): void {
        const record = this._timers.find(t => t.id === id);
        if (record) {
            const timerId = EventCleaner._timers.get(id);
            if (record.type === 'setTimeout') {
                clearTimeout(timerId);
            } else if (record.type === 'setInterval') {
                clearInterval(timerId);
            }
            EventCleaner._timers.delete(id);
            this._timers = this._timers.filter(t => t.id !== id);
        }
    }

    /**
     * 移除特定目标的所有事件
     */
    offAllFrom(target: any): void {
        const listeners = this._listeners.filter(l => l.target === target);
        listeners.forEach(l => {
            l.target.off(l.event, l.callback, l.context);
        });
        this._listeners = this._listeners.filter(l => l.target !== target);
    }

    /**
     * 清理所有事件监听器和定时器
     */
    clear(): void {
        if (this._cleaned) {
            return;
        }

        // 清理事件监听器
        this._listeners.forEach(record => {
            try {
                record.target.off(record.event, record.callback, record.context);
            } catch (e) {
                LogService.warn('EventCleaner', `[${this._ownerName}] 移除事件失败:`, e);
            }
        });

        // 清理定时器
        this._timers.forEach(record => {
            try {
                if (record.type === 'setTimeout') {
                    clearTimeout(EventCleaner._timers.get(record.id));
                } else if (record.type === 'setInterval') {
                    clearInterval(EventCleaner._timers.get(record.id));
                }
                EventCleaner._timers.delete(record.id);
            } catch (e) {
                LogService.warn('EventCleaner', `[${this._ownerName}] 清除定时器失败:`, e);
            }
        });

        const listenerCount = this._listeners.length;
        const timerCount = this._timers.length;

        this._listeners = [];
        this._timers = [];
        this._cleaned = true;

        LogService.info('EventCleaner', `[${this._ownerName}] 清理完成: ${listenerCount}个事件, ${timerCount}个定时器`);
    }

    /**
     * 检查是否已清理
     */
    isCleaned(): boolean {
        return this._cleaned;
    }

    /**
     * 获取当前监听器数量
     */
    getListenerCount(): number {
        return this._listeners.length;
    }

    /**
     * 获取当前定时器数量
     */
    getTimerCount(): number {
        return this._timers.length;
    }
}

/**
 * 组件基类（自动事件清理）
 */
export class ComponentWithCleanup extends Component {
    protected _eventCleaner: EventCleaner = null;

    protected onLoad(): void {
        this._eventCleaner = new EventCleaner(this.node?.name || this.constructor.name);
    }

    protected onDestroy(): void {
        this._eventCleaner?.clear();
    }

    /**
     * 获取事件清理器
     */
    protected get eventCleaner(): EventCleaner {
        if (!this._eventCleaner) {
            this._eventCleaner = new EventCleaner(this.node?.name || this.constructor.name);
        }
        return this._eventCleaner;
    }
}
