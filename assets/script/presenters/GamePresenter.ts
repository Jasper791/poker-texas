import { Node, Prefab, Vec3 } from 'cc';
import { ViewPresenter } from './BasePresenter';
import { CardDisplayPresenter, CardDisplayConfig } from './CardDisplayPresenter';
import { PlayerInfoPresenter, PlayerAvatarConfig } from './PlayerInfoPresenter';
import { ActionButtonPresenter, ActionButtonConfig } from './ActionButtonPresenter';
import { SettlementPresenter, SettlementDisplayConfig } from './SettlementPresenter';
import { GameInitService } from '../services/GameInitService';
import { PlayerActionService } from '../services/PlayerActionService';
import { AIDecisionService } from '../services/AIDecisionService';
import { GameFlowController, GamePhase } from '../core/GameFlowController';
import { EventBus, GameEvents } from '../utils/EventBus';
import { LogService } from '../utils/LogService';
import { ActionType, PlayerInfo, GameConfig } from '../types';

/**
 * 游戏主 Presenter 配置
 */
export interface GamePresenterConfig {
    pokerPrefab?: Prefab;
    avatarPrefab?: Prefab;
    winPanelPrefab?: Prefab;
    cardParent?: Node;
    avatarParent?: Node;
    buttonContainer?: Node;
    settlementParent?: Node;
    playersContainer?: Node;
    config: GameConfig;
}

/**
 * 游戏主 Presenter
 * 整合所有子 Presenter 和 Service，提供统一的游戏控制接口
 * 负责所有 Presenter 的初始化、管理和销毁
 */
export class GamePresenter extends ViewPresenter {
    // 子 Presenter
    private _cardPresenter: CardDisplayPresenter | null = null;
    private _playerPresenter: PlayerInfoPresenter | null = null;
    private _actionPresenter: ActionButtonPresenter | null = null;
    private _settlementPresenter: SettlementPresenter | null = null;

    // 服务
    private _initService: GameInitService;
    private _actionService: PlayerActionService;
    private _aiService: AIDecisionService;
    private _gameFlowController: GameFlowController | null = null;

    // 事件总线
    private _eventBus: EventBus;

    // 配置
    private _config: GamePresenterConfig | null = null;

    // 回调函数
    private _actionCallback: ((action: ActionType, amount?: number) => void) | null = null;
    private _settlementCallback: ((continueToNextHand: boolean) => void) | null = null;
    private _confirmCallback: ((playerIndex: number) => void) | null = null;

    constructor(view?: Node) {
        super(view);
        this._initService = GameInitService.getInstance();
        this._actionService = PlayerActionService.getInstance();
        this._aiService = AIDecisionService.getInstance();
        this._eventBus = EventBus.getInstance();
    }

    protected onInit(): void {
        LogService.info('GamePresenter', 'Initializing game presenter');
        this.setupEventListeners();
    }

    protected onDestroy(): void {
        super.onDestroy();
        this.cleanup();
    }

    protected onReset(): void {
        LogService.info('GamePresenter', 'Resetting game presenter');
        this._cardPresenter?.reset();
        this._playerPresenter?.reset();
        this._actionPresenter?.reset();
        this._initService.reset();
        this._actionService.reset();
        this._aiService.reset();
    }

    /**
     * 配置 Presenter
     */
    configure(config: GamePresenterConfig): void {
        this._config = config;
        this.setupPresenters();
    }

    /**
     * 设置子 Presenter
     */
    private setupPresenters(): void {
        if (!this._config) return;

        // 初始化卡牌显示 Presenter
        if (this._config.pokerPrefab && this._config.cardParent) {
            const cardConfig: CardDisplayConfig = {
                pokerPrefab: this._config.pokerPrefab,
                cardParent: this._config.cardParent
            };
            this._cardPresenter = new CardDisplayPresenter();
            this._cardPresenter.initWithConfig(cardConfig);
        }

        // 初始化玩家信息 Presenter
        if (this._config.avatarPrefab && this._config.avatarParent) {
            const avatarConfig: PlayerAvatarConfig = {
                avatarPrefab: this._config.avatarPrefab,
                parent: this._config.avatarParent
            };
            this._playerPresenter = new PlayerInfoPresenter();
            this._playerPresenter.initWithConfig(avatarConfig);
        }

        // 初始化操作按钮 Presenter
        if (this._config.buttonContainer) {
            this._actionPresenter = new ActionButtonPresenter(this._config.buttonContainer);
            this._actionPresenter.init();
            this._actionPresenter.setActionCallback((action, amount) => {
                this.onPlayerAction(action, amount);
            });
        }

        // 初始化结算 Presenter
        if (this._config.winPanelPrefab && this._config.settlementParent) {
            const settlementConfig: SettlementDisplayConfig = {
                winPanelPrefab: this._config.winPanelPrefab,
                parent: this._config.settlementParent,
                playersContainer: this._config.playersContainer
            };
            this._settlementPresenter = new SettlementPresenter();
            this._settlementPresenter.initWithConfig(settlementConfig);
            if (this._settlementCallback) {
                this._settlementPresenter.setContinueCallback(this._settlementCallback);
            }
            if (this._confirmCallback) {
                this._settlementPresenter.setConfirmCallback(this._confirmCallback);
            }
        }
    }

