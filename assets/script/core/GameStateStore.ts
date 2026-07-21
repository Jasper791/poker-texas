import { LogService } from '../utils/LogService';

/**
 * 游戏阶段枚举
 */
export enum GamePhase {
    WAITING = 'waiting',           // 等待中
    PRE_FLOP = 'pre_flop',         // 翻牌前
    FLOP = 'flop',                 // 翻牌
    TURN = 'turn',                 // 转牌
    RIVER = 'river',               // 河牌
    SHOWDOWN = 'showdown',         // 摊牌
    FINISHED = 'finished'          // 结束
}

/**
 * 玩家状态
 */
export interface PlayerState {
    userId: number;
    nickname: string;
    seatIndex: number;
    chips: number;
    betAmount: number;
    isActive: boolean;
    isAI: boolean;
    isOnline: boolean;
    isReady: boolean;
    cards: number[];
}

/**
 * 游戏状态接口
 */
export interface GameState {
    roomId: number;
    phase: GamePhase;
    hostUserId: number;
    currentTurn: number;
    pot: number;
    maxPlayers: number;
    players: PlayerState[];
    communityCards: number[];
    buttonSeat: number;
    smallBlindSeat: number;
    bigBlindSeat: number;
    smallBlindAmount: number;
    bigBlindAmount: number;
    minRaiseAmount: number;
    isGameActive: boolean;
    lastUpdateTime: number;
}

/**
 * 状态变化监听器类型
 */
type StateListener = (newState: Readonly<GameState>, oldState: Readonly<GameState>) => void;

/**
 * 统一的游戏状态管理类
 * 实现单例模式，提供全局状态管理和监听能力
 */
export class GameStateStore {
    private static _instance: GameStateStore = null;
    private static _state: GameState = GameStateStore.createInitialState();
    private static _listeners: Map<string, Set<StateListener>> = new Map();
    private static _isUpdating: boolean = false;
    private static _history: GameState[] = [];
    private static _maxHistoryLength: number = 50;

    /**
     * 获取单例实例
     */
    public static get instance(): GameStateStore {
        if (!this._instance) {
            this._instance = new GameStateStore();
        }
        return this._instance;
    }

    /**
     * 创建初始状态
     */
    private static createInitialState(): GameState {
        return {
            roomId: 0,
            phase: GamePhase.WAITING,
            hostUserId: 0,
            currentTurn: 0,
            pot: 0,
            maxPlayers: 5,
            players: [],
            communityCards: [],
            buttonSeat: -1,
            smallBlindSeat: -1,
            bigBlindSeat: -1,
            smallBlindAmount: 10,
            bigBlindAmount: 20,
            minRaiseAmount: 20,
            isGameActive: false,
            lastUpdateTime: Date.now()
        };
    }

    /**
     * 获取当前状态（只读）
     */
    public static get state(): Readonly<GameState> {
        return this._state;
    }

    /**
     * 更新状态（部分更新）
     * @param partialState 部分状态对象
     * @param eventName 事件名称（用于触发特定监听器）
     */
    public static setState(partialState: Partial<GameState>, eventName: string = 'stateChanged'): void {
        if (this._isUpdating) {
            LogService.warn('GameStateStore', '状态更新正在进行中，忽略本次更新');
            return;
        }

        this._isUpdating = true;
        const oldState = { ...this._state };
        const newState = { ...this._state, ...partialState, lastUpdateTime: Date.now() };
        this._state = newState;

        // 保存到历史记录
        this.addToHistory(newState);

        // 触发监听器
        this.notify(eventName, newState, oldState);

        // 如果是全局状态变化，也触发 stateChanged
        if (eventName !== 'stateChanged') {
            this.notify('stateChanged', newState, oldState);
        }

        this._isUpdating = false;
    }

    /**
     * 批量更新状态（不触发中间事件）
     * @param updates 批量更新对象
     */
    public static batchUpdate(updates: Partial<GameState>): void {
        if (this._isUpdating) {
            LogService.warn('GameStateStore', '状态更新正在进行中，忽略本次批量更新');
            return;
        }

        this._isUpdating = true;
        const oldState = { ...this._state };
        const newState = { ...this._state, ...updates, lastUpdateTime: Date.now() };
        this._state = newState;

        this.addToHistory(newState);
        this.notify('stateChanged', newState, oldState);
        this._isUpdating = false;
    }

    /**
     * 重置为初始状态
     */
    public static reset(): void {
        const oldState = { ...this._state };
        const newState = this.createInitialState();
        this._state = newState;
        this._history = [];
        this.notify('reset', newState, oldState);
        this.notify('stateChanged', newState, oldState);
    }

