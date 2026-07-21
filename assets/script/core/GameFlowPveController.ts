import { LogService } from '../utils/LogService';
/**
 * PVE 游戏流程控制器
 * 专门处理 PVE 模式的游戏核心流程
 * 继承自 GameFlowController，复用基础游戏流程逻辑
 * 
 * 主要功能：
 * - 游戏阶段管理
 * - 下注流程
 * - 发牌逻辑
 * - 回合控制
 * - 玩家操作动画播放（服务端驱动）
 */
import { Label, Node } from 'cc';
import { GameFlowController, GamePhase } from './GameFlowController';
import { GameManager } from '../managers/GameManager';
import { PlayerManager } from '../managers/PlayerManager';
import { CardManager } from '../managers/CardManager';
import { UIManager } from '../managers/UIManager';

// ✅ 重新导出 GamePhase，方便外部使用
export { GamePhase };

export interface GameFlowCallbacks {
    onGameStart?: () => void;
    onDealComplete?: () => void;
    onPhaseChange?: (any) => void;
    onPlayerTurn?: (playerIndex: number) => void;
    onRoundComplete?: () => void;
    onShowdown?: () => void;
    onSettlement?: (result: any) => void;
    onCountdownTimeout?: () => void;
    // ✅ [优化] onCountdownTick 已移除，倒计时UI更新已集成到 GameFlowPveController.startCountdown 内部处理
}

export class GameFlowPveController extends GameFlowController {
    
    // 倒计时相关（PVE 特有）
    private _countdownTimer: number = 0;
    private _countdownInterval: number = -1;
    private _countdownDuration: number = 30; // 30秒倒计时
    
    // 服务端推送的可用操作（PVE 特有）
    private _serverAvailableActions: any[] = [];
    
    // 胜利确认状态跟踪（PVE 特有）
    private _confirmationPending: boolean = false;
    private _confirmedPlayers: Set<number> = new Set();
    private _onAllConfirmedCallback: () => void = null;
    
    // 操作处理状态（用于防重复点击）（PVE 特有）
    private _actionProcessing: boolean = false;
    
    // 操作金额缓存（用于字符串数组格式的 availableActions）（PVE 特有）
    private _lastNeedToCall: number = 0;
    private _lastPlayerChips: number = 0;
    private _lastMinBetAmount: number = 200;
    
    constructor(
        gameManager: GameManager,
        playerManager: PlayerManager,
        cardManager: CardManager,
        uiManager: UIManager,
        playersContainer: Node,
        container: Node,
        playersActionNode: Node,
        potLabel: Label
    ) {
        // 调用父类构造函数
        super(gameManager, playerManager, cardManager, uiManager, playersContainer, container, playersActionNode, potLabel);
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: GameFlowCallbacks) {
        this._callbacks = { ...this._callbacks, ...callbacks };
    }
    
    /**
     * ✅ [新增] 检查是否可以显示操作按钮（防重复调用检查）
     * @param messageTimestamp 消息时间戳
     * @returns 是否可以显示操作
     */
    canShowActions(messageTimestamp?: number): boolean {
        // 检查是否正在处理操作
        if (this._actionProcessing) {
            return false;
        }
        
        // 检查游戏是否已开始
        if (!this._gameStarted) {
            return false;
        }
        
        // 检查是否在游戏阶段
        if (!this._isInGamePhase) {
            return false;
        }
        return true;
    }
    
    /**
     * 处理游戏开始
     */
    handleGameStart(data: any) {
        
        this._gameStarted = true;
        this._isInGamePhase = true;
        
        // 重置阶段统计
        this._preflopComplete = false;
        this._flopComplete = false;
        this._turnComplete = false;
        this._riverComplete = false;
        
        // 更新游戏配置
        if (data.smallBlind !== undefined && data.bigBlind !== undefined) {
            this._gameManager.setBlinds(data.smallBlind, data.bigBlind);
        }
        if (data.buttonIndex !== undefined) {
            this._gameManager.setButtonSeat(data.buttonIndex);
        }
        
        // 更新 UI 显示
        this._uiManager.updatePotDisplay(this._potLabel, 0);
        
        // 触发回调
        if (this._callbacks.onGameStart) {
            this._callbacks.onGameStart();
        }
    }
    
