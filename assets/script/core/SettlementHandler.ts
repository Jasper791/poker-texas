import { LogService } from '../utils/LogService';
/**
 * 结算处理器
 * 负责处理游戏结算逻辑，包括：
 * - 更新游戏状态
 * - 显示玩家手牌和牌型
 * - 计算赢家
 * - 显示胜利结果
 */
import { Label, Node, Prefab } from 'cc';
import { PlayerManager } from '../managers/PlayerManager';
import { CardManager } from '../managers/CardManager';
import { GameManager } from '../managers/GameManager';
import { UIManager } from '../managers/UIManager';

export interface SettlementData {
    status?: string;
    communityCards?: number[];
    totalPot?: number;
    mainPot?: number;
    sidePots?: any[];
    winners?: number[];
    players?: PlayerSettlementData[];
}

export interface PlayerSettlementData {
    userId?: number;
    seatIndex: number;
    nickname?: string;
    isFold?: boolean;
    holeCards?: number[];
    handCards?: number[];
    handTypeName?: string;
    handValue?: number;
    gameCoin?: number;
    lastAction?: string;
    lastActionBet?: number;
}

export interface SettlementResult {
    winnerIndex: number;
    winnerNickname: string;
    handTypeName: string;
    handStrength: number;
    pot: number;
}

export class SettlementHandler {
    
    private _playerManager: PlayerManager;
    private _cardManager: CardManager;
    private _gameManager: GameManager;
    private _uiManager: UIManager;
    
    // 结算回调
    private _onSettlementComplete: ((result: SettlementResult) => void) | null = null;
    private _onPlayerConfirmed: ((playerIndex: number) => void) | null = null;
    
    // 确认状态
    private _confirmationPending: boolean = false;
    private _confirmedPlayers: Set<number> = new Set();
    
    constructor(
        playerManager: PlayerManager,
        cardManager: CardManager,
        gameManager: GameManager,
        uiManager: UIManager
    ) {
        this._playerManager = playerManager;
        this._cardManager = cardManager;
        this._gameManager = gameManager;
        this._uiManager = uiManager;
    }
    
    /**
     * 设置结算完成回调
     */
    setOnSettlementComplete(callback: (result: SettlementResult) => void) {
        this._onSettlementComplete = callback;
    }
    
    /**
     * 设置玩家确认回调
     */
    setOnPlayerConfirmed(callback: (playerIndex: number) => void) {
        this._onPlayerConfirmed = callback;
    }
    
    /**
     * 处理游戏结算
     */
    handleGameSettlement(
        data: SettlementData,
        playersContainer: Node,
        potLabel: Label,
        winPanelPrefab: Prefab,
        rootNode: Node,
        showActivePlayersCards: () => Promise<void>,
        getOnlyActivePlayer: () => number
    ): Promise<SettlementResult> {
        return new Promise((resolve) => {
            
            // 1. 更新游戏状态
            if (data.status !== undefined) {
            }
            
            // 2. 更新公共牌
            if (data.communityCards !== undefined) {
                this._cardManager.setCommunityCards(data.communityCards);
            }
            
            // 3. 更新底池
            const potValue = data.totalPot !== undefined ? data.totalPot : data.mainPot;
            if (potValue !== undefined) {
                this._gameManager.setMainPot(potValue);
                this._uiManager.updatePotDisplay(potLabel, potValue);
            }
            
            if (data.sidePots && Array.isArray(data.sidePots)) {
                this._gameManager.setSidePots(data.sidePots);
            }
            
            // 4. 获取玩家数据
            const winners = data.winners || [];
            const players = data.players || [];
            
            // 5. 保存服务端发送的玩家数据
            this._gameManager.updatePlayersFromServer(players);
            
            // 6. 更新玩家的弃牌状态
            for (const player of players) {
                const seatIndex = player.seatIndex;
                if (player.isFold) {
                    this._playerManager.setPlayerFolded(seatIndex);
                }
            }
            
            // 7. 显示活跃玩家的手牌
            Promise.resolve(showActivePlayersCards ? showActivePlayersCards() : undefined).then(() => {
                // 8. 显示所有活跃玩家的牌型
                this._showPlayerHandTypes(players, playersContainer);
                
                // 9. 获取赢家信息
                if (winners.length === 0) {
                    LogService.warn('SettlementHandler', '没有赢家信息，跳过胜利面板显示');
                    resolve(null);
                    return;
                }
                
                // 10. 计算胜利者信息
                const result = this._calculateWinnerInfo(
                    winners, 
                    players, 
                    data.communityCards,
                    getOnlyActivePlayer
                );
                
                // 11. 初始化确认状态
                this._confirmationPending = true;
                this._confirmedPlayers.clear();
                
                // 12. 清空底池、手牌和公牌
                this._gameManager.setMainPot(0);
                this._gameManager.setPot(0);
                this._uiManager.updatePotDisplay(potLabel, 0);
                
                // 13. 清空手牌和公牌显示
                this._uiManager.cleanupCards();
                
                // 14. 获取真实玩家的座位号
                const playerSeat = this._playerManager.getPlayerSeat();
                
                // 15. 显示胜利结果面板
                this._uiManager.showWinnerResultWithConfirmation(
                    winPanelPrefab,
                    rootNode,
                    playersContainer,
                    result.winnerIndex,
                    result.handTypeName,
                    result.handStrength,
                    result.pot,
                    (confirmedPlayer: number) => {
                        this._onPlayerConfirmedCallback(confirmedPlayer);
                    },
                    playerSeat,
                    result.winnerNickname
                );
                
                // 16. AI玩家自动确认
                this._autoConfirmAIPlayers();
                
                // 17. 触发完成回调
                if (this._onSettlementComplete) {
                    this._onSettlementComplete(result);
                }
                
                resolve(result);
            });
        });
    }
    
