export enum ActionType {
    FOLD = 'FOLD',
    CALL = 'CALL',
    RAISE = 'RAISE',
    CHECK = 'CHECK',
    BET = 'BET',
    ALLIN = 'ALLIN',
    ALL_IN = 'ALL_IN'
}

export interface ActionExecutorConfig {
    playerManager: any;
    uiManager: any;
    gameManager: any;
}

export abstract class PlayerActionExecutor {
    protected playerManager: any;
    protected uiManager: any;
    protected gameManager: any;
    
    constructor(config: ActionExecutorConfig) {
        this.playerManager = config.playerManager;
        this.uiManager = config.uiManager;
        this.gameManager = config.gameManager;
    }
    
    executeAction(actionType: ActionType, amount?: number): void {
        switch (actionType) {
            case ActionType.FOLD:
                this.executeFold();
                break;
            case ActionType.CALL:
                this.executeCall();
                break;
            case ActionType.RAISE:
                this.executeRaise(amount || 0);
                break;
            case ActionType.CHECK:
                this.executeCheck();
                break;
            case ActionType.BET:
                this.executeRaise(amount || 0);
                break;
            case ActionType.ALLIN:
            case ActionType.ALL_IN:
                this.executeAllIn();
                break;
        }
    }
    
    protected abstract executeFold(): void;
    protected abstract executeCall(): void;
    protected abstract executeRaise(amount: number): void;
    protected abstract executeCheck(): void;
    protected abstract executeAllIn(): void;
    
    protected getPlayerSeat(): number {
        return this.playerManager.getPlayerSeat();
    }
    
    protected getPlayerNickname(seatIndex: number): string {
        return this.playerManager.getPlayerNickname(seatIndex);
    }
    
    protected playPlayerAction(seatIndex: number, action: string, amount: number, nickname: string): void {
        this.playerManager.playPlayerAction(seatIndex, action, amount, nickname);
    }
    
    protected updatePlayerChips(seatIndex: number, chips: number): void {
        this.gameManager.setPlayerChips(seatIndex, chips);
        this.uiManager.updateAvatarAmount(this.playerManager.getPlayersContainer(), seatIndex, chips);
    }
    
    protected getPlayerChips(seatIndex: number): number {
        return this.gameManager.getPlayerChips(seatIndex);
    }
}