    /**
     * 处理发牌通知
     */
    handleDealCards(data: any) {
        
        // 发牌期间隐藏所有玩家的倒计时
        this._hideAllPlayerCountdowns();
        
        // 更新游戏状态
        if (data.buttonIndex !== undefined) {
            this._gameManager.setButtonSeat(data.buttonIndex);
        }
        
        if (data.communityCards) {
            this._gameManager.setCommunityCards(data.communityCards);
        }
        
        // 根据不同阶段处理发牌
        if (data.dealNotify && data.dealNotify.phase === 'PREFLOP') {
            this._handlePreFlopDeal(data);
        } else if (data.communityCards && data.communityCards.length > 0) {
            this._handleCommunityCards(data);
        }
        
        // 触发回调
        if (this._callbacks.onDealComplete) {
            this._callbacks.onDealComplete();
        }
    }
    
    /**
     * 处理翻牌前发牌
     */
    private _handlePreFlopDeal(data: any) {
        
        const dealNotify = data.dealNotify;
        
        // 清空手牌和公牌
        this._uiManager.cleanupCards();
        
        // 重置游戏管理器
        this._gameManager.reset(false);
        
        // 更新按钮位信息
        if (dealNotify.buttonIndex !== undefined) {
            this._gameManager.setButtonSeat(dealNotify.buttonIndex);
        }
        if (dealNotify.smallBlindIndex !== undefined) {
            this._gameManager.setSmallBlindSeat(dealNotify.smallBlindIndex);
        }
        if (dealNotify.bigBlindIndex !== undefined) {
            this._gameManager.setBigBlindSeat(dealNotify.bigBlindIndex);
        }
        
        // 保存玩家手牌
        if (data.players && data.players.length > 0) {
            for (const playerData of data.players) {
                const seatIndex = playerData.seatIndex;
                const cards = playerData.holeCards || playerData.handCards;
                if (seatIndex !== undefined && cards && cards.length === 2) {
                    this._gameManager.setPlayerHoleCardsFromServer(seatIndex, cards);
                }
            }
        }
        
        this._currentPhase = GamePhase.PREFLOP;
        
        if (this._callbacks.onPhaseChange) {
            this._callbacks.onPhaseChange(GamePhase.PREFLOP);
        }
    }
    
    /**
     * 处理公共牌发牌
     */
    private _handleCommunityCards(data: any) {
        const communityCards = data.communityCards;
        const cardCount = communityCards.length;
        
        if (cardCount === 3) {
            this._currentPhase = GamePhase.FLOP;
            
            if (this._callbacks.onPhaseChange) {
                this._callbacks.onPhaseChange(GamePhase.FLOP);
            }
        } else if (cardCount === 4) {
            this._currentPhase = GamePhase.TURN;
            
            if (this._callbacks.onPhaseChange) {
                this._callbacks.onPhaseChange(GamePhase.TURN);
            }
        } else if (cardCount === 5) {
            this._currentPhase = GamePhase.RIVER;
            
            if (this._callbacks.onPhaseChange) {
                this._callbacks.onPhaseChange(GamePhase.RIVER);
            }
        }
    }
    
