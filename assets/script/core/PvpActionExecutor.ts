import { PlayerActionExecutor, ActionType, ActionExecutorConfig } from './PlayerActionExecutor';
import { LogService } from '../utils/LogService';

export interface PvpActionExecutorConfig extends ActionExecutorConfig {
    gameFlowController: any;
    pendingActions: Map<number, { action: string; amount: number; nickname: string }>;
}

export class PvpActionExecutor extends PlayerActionExecutor {
    private gameFlowController: any;
    private pendingActions: Map<number, { action: string; amount: number; nickname: string }>;
    
    constructor(config: PvpActionExecutorConfig) {
        super(config);
        this.gameFlowController = config.gameFlowController;
        this.pendingActions = config.pendingActions;
    }
    
    protected executeFold(): void {
        if (this.gameFlowController?.isActionProcessing()) {
            return;
        }
        
        this.gameFlowController?.setActionProcessing(true);
        
        const playerSeat = this.getPlayerSeat();
        
        this.playPlayerAction(playerSeat, ActionType.FOLD, 0, this.getPlayerNickname(playerSeat));
        
        this.gameFlowController?.setActionProcessing(false);
    }
    
    protected executeCall(): void {
        if (this.gameFlowController?.isActionProcessing()) {
            return;
        }
        
        this.gameFlowController?.setActionProcessing(true);
        
        const playerSeat = this.getPlayerSeat();
        const amount = this.gameFlowController?.getAmountFromServerActions(ActionType.CALL) || 0;
        
        this.playPlayerAction(playerSeat, ActionType.CALL, amount, this.getPlayerNickname(playerSeat));
        
        const currentChips = this.getPlayerChips(playerSeat);
        const newChips = Math.max(0, currentChips - amount);
        this.updatePlayerChips(playerSeat, newChips);
        
        this.pendingActions.set(playerSeat, {
            action: 'call',
            amount: amount,
            nickname: this.getPlayerNickname(playerSeat)
        });
        
        this.gameFlowController?.setActionProcessing(false);
    }
    
    protected executeRaise(amount: number): void {
        if (this.gameFlowController?.isActionProcessing()) {
            return;
        }
        
        this.gameFlowController?.setActionProcessing(true);
        
        const playerSeat = this.getPlayerSeat();
        
        this.playPlayerAction(playerSeat, ActionType.RAISE, amount, this.getPlayerNickname(playerSeat));
        
        const currentChips = this.getPlayerChips(playerSeat);
        const newChips = Math.max(0, currentChips - amount);
        this.updatePlayerChips(playerSeat, newChips);
        
        this.pendingActions.set(playerSeat, {
            action: 'raise',
            amount: amount,
            nickname: this.getPlayerNickname(playerSeat)
        });
        
        this.gameFlowController?.setActionProcessing(false);
    }
    
    protected executeCheck(): void {
        if (this.gameFlowController?.isActionProcessing()) {
            return;
        }
        
        this.gameFlowController?.setActionProcessing(true);
        
        const playerSeat = this.getPlayerSeat();
        const amount = this.gameFlowController?.getAmountFromServerActions(ActionType.CHECK) || 0;
        
        this.playPlayerAction(playerSeat, ActionType.CHECK, amount, this.getPlayerNickname(playerSeat));
        
        this.pendingActions.set(playerSeat, {
            action: 'check',
            amount: amount,
            nickname: this.getPlayerNickname(playerSeat)
        });
        
        this.gameFlowController?.setActionProcessing(false);
    }
    
    protected executeAllIn(): void {
        if (this.gameFlowController?.isActionProcessing()) {
            return;
        }
        
        this.gameFlowController?.setActionProcessing(true);
        
        const playerSeat = this.getPlayerSeat();
        const currentChips = this.getPlayerChips(playerSeat);
        
        this.playPlayerAction(playerSeat, ActionType.ALLIN, currentChips, this.getPlayerNickname(playerSeat));
        
        this.updatePlayerChips(playerSeat, 0);
        
        this.pendingActions.set(playerSeat, {
            action: 'allin',
            amount: currentChips,
            nickname: this.getPlayerNickname(playerSeat)
        });
        
        this.gameFlowController?.setActionProcessing(false);
    }
}