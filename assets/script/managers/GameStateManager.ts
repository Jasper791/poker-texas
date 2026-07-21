/**
 * 游戏状态管理器
 * 提供统一的游戏状态管理和状态变化通知机制
 * 采用单例模式，确保全局只有一个状态实例
 */
import { LogService } from '../utils/LogService';

export class GameStateManager {
    private static instance: GameStateManager;
    
    // 游戏状态接口
    private state: {
        phase: string;
        pot: number;
        sidePots: { amount: number; eligiblePlayers: number[] }[];
        currentTurn: number;
        players: any[];
        communityCards: number[];
        buttonSeat: number;
        smallBlind: number;
        bigBlind: number;
        lastRaiseAmount: number;
        currentBet: number;
        isProcessingAction: boolean;
        lastActionTimestamp: number;
    };

    // 状态变化监听器
    private listeners: Map<string, Set<(state: any) => void>> = new Map();

    private constructor() {
        this.state = this.createInitialState();
    }

    /**
     * 获取单例实例
     */
    static getInstance(): GameStateManager {
        if (!GameStateManager.instance) {
            GameStateManager.instance = new GameStateManager();
        }
        return GameStateManager.instance;
    }

    /**
     * 创建初始状态
     */
    private createInitialState() {
        return {
            phase: 'WAITING',
            pot: 0,
            sidePots: [],
            currentTurn: 0,
            players: [],
            communityCards: [],
            buttonSeat: 0,
            smallBlind: 50,
            bigBlind: 100,
            lastRaiseAmount: 0,
            currentBet: 0,
            isProcessingAction: false,
            lastActionTimestamp: 0
        };
    }

    /**
     * 获取当前状态（只读副本，防止外部直接修改）
     */
    getState(): Readonly<typeof this.state> {
        return { ...this.state };
    }

    /**
     * 更新状态（支持部分更新）
     */
    updateState(updates: Partial<typeof this.state>): void {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...updates };
        
        // 通知所有监听器
        this.notify('stateChanged', oldState);
        
        // 根据更新的字段触发特定事件
        if (updates.phase !== undefined && updates.phase !== oldState.phase) {
            this.notify('phaseChanged', oldState);
        }
        if (updates.pot !== undefined && updates.pot !== oldState.pot) {
            this.notify('potChanged', oldState);
        }
        if (updates.currentTurn !== undefined && updates.currentTurn !== oldState.currentTurn) {
            this.notify('turnChanged', oldState);
        }
        if (updates.players !== undefined) {
            this.notify('playersChanged', oldState);
        }
        if (updates.communityCards !== undefined) {
            this.notify('communityCardsChanged', oldState);
        }
    }

    /**
     * 重置状态
     */
    reset(): void {
        const oldState = { ...this.state };
        this.state = this.createInitialState();
        this.notify('stateReset', oldState);
    }

    /**
     * 订阅状态变化
     */
    subscribe(event: string, callback: (state: any) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    /**
     * 取消订阅
     */
    unsubscribe(event: string, callback: (state: any) => void): void {
        this.listeners.get(event)?.delete(callback);
    }

    /**
     * 通知所有监听器
     */
    private notify(event: string, oldState?: any): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback({
                        currentState: this.getState(),
                        oldState: oldState,
                        event: event
                    });
                } catch (error) {
                    LogService.error('GameStateManager', `状态监听器执行错误 (${event}): ${error}`);
                }
            });
        }
    }

    // ============================================
    // 便捷方法：游戏操作锁
    // ============================================

    /**
     * 检查是否可以执行操作（防止重复点击）
     * @param debounceMs 防抖时间（毫秒），默认500ms
     */
    canPerformAction(debounceMs: number = 500): boolean {
        if (this.state.isProcessingAction) {
            return false;
        }

        const now = Date.now();
        if (now - this.state.lastActionTimestamp < debounceMs) {
            return false;
        }

        return true;
    }

    /**
     * 开始执行操作（设置操作锁）
     */
    beginAction(): boolean {
        if (this.state.isProcessingAction) {
            return false;
        }
        this.state.isProcessingAction = true;
        this.state.lastActionTimestamp = Date.now();
        return true;
    }

    /**
     * 结束执行操作（释放操作锁）
     */
    endAction(): void {
        this.state.isProcessingAction = false;
    }

    // ============================================
    // 便捷方法：状态获取
    // ============================================

    /**
     * 获取游戏阶段
     */
    getPhase(): string {
        return this.state.phase;
    }

    /**
     * 设置游戏阶段
     */
    setPhase(phase: string): void {
        this.updateState({ phase });
    }

    /**
     * 获取底池
     */
    getPot(): number {
        return this.state.pot;
    }

    /**
     * 设置底池
     */
    setPot(pot: number): void {
        this.updateState({ pot });
    }

    /**
     * 获取边池
     */
    getSidePots(): { amount: number; eligiblePlayers: number[] }[] {
        return this.state.sidePots;
    }

    /**
     * 设置边池
     */
    setSidePots(sidePots: { amount: number; eligiblePlayers: number[] }[]): void {
        this.updateState({ sidePots });
    }

    /**
     * 获取当前回合玩家
     */
    getCurrentTurn(): number {
        return this.state.currentTurn;
    }

    /**
     * 设置当前回合玩家
     */
    setCurrentTurn(turn: number): void {
        this.updateState({ currentTurn: turn });
    }

    /**
     * 获取社区牌
     */
    getCommunityCards(): number[] {
        return [...this.state.communityCards];
    }

    /**
     * 设置社区牌
     */
    setCommunityCards(cards: number[]): void {
        this.updateState({ communityCards: [...cards] });
    }

    /**
     * 获取按钮位
     */
    getButtonSeat(): number {
        return this.state.buttonSeat;
    }

    /**
     * 设置按钮位
     */
    setButtonSeat(seat: number): void {
        this.updateState({ buttonSeat: seat });
    }

    /**
     * 获取玩家列表
     */
    getPlayers(): any[] {
        return [...this.state.players];
    }

    /**
     * 设置玩家列表
     */
    setPlayers(players: any[]): void {
        this.updateState({ players: [...players] });
    }

    /**
     * 获取小盲注
     */
    getSmallBlind(): number {
        return this.state.smallBlind;
    }

    /**
     * 设置小盲注
     */
    setSmallBlind(amount: number): void {
        this.updateState({ smallBlind: amount });
    }

    /**
     * 获取大盲注
     */
    getBigBlind(): number {
        return this.state.bigBlind;
    }

    /**
     * 设置大盲注
     */
    setBigBlind(amount: number): void {
        this.updateState({ bigBlind: amount });
    }

    /**
     * 获取当前下注
     */
    getCurrentBet(): number {
        return this.state.currentBet;
    }

    /**
     * 设置当前下注
     */
    setCurrentBet(bet: number): void {
        this.updateState({ currentBet: bet });
    }

    /**
     * 获取最后加注金额
     */
    getLastRaiseAmount(): number {
        return this.state.lastRaiseAmount;
    }

    /**
     * 设置最后加注金额
     */
    setLastRaiseAmount(amount: number): void {
        this.updateState({ lastRaiseAmount: amount });
    }
}