    /**
     * 处理玩家回合通知
     */
    handlePlayerTurn(data: any) {
        
        // 记录完整的输入数据
        LogService.info('GameFlowPveController', `📥 输入数据 - data.actionPlayer: ${JSON.stringify(data.actionPlayer)}, data.actionNotify: ${JSON.stringify(data.actionNotify)}`);
        
        const notify = data.actionNotify;
        if (!notify) {
            LogService.error('GameFlowPveController', '无效的玩家回合通知数据 - actionNotify 不存在');
            return;
        }
        
        // 详细记录收到的数据
        LogService.info('GameFlowPveController', `数据来源: actionPlayer=${data.actionPlayer ? '存在' : '不存在'}, notify.isMyTurn=${notify.isMyTurn}, notify.targetUserSeatIndex=${notify.targetUserSeatIndex}`);
        if (data.actionPlayer) {
            LogService.info('GameFlowPveController', `actionPlayer: seatIndex=${data.actionPlayer.seatIndex}, isAllIn=${data.actionPlayer.isAllIn}`);
        }
        
        // 更新操作金额缓存（用于字符串数组格式的 availableActions）
        if (notify.needToCall !== undefined) {
            this._lastNeedToCall = notify.needToCall;
        }
        if (notify.playerChips !== undefined) {
            this._lastPlayerChips = notify.playerChips;
        }
        if (notify.minBetAmount !== undefined) {
            this._lastMinBetAmount = notify.minBetAmount;
        } else if (data.minBetAmount !== undefined) {
            this._lastMinBetAmount = data.minBetAmount;
        }
        
        // 如果是真实玩家的回合，明确记录
        if (notify.isMyTurn) {
            LogService.info('GameFlowPveController', `✋ 检测到真实玩家回合 (isMyTurn=true)`);
        }
        
        // 防御性检查：如果收到通知指向ALL-IN玩家，跳过处理
        if (data.actionPlayer && data.actionPlayer.isAllIn) {
            LogService.warn('GameFlowPveController', '收到ALL-IN玩家的操作通知，跳过处理');
            return;
        }
        
        // 隐藏所有玩家的倒计时
        this._hideAllPlayerCountdowns();
        
        // 更新当前回合玩家索引（支持多种数据来源）
        let currentSeatIndex = -1;
        
        if (data.actionPlayer) {
            currentSeatIndex = data.actionPlayer.seatIndex;
            
            // 防御性检查：如果轮到真实玩家但他已ALL-IN，跳过
            if (notify.isMyTurn && data.actionPlayer.isAllIn) {
                LogService.warn('GameFlowPveController', '轮到真实玩家但他已ALL-IN，跳过操作');
                return;
            }
            
            // 记录玩家回合（服务端驱动，无需本地AI策略）
            LogService.info('GameFlowPveController', `玩家 ${data.actionPlayer.seatIndex} 的回合（等待服务端操作）`);
        } else if (notify.targetUserSeatIndex !== undefined) {
            // 如果没有 actionPlayer，从 notify 中获取座位索引
            currentSeatIndex = notify.targetUserSeatIndex;
        }
        
        // 记录更新前的状态
        
        // 更新成员变量
        this._currentTurnPlayerIndex = currentSeatIndex;
        
        // 记录更新后的状态
        
        // 启动当前玩家的倒计时显示
        if (currentSeatIndex !== -1) {
            this.startCountdown();
        } else {
            LogService.warn('GameFlowPveController', `❌ 跳过 startCountdown()，因为 currentSeatIndex=${currentSeatIndex}`);
        }
        
        // 触发回调
        if (this._callbacks.onPlayerTurn && currentSeatIndex !== -1) {
            this._callbacks.onPlayerTurn(currentSeatIndex, this._currentTurnIsAI);
        }
    }
    
    /**
     * 处理玩家操作通知
     */
    handlePlayerAction(data: any) {
        
        const notify = data.actionNotify;
        if (!notify) {
            return;
        }
        
        // 更新玩家操作显示
        const playerIndex = notify.targetUserSeatIndex;
        if (playerIndex !== undefined) {
            const action = notify.action;
            const amount = notify.amount || 0;
            const nickname = notify.targetUserNickname || '';
            
            this._playerManager.showPlayerActionNearAvatar(
                this._playersContainer,
                playerIndex,
                action,
                amount,
                nickname
            );
        }
        
        // 更新底池
        if (data.totalPot !== undefined) {
            this._gameManager.setMainPot(data.totalPot);
            this._uiManager.updatePotDisplay(this._potLabel, data.totalPot);
        }
        
        // 更新当前下注额
        if (data.currentBet !== undefined) {
            this._gameManager.setCurrentBet(data.currentBet);
        }
        
        // 更新当前回合玩家索引
        if (data.currentActIndex !== undefined) {
            this._currentTurnPlayerIndex = data.currentActIndex;
        }
    }
    
