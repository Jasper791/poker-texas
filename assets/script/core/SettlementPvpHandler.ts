import { LogService } from '../utils/LogService';
import { SoundManager } from '../managers/SoundManager';
import { Label, Node, Prefab } from 'cc';
import { PlayerManager } from '../managers/PlayerManager';
import { CardManager } from '../managers/CardManager';
import { GameManager } from '../managers/GameManager';
import { UIManager } from '../managers/UIManager';

/**
 * 结算数据接口（从服务端接收）
 */
export interface SettlementPvpData {
    status?: string;
    communityCards?: number[];
    totalPot?: number;
    mainPot?: number;
    sidePots?: any[];
    winners?: number[];
    players?: PlayerPvpSettlementData[];
    timestamp?: number;
    
    // ✅ [新增] 服务端发送的完整结算信息
    settlement?: TexasSettlementNotifyDTO;
    
    // ✅ [新增] 局数信息，用于判断是否是最后一局
    currentRound?: number;
    maxRounds?: number;
}

/**
 * 服务端结算通知DTO接口
 */
export interface TexasSettlementNotifyDTO {
    roomId?: number;
    gameId?: number;
    totalPot?: number;
    mainPot?: number;
    sidePots?: SidePotDTO[];
    winnerUserIds?: number[];
    playerSettlements?: PlayerSettlementInfoDTO[];
    showdownOrder?: number[];
    timestamp?: number;
}

/**
 * 边池DTO接口
 */
export interface SidePotDTO {
    amount?: number;
    eligiblePlayerIds?: number[];
}

/**
 * 玩家结算信息DTO接口
 */
export interface PlayerSettlementInfoDTO {
    userId?: number;
    nickname?: string;
    seatIndex?: number;
    isAI?: boolean;
    isFold?: boolean;
    isAllIn?: boolean;
    holeCards?: number[];
    handTypeName?: string;
    handValue?: string;
    gameCoin?: number;
    wonAmount?: number;
    isWinner?: boolean;
    totalBet?: number;
    roundBet?: number;
    lastAction?: string;
    lastActionBet?: number;
}

/**
 * 玩家结算数据接口
 */
export interface PlayerPvpSettlementData {
    userId?: number;
    seatIndex: number;
    nickname?: string;
    isFold?: boolean;
    holeCards?: number[];
    handCards?: number[];
    handTypeName?: string;
    handValue?: string;
    gameCoin?: number;
    lastAction?: string;
    lastActionBet?: number;
    roundBet?: number;
    totalBet?: number;
    wonAmount?: number;
}

/**
 * 结算结果接口
 */
export interface SettlementPvpResult {
    winnerIndex: number;
    winnerUserId: number;
    winnerNickname: string;
    handTypeName: string;
    handStrength: number;
    pot: number;
    winners: number[];
    communityCards?: number[];
    winnerHandCards?: number[];
    /**
     * 是否是平局
     */
    isTie?: boolean;
    /**
     * 当前玩家（真实玩家）是否是赢家
     */
    currentPlayerIsWinner?: boolean;
    /**
     * 当前玩家赢得的金额
     */
    currentPlayerWonAmount?: number;
    /**
     * 所有赢家的详细信息
     */
    winnerDetails?: Array<{
        userId: number;
        seatIndex: number;
        nickname: string;
        wonAmount: number;
        handTypeName?: string;
    }>;
}

/**
 * PVP 结算处理器类
 */
export class SettlementPvpHandler {
    
    private _playerManager: PlayerManager;
    private _cardManager: CardManager;
    private _gameManager: GameManager;
    private _uiManager: UIManager;
    
    // 结算回调
    private _onSettlementComplete: ((result: SettlementPvpResult) => void) | null = null;
    private _onPlayerConfirmed: ((playerIndex: number) => void) | null = null;
    
    // 确认状态
    private _confirmationPending: boolean = false;
    private _confirmedPlayers: Set<number> = new Set();
    