    /**
     * 添加状态监听器
     * @param eventName 事件名称
     * @param listener 监听器函数
     */
    public static subscribe(eventName: string, listener: StateListener): () => void {
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, new Set());
        }
        this._listeners.get(eventName).add(listener);

        // 返回取消订阅函数
        return () => this.unsubscribe(eventName, listener);
    }

    /**
     * 移除状态监听器
     * @param eventName 事件名称
     * @param listener 监听器函数
     */
    public static unsubscribe(eventName: string, listener: StateListener): void {
        const listeners = this._listeners.get(eventName);
        if (listeners) {
            listeners.delete(listener);
            if (listeners.size === 0) {
                this._listeners.delete(eventName);
            }
        }
    }

    /**
     * 一次性监听器（触发后自动移除）
     * @param eventName 事件名称
     * @param listener 监听器函数
     */
    public static once(eventName: string, listener: StateListener): () => void {
        const onceListener: StateListener = (newState, oldState) => {
            listener(newState, oldState);
            this.unsubscribe(eventName, onceListener);
        };
        return this.subscribe(eventName, onceListener);
    }

    /**
     * 清空所有监听器
     */
    public static clearAllListeners(): void {
        this._listeners.clear();
    }

    /**
     * 触发事件通知
     */
    private static notify(eventName: string, newState: GameState, oldState: GameState): void {
        const listeners = this._listeners.get(eventName);
        if (!listeners || listeners.size === 0) {
            return;
        }

        listeners.forEach(listener => {
            try {
                listener(newState, oldState);
            } catch (error) {
                LogService.error('GameStateStore', `监听器执行失败 [${eventName}]:`, error);
            }
        });
    }

    /**
     * 添加到历史记录
     */
    private static addToHistory(state: GameState): void {
        this._history.push({ ...state });
        if (this._history.length > this._maxHistoryLength) {
            this._history.shift();
        }
    }

    /**
     * 获取历史记录
     */
    public static getHistory(): Readonly<GameState[]> {
        return this._history;
    }

    // ====== 便捷方法：常用状态更新 ======

    /**
     * 添加玩家
     */
    public static addPlayer(player: PlayerState): void {
        const players = [...this._state.players, player];
        this.setState({ players }, 'playerAdded');
    }

    /**
     * 移除玩家
     */
    public static removePlayer(userId: number): void {
        const players = this._state.players.filter(p => p.userId !== userId);
        this.setState({ players }, 'playerRemoved');
    }

    /**
     * 更新玩家信息
     */
    public static updatePlayer(userId: number, updates: Partial<PlayerState>): void {
        const players = this._state.players.map(p =>
            p.userId === userId ? { ...p, ...updates } : p
        );
        this.setState({ players }, 'playerUpdated');
    }

    /**
     * 获取玩家
     */
    public static getPlayer(userId: number): PlayerState | undefined {
        return this._state.players.find(p => p.userId === userId);
    }

    /**
     * 添加公共牌
     */
    public static addCommunityCard(card: number): void {
        const communityCards = [...this._state.communityCards, card];
        this.setState({ communityCards }, 'communityCardAdded');
    }

    /**
     * 清空公共牌
     */
    public static clearCommunityCards(): void {
        this.setState({ communityCards: [] }, 'communityCardsCleared');
    }

    /**
     * 更新奖池
     */
    public static updatePot(amount: number): void {
        this.setState({ pot: this._state.pot + amount }, 'potUpdated');
    }

    /**
     * 设置奖池
     */
    public static setPot(pot: number): void {
        this.setState({ pot }, 'potSet');
    }

    /**
     * 切换游戏阶段
     */
    public static setPhase(phase: GamePhase): void {
        this.setState({ phase }, 'phaseChanged');
    }

    /**
     * 设置当前回合玩家
     */
    public static setCurrentTurn(seatIndex: number): void {
        this.setState({ currentTurn: seatIndex }, 'turnChanged');
    }

    /**
     * 开始游戏
     */
    public static startGame(roomId: number, hostUserId: number): void {
        this.batchUpdate({
            roomId,
            hostUserId,
            phase: GamePhase.WAITING,
            isGameActive: true,
            pot: 0,
            communityCards: []
        });
        LogService.info('GameStateStore', `游戏已开始: 房间ID=${roomId}, 房主ID=${hostUserId}`);
    }

    /**
     * 结束游戏
     */
    public static endGame(): void {
        this.setState({
            phase: GamePhase.FINISHED,
            isGameActive: false
        }, 'gameEnded');
        LogService.info('GameStateStore', '游戏已结束');
    }

    /**
     * 导出状态（用于调试）
     */
    public static export(): string {
        return JSON.stringify(this._state, null, 2);
    }
}