    /**
     * 处理回合完成
     */
    handleRoundComplete(data: any) {
        
        this._updatePhaseStatus();
        
        // 触发回调
        if (this._callbacks.onRoundComplete) {
            this._callbacks.onRoundComplete();
        }
    }
    
    /**
     * 更新阶段状态
     */
    private _updatePhaseStatus() {
        switch (this._currentPhase) {
            case GamePhase.PREFLOP:
                this._preflopComplete = true;
                break;
            case GamePhase.FLOP:
                this._flopComplete = true;
                break;
            case GamePhase.TURN:
                this._turnComplete = true;
                break;
            case GamePhase.RIVER:
                this._riverComplete = true;
                break;
        }
    }
    
    /**
     * 处理摊牌
     */
    handleShowdown(data: any) {
        
        this._currentPhase = GamePhase.SHOWDOWN;
        
        // 更新公共牌
        if (data.communityCards) {
            this._gameManager.setCommunityCards(data.communityCards);
        }
        
        // 触发回调
        if (this._callbacks.onShowdown) {
            this._callbacks.onShowdown();
        }
    }
    
    /**
     * 处理结算
     */
    handleSettlement(data: any) {
        
        this._currentPhase = GamePhase.SETTLEMENT;
        this._isInGamePhase = false;
        
        // 触发回调
        if (this._callbacks.onSettlement) {
            this._callbacks.onSettlement(data);
        }
    }
    
    /**
     * 隐藏所有玩家的倒计时
     */
    private _hideAllPlayerCountdowns() {
        const playersNum = this._playerManager.getPlayersNum();
        for (let i = 0; i < playersNum; i++) {
            this._playerManager.hidePlayerCountdown(this._playersContainer, i);
        }
    }
    
    // ==================== 公共访问方法 ====================
    
    /**
     * 获取当前游戏阶段
     */
    getCurrentPhase(): GamePhase {
        return this._currentPhase;
    }
    
    /**
     * 检查游戏是否已开始
     */
    isGameStarted(): boolean {
        return this._gameStarted;
    }
    
    /**
     * 检查是否在游戏阶段中
     */
    isInGamePhase(): boolean {
        return this._isInGamePhase;
    }
    
    /**
     * 获取当前回合玩家索引
     */
    getCurrentTurnPlayerIndex(): number {
        return this._currentTurnPlayerIndex;
    }
    
    /**
     * 检查是否正在处理操作（防重复点击）
     */
    isActionProcessing(): boolean {
        return this._actionProcessing;
    }
    
    /**
     * 设置操作处理状态（防重复点击）
     */
    setActionProcessing(processing: boolean) {
        this._actionProcessing = processing;
    }
    
    /**
     * 获取阶段名称
     */
    getPhaseName(): string {
        return GamePhase[this._currentPhase];
    }
    
    /**
     * 获取阶段描述
     */
    getPhaseDescription(): string {
        switch (this._currentPhase) {
            case GamePhase.WAITING:
                return '等待开始';
            case GamePhase.PREFLOP:
                return '翻牌前';
            case GamePhase.FLOP:
                return '翻牌';
            case GamePhase.TURN:
                return '转牌';
            case GamePhase.RIVER:
                return '河牌';
            case GamePhase.SHOWDOWN:
                return '摊牌';
            case GamePhase.SETTLEMENT:
                return '结算';
            default:
                return '未知阶段';
        }
    }
    
    // ==================== 倒计时相关方法 ====================
    
