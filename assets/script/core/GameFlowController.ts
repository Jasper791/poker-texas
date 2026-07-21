import { LogService } from '../utils/LogService';
/**
 * 游戏流程控制器
 * 负责管理游戏的核心流程，包括：
 * - 游戏阶段管理
 * - 下注流程
 * - 发牌逻辑
 * - 回合控制
 */
import { Label, Node, Prefab } from 'cc';
import { GameManager } from '../managers/GameManager';
import { PlayerManager } from '../managers/PlayerManager';
import { CardManager } from '../managers/CardManager';
import { UIManager } from '../managers/UIManager';

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
    onGameStart?: () => void;
    onDealComplete?: () => void;
    onPhaseChange?: (phase: GamePhase) => void;
    onPlayerTurn?: (playerIndex: number, isAI: boolean) => void;
    onRoundComplete?: () => void;
    onShowdown?: () => void;
    onSettlement?: (result: any) => void;
    onCountdownTimeout?: () => void;
}

export class GameFlowController {
    
    // 核心管理器
    protected _gameManager: GameManager;
    protected _playerManager: PlayerManager;
    protected _cardManager: CardManager;
    protected _uiManager: UIManager;
    
    // 游戏状态
    protected _currentPhase: GamePhase = GamePhase.WAITING;
    protected _gameStarted: boolean = false;
    protected _isInGamePhase: boolean = false;
    protected _currentRound: number = 0;
    
    // 玩家操作状态
    protected _currentTurnPlayerIndex: number = -1;
    protected _currentTurnIsAI: boolean = false;
    protected _serverTimeRemaining: number = 30;
    
    // 阶段统计
    protected _preflopComplete: boolean = false;
    protected _flopComplete: boolean = false;
    protected _turnComplete: boolean = false;
    protected _riverComplete: boolean = false;
    
    // 回调函数
    protected _callbacks: GameFlowCallbacks = {};
    
    // 容器节点
    protected _playersContainer: Node;
    protected _container: Node;
    protected _playersActionNode: Node;
    protected _potLabel: Label;
    
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
        this._gameManager = gameManager;
        this._playerManager = playerManager;
        this._cardManager = cardManager;
        this._uiManager = uiManager;
        this._playersContainer = playersContainer;
        this._container = container;
        this._playersActionNode = playersActionNode;
        this._potLabel = potLabel;
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: GameFlowCallbacks) {
        this._callbacks = { ...this._callbacks, ...callbacks };
    }
    
    /**
     * 开始游戏（无参数版本）
     */
    startGame(): void {
        this.handleGameStart({});
    }
    
    /**
     * 处理游戏开始
     */
    handleGameStart(data: any) {
        
        // 设置游戏已开始标志
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
    protected _handlePreFlopDeal(data: any) {
        
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
    protected _handleCommunityCards(data: any) {
        const communityCards = data.communityCards;
        const cardCount = communityCards.length;
        
        if (cardCount === 3) {
            // 翻牌阶段
            this._currentPhase = GamePhase.FLOP;
            
            if (this._callbacks.onPhaseChange) {
                this._callbacks.onPhaseChange(GamePhase.FLOP);
            }
        } else if (cardCount === 4) {
            // 转牌阶段
            this._currentPhase = GamePhase.TURN;
            
            if (this._callbacks.onPhaseChange) {
                this._callbacks.onPhaseChange(GamePhase.TURN);
            }
        } else if (cardCount === 5) {
            // 河牌阶段
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
            LogService.error('GameFlowController', '无效的玩家回合通知数据');
            return;
        }
        
        // 隐藏所有玩家的倒计时
        this._hideAllPlayerCountdowns();
        
        // 更新当前回合玩家
        if (data.actionPlayer) {
            this._currentTurnPlayerIndex = data.actionPlayer.seatIndex;
            this._currentTurnIsAI = data.actionPlayer.isAI;
            
            // 显示当前操作玩家的倒计时
            if (data.timeRemaining !== undefined) {
                this._serverTimeRemaining = data.timeRemaining;
            }
            
            this._playerManager.showPlayerCountdown(
                this._playersContainer, 
                this._currentTurnPlayerIndex, 
                this._serverTimeRemaining
            );
            
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
    protected _updatePhaseStatus() {
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
     * 隐藏所有玩家的倒计时
     */
    protected _hideAllPlayerCountdowns() {
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
     * 检查当前回合是否是 AI
     */
    isCurrentTurnAI(): boolean {
        return this._currentTurnIsAI;
    }
    
    /**
     * 检查 PREFLOP 是否完成
     */
    isPreFlopComplete(): boolean {
        return this._preflopComplete;
    }
    
    /**
     * 检查 FLOP 是否完成
     */
    isFlopComplete(): boolean {
        return this._flopComplete;
    }
    
    /**
     * 检查 TURN 是否完成
     */
    isTurnComplete(): boolean {
        return this._turnComplete;
    }
    
    /**
     * 检查 RIVER 是否完成
     */
    isRiverComplete(): boolean {
        return this._riverComplete;
    }
    
    /**
     * 获取当前回合数
     */
    getCurrentRound(): number {
        return this._currentRound;
    }
    
    /**
     * 设置当前回合数
     */
    setCurrentRound(round: number) {
        this._currentRound = round;
    }
    
    /**
     * 设置游戏阶段
     */
    setCurrentPhase(phase: GamePhase) {
        this._currentPhase = phase;
    }
    
    /**
     * 设置游戏已开始标志
     */
    setGameStarted(started: boolean) {
        this._gameStarted = started;
    }
    
    /**
     * 设置是否在游戏阶段中
     */
    setInGamePhase(inGame: boolean) {
        this._isInGamePhase = inGame;
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
     * 设置服务器时间剩余
     */
    setServerTimeRemaining(time: number) {
        this._serverTimeRemaining = time;
    }
}