    /**
     * 设置事件监听
     */
    private setupEventListeners(): void {
        // 游戏开始
        this._eventBus.on(GameEvents.GAME_START, () => {
            this.onGameStart();
        });

        // 游戏结束
        this._eventBus.on(GameEvents.GAME_END, () => {
            this.onGameEnd();
        });

        // 阶段变化
        this._eventBus.on(GameEvents.GAME_PHASE_CHANGE, (phase: GamePhase) => {
            this.onPhaseChange(phase);
        });

        // 发牌
        this._eventBus.on(GameEvents.DEAL_CARDS, (data: any) => {
            this.onDealCards(data);
        });

        // 玩家操作
        this._eventBus.on(GameEvents.PLAYER_ACTION, (data: any) => {
            this.onPlayerActionReceived(data);
        });

        // 玩家回合开始
        this._eventBus.on(GameEvents.PLAYER_TURN_START, (data: any) => {
            this.onPlayerTurnStart(data);
        });
    }

    /**
     * 初始化游戏
     */
    async initGame(config: GameConfig): Promise<void> {
        const result = await this._initService.init(config);
        if (!result.success) {
            LogService.error('GamePresenter', `Game init failed: ${result.error}`);
            throw new Error(result.error);
        }

        // 通知游戏开始
        this._eventBus.emit(GameEvents.GAME_START);
    }

    /**
     * 游戏开始处理
     */
    private onGameStart(): void {
        LogService.info('GamePresenter', 'Game started');
        this._cardPresenter?.reset();
        this._playerPresenter?.reset();
    }

    /**
     * 游戏结束处理
     */
    private onGameEnd(): void {
        LogService.info('GamePresenter', 'Game ended');
        this._actionPresenter?.hideAllButtons();
    }

    /**
     * 阶段变化处理
     */
    private onPhaseChange(phase: GamePhase): void {
        LogService.info('GamePresenter', `Phase changed to: ${phase}`);

        switch (phase) {
            case GamePhase.PREFLOP:
            case GamePhase.FLOP:
            case GamePhase.TURN:
            case GamePhase.RIVER:
                // 显示阶段对应的 UI
                break;
            case GamePhase.SHOWDOWN:
                this._actionPresenter?.hideAllButtons();
                break;
            case GamePhase.SETTLEMENT:
                this._actionPresenter?.hideAllButtons();
                break;
        }
    }

    /**
     * 发牌处理
     */
    private onDealCards(data: any): void {

        if (data.communityCards) {
            this._cardPresenter?.showCommunityCards(
                data.communityCards,
                this.calculateCommunityCardPositions(data.communityCards.length)
            );
        }

        if (data.players) {
            data.players.forEach((player: PlayerInfo) => {
                if (player.cards) {
                    this._cardPresenter?.showPlayerCards(
                        player.seatIndex,
                        player.cards,
                        this.calculatePlayerCardPositions(player.seatIndex, player.cards.length)
                    );
                }
            });
        }
    }

    /**
     * 玩家操作处理
     */
    private onPlayerAction(action: ActionType, amount?: number): void {
        LogService.info('GamePresenter', `Player action: ${action}`, { amount });

        this._actionService.executeAction(action, amount || 0).then((result) => {
            if (result.success) {
                this._actionPresenter?.hideAllButtons();
                this._eventBus.emit(GameEvents.PLAYER_ACTION, { action, amount });
            } else {
                LogService.error('GamePresenter', `Action failed: ${result.error}`);
            }
        });
    }

    /**
     * 收到玩家操作
     */
    private onPlayerActionReceived(data: any): void {
        const { seatIndex, action, amount } = data;
        this._playerPresenter?.showPlayerAction(seatIndex, action, amount);
    }

    /**
     * 玩家回合开始
     */
    private onPlayerTurnStart(data: any): void {
        const { seatIndex, isAI, timeRemaining } = data;

        // 显示倒计时
        this._playerPresenter?.showCountdown(seatIndex, timeRemaining);

        if (isAI) {
            // AI 回合
            this.executeAITurn(seatIndex);
        } else {
            // 玩家回合，显示操作按钮
            this.showActionButtons(data);
        }
    }

    /**
     * 执行 AI 回合
     */
    private async executeAITurn(seatIndex: number): Promise<void> {
        LogService.info('GamePresenter', `Executing AI turn for seat ${seatIndex}`);

        const decision = await this._aiService.executeAITurn(
            { seatIndex } as PlayerInfo,
            this.getCurrentGameState()
        );

        this.onPlayerAction(decision.action, decision.amount);
    }