    /**
     * 开始倒计时
     */
    startCountdown(): void {
        
        if (!this._playersContainer) {
            LogService.error('GameFlowPveController', '⏱️ _playersContainer 未设置，无法显示倒计时！');
            return;
        }
        
        if (!this._playerManager) {
            LogService.error('GameFlowPveController', '⏱️ _playerManager 未设置，无法显示倒计时！');
            return;
        }
        
        // 先停止之前的倒计时
        this.stopCountdown();
        
        // 初始化倒计时
        this._countdownTimer = this._countdownDuration;
        
        // 更新UI显示初始时间（使用showPlayerCountdown来激活clock节点）
        if (this._currentTurnPlayerIndex !== -1) {
            this._playerManager.showPlayerCountdown(this._playersContainer, this._currentTurnPlayerIndex, this._countdownTimer);
        } else {
            LogService.warn('GameFlowPveController', '当前回合玩家索引无效，无法显示倒计时');
        }
        
        // 每秒更新倒计时
        this._countdownInterval = setInterval(() => {
            this._countdownTimer--;
            
            // 更新UI显示
            if (this._currentTurnPlayerIndex !== -1) {
                this._playerManager.updatePlayerCountdown(this._playersContainer, this._currentTurnPlayerIndex, this._countdownTimer);
            }
            
            // 倒计时结束
            if (this._countdownTimer <= 0) {
                this.stopCountdown();
                // 触发倒计时超时回调
                if (this._callbacks.onCountdownTimeout) {
                    this._callbacks.onCountdownTimeout();
                }
            }
        }, 1000) as unknown as number;
    }
    
    /**
     * 停止倒计时
     */
    stopCountdown(): void {
        if (this._countdownInterval !== -1) {
            clearInterval(this._countdownInterval);
            this._countdownInterval = -1;
        }
        // ✅ [修复] 隐藏当前玩家的倒计时显示
        if (this._currentTurnPlayerIndex !== -1) {
            this._playerManager.hidePlayerCountdown(this._playersContainer, this._currentTurnPlayerIndex);
        }
    }
    
    /**
     * 获取倒计时剩余时间
     */
    getCountdownTimer(): number {
        return this._countdownTimer;
    }
    
    /**
     * 设置服务端时间剩余
     */
    setServerTimeRemaining(time: number): void {
        this._serverTimeRemaining = time;
        this._countdownTimer = time;
    }
    
    /**
     * 获取服务端时间剩余
     */
    getServerTimeRemaining(): number {
        return this._serverTimeRemaining;
    }
    
    /**
     * 设置倒计时时长
     */
    setCountdownDuration(duration: number): void {
        this._countdownDuration = duration;
    }
    
    /**
     * 获取倒计时时长
     */
    getCountdownDuration(): number {
        return this._countdownDuration;
    }
    
    /**
     * 隐藏当前玩家的倒计时
     */
    hideCurrentCountdown(): void {
        if (this._currentTurnPlayerIndex !== -1) {
            this._playerManager.hidePlayerCountdown(this._playersContainer, this._currentTurnPlayerIndex);
        }
    }
    
    // ==================== 服务端可用操作 ====================
    
    /**
     * 设置服务端推送的可用操作
     */
    setServerAvailableActions(actions: any[]): void {
        this._serverAvailableActions = actions || [];
    }
    
    /**
     * 获取服务端推送的可用操作
     */
    getServerAvailableActions(): any[] {
        return this._serverAvailableActions;
    }
    
