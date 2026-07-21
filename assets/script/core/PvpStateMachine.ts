/**
 * PVP 游戏状态机
 * PVP 模式专用，与 PVE 状态机完全独立
 * PVP 模式有额外的房间管理和玩家等待状态
 */
import { GameState, StateChangeCallback, GameStateMachine } from './GameStateMachine';

export enum PvpRoomState {
    CREATED = 'CREATED',
    JOINING = 'JOINING',
    WAITING = 'WAITING',
    READY = 'READY',
    PLAYING = 'PLAYING',
    ENDED = 'ENDED'
}

export interface PvpStateChangeInfo {
    previous: GameState;
    current: GameState;
    roomState: PvpRoomState;
}

export interface PvpStateChangeCallback extends StateChangeCallback {
    onRoomStateChange?: (state: PvpRoomState) => void;
}

export class PvpStateMachine extends GameStateMachine {
    private static instance: PvpStateMachine | null = null;
    
    private roomState: PvpRoomState = PvpRoomState.CREATED;
    private roomStateHistory: PvpRoomState[] = [];

    private constructor(callbacks?: PvpStateChangeCallback) {
        super(callbacks);
    }

    static getInstance(callbacks?: PvpStateChangeCallback): PvpStateMachine {
        if (!PvpStateMachine.instance) {
            PvpStateMachine.instance = new PvpStateMachine(callbacks);
        }
        return PvpStateMachine.instance;
    }

    static destroyInstance(): void {
        PvpStateMachine.instance = null;
    }

    protected getValidTransitions(): Record<GameState, GameState[]> {
        return {
            [GameState.WAITING]: [GameState.DEALING],
            [GameState.DEALING]: [GameState.PREFLOP],
            [GameState.PREFLOP]: [GameState.FLOP, GameState.SHOWDOWN],
            [GameState.FLOP]: [GameState.TURN, GameState.SHOWDOWN],
            [GameState.TURN]: [GameState.RIVER, GameState.SHOWDOWN],
            [GameState.RIVER]: [GameState.SHOWDOWN],
            [GameState.SHOWDOWN]: [GameState.SETTLEMENT],
            [GameState.SETTLEMENT]: [GameState.WAITING, GameState.DEALING]
        };
    }

    getRoomState(): PvpRoomState {
        return this.roomState;
    }

    getRoomStateHistory(): PvpRoomState[] {
        return [...this.roomStateHistory];
    }

    setRoomState(state: PvpRoomState): void {
        const previousState = this.roomState;
        this.roomStateHistory.push(this.roomState);
        this.roomState = state;
        
        const callbacks = this.callbacks as PvpStateChangeCallback;
        callbacks.onRoomStateChange?.(state);
    }

    isRoomPlaying(): boolean {
        return this.roomState === PvpRoomState.PLAYING;
    }

    isRoomReady(): boolean {
        return this.roomState === PvpRoomState.READY;
    }

    reset(): void {
        super.reset();
        this.roomState = PvpStateMachine.CREATED;
        this.roomStateHistory = [];
    }

    startNewRound(): boolean {
        this.setRoomState(PvpRoomState.PLAYING);
        return this.transitionTo(GameState.DEALING);
    }

    startPreflop(): boolean {
        return this.transitionTo(GameState.PREFLOP);
    }

    startFlop(): boolean {
        return this.transitionTo(GameState.FLOP);
    }

    startTurn(): boolean {
        return this.transitionTo(GameState.TURN);
    }

    startRiver(): boolean {
        return this.transitionTo(GameState.RIVER);
    }

    startShowdown(): boolean {
        return this.transitionTo(GameState.SHOWDOWN);
    }

    startSettlement(): boolean {
        return this.transitionTo(GameState.SETTLEMENT);
    }

    returnToWaiting(): boolean {
        return this.transitionTo(GameState.WAITING);
    }

    static readonly CREATED = PvpRoomState.CREATED;
    static readonly JOINING = PvpRoomState.JOINING;
    static readonly WAITING = PvpRoomState.WAITING;
    static readonly READY = PvpRoomState.READY;
    static readonly PLAYING = PvpRoomState.PLAYING;
    static readonly ENDED = PvpRoomState.ENDED;
}