    /**
     * 显示玩家牌型
     */
    private _showPlayerHandTypes(players: PlayerSettlementData[], playersContainer: Node) {
        for (const player of players) {
            const seatIndex = player.seatIndex;
            const nickname = player.nickname || `Player_${seatIndex}`;
            
            if (player.isFold) {
                // 弃牌玩家不显示牌型，清空action_label
                this._playerManager.showPlayerActionNearAvatar(
                    playersContainer,
                    seatIndex,
                    '',
                    0,
                    nickname
                );
                continue;
            }
            
            // 优先使用服务端发送的牌型信息
            let handTypeName = player.handTypeName || '高牌';
            let handStrength = player.handValue || 0;
        }
    }
    
    /**
     * 计算赢家信息
     */
    private _calculateWinnerInfo(
        winners: number[],
        players: PlayerSettlementData[],
        communityCards: number[],
        getOnlyActivePlayer: () => number
    ): SettlementResult {
        let winnerIndex = -1;
        let handTypeName = '高牌';
        let handStrength = 0;
        
        // 遍历赢家列表，找到第一个赢家
        for (const winnerUserId of winners) {
            for (const player of players) {
                if (player.userId === winnerUserId) {
                    winnerIndex = player.seatIndex;
                    
                    // 直接使用服务端返回的牌型信息
                    if (player.handTypeName && player.handValue !== undefined && player.handValue !== null) {
                        // ✅ [修改] 只使用服务端返回的牌型信息，不进行本地计算
                        handTypeName = player.handTypeName;
                        handStrength = player.handValue;
                    } else {
                        LogService.warn('SettlementHandler', `[WARNING] 服务端没有发送玩家 ${player.userId} 的牌型信息`);
                    }
                    break;
                }
            }
            if (winnerIndex !== -1) break;
        }
        
        // 如果没找到赢家，但有活跃玩家，使用第一个活跃玩家
        if (winnerIndex === -1) {
            winnerIndex = getOnlyActivePlayer();
        }
        
        // 获取胜利者昵称
        const winnerNickname = this._gameManager.getPlayerNickname(winnerIndex);
        
        return {
            winnerIndex,
            winnerNickname,
            handTypeName,
            handStrength,
            pot: 0 // 底池在调用时传入
        };
    }
    
    /**
     * 玩家确认回调
     */
    private _onPlayerConfirmedCallback(playerIndex: number) {
        
        if (this._onPlayerConfirmed) {
            this._onPlayerConfirmed(playerIndex);
        }
    }
    
    /**
     * AI玩家自动确认
     */
    private _autoConfirmAIPlayers() {
        const playersNum = this._playerManager.getPlayersNum();
        
        for (let i = 0; i < playersNum; i++) {
            if (this._playerManager.isAIPlayer(i) && this._gameManager.getPlayerChips(i) > 0) {
                setTimeout(() => {
                    if (this._confirmationPending) {
                        this._onPlayerConfirmedCallback(i);
                    }
                }, 1000 + Math.random() * 1000);
            }
        }
    }
    
    /**
     * 检查是否正在等待确认
     */
    isConfirmationPending(): boolean {
        return this._confirmationPending;
    }
    
    /**
     * 设置确认状态
     */
    setConfirmationPending(pending: boolean) {
        this._confirmationPending = pending;
    }
    
    /**
     * 清除所有确认状态
     */
    clearConfirmations() {
        this._confirmedPlayers.clear();
        this._confirmationPending = false;
    }
    
    /**
     * 玩家确认
     */
    confirmPlayer(playerIndex: number) {
        this._confirmedPlayers.add(playerIndex);
    }
    
    /**
     * 检查玩家是否已确认
     */
    isPlayerConfirmed(playerIndex: number): boolean {
        return this._confirmedPlayers.has(playerIndex);
    }
    
    /**
     * 获取已确认的玩家数量
     */
    getConfirmedCount(): number {
        return this._confirmedPlayers.size;
    }
    
    /**
     * 获取牌型名称
     */
    getHandTypeName(type: number): string {
        return this._gameManager.getHandTypeName(type);
    }
}