    /**
     * 从服务端推送的可用操作中获取对应操作类型的金额
     */
    getAmountFromServerActions(actionType: string): number {
        if (!this._serverAvailableActions || this._serverAvailableActions.length === 0) {
            LogService.warn('GameFlowPveController', 'serverAvailableActions 为空，返回默认金额 0');
            return 0;
        }
        
        for (const action of this._serverAvailableActions) {
            // ✅ [修复] 处理字符串类型的操作（服务端可能发送字符串数组）
            if (typeof action === 'string') {
                let serverActionType = action;
                if (serverActionType === 'ALL_IN') {
                    serverActionType = 'ALLIN';
                }
                if (serverActionType === actionType) {
                    // 字符串类型没有 betAmount，需要根据操作类型返回相应金额
                    return this._getDefaultActionAmount(actionType);
                }
            }
            
            // 处理对象类型的操作
            let serverActionType = action.actionType;
            if (serverActionType === 'ALL_IN') {
                serverActionType = 'ALLIN';
            }
            if (serverActionType === actionType) {
                return action.betAmount || this._getDefaultActionAmount(actionType);
            }
        }
        
        LogService.warn('GameFlowPveController', `未找到操作 ${actionType} 的金额，返回默认金额`);
        return this._getDefaultActionAmount(actionType);
    }
    
    /**
     * 根据操作类型获取默认金额
     */
    private _getDefaultActionAmount(actionType: string): number {
        switch (actionType) {
            case 'CALL':
                // CALL 使用需要跟注的金额
                const callAmount = this._lastNeedToCall || 0;
                return callAmount;
            case 'ALLIN':
                // ALLIN 使用玩家总筹码
                const allinAmount = this._lastPlayerChips || 0;
                return allinAmount;
            case 'RAISE':
                // RAISE 使用最小加注金额
                const raiseAmount = this._lastMinBetAmount || 200;
                return raiseAmount;
            default:
                return 0;
        }
    }
    
    // ==================== 确认状态相关 ====================
    
    /**
     * 设置确认状态
     */
    setConfirmationPending(pending: boolean): void {
        this._confirmationPending = pending;
    }
    
    /**
     * 检查是否正在等待确认
     */
    isConfirmationPending(): boolean {
        return this._confirmationPending;
    }
    
    /**
     * 确认玩家
     */
    confirmPlayer(playerIndex: number): void {
        this._confirmedPlayers.add(playerIndex);
    }
    
    /**
     * 获取已确认的玩家数量
     */
    getConfirmedCount(): number {
        return this._confirmedPlayers.size;
    }
    
    /**
     * 检查玩家是否已确认
     */
    isPlayerConfirmed(playerIndex: number): boolean {
        return this._confirmedPlayers.has(playerIndex);
    }
    
    /**
     * 清空确认状态
     */
    clearConfirmations(): void {
        this._confirmationPending = false;
        this._confirmedPlayers.clear();
        this._onAllConfirmedCallback = null;
    }
    
    /**
     * 设置所有玩家确认完成回调
     */
    setOnAllConfirmedCallback(callback: () => void): void {
        this._onAllConfirmedCallback = callback;
    }
    
    /**
     * 触发所有玩家确认完成回调
     */
    triggerAllConfirmedCallback(): void {
        if (this._onAllConfirmedCallback) {
            this._onAllConfirmedCallback();
        }
    }
    
    /**
     * 获取未确认玩家数量
     */
    getUnconfirmedPlayersCount(): number {
        const activePlayers = this._playerManager.getActivePlayersCount();
        return activePlayers - this._confirmedPlayers.size;
    }
    
    /**
     * 重置游戏状态
     */
    reset() {
        
        this._currentPhase = GamePhase.WAITING;
        this._gameStarted = false;
        this._isInGamePhase = false;
        this._currentRound = 0;
        this._currentTurnPlayerIndex = -1;
        this._currentTurnIsAI = false;
        
        this._preflopComplete = false;
        this._flopComplete = false;
        this._turnComplete = false;
        this._riverComplete = false;
        
        // 隐藏所有玩家的倒计时
        this._hideAllPlayerCountdowns();
    }
    
    /**
     * 清理资源
     */
    cleanup() {
        
        this.reset();
        this._callbacks = {};
    }
    
    /**
     * 获取当前回合玩家的座位索引
     */
    getCurrentTurnSeatIndex(): number {
        return this._currentTurnPlayerIndex;
    }
    
