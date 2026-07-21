import { LogService } from '../utils/LogService';
/**
 * PVP 游戏流程控制器
 * 专门处理 PVP 模式的游戏核心流程
 * 与 PVE 模式分离，确保 PVP 特有逻辑的独立性
 * 
 * 主要功能：
 * - 游戏阶段管理
 * - 下注流程
 * - 发牌逻辑
 * - 回合控制
 * - 玩家操作验证
 * - 倒计时管理
 */
import { Label, Node, Prefab } from 'cc';
import { GameManager } from '../managers/GameManager';
import { PlayerManager } from '../managers/PlayerManager';
import { CardManager } from '../managers/CardManager';
import { UIManager } from '../managers/UIManager';
import { ActionDebouncer } from '../managers/ActionDebouncer';

export enum GamePhase {
    WAITING = 'WAITING',
    PREFLOP = 'PREFLOP',
    FLOP = 'FLOP',
    TURN = 'TURN',
    RIVER = 'RIVER',
    SHOWDOWN = 'SHOWDOWN',
    SETTLEMENT = 'SETTLEMENT'
}

export interface GameFlowCallbacks {
    // 游戏生命周期回调
    onGameStart?: () => void;
    onGameReset?: () => void;
    onDealComplete?: () => void;
    onPhaseChange?: (phase: GamePhase) => void;
    onRoundComplete?: () => void;
    onShowdown?: () => void;
    onSettlement?: (result: any) => void;
    
    // 回合相关回调
    onPlayerTurn?: (playerIndex: number, isAI: boolean) => void;
    onPlayerAction?: (playerIndex: number, action: string, amount: number) => void;
    
    // 倒计时相关回调
    onCountdownStarted?: (duration: number) => void;
    onCountdownTick?: (timeRemaining: number) => void;
    onCountdownExpired?: () => void;
    onCountdownStopped?: () => void;
    
    // AI 相关回调
    onAIStartThinking?: () => void;
    onAIEndThinking?: () => void;
}

export class GameFlowPvpController {
    
    // 核心管理器
    private _gameManager: GameManager;
    private _playerManager: PlayerManager;
    private _cardManager: CardManager;
    private _uiManager: UIManager;
    private _actionDebouncer: ActionDebouncer;
    
    // 游戏状态
    private _currentPhase: GamePhase = GamePhase.WAITING;
    private _gameStarted: boolean = false;
    private _isInGamePhase: boolean = false;
    private _currentRound: number = 0;
    
    // 玩家操作状态
    private _currentTurnPlayerIndex: number = -1;
    private _currentTurnIsAI: boolean = false;
    private _serverTimeRemaining: number = 30;
    
    // 服务端推送的操作
    private _serverAvailableActions: any[] = [];
    
    // 阶段统计
    private _preflopComplete: boolean = false;
    private _flopComplete: boolean = false;
    private _turnComplete: boolean = false;
    private _riverComplete: boolean = false;
    
    // 倒计时
    private _countdownInterval: number = -1;
    private _countdownTimer: number = 30;
    
    // 确认状态
    private _confirmationPending: boolean = false;
    private _confirmedPlayers: Set<number> = new Set();
    
    // 回调函数
    private _callbacks: GameFlowCallbacks = {};
    
    // 容器节点
    private _playersContainer: Node;
    private _container: Node;
    private _playersActionNode: Node;
    private _potLabel: Label;
    
    // 房间信息
    private _roomId: number = 0;
    
    // AI操作锁
    private _aiActionInProgress: boolean = false;
    
    // 防重复点击和消息去重
    private _isActionProcessing: boolean = false;
    private _lastShowActionsTime: number = 0;
    private _lastShowActionsTimestamp: number = 0;
    
    constructor(
        gameManager: GameManager,
        playerManager: PlayerManager,
        cardManager: CardManager,
        uiManager: UIManager,
        actionDebouncer: ActionDebouncer,
        playersContainer: Node,
        container: Node,
        playersActionNode: Node,
        potLabel: Label
    ) {
        this._gameManager = gameManager;
        this._playerManager = playerManager;
        this._cardManager = cardManager;
        this._uiManager = uiManager;
        this._actionDebouncer = actionDebouncer;
        this._playersContainer = playersContainer;
        this._container = container;
        this._playersActionNode = playersActionNode;
        this._potLabel = potLabel;
    }
    
