/**
 * 游戏 UI 处理器（聚合类）
 * 统一管理所有 UI 更新器，提供统一的 UI 更新入口
 */
import { Node, Prefab, Label } from 'cc';
import { PlayerManager } from '../managers/PlayerManager';
import { UIManager } from '../managers/UIManager';
import { CardManager } from '../managers/CardManager';
import { GameManager } from '../managers/GameManager';
import { ActionDebouncer } from '../managers/ActionDebouncer';
import { PlayerUIUpdater } from './PlayerUIUpdater';
import { ActionButtonManager } from './ActionButtonManager';
import { PokerDisplayHandler } from './PokerDisplayHandler';
import { LogService } from '../utils/LogService';

// ====== Presenter 模块导入 ======
import {
    CardDisplayPresenter,
    PlayerInfoPresenter,
    ActionButtonPresenter,
    SettlementPresenter
} from '../presenters';

export class GameUIHandler {
    
    public playerUIUpdater: PlayerUIUpdater;
    public actionButtonManager: ActionButtonManager;
    public pokerDisplayHandler: PokerDisplayHandler;
    
    // ====== Presenter 模块 ======
    private _cardPresenter: CardDisplayPresenter | null = null;
    private _playerPresenter: PlayerInfoPresenter | null = null;
    private _actionPresenter: ActionButtonPresenter | null = null;
    private _settlementPresenter: SettlementPresenter | null = null;
    private _presentersInitialized: boolean = false;
    
    private _rootNode: Node;
    private _isInitialized: boolean = false;
    
    // 回调函数
    private _onFoldCallback: (() => void) | null = null;
    private _onCallCallback: (() => void) | null = null;
    private _onRaiseCallback: (() => void) | null = null;
    private _onCheckCallback: (() => void) | null = null;
    private _onAllInCallback: (() => void) | null = null;
    private _onBetCallback: (() => void) | null = null;
    private _onConfirmCallback: (() => void) | null = null;
    
    constructor(
        rootNode: Node,
        playerManager: PlayerManager,
        uiManager: UIManager,
        cardManager: CardManager,
        gameManager: GameManager,
        actionDebouncer: ActionDebouncer,
        pokerPrefab: Prefab,
        playersContainer: Node,
        playersActionNode: Node,
        container: Node,
        potLabel: Label
    ) {
        this._rootNode = rootNode;
        
        // 初始化各个子模块
        this.playerUIUpdater = new PlayerUIUpdater(playerManager, uiManager, playersContainer);
        this.actionButtonManager = new ActionButtonManager(playersActionNode, uiManager, actionDebouncer, potLabel);
        this.pokerDisplayHandler = new PokerDisplayHandler(container, pokerPrefab, cardManager, gameManager, playerManager);
        
        // 设置按钮回调（需要在外部调用 setButtonCallbacks 后生效）
        this._updateButtonCallbacks();
        
        this._isInitialized = true;
    }
    
    /**
     * 设置按钮回调函数
     */
    setButtonCallbacks(
        onFold: () => void,
        onCall: () => void,
        onRaise: () => void,
        onCheck: () => void,
        onAllIn: () => void,
        onBet: () => void,
        onConfirm: () => void
    ) {
        this._onFoldCallback = onFold;
        this._onCallCallback = onCall;
        this._onRaiseCallback = onRaise;
        this._onCheckCallback = onCheck;
        this._onAllInCallback = onAllIn;
        this._onBetCallback = onBet;
        this._onConfirmCallback = onConfirm;
        
        // 更新 ActionButtonManager 的回调
        this._updateButtonCallbacks();
    }
    
    /**
     * 更新按钮回调
     */
    private _updateButtonCallbacks() {
        if (this.actionButtonManager && 
            this._onFoldCallback && this._onCallCallback && 
            this._onRaiseCallback && this._onCheckCallback &&
            this._onAllInCallback && this._onBetCallback && this._onConfirmCallback) {
            
            this.actionButtonManager.setButtonCallbacks(
                this._onFoldCallback,
                this._onCallCallback,
                this._onRaiseCallback,
                this._onCheckCallback,
                this._onAllInCallback,
                this._onBetCallback,
                this._onConfirmCallback
            );
        }
    }
    
    /**
     * 统一的 UI 更新入口
     * 根据游戏状态更新所有 UI 组件
     */
    updateUIFromState(state: any) {
        if (!this._isInitialized) {
            LogService.warn('GameUIHandler', 'UI 处理器尚未初始化');
            return;
        }
        
        // 更新玩家信息
        if (state.players && Array.isArray(state.players)) {
            this.playerUIUpdater.updateAllPlayersUI(state.players);
        }
        
        // 更新公牌
        if (state.communityCards && Array.isArray(state.communityCards)) {
            this.pokerDisplayHandler.updateCommunityCardsFromState(state.communityCards);
        }
        
        // 更新玩家手牌
        if (state.players && Array.isArray(state.players)) {
            this.pokerDisplayHandler.updatePlayerHoleCardsFromState(state.players);
        }
        
        // 更新操作按钮（如果是玩家回合）
        if (state.actionNotify && state.actionNotify.isMyTurn && state.availableActions) {
            this.actionButtonManager.showPlayerActions(state, state.actionNotify);
        }
        
        // 更新底池金额
        if (state.totalPot !== undefined || state.mainPot !== undefined) {
            // 通过 UIManager 更新底池显示
            // 这里需要 UIManager 的引用，已经在子模块中
        }
    }
    
    /**
     * 清除所有牌（新局开始时调用）
     */
    clearAllCards() {
        this.pokerDisplayHandler.clearPreviousRoundCards();
    }
    