    // 房间信息
    private _roomId: number = 0;
    private _hostUserId: number | null = null;
    
    // 局数信息
    private _currentRound: number = 1;
    private _maxRounds: number = 10;
    
    // 最后一局回调
    private _onLastRoundConfirmed: (() => void) | null = null;
    
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
     * 设置房间信息
     */
    setRoomInfo(roomId: number, hostUserId: number | null) {
        this._roomId = roomId;
        this._hostUserId = hostUserId;
    }
    
    /**
     * 设置结算完成回调
     */
    setOnSettlementComplete(callback: (result: SettlementPvpResult) => void) {
        this._onSettlementComplete = callback;
    }
    
    /**
     * 设置玩家确认回调
     */
    setOnPlayerConfirmed(callback: (playerIndex: number) => void) {
        this._onPlayerConfirmed = callback;
    }
    
    /**
     * 设置最后一局确认回调
     */
    setOnLastRoundConfirmed(callback: () => void) {
        this._onLastRoundConfirmed = callback;
    }
    
    /**
     * 处理 PVP 游戏结算（主入口）
     */
    handleGameSettlement(
        data: SettlementPvpData,
        playersContainer: Node,
        potLabel: Label,
        sidePotsContainer: Node,
        winPanelPrefab: Prefab,
        rootNode: Node,
        showActivePlayersCards: () => Promise<void>,
        getOnlyActivePlayer: () => number,
        playerCardsRef: any
    ): Promise<SettlementPvpResult> {
        return new Promise((resolve) => {
            
            // ✅ [新增] 优先使用服务端发送的完整结算信息
            const settlement = data.settlement;
            
            // ✅ [新增] 保存局数信息
            if (data.currentRound !== undefined) {
                this._currentRound = data.currentRound;
            }
            if (data.maxRounds !== undefined) {
                this._maxRounds = data.maxRounds;
            }
            
            // ✅ [新增] 客户端结算数据验证
            this._validateSettlementData(data, settlement);
            
            // 1. 更新游戏状态
            this._updateGameStatus(data);
            
            // 2. 更新公共牌
            this._updateCommunityCards(data);
            
            // 3. 更新底池显示（优先使用结算DTO中的数据）
            const potValue = settlement?.totalPot ?? data.totalPot ?? data.mainPot;
            if (potValue !== undefined) {
                this._gameManager.setMainPot(potValue);
                this._uiManager.updatePotDisplay(potLabel, potValue);
            }
            this._updatePotDisplay(data, potLabel, sidePotsContainer);
            
            // 4. 获取玩家数据（优先使用结算DTO中的数据）
            let winners: number[] = [];
            const potentialWinners = settlement?.winnerUserIds ?? data.winners;
            if (Array.isArray(potentialWinners)) {
                winners = potentialWinners;
            } else {
                LogService.warn('SettlementPvpHandler', `winners 不是数组类型: ${typeof potentialWinners}`);
            }
            
            LogService.debug('SettlementPvpHandler', `[handleGameSettlement] settlement存在: ${settlement !== undefined && settlement !== null}`);
            LogService.debug('SettlementPvpHandler', `[handleGameSettlement] settlement.playerSettlements存在: ${settlement?.playerSettlements !== undefined && settlement?.playerSettlements !== null}`);
            LogService.debug('SettlementPvpHandler', `[handleGameSettlement] data.players存在: ${data.players !== undefined && data.players !== null}`);
            
            const players = settlement?.playerSettlements?.map(p => ({
                ...p,
                seatIndex: p.seatIndex ?? 0,
                isFold: p.isFold ?? false,
                holeCards: p.holeCards,
                handTypeName: p.handTypeName,
                handValue: p.handValue,
                userId: p.userId,
                nickname: p.nickname,
                gameCoin: p.gameCoin,
                lastAction: p.lastAction,
                lastActionBet: p.lastActionBet,
                roundBet: p.roundBet,
                isWinner: p.isWinner
            })) || data.players || [];
            
            LogService.debug('SettlementPvpHandler', `[handleGameSettlement] 解析出 ${players.length} 个玩家数据`);
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                LogService.debug('SettlementPvpHandler', `[handleGameSettlement] 玩家 ${i}: seatIndex=${player.seatIndex}, userId=${player.userId}, holeCards=${player.holeCards}, isFold=${player.isFold}`);
            }
            
            // 5. 保存服务端发送的玩家数据
            this._gameManager.updatePlayersFromServer(players);
            
            // 6. 更新玩家的弃牌状态
            this._updatePlayerFoldStatus(players);
            
            // 7. 显示活跃玩家的手牌
            showActivePlayersCards().then(() => {
                // 8. 显示所有活跃玩家的牌型（使用服务端数据）
                this._showPlayerHandTypes(players, playersContainer);
                
                // 9. 获取赢家信息
                if (winners.length === 0) {
                    LogService.warn('SettlementPvpHandler', '没有赢家信息，跳过胜利面板显示');
                    resolve(null);
                    return;
                }
                
                // 10. 计算胜利者信息（使用服务端数据）
                const result = this._calculateWinnerInfo(
                    winners, 
                    players, 
                    data.communityCards,
                    getOnlyActivePlayer,
                    potValue || 0
                );
                
                // 11. 初始化确认状态
                this._confirmationPending = true;
                this._confirmedPlayers.clear();
                
                // ⚠️ [修复] 移除提前清理卡牌的调用！
                // 公牌应该在所有玩家确认后才清理，而不是在显示胜利面板前清理
                
                // 13. 获取真实玩家的座位号
                const playerSeat = this._playerManager.getPlayerSeat();
                
                // 14. 显示胜利结果面板
                this._showWinnerPanel(
                    winPanelPrefab,
                    rootNode,
                    playersContainer,
                    result,
                    playerSeat
                );
                
                // 15. AI玩家自动确认
                this._autoConfirmAIPlayers();
                
                // 16. 触发完成回调
                if (this._onSettlementComplete) {
                    this._onSettlementComplete(result);
                }
                
                resolve(result);
            });
        });
    }
    
    /**
     * 验证结算数据的合理性
     */
    private _validateSettlementData(data: SettlementPvpData, settlement: TexasSettlementNotifyDTO | undefined) {
        const potValue = settlement?.totalPot ?? data.totalPot ?? data.mainPot;
        
        if (potValue !== undefined && potValue > 0) {
            const players = settlement?.playerSettlements ?? data.players ?? [];
            let totalBet = 0;
            let totalWon = 0;
            
            for (const player of players) {
                if (player.totalBet !== undefined) {
                    totalBet += player.totalBet;
                }
                if (player.wonAmount !== undefined) {
                    totalWon += player.wonAmount;
                }
            }
            
            const betPotDiff = Math.abs(totalBet - potValue);
            const wonPotDiff = Math.abs(totalWon - potValue);
            
            if (betPotDiff > potValue * 0.1) {
                LogService.warn('SettlementPvpHandler', `[验证警告] 总下注(${totalBet})与奖池(${potValue})偏差超过10%`);
            }
            
            if (wonPotDiff > potValue * 0.1) {
                LogService.warn('SettlementPvpHandler', `[验证警告] 总赢得(${totalWon})与奖池(${potValue})偏差超过10%`);
            }
            
            LogService.debug('SettlementPvpHandler', `[验证] 总下注=${totalBet}, 奖池=${potValue}, 总赢得=${totalWon}`);
        }
        
        if (data.winners && data.winners.length === 0) {
            LogService.warn('SettlementPvpHandler', '[验证警告] 没有赢家信息');
        }
    }
    
    /**
     * 更新游戏状态
     */
    private _updateGameStatus(data: SettlementPvpData) {
        if (data.status !== undefined) {
        }
    }
    
    /**
     * 更新公共牌
     */
    private _updateCommunityCards(data: SettlementPvpData) {
        if (data.communityCards !== undefined) {
            this._cardManager.setCommunityCards(data.communityCards);
        }
    }
    
    /**
     * 更新底池显示
     */
    private _updatePotDisplay(data: SettlementPvpData, potLabel: Label, sidePotsContainer: Node) {
        const potValue = data.totalPot !== undefined ? data.totalPot : data.mainPot;
        if (potValue !== undefined) {
            this._gameManager.setMainPot(potValue);
            this._uiManager.updatePotDisplay(potLabel, potValue);
        }
        
        if (data.sidePots && Array.isArray(data.sidePots)) {
            this._gameManager.setSidePots(data.sidePots);
            this._uiManager.updateSidePotsDisplay(sidePotsContainer, data.sidePots);
        }
    }
    
    /**
     * 更新玩家弃牌状态
     */
    private _updatePlayerFoldStatus(players: PlayerPvpSettlementData[]) {
        for (const player of players) {
            const seatIndex = player.seatIndex;
            if (player.isFold) {
                this._playerManager.setPlayerFolded(seatIndex);
            }
        }
    }
    
    /**
     * 显示玩家牌型
     */
    private _showPlayerHandTypes(players: PlayerPvpSettlementData[], playersContainer: Node) {
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
            
            // ✅ [修复] 优先使用服务端发送的牌型名称，如果没有则根据handValue计算
            let handTypeName = player.handTypeName;
            const handValue = player.handValue;
            
            // 如果服务端没有发送handTypeName（可能是字段名不匹配导致），则根据handValue计算
            if (!handTypeName || handTypeName.trim() === '') {
                const hv = String(handValue || '0');
                let handType = 0;
                if (hv.length > 10) {
                    handType = parseInt(hv.substring(0, hv.length - 10), 10);
                } else {
                    handType = Math.floor(parseFloat(hv) / 10000000000);
                }
                handTypeName = CardManager.getHandTypeName(handType);
                LogService.warn('SettlementPvpHandler', `[WARNING] 服务端未发送handTypeName，根据handValue(${handValue})计算: ${handTypeName}`);
            }
            
            // ✅ 在玩家头像上方显示牌型（amount传0，只显示牌型名称）
            this._playerManager.showPlayerActionNearAvatar(
                playersContainer,
                seatIndex,
                handTypeName,
                0,  // 金额传0，避免显示数字
                nickname
            );
        }
    }
    
    /**
     * 计算赢家信息
     */
    private _calculateWinnerInfo(
        winners: number[],
        players: PlayerPvpSettlementData[],
        communityCards: number[],
        getOnlyActivePlayer: () => number,
        pot: number
    ): SettlementPvpResult {
        let winnerIndex = -1;
        let winnerUserId = 0;
        let handTypeName = '高牌';
        let handStrength = 0;
        
        // 获取当前真实玩家的座位号和用户ID
        const currentPlayerSeat = this._playerManager.getPlayerSeat();
        const currentPlayerUserId = this._playerManager.getUserIdBySeatIndex(currentPlayerSeat);
        
        // 收集所有赢家的详细信息
        const winnerDetails: Array<{
            userId: number;
            seatIndex: number;
            nickname: string;
            wonAmount: number;
            handTypeName?: string;
        }> = [];
        
        // 遍历所有赢家，收集详细信息
        for (const winnerUserIdIter of winners) {
            for (const player of players) {
                if (player.userId === winnerUserIdIter) {
                    let playerWonAmount = 0;
                    
                    // 使用服务端返回的 wonAmount
                    if (player.wonAmount !== undefined && player.wonAmount !== null) {
                        playerWonAmount = player.wonAmount;
                    } else if (winners.length > 1) {
                        // 如果是平局且没有 wonAmount，计算平均分配
                        playerWonAmount = Math.floor(pot / winners.length);
                    } else {
                        playerWonAmount = pot;
                    }
                    
                    winnerDetails.push({
                        userId: player.userId,
                        seatIndex: player.seatIndex,
                        nickname: this._gameManager.getPlayerNickname(player.seatIndex) || `玩家 ${player.seatIndex + 1}`,
                        wonAmount: playerWonAmount,
                        handTypeName: player.handTypeName
                    });
                    break;
                }
            }
        }
        
        // 查找当前玩家（如果是赢家的话）
        let currentPlayerIsWinner = false;
        let currentPlayerWonAmount = 0;
        let currentPlayerHandCards: number[] | undefined;
        
        if (currentPlayerUserId !== undefined) {
            currentPlayerIsWinner = winners.indexOf(currentPlayerUserId) !== -1;
            
            if (currentPlayerIsWinner) {
                const currentPlayerDetail = winnerDetails.find(d => d.userId === currentPlayerUserId);
                if (currentPlayerDetail) {
                    currentPlayerWonAmount = currentPlayerDetail.wonAmount;
                }
                
                // 获取当前玩家的手牌
                for (const player of players) {
                    if (player.userId === currentPlayerUserId) {
                        currentPlayerHandCards = player.holeCards;
                        break;
                    }
                }
            }
        }
        
        // ✅ [修改] 只有在平局或多个赢家时，才显示不同玩家的信息
        // 单一赢家时，所有玩家都看到相同的胜利者信息
        let displayWinnerIndex = -1;
        let displayWinnerUserId = 0;
        let displayWonAmount = 0;
        
        const isTie = winners.length > 1;
        
        if (winnerDetails.length > 0) {
            if (isTie && currentPlayerIsWinner) {
                // ✅ [修改] 平局且当前玩家是赢家时，显示当前玩家的信息
                const currentPlayerDetail = winnerDetails.find(d => d.userId === currentPlayerUserId);
                if (currentPlayerDetail) {
                    displayWinnerIndex = currentPlayerDetail.seatIndex;
                    displayWinnerUserId = currentPlayerDetail.userId;
                    displayWonAmount = currentPlayerDetail.wonAmount;
                    
                    // 获取当前玩家的牌型信息
                    for (const player of players) {
                        if (player.userId === currentPlayerUserId) {
                            if (player.handTypeName && player.handValue !== undefined && player.handValue !== null) {
                                handTypeName = player.handTypeName;
                                handStrength = Number(player.handValue);
                            }
                            break;
                        }
                    }
                }
            } else {
                // ✅ [修改] 单一赢家或非平局时，所有玩家都看到相同的第一个赢家信息
                const firstWinner = winnerDetails[0];
                displayWinnerIndex = firstWinner.seatIndex;
                displayWinnerUserId = firstWinner.userId;
                displayWonAmount = firstWinner.wonAmount;
                
                // 获取第一个赢家的牌型信息
                for (const player of players) {
                    if (player.userId === firstWinner.userId) {
                        if (player.handTypeName && player.handValue !== undefined && player.handValue !== null) {
                            handTypeName = player.handTypeName;
                            handStrength = Number(player.handValue);
                        }
                        break;
                    }
                }
            }
        } else {
            // 如果没找到赢家，但有活跃玩家，使用第一个活跃玩家
            displayWinnerIndex = getOnlyActivePlayer();
            displayWonAmount = pot;
        }
        
        // 获取显示的赢家昵称
        const displayWinnerNickname = this._gameManager.getPlayerNickname(displayWinnerIndex);
        
        // 获取显示的赢家手牌
        let displayWinnerHandCards: number[] | undefined;
        if (isTie && currentPlayerIsWinner) {
            // 平局且当前玩家是赢家时，显示当前玩家的手牌
            for (const player of players) {
                if (player.userId === currentPlayerUserId) {
                    displayWinnerHandCards = player.holeCards;
                    break;
                }
            }
        } else {
            // 其他情况显示第一个赢家的手牌
            for (const player of players) {
                if (player.userId === displayWinnerUserId) {
                    displayWinnerHandCards = player.holeCards;
                    break;
                }
            }
        }
        
        return {
            winnerIndex: displayWinnerIndex,
            winnerUserId: displayWinnerUserId,
            winnerNickname: displayWinnerNickname,
            handTypeName,
            handStrength,
            pot: isTie && currentPlayerIsWinner ? currentPlayerWonAmount : displayWonAmount, // ✅ [修改] 平局时显示当前玩家获得，否则显示第一个赢家获得
            winners,
            communityCards,
            winnerHandCards: displayWinnerHandCards,
            isTie,
            currentPlayerIsWinner,
            currentPlayerWonAmount,
            winnerDetails
        };
    }
    
    /**
     * 清空底池、手牌和公牌
     */
    private _cleanupAfterSettlement(potLabel: Label, playerCardsRef: any) {
        
        // 清空底池
        this._gameManager.setMainPot(0);
        this._gameManager.setPot(0);
        this._uiManager.updatePotDisplay(potLabel, 0);
        
        // 清空手牌和公牌显示
        this._uiManager.cleanupCards();
    }
    
    /**
     * 显示胜利结果面板
     */
    private _showWinnerPanel(
        winPanelPrefab: Prefab,
        rootNode: Node,
        playersContainer: Node,
        result: SettlementPvpResult,
        playerSeat: number
    ) {
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
            result.winnerNickname,
            result.communityCards,
            result.winnerHandCards,
            result.isTie,
            result.currentPlayerIsWinner,
            result.currentPlayerWonAmount,
            result.winnerDetails
        );

        const handPatternKey = CardManager.getHandTypeConfigKey(result.handTypeName);
        SoundManager.getInstance().playHandPatternSound(handPatternKey);
    }
    
    /**
     * 玩家确认回调
     */
    private _onPlayerConfirmedCallback(playerIndex: number) {
        
        // 记录确认状态
        this._confirmedPlayers.add(playerIndex);
        
        // ✅ [新增] 检查是否是最后一局
        const isLastRound = this._currentRound >= this._maxRounds;
        
        if (this._onPlayerConfirmed) {
            this._onPlayerConfirmed(playerIndex);
        }
        
        // ✅ [修改] 最后一局时，真实玩家点击确认就立即退出，不需要等待其他玩家
        // 每个玩家独立操作，互不影响
        if (isLastRound && this._onLastRoundConfirmed) {
            const playerSeat = this._playerManager.getPlayerSeat();
            if (playerIndex === playerSeat) {
                LogService.info('SettlementPvpHandler', '[最后一局确认] 真实玩家已确认，立即跳转到record场景');
                this._onLastRoundConfirmed();
            } else {
                LogService.info('SettlementPvpHandler', '[最后一局确认] AI玩家已确认，不触发跳转');
            }
        }
    }
    
    /**
     * AI玩家自动确认
     */
    private _autoConfirmAIPlayers() {
        const playersNum = this._playerManager.getPlayersNum();
        let aiCount = 0;
        
        for (let i = 0; i < playersNum; i++) {
            if (this._playerManager.isAIPlayer(i) && this._gameManager.getPlayerChips(i) > 0) {
                aiCount++;
                setTimeout(() => {
                    if (this._confirmationPending) {
                        this._onPlayerConfirmedCallback(i);
                    }
                }, 1000 + Math.random() * 1000);
            }
        }
    }
    
    // ==================== 公共方法 ====================
    
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
    
    /**
     * 获取房间ID
     */
    getRoomId(): number {
        return this._roomId;
    }
    
    /**
     * 获取房主ID
     */
    getHostUserId(): number | null {
        return this._hostUserId;
    }
    
    /**
     * 清理资源
     */
    cleanup() {
        this._confirmationPending = false;
        this._confirmedPlayers.clear();
        this._onSettlementComplete = null;
        this._onPlayerConfirmed = null;
    }
}
