/**
 * 游戏状态机基类
 * 提供统一的状态管理和转换机制
 */
export enum GameState {
    WAITING = 'WAITING',
    DEALING = 'DEALING',
    PREFLOP = 'PREFLOP',
    FLOP = 'FLOP',
    TURN = 'TURN',
    RIVER = 'RIVER',
    SHOWDOWN = 'SHOWDOWN',
    SETTLEMENT = 'SETTLEMENT'
}

export interface StateChangeInfo {
    previous: GameState;
    current: GameState;
}

export interface StateChangeCallback {
    onStateChange?: (info: StateChangeInfo) => void;
    onEnterState?: (state: GameState) => void;
    onExitState?: (state: GameState) => void;
}

export abstract class GameStateMachine {
    protected currentState: GameState = GameState.WAITING;
    protected callbacks: StateChangeCallback = {};
    protected stateHistory: GameState[] = [];
    protected isTransitioning: boolean = false;

    constructor(callbacks?: StateChangeCallback) {
        if (callbacks) {
            this.callbacks = callbacks;
        }
    }

    getCurrentState(): GameState {
        return this.currentState;
    }

    getPreviousState(): GameState | null {
        return this.stateHistory.length > 0 ? this.stateHistory[this.stateHistory.length - 1] : null;
    }

    getStateHistory(): GameState[] {
        return [...this.stateHistory];
    }

    transitionTo(state: GameState): boolean {
        if (this.isTransitioning) {
            return false;
        }

        if (!this.canTransition(state)) {
            return false;
        }

        this.isTransitioning = true;
        
        const previousState = this.currentState;
        
        // 触发退出回调
        this.callbacks.onExitState?.(previousState);
        
        // 记录历史
        this.stateHistory.push(this.currentState);
        
        // 更新状态
        this.currentState = state;
        
        // 触发进入回调
        this.callbacks.onEnterState?.(state);
        
        // 触发状态变更回调
        this.callbacks.onStateChange?.({
            previous: previousState,
            current: state
        });
        
        this.isTransitioning = false;
        return true;
    }

    canTransition(targetState: GameState): boolean {
        const validTransitions = this.getValidTransitions();
        const transitions = validTransitions[this.currentState];
        // ⚠️ [修复] 使用 indexOf 替代 includes，兼容 ES5 环境
        return transitions ? transitions.indexOf(targetState) !== -1 : false;
    }

    reset(): void {
        this.currentState = GameState.WAITING;
        this.stateHistory = [];
        this.isTransitioning = false;
    }

    isInGamePhase(): boolean {
        const gamePhases = [GameState.PREFLOP, GameState.FLOP, GameState.TURN, GameState.RIVER];
        // ⚠️ [修复] 使用 indexOf 替代 includes，兼容 ES5 环境
        return gamePhases.indexOf(this.currentState) !== -1;
    }

    isSettlementPhase(): boolean {
        return this.currentState === GameState.SETTLEMENT;
    }

    isShowdownPhase(): boolean {
        return this.currentState === GameState.SHOWDOWN;
    }

    protected abstract getValidTransitions(): Record<GameState, GameState[]>;
}