/**
 * 结算服务
 * 负责游戏结算相关的业务逻辑
 */
import { LogService } from '../utils/LogService';
import { GameManager } from '../managers/GameManager';
import { PlayerManager } from '../managers/PlayerManager';

export class SettlementService {
    private _gameManager: GameManager;
    private _playerManager: PlayerManager;

    constructor(gameManager: GameManager, playerManager: PlayerManager) {
        this._gameManager = gameManager;
        this._playerManager = playerManager;
    }

    /**
     * 处理结算通知
     * @param winnerInfo 胜利者信息
     * @param potAmount 奖池金额
     */
    handleSettlement(winnerInfo: any, potAmount: number): void {
        LogService.info('SettlementService', `游戏结算: 奖池${potAmount}, 胜利者${JSON.stringify(winnerInfo)}`);
        // 这里可以添加结算相关的业务逻辑
    }

    /**
     * 获取当前游戏状态
     */
    getGameState(): any {
        return {
            // ⚠️ [修复] GameManager 没有 getMainPot 方法，使用 getPot 替代
            mainPot: this._gameManager.getPot(),
            sidePots: this._gameManager.getSidePots(),
            currentBet: this._gameManager.getCurrentBet()
        };
    }

    /**
     * 计算玩家总投入
     * @param seatIndex 玩家座位索引
     * @returns 总投入金额
     */
    getPlayerTotalBet(seatIndex: number): number {
        return this._gameManager.getPlayerBet(seatIndex);
    }

    /**
     * 检查游戏是否可以开始下一局
     */
    canStartNewGame(): boolean {
        const playerSeat = this._playerManager.getPlayerSeat();
        const chips = this._gameManager.getPlayerChips(playerSeat);
        return chips > 0;
    }

    /**
     * 重置游戏状态
     */
    resetGameState(): void {
        this._gameManager.setMainPot(0);
        this._gameManager.setSidePots([]);
        this._gameManager.setCurrentBet(0);
    }
}
