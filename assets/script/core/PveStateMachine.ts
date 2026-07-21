/**
 * PVE 游戏状态机
 * PVE 模式专用，与 PVP 状态机完全独立
 */
import { GameState, StateChangeCallback, GameStateMachine } from './GameStateMachine';

export class PveStateMachine extends GameStateMachine {
    private static instance: PveStateMachine | null = null;

    private constructor(callbacks?: StateChangeCallback) {
        super(callbacks);
    }

    static getInstance(callbacks?: StateChangeCallback): PveStateMachine {
        if (!PveStateMachine.instance) {
            PveStateMachine.instance = new PveStateMachine(callbacks);
        }
        return PveStateMachine.instance;
    }

    static destroyInstance(): void {
        PveStateMachine.instance = null;
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

    startNewRound(): boolean {
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
}