    /**
     * 清除玩家手牌
     */
    clearPlayerCards() {
        this.pokerDisplayHandler.clearPlayerCards();
    }
    
    /**
     * 清除公牌
     */
    clearBoardCards() {
        this.pokerDisplayHandler.clearBoardCards();
    }
    
    /**
     * 显示操作按钮
     */
    showPlayerActions(data: any, notify: any) {
        this.actionButtonManager.showPlayerActions(data, notify);
    }
    
    /**
     * 隐藏操作按钮
     */
    hidePlayerActions() {
        this.actionButtonManager.hideAllActionButtons();
    }
    
    /**
     * 更新单个玩家 UI
     */
    updateSinglePlayerUI(seatIndex: number, playerState: any) {
        this.playerUIUpdater.updateSinglePlayerUI(seatIndex, playerState);
    }
    
    /**
     * 设置待显示的操作
     */
    setPendingAction(seatIndex: number, action: string, amount: number, nickname: string) {
        this.playerUIUpdater.setPendingAction(seatIndex, action, amount, nickname);
    }
    
    /**
     * 更新玩家昵称
     */
    updateAvatarNickname(playerIndex: number, nickname: string) {
        this.playerUIUpdater.updateAvatarNickname(playerIndex, nickname);
    }
    
    /**
     * 显示公牌（带动画）
     */
    async showCommunityCards(cards: number[]) {
        await this.pokerDisplayHandler.showCommunityCards(cards);
    }
    
    /**
     * 立即显示公牌（不带动画）
     */
    dealBoardCardImmediate(cardId: number, index: number) {
        this.pokerDisplayHandler.dealBoardCardImmediate(cardId, index);
    }
    
    /**
     * 显示玩家手牌
     */
    async showPlayerCards(seatIndex: number, cards: any[]) {
        await this.pokerDisplayHandler.showPlayerCards(seatIndex, cards);
    }
    
    /**
     * 检查是否已初始化
     */
    isInitialized(): boolean {
        return this._isInitialized;
    }
    
    /**
     * 初始化 Presenter 模块
     */
    initializePresenters(
        pokerPrefab: Prefab,
        avatarPrefab: Prefab,
        winPanelPrefab: Prefab,
        playersActionNode: Node,
        container: Node,
        actionCallback: (action: string, amount?: number) => void,
        continueCallback: (continueToNext: boolean) => void
    ): void {
        
        
        try {
            if (pokerPrefab && container) {
                this._cardPresenter = new CardDisplayPresenter();
                this._cardPresenter.initWithConfig({
                    pokerPrefab: pokerPrefab,
                    cardParent: container
                });
                LogService.info('GameUIHandler', 'CardDisplayPresenter 初始化成功');
            }
            
            if (avatarPrefab && this.playerUIUpdater) {
                this._playerPresenter = new PlayerInfoPresenter();
                this._playerPresenter.initWithConfig({
                    avatarPrefab: avatarPrefab,
                    parent: this.playerUIUpdater.getPlayersContainer()
                });
                LogService.info('GameUIHandler', 'PlayerInfoPresenter 初始化成功');
            }
            
            if (playersActionNode) {
                this._actionPresenter = new ActionButtonPresenter(playersActionNode);
                this._actionPresenter.init();
                this._actionPresenter.setActionCallback(actionCallback);
                LogService.info('GameUIHandler', 'ActionButtonPresenter 初始化成功');
            }
            
            if (winPanelPrefab && container) {
                this._settlementPresenter = new SettlementPresenter();
                this._settlementPresenter.initWithConfig({
                    winPanelPrefab: winPanelPrefab,
                    parent: container
                });
                this._settlementPresenter.setContinueCallback(continueCallback);
                LogService.info('GameUIHandler', 'SettlementPresenter 初始化成功');
            }
            
            this._presentersInitialized = true;
            
            
        } catch (error) {
            LogService.error('GameUIHandler', 'Presenter 初始化失败', error);
        }
    }
    
    /**
     * 获取 CardPresenter
     */
    getCardPresenter(): CardDisplayPresenter | null {
        return this._cardPresenter;
    }
    
    /**
     * 获取 PlayerPresenter
     */
    getPlayerPresenter(): PlayerInfoPresenter | null {
        return this._playerPresenter;
    }
    
    /**
     * 获取 ActionPresenter
     */
    getActionPresenter(): ActionButtonPresenter | null {
        return this._actionPresenter;
    }
    
    /**
     * 获取 SettlementPresenter
     */
    getSettlementPresenter(): SettlementPresenter | null {
        return this._settlementPresenter;
    }
    
    /**
     * 隐藏结算面板
     */
    hideSettlementPanel(): void {
        if (this._settlementPresenter) {
            this._settlementPresenter.hideSettlementPanel();
        }
    }
    
    /**
     * 销毁所有 Presenter
     */
    destroyPresenters(): void {
        if (this._cardPresenter) {
            this._cardPresenter.destroy();
            this._cardPresenter = null;
        }
        if (this._playerPresenter) {
            this._playerPresenter.destroy();
            this._playerPresenter = null;
        }
        if (this._actionPresenter) {
            this._actionPresenter.destroy();
            this._actionPresenter = null;
        }
        if (this._settlementPresenter) {
            this._settlementPresenter.destroy();
            this._settlementPresenter = null;
        }
        this._presentersInitialized = false;
    }
    
    /**
     * 检查 Presenter 是否已初始化
     */
    arePresentersInitialized(): boolean {
        return this._presentersInitialized;
    }
}
