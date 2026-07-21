import { ActionType, PlayerActionResponse } from '../types';
import { LogService } from '../utils/LogService';

export interface PlayerActionResult {
    success: boolean;
    error?: string;
}

export interface ActionValidationResult {
    valid: boolean;
    error?: string;
}

export class PlayerActionService {
    private static _instance: PlayerActionService | null = null;

    private _isProcessing: boolean = false;
    private _lastActionTime: number = 0;
    private _actionCooldown: number = 500;

    static getInstance(): PlayerActionService {
        if (!PlayerActionService._instance) {
            PlayerActionService._instance = new PlayerActionService();
        }
        return PlayerActionService._instance;
    }

    private constructor() {}

    async executeAction(
        actionType: ActionType | string,
        amount: number = 0,
        playerChips: number = 0,
        currentBet: number = 0,
        minBetAmount: number = 0
    ): Promise<PlayerActionResult> {
        if (this._isProcessing) {
            LogService.warn('PlayerActionService', 'Action already processing');
            return { success: false, error: 'Action already processing' };
        }

        const validation = this.validateAction(actionType, amount, playerChips, currentBet, minBetAmount);
        if (!validation.valid) {
            LogService.warn('PlayerActionService', `Invalid action: ${validation.error}`);
            return { success: false, error: validation.error };
        }

        this._isProcessing = true;
        
        // ✅ [修复] 添加超时保护，防止 _isProcessing 永久为 true
        const timeoutHandle = setTimeout(() => {
            if (this._isProcessing) {
                LogService.warn('PlayerActionService', 'Action timeout, resetting processing state');
                this._isProcessing = false;
            }
        }, 5000); // 5秒超时

        try {
            LogService.info('PlayerActionService', `Executing action: ${actionType}`, { amount });

            if (Date.now() - this._lastActionTime < this._actionCooldown) {
                LogService.warn('PlayerActionService', 'Action cooldown not elapsed');
                return { success: false, error: 'Action cooldown not elapsed' };
            }

            await this.performAction(actionType, amount);

            this._lastActionTime = Date.now();
            this._isProcessing = false;
            clearTimeout(timeoutHandle);

            LogService.info('PlayerActionService', `Action executed successfully: ${actionType}`);
            return { success: true };
        } catch (error) {
            this._isProcessing = false;
            clearTimeout(timeoutHandle);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            LogService.error('PlayerActionService', `Action execution failed: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    validateAction(
        actionType: ActionType | string,
        amount: number,
        playerChips: number,
        currentBet: number,
        minBetAmount: number = 0
    ): ActionValidationResult {
        switch (actionType) {
            case ActionType.FOLD:
            case ActionType.CHECK:
                return { valid: true };

            case ActionType.CALL:
                if (amount <= 0) {
                    return { valid: false, error: 'Call amount must be positive' };
                }
                if (amount > playerChips) {
                    return { valid: false, error: 'Not enough chips to call' };
                }
                return { valid: true };

            case ActionType.BET:
            case ActionType.RAISE:
                if (amount <= 0) {
                    return { valid: false, error: 'Bet amount must be positive' };
                }
                if (amount > playerChips) {
                    return { valid: false, error: 'Not enough chips to raise' };
                }
                if (minBetAmount > 0 && amount < minBetAmount) {
                    return { valid: false, error: `Bet amount must be at least ${minBetAmount}` };
                }
                return { valid: true };

            case ActionType.ALLIN:
            case ActionType.ALL_IN:
                if (playerChips <= 0) {
                    return { valid: false, error: 'No chips to go all-in' };
                }
                return { valid: true };

            default:
                return { valid: false, error: `Unknown action type: ${actionType}` };
        }
    }

    private async performAction(actionType: ActionType | string, amount: number): Promise<void> {
        
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, 100);
        });
    }

    calculateCallAmount(currentBet: number, playerCurrentBet: number): number {
        return Math.max(0, currentBet - playerCurrentBet);
    }

    calculateRaiseRange(
        currentBet: number,
        playerCurrentBet: number,
        playerChips: number,
        bigBlind: number
    ): { min: number, max: number } {
        const callAmount = this.calculateCallAmount(currentBet, playerCurrentBet);
        const minRaise = callAmount + bigBlind;
        const maxRaise = playerChips;

        return {
            min: Math.min(minRaise, maxRaise),
            max: maxRaise
        };
    }

    reset(): void {
        this._isProcessing = false;
        this._lastActionTime = 0;
    }

    isProcessing(): boolean {
        return this._isProcessing;
    }

    setActionCooldown(cooldown: number): void {
        this._actionCooldown = cooldown;
    }
}