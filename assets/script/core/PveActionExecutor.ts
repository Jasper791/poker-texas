import { PlayerActionExecutor, ActionType, ActionExecutorConfig } from './PlayerActionExecutor';
import { LogService } from '../utils/LogService';

export interface PveActionExecutorConfig extends ActionExecutorConfig {
    gameFlowController: any;
    gameNetwork?: any;
    useNetworkMode?: boolean;
}

export class PveActionExecutor extends PlayerActionExecutor {
    private gameFlowController: any;
    
    constructor(config: PveActionExecutorConfig) {
        super(config);
        this.gameFlowController = config.gameFlowController;
    }
    
    protected executeFold(): void {
        if (this.gameFlowController?.isActionProcessing()) {
            return;
        }
        
        this.gameFlowController?.setActionProcessing(true);
        
        this.playPlayerAction(
            this.getPlayerSeat(),
            ActionType.FOLD,
            0,
            this.getPlayerNickname(this.getPlayerSeat())
        );
        
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
        
        this.gameFlowController?.setActionProcessing(false);
    }
    
    protected executeCheck(): void {
        if (this.gameFlowController?.isActionProcessing()) {
            return;
        }
        
        this.gameFlowController?.setActionProcessing(true);
        
        const playerSeat = this.getPlayerSeat();
        
        this.playPlayerAction(playerSeat, ActionType.CHECK, 0, this.getPlayerNickname(playerSeat));
        
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
        
        this.gameFlowController?.setActionProcessing(false);
    }
}