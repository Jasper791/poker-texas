import { ActionType, PlayerInfo } from '../types';
import { LogService } from '../utils/LogService';

/**
 * AI 决策结果
 */
export interface AIDecisionResult {
    action: ActionType;
    amount: number;
    confidence: number;
    reasoning: string;
}

/**
 * AI 配置
 */
export interface AIConfig {
    thinkingTime: number;
    aggressionLevel: number;
    riskTolerance: number;
}

/**
 * AI 决策服务
 * 负责管理 AI 玩家的决策逻辑
 */
export class AIDecisionService {
    private static _instance: AIDecisionService | null = null;

    private _isThinking: boolean = false;
    private _aiConfig: AIConfig = {
        thinkingTime: 2000,
        aggressionLevel: 0.5,
        riskTolerance: 0.5
    };

    /**
     * 获取单例
     */
    static getInstance(): AIDecisionService {
        if (!AIDecisionService._instance) {
            AIDecisionService._instance = new AIDecisionService();
        }
        return AIDecisionService._instance;
    }

    /**
     * 私有构造函数
     */
    private constructor() {}

    /**
     * 配置 AI
     */
    configure(config: Partial<AIConfig>): void {
        this._aiConfig = { ...this._aiConfig, ...config };
    }

    /**
     * 执行 AI 回合
     */
    async executeAITurn(playerInfo: PlayerInfo, gameState: any): Promise<AIDecisionResult> {
        if (this._isThinking) {
            LogService.warn('AIDecisionService', 'AI already thinking');
            return this.createDefaultDecision();
        }

        this._isThinking = true;

        try {
            LogService.info('AIDecisionService', `AI thinking for player ${playerInfo.seatIndex}`);

            // 模拟 AI 思考
            await this.simulateThinking();

            // 计算决策
            const decision = this.calculateDecision(playerInfo, gameState);

            LogService.info('AIDecisionService', `AI decision: ${decision.action}`, decision);
            
            return decision;
        } finally {
            this._isThinking = false;
        }
    }

    /**
     * 模拟 AI 思考
     */
    private simulateThinking(): Promise<void> {
        return new Promise((resolve) => {
            const thinkingTime = this._aiConfig.thinkingTime + Math.random() * 1000;
            setTimeout(resolve, thinkingTime);
        });
    }

    /**
     * 计算决策
     */
    private calculateDecision(playerInfo: PlayerInfo, gameState: any): AIDecisionResult {
        const { communityCards, pot, currentBet, phase } = gameState;
        const { chips } = playerInfo;

        // 简单决策逻辑
        const action = this.decideAction(playerInfo, gameState);
        const amount = this.calculateAmount(action, playerInfo, gameState);

        return {
            action,
            amount,
            confidence: 0.7 + Math.random() * 0.3,
            reasoning: this.generateReasoning(action, playerInfo, gameState)
        };
    }

    /**
     * 决定动作
     */
    private decideAction(playerInfo: PlayerInfo, gameState: any): ActionType {
        const random = Math.random();
        const { currentBet } = gameState;

        // 如果没有下注，可以过牌或加注
        if (currentBet === 0) {
            if (random < 0.6) return ActionType.CHECK;
            if (random < 0.9) return ActionType.BET;
            return ActionType.ALLIN;
        }

        // 如果需要跟注
        const callAmount = this.calculateCallAmount(currentBet, 0);

        if (random < 0.4) return ActionType.FOLD;
        if (random < 0.8) return ActionType.CALL;
        if (random < 0.95) return ActionType.RAISE;
        return ActionType.ALLIN;
    }

    /**
     * 计算下注金额
     */
    private calculateAmount(action: ActionType, playerInfo: PlayerInfo, gameState: any): number {
        const { chips } = playerInfo;
        const { currentBet, pot } = gameState;

        switch (action) {
            case ActionType.FOLD:
            case ActionType.CHECK:
                return 0;

            case ActionType.CALL:
                return this.calculateCallAmount(currentBet, 0);

            case ActionType.BET:
            case ActionType.RAISE:
                const baseAmount = pot * this._aiConfig.aggressionLevel;
                return Math.min(Math.max(baseAmount, 10), chips);

            case ActionType.ALLIN:
            case ActionType.ALL_IN:
                return chips;

            default:
                return 0;
        }
    }

    /**
     * 计算跟注金额
     */
    private calculateCallAmount(currentBet: number, playerBet: number): number {
        return Math.max(0, currentBet - playerBet);
    }

    /**
     * 生成决策理由
     */
    private generateReasoning(action: ActionType, playerInfo: PlayerInfo, gameState: any): string {
        const reasons: string[] = [];

        if (playerInfo.chips < 100) {
            reasons.push('Low chip count');
        }

        if (gameState.phase === 'FLOP' && gameState.communityCards?.length > 0) {
            reasons.push('Post-flop decision');
        }

        if (this._aiConfig.aggressionLevel > 0.7) {
            reasons.push('Aggressive strategy');
        }

        return reasons.length > 0 ? reasons.join(', ') : 'Standard play';
    }

    /**
     * 创建默认决策
     */
    private createDefaultDecision(): AIDecisionResult {
        return {
            action: ActionType.FOLD,
            amount: 0,
            confidence: 0,
            reasoning: 'Default fold due to error'
        };
    }

    /**
     * 重置
     */
    reset(): void {
        this._isThinking = false;
    }

    /**
     * 是否正在思考
     */
    isThinking(): boolean {
        return this._isThinking;
    }
}