    /**
     * 显示操作按钮
     */
    private showActionButtons(data: any): void {
        if (!this._actionPresenter) return;

        const state = {
            canFold: true,
            canCheck: data.currentBet === 0,
            canCall: data.currentBet > 0,
            canRaise: true,
            canAllIn: true,
            callAmount: data.needToCall || 0,
            raiseMin: data.minBet || 0,
            raiseMax: data.maxBet || data.playerChips || 0
        };

        this._actionPresenter.showButtons(state);
    }

    /**
     * 计算公共牌位置
     */
    private calculateCommunityCardPositions(count: number): Vec3[] {
        const positions: Vec3[] = [];
        const startX = -((count - 1) * 60) / 2;
        
        for (let i = 0; i < count; i++) {
            positions.push(new Vec3(startX + i * 60, 0, 0));
        }
        
        return positions;
    }

    /**
     * 计算玩家手牌位置
     */
    private calculatePlayerCardPositions(seatIndex: number, count: number): Vec3[] {
        const positions: Vec3[] = [];
        const startX = -((count - 1) * 30) / 2;
        
        for (let i = 0; i < count; i++) {
            positions.push(new Vec3(startX + i * 30, 0, 0));
        }
        
        return positions;
    }

    /**
     * 获取当前游戏状态
     */
    private getCurrentGameState(): any {
        return {
            phase: this._gameFlowController?.getCurrentPhase(),
            pot: 0,
            currentBet: 0,
            communityCards: []
        };
    }

    /**
     * 清理所有 Presenter
     * 统一管理所有子 Presenter 的销毁流程
     */
    private cleanup(): void {
        LogService.info('GamePresenter', '开始销毁所有 Presenter');

        try {
            // 销毁卡牌显示 Presenter
            if (this._cardPresenter) {
                this._cardPresenter.destroy();
                this._cardPresenter = null;
                LogService.info('GamePresenter', 'CardDisplayPresenter 已销毁');
            }

            // 销毁玩家信息 Presenter
            if (this._playerPresenter) {
                this._playerPresenter.destroy();
                this._playerPresenter = null;
                LogService.info('GamePresenter', 'PlayerInfoPresenter 已销毁');
            }

            // 销毁操作按钮 Presenter
            if (this._actionPresenter) {
                this._actionPresenter.destroy();
                this._actionPresenter = null;
                LogService.info('GamePresenter', 'ActionButtonPresenter 已销毁');
            }

            // 销毁结算 Presenter
            if (this._settlementPresenter) {
                this._settlementPresenter.destroy();
                this._settlementPresenter = null;
                LogService.info('GamePresenter', 'SettlementPresenter 已销毁');
            }

            // 清理事件监听
            this._eventBus.clearByContext(this);

            LogService.info('GamePresenter', '所有 Presenter 销毁完成');
        } catch (error) {
            LogService.error('GamePresenter', 'Presenter 销毁失败', error);
        }
    }

    // ==================== 回调函数设置方法 ====================

    /**
     * 设置操作回调函数
     */
    setActionCallback(callback: (action: ActionType, amount?: number) => void): void {
        this._actionCallback = callback;
    }

    /**
     * 设置结算回调函数
     */
    setSettlementCallback(callback: (continueToNextHand: boolean) => void): void {
        this._settlementCallback = callback;
        // 如果 SettlementPresenter 已经初始化，立即设置回调
        if (this._settlementPresenter) {
            this._settlementPresenter.setContinueCallback(callback);
        }
    }

    /**
     * 设置确认回调函数
     */
    setConfirmCallback(callback: (playerIndex: number) => void): void {
        this._confirmCallback = callback;
        // 如果 SettlementPresenter 已经初始化，立即设置回调
        if (this._settlementPresenter) {
            this._settlementPresenter.setConfirmCallback(callback);
        }
    }

    // ==================== 公共访问方法 ====================

    /**
     * 获取卡牌显示 Presenter
     */
    getCardPresenter(): CardDisplayPresenter | null {
        return this._cardPresenter;
    }

    /**
     * 获取玩家信息 Presenter
     */
    getPlayerPresenter(): PlayerInfoPresenter | null {
        return this._playerPresenter;
    }

    /**
     * 获取操作按钮 Presenter
     */
    getActionPresenter(): ActionButtonPresenter | null {
        return this._actionPresenter;
    }

    /**
     * 获取结算 Presenter
     */
    getSettlementPresenter(): SettlementPresenter | null {
        return this._settlementPresenter;
    }

    /**
     * 销毁所有 Presenter（公共方法）
     * 供外部调用以统一销毁所有子 Presenter
     */
    destroyPresenters(): void {
        this.cleanup();
    }
}
