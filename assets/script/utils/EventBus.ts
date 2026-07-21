import { LogService } from './LogService';

/**
 * 事件回调类型
 */
export type EventCallback<T = any> = (data?: T) => void;

/**
 * 事件监听记录
 */
interface EventListener {
    callback: EventCallback;
    context?: any;
    once: boolean;
    id: string;
}

/**
 * 事件总线
 * 提供组件间的解耦通信
 */
export class EventBus {
    private static _instance: EventBus | null = null;
    private _events: Map<string, EventListener[]> = new Map();
    private _listenerIdCounter: number = 0;
    private _debug: boolean = false;

    /**
     * 获取单例
     */
    static getInstance(): EventBus {
        if (!EventBus._instance) {
            EventBus._instance = new EventBus();
        }
        return EventBus._instance;
    }

    /**
     * 设置调试模式
     */
    setDebug(debug: boolean): void {
        this._debug = debug;
    }

    /**
     * 监听事件
     */
    on<T = any>(event: string, callback: EventCallback<T>, context?: any): string {
        if (!this._events.has(event)) {
            this._events.set(event, []);
        }

        const listenerId = this._generateListenerId();
        const listener: EventListener = {
            callback,
            context,
            once: false,
            id: listenerId
        };

        this._events.get(event)!.push(listener);

        if (this._debug) {
        }

        return listenerId;
    }

    /**
     * 一次性监听事件
     */
    once<T = any>(event: string, callback: EventCallback<T>, context?: any): string {
        if (!this._events.has(event)) {
            this._events.set(event, []);
        }

        const listenerId = this._generateListenerId();
        const listener: EventListener = {
            callback,
            context,
            once: true,
            id: listenerId
        };

        this._events.get(event)!.push(listener);

        if (this._debug) {
        }

        return listenerId;
    }

    /**
     * 取消监听
     */
    off(event: string, callback?: EventCallback, context?: any): boolean {
        const listeners = this._events.get(event);
        if (!listeners || listeners.length === 0) {
            return false;
        }

        const originalLength = listeners.length;

        if (callback) {
            // 根据回调和上下文移除
            this._events.set(
                event,
                listeners.filter(listener => {
                    const matchCallback = listener.callback === callback;
                    const matchContext = !context || listener.context === context;
                    return !(matchCallback && matchContext);
                })
            );
        } else {
            // 移除该事件的所有监听
            this._events.delete(event);
        }

        const removed = originalLength - (this._events.get(event)?.length || 0);
        if (this._debug && removed > 0) {
        }

        return removed > 0;
    }

    /**
     * 根据ID取消监听
     */
    offById(listenerId: string): boolean {
        for (const [event, listeners] of this._events.entries()) {
            const index = listeners.findIndex(l => l.id === listenerId);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (this._debug) {
                }
                return true;
            }
        }
        return false;
    }

    /**
     * 触发事件
     */
    emit<T = any>(event: string, data?: T): boolean {
        const listeners = this._events.get(event);
        if (!listeners || listeners.length === 0) {
            if (this._debug) {
            }
            return false;
        }

        if (this._debug) {
        }

        // 复制一份监听器列表，防止在回调中修改列表
        const listenersCopy = [...listeners];

        // 执行回调
        listenersCopy.forEach(listener => {
            try {
                if (listener.context) {
                    listener.callback.call(listener.context, data);
                } else {
                    listener.callback(data);
                }
            } catch (e) {
                LogService.error('EventBus', `事件回调执行失败 [${event}]:`, e);
            }
        });

        // 移除一次性监听器
        this._events.set(
            event,
            listeners.filter(listener => !listener.once)
        );

        return true;
    }

    /**
     * 检查是否有监听
     */
    has(event: string): boolean {
        const listeners = this._events.get(event);
        return listeners !== undefined && listeners.length > 0;
    }

    /**
     * 获取监听数量
     */
    listenerCount(event: string): number {
        return this._events.get(event)?.length || 0;
    }

    /**
     * 获取所有事件名
     */
    eventNames(): string[] {
        return Array.from(this._events.keys());
    }

    /**
     * 清除所有事件监听
     */
    clear(): void {
        this._events.clear();
        if (this._debug) {
        }
    }

    /**
     * 清除指定上下文的所有监听
     */
    clearByContext(context: any): void {
        let removedCount = 0;
        for (const [event, listeners] of this._events.entries()) {
            const originalLength = listeners.length;
            this._events.set(
                event,
                listeners.filter(listener => listener.context !== context)
            );
            removedCount += originalLength - (this._events.get(event)?.length || 0);
        }
        if (this._debug && removedCount > 0) {
        }
    }

    // ==================== 私有方法 ====================

    /**
     * 生成监听器ID
     */
    private _generateListenerId(): string {
        return `listener_${++this._listenerIdCounter}_${Date.now()}`;
    }
}

// ==================== 预定义事件常量 ====================

/**
 * 游戏事件
 */
export enum GameEvents {
    // 游戏流程事件
    GAME_START = 'game:start',
    GAME_END = 'game:end',
    GAME_PHASE_CHANGE = 'game:phase:change',
    
    // 玩家事件
    PLAYER_JOIN = 'player:join',
    PLAYER_LEAVE = 'player:leave',
    PLAYER_ACTION = 'player:action',
    PLAYER_TURN_START = 'player:turn:start',
    PLAYER_TURN_END = 'player:turn:end',
    
    // 卡牌事件
    DEAL_CARDS = 'cards:deal',
    COMMUNITY_CARDS = 'cards:community',
    
    // 底池事件
    POT_UPDATE = 'pot:update',
    
    // 结算事件
    SHOWDOWN = 'game:showdown',
    SETTLEMENT = 'game:settlement',
    
    // UI 事件
    UI_SHOW_PANEL = 'ui:panel:show',
    UI_HIDE_PANEL = 'ui:panel:hide',
    UI_BUTTON_CLICK = 'ui:button:click',
    
    // 网络事件
    NETWORK_CONNECTED = 'network:connected',
    NETWORK_DISCONNECTED = 'network:disconnected',
    NETWORK_ERROR = 'network:error',
    NETWORK_RECONNECT = 'network:reconnect'
}