    /**
     * 设置房间ID
     */
    setRoomId(roomId: number) {
        this._roomId = roomId;
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: GameFlowCallbacks) {
        this._callbacks = { ...this._callbacks, ...callbacks };
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
        
        // 重置确认状态
        this._confirmationPending = false;
        this._confirmedPlayers.clear();
        
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
        this.stopCountdown();
        
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
        
        const notify = data.actionNotify;
        if (!notify) {
            LogService.error('GameFlowPvpController', '无效的玩家回合通知数据');
            return;
        }
        
        // ✅ [防御性检查] 如果收到通知指向ALL-IN玩家，跳过处理
        if (data.actionPlayer && data.actionPlayer.isAllIn) {
            LogService.warn('GameFlowPvpController', '收到ALL-IN玩家的操作通知，跳过处理');
            return;
        }
        
        // 隐藏所有玩家的倒计时
        this._hideAllPlayerCountdowns();
        
        // 更新当前回合玩家
        if (data.actionPlayer) {
            this._currentTurnPlayerIndex = data.actionPlayer.seatIndex;
            this._currentTurnIsAI = data.actionPlayer.isAI;
            
            // ✅ [防御性检查] 如果轮到真实玩家但他已ALL-IN，跳过
            if (notify.isMyTurn && data.actionPlayer.isAllIn) {
                LogService.warn('GameFlowPvpController', '轮到真实玩家但他已ALL-IN，跳过操作');
                return;
            }
            
            // 获取服务端推送的剩余时间
            if (data.timeRemaining !== undefined) {
                this._serverTimeRemaining = data.timeRemaining;
            }
            
            // 显示当前操作玩家的倒计时
            this._playerManager.showPlayerCountdown(
                this._playersContainer, 
                this._currentTurnPlayerIndex, 
                this._serverTimeRemaining
            );
            
            // 启动客户端倒计时
            this.startCountdown(this._serverTimeRemaining);
            
            // 保存服务端推送的可用操作
            if (data.availableActions) {
                this._serverAvailableActions = data.availableActions;
            }
            
            // 如果是AI玩家，设置锁
            if (data.actionPlayer.isAI) {
                this._aiActionInProgress = true;
            }
            
            // 触发回调
            if (this._callbacks.onPlayerTurn) {
                this._callbacks.onPlayerTurn(this._currentTurnPlayerIndex, this._currentTurnIsAI);
            }
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
        
        // 停止倒计时
        this.stopCountdown();
        
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
        
        // 停止倒计时
        this.stopCountdown();
        
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
        this._stopCountdown();
        
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
        this._stopCountdown();
        
        // 初始化确认状态
        this._confirmationPending = true;
        this._confirmedPlayers.clear();
        
        // 触发回调
        if (this._callbacks.onSettlement) {
            this._callbacks.onSettlement(data);
        }
    }
    
    // ==================== 倒计时管理 ====================
    
    /**
     * 启动倒计时
     */
    startCountdown(timeRemaining: number) {
        this._countdownTimer = timeRemaining;
        
        // 清除之前的倒计时
        this._stopCountdown();
        
        this._countdownInterval = setInterval(() => {
            this._countdownTimer--;
            
            if (this._callbacks.onCountdownTick) {
                this._callbacks.onCountdownTick(this._countdownTimer);
            }
            
            if (this._countdownTimer <= 0) {
                this._stopCountdown();
                
                if (this._callbacks.onCountdownExpired) {
                    this._callbacks.onCountdownExpired();
                }
            }
        }, 1000) as unknown as number;
    }
    
    /**
     * 停止倒计时
     */
    stopCountdown() {
        this._stopCountdown();
    }
    
    /**
     * 内部停止倒计时
     */
    private _stopCountdown() {
        if (this._countdownInterval !== -1) {
            clearInterval(this._countdownInterval);
            this._countdownInterval = -1;
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
    
    // ==================== 确认状态管理 ====================
    
    /**
     * 检查是否正在等待确认
     */
    isConfirmationPending(): boolean {
        return this._confirmationPending;
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
     * 清除所有确认状态
     */
    clearConfirmations() {
        this._confirmedPlayers.clear();
        this._confirmationPending = false;
    }
    
    // ==================== 操作验证 ====================
    
    /**
     * 获取服务端推送的可用操作
     */
    getServerAvailableActions(): any[] {
        return this._serverAvailableActions;
    }
    
    /**
     * 设置服务端推送的可用操作
     */
    setServerAvailableActions(actions: any[]): void {
        this._serverAvailableActions = actions || [];
    }
    
    /**
     * 检查是否可以执行操作
     */
    /*
    canPerformAction(): boolean {
        // 检查是否正在处理AI操作
        if (this._aiActionInProgress) {
            return false;
        }
        
        // 检查当前玩家是否ALL-IN
        const currentPlayerState = this._playerManager.getPlayerState(this._currentTurnPlayerIndex);
        if (currentPlayerState) {
            if (currentPlayerState.isAllIn) {
                LogService.warn('GameFlowPvpController', '当前玩家已ALL-IN，不允许操作');
                return false;
            }
            if (currentPlayerState.isFold) {
                LogService.warn('GameFlowPvpController', '当前玩家已弃牌，不允许操作');
                return false;
            }
        }
        
        return true;
    }*/

    /**
     * 检查是否可以执行操作
     */
    canPerformAction(): boolean {
        // ✅ [修复] 游戏未开始或已结算，不能执行操作
        if (!this._gameStarted || !this._isInGamePhase) {
            LogService.debug('GameFlowPvpController', `canPerformAction: 游戏未进行中 - _gameStarted=${this._gameStarted}, _isInGamePhase=${this._isInGamePhase}`);
            return false;
        }
        
        // ✅ [修复] 如果是AI回合，玩家不能执行操作
        if (this._currentTurnIsAI) {
            LogService.debug('GameFlowPvpController', 'canPerformAction: 当前是AI回合');
            return false;
        }
        
        // ✅ [修复] 检查当前回合玩家索引是否有效
        if (this._currentTurnPlayerIndex < 0) {
            LogService.debug('GameFlowPvpController', 'canPerformAction: 当前回合玩家索引无效');
            return false;
        }
        
        // ✅ [修复] 检查当前玩家是否是本地玩家
        const localPlayerSeat = this._playerManager.getPlayerSeat();
        if (this._currentTurnPlayerIndex !== localPlayerSeat) {
            LogService.debug('GameFlowPvpController', `canPerformAction: 不是当前玩家的回合 - currentTurn=${this._currentTurnPlayerIndex}, localSeat=${localPlayerSeat}`);
            return false;
        }
        
        // ✅ [修复] 检查当前玩家是否活跃（未弃牌、未全押）
        const playerState = this._playerManager.getPlayerState(this._currentTurnPlayerIndex);
        if (!playerState) {
            LogService.debug('GameFlowPvpController', `canPerformAction: 未找到玩家状态 - seatIndex=${this._currentTurnPlayerIndex}`);
            return false;
        }
        
        if (playerState.isFold || playerState.isFolded) {
            LogService.debug('GameFlowPvpController', 'canPerformAction: 当前玩家已弃牌');
            return false;
        }
        
        if (playerState.isAllIn) {
            LogService.debug('GameFlowPvpController', 'canPerformAction: 当前玩家已全押');
            return false;
        }
        
        // ✅ [修复] 检查玩家是否在线
        if (playerState.isOnline === false) {
            LogService.debug('GameFlowPvpController', 'canPerformAction: 当前玩家离线');
            return false;
        }
        
        return true;
    }
    
    // ==================== 重置和清理 ====================
    
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
        
        this._confirmationPending = false;
        this._confirmedPlayers.clear();
        
        this._serverAvailableActions = [];
        this._aiActionInProgress = false;
        
        // 停止倒计时
        this._stopCountdown();
        
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
     * 设置当前回合玩家
     */
    setCurrentTurnPlayer(seatIndex: number, isAI: boolean = false): void {
        this._currentTurnPlayerIndex = seatIndex;
        this._currentTurnIsAI = isAI;
    }
    
    /**
     * 设置游戏阶段
     */
    setGamePhase(phase: string): void {
        let phaseUpper = phase.toUpperCase();
        
        if (phaseUpper.startsWith('BETTING_')) {
            phaseUpper = phaseUpper.replace('BETTING_', '');
        }
        
        if (GamePhase[phaseUpper as keyof typeof GamePhase] !== undefined) {
            this._currentPhase = GamePhase[phaseUpper as keyof typeof GamePhase];
            if (this._currentPhase !== GamePhase.WAITING && this._currentPhase !== GamePhase.SETTLEMENT) {
                this._isInGamePhase = true;
                this._gameStarted = true;
            }
        }
    }
    
    /**
     * 检查当前回合是否是 AI
     */
    isCurrentTurnAI(): boolean {
        return this._currentTurnIsAI;
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
    
    /**
     * 获取服务器时间剩余
     */
    getServerTimeRemaining(): number {
        return this._serverTimeRemaining;
    }
    
    /**
     * 获取倒计时剩余时间
     */
    getCountdownTimer(): number {
        return this._countdownTimer;
    }
    
    /**
     * 获取房间ID
     */
    getRoomId(): number {
        return this._roomId;
    }
    
    /**
     * 检查AI操作是否在进行中
     */
    isAIActionInProgress(): boolean {
        return this._aiActionInProgress;
    }
    
    /**
     * 设置AI操作状态
     */
    setAIActionInProgress(inProgress: boolean) {
        this._aiActionInProgress = inProgress;
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
        // ⚠️ [修复] 使用 indexOf 替代 includes，兼容 ES5 环境
        return [GamePhase.PREFLOP, GamePhase.FLOP, GamePhase.TURN, GamePhase.RIVER].indexOf(this._currentPhase) !== -1;
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
     * 比较两个阶段的先后顺序
     * @param phase1 阶段1
     * @param phase2 阶段2
     * @returns 如果 phase1 在 phase2 之前返回负数，相等返回0，之后返回正数
     */
    comparePhases(phase1: GamePhase, phase2: GamePhase): number {
        const order1 = this.getPhaseOrderFor(phase1);
        const order2 = this.getPhaseOrderFor(phase2);
        return order1 - order2;
    }
    
    private getPhaseOrderFor(phase: GamePhase): number {
        const phaseOrder = {
            [GamePhase.WAITING]: 0,
            [GamePhase.PREFLOP]: 1,
            [GamePhase.FLOP]: 2,
            [GamePhase.TURN]: 3,
            [GamePhase.RIVER]: 4,
            [GamePhase.SHOWDOWN]: 5,
            [GamePhase.SETTLEMENT]: 6
        };
        return phaseOrder[phase] ?? -1;
    }
    
    /**
     * 检查当前阶段是否在指定阶段之后
     */
    isPhaseAfter(targetPhase: GamePhase): boolean {
        return this.getPhaseOrder() > this.getPhaseOrderFor(targetPhase);
    }
    
    /**
     * 检查当前阶段是否在指定阶段之前
     */
    isPhaseBefore(targetPhase: GamePhase): boolean {
        return this.getPhaseOrder() < this.getPhaseOrderFor(targetPhase);
    }
    
    
    
    // ==================== 防重复点击和消息去重 ====================
    
    /**
     * 检查是否正在处理玩家操作（防止重复点击）
     */
    isActionProcessing(): boolean {
        return this._isActionProcessing;
    }
    
    /**
     * 设置操作处理状态
     */
    setActionProcessing(isProcessing: boolean): void {
        this._isActionProcessing = isProcessing;
    }
    
    /**
     * 检查是否可以显示操作按钮（防重复调用）
     * @param messageTimestamp 消息时间戳（可选）
     * @returns 如果可以显示返回 true，否则返回 false
     */
    canShowActions(messageTimestamp?: number): boolean {
        // 防重复调用机制1：检查时间戳（防止短时间内重复显示）
        const now = Date.now();
        const timeDiff = now - this._lastShowActionsTime;
        if (timeDiff < 500) {
            return false;
        }
        
        // 防重复调用机制2：检查消息时间戳（防止处理重复消息）
        if (messageTimestamp && messageTimestamp === this._lastShowActionsTimestamp) {
            return false;
        }
        
        // 更新时间戳
        this._lastShowActionsTime = now;
        if (messageTimestamp) {
            this._lastShowActionsTimestamp = messageTimestamp;
        }
        
        return true;
    }
    
    /**
     * 重置消息去重时间戳
     */
    resetShowActionsTimestamp(): void {
        this._lastShowActionsTime = 0;
        this._lastShowActionsTimestamp = 0;
    }
    
    // ============================================
    // 游戏流程辅助方法 - 用于逐步迁移
    // ============================================
    
    /**
     * 处理翻牌（PVP模式）
     * 注意：此方法仅更新状态，实际发牌UI逻辑仍在 gamingPvp.ts 中
     */
    processFlop(communityCards: number[]) {
        
        this._currentPhase = GamePhase.FLOP;
        this._flopComplete = true;
        
        if (this._callbacks.onPhaseChange) {
            this._callbacks.onPhaseChange(GamePhase.FLOP);
        }
    }
    
    /**
     * 处理转牌（PVP模式）
     */
    processTurn(communityCards: number[]) {
        
        this._currentPhase = GamePhase.TURN;
        this._turnComplete = true;
        
        if (this._callbacks.onPhaseChange) {
            this._callbacks.onPhaseChange(GamePhase.TURN);
        }
    }
    
    /**
     * 处理河牌（PVP模式）
     */
    processRiver(communityCards: number[]) {
        
        this._currentPhase = GamePhase.RIVER;
        this._riverComplete = true;
        
        if (this._callbacks.onPhaseChange) {
            this._callbacks.onPhaseChange(GamePhase.RIVER);
        }
    }
    
    /**
     * 处理摊牌（PVP模式）
     */
    processShowdown() {
        
        this._currentPhase = GamePhase.SHOWDOWN;
        
        if (this._callbacks.onShowdown) {
            this._callbacks.onShowdown();
        }
    }
    
    /**
     * 触发玩家操作回调
     */
    triggerPlayerAction(playerIndex: number, actionType: string, amount: number = 0) {
        if (this._callbacks.onPlayerAction) {
            this._callbacks.onPlayerAction(playerIndex, actionType, amount);
        }
    }
}