    /**
     * 检查游戏是否处于等待状态
     */
    isWaiting(): boolean {
        return this._currentPhase === GamePhase.WAITING;
    }
    
    /**
     * 检查游戏是否处于翻牌前阶段
     */
    isPreflop(): boolean {
        return this._currentPhase === GamePhase.PREFLOP;
    }
    
    /**
     * 检查游戏是否处于翻牌阶段
     */
    isFlop(): boolean {
        return this._currentPhase === GamePhase.FLOP;
    }
    
    /**
     * 检查游戏是否处于转牌阶段
     */
    isTurn(): boolean {
        return this._currentPhase === GamePhase.TURN;
    }
    
    /**
     * 检查游戏是否处于河牌阶段
     */
    isRiver(): boolean {
        return this._currentPhase === GamePhase.RIVER;
    }
    
    /**
     * 检查游戏是否处于摊牌阶段
     */
    isShowdown(): boolean {
        return this._currentPhase === GamePhase.SHOWDOWN;
    }
    
    /**
     * 检查游戏是否处于结算阶段
     */
    isSettlement(): boolean {
        return this._currentPhase === GamePhase.SETTLEMENT;
    }
    
    /**
     * 检查游戏是否处于下注阶段（翻牌前/翻牌/转牌/河牌）
     */
    isInBettingPhase(): boolean {
        const bettingPhases = [GamePhase.PREFLOP, GamePhase.FLOP, GamePhase.TURN, GamePhase.RIVER];
        return bettingPhases.indexOf(this._currentPhase) !== -1;
    }
    
    /**
     * 获取阶段顺序编号（用于比较阶段先后）
     */
    getPhaseOrder(): number {
        const phaseOrder = {
            [GamePhase.WAITING]: 0,
            [GamePhase.PREFLOP]: 1,
            [GamePhase.FLOP]: 2,
            [GamePhase.TURN]: 3,
            [GamePhase.RIVER]: 4,
            [GamePhase.SHOWDOWN]: 5,
            [GamePhase.SETTLEMENT]: 6
        };
        return phaseOrder[this._currentPhase] ?? -1;
    }
    
    /**
     * 检查当前阶段是否在指定阶段之后
     */
    isPhaseAfter(targetPhase: GamePhase): boolean {
        const phaseOrder = {
            [GamePhase.WAITING]: 0,
            [GamePhase.PREFLOP]: 1,
            [GamePhase.FLOP]: 2,
            [GamePhase.TURN]: 3,
            [GamePhase.RIVER]: 4,
            [GamePhase.SHOWDOWN]: 5,
            [GamePhase.SETTLEMENT]: 6
        };
        return phaseOrder[this._currentPhase] > phaseOrder[targetPhase];
    }
    
    /**
     * 检查当前阶段是否在指定阶段之前
     */
    isPhaseBefore(targetPhase: GamePhase): boolean {
        const phaseOrder = {
            [GamePhase.WAITING]: 0,
            [GamePhase.PREFLOP]: 1,
            [GamePhase.FLOP]: 2,
            [GamePhase.TURN]: 3,
            [GamePhase.RIVER]: 4,
            [GamePhase.SHOWDOWN]: 5,
            [GamePhase.SETTLEMENT]: 6
        };
        return phaseOrder[this._currentPhase] < phaseOrder[targetPhase];
    }
    
    /**
     * 检查是否可以执行操作
     */
    canPerformAction(): boolean {
        // 游戏未开始或已结算，不能执行操作
        if (!this._gameStarted || !this._isInGamePhase) {
            return false;
        }
        
        // 检查当前玩家是否活跃
        if (this._currentTurnPlayerIndex >= 0) {
            const playerState = this._playerManager.getPlayerState(this._currentTurnPlayerIndex);
            if (playerState && (playerState.isAllIn || playerState.isFold)) {
                return false;
            }
        }
        
        return true;
    }
}
