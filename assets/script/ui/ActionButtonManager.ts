import { LogService } from '../utils/LogService';
/**
 * 操作按钮管理器
 * 负责管理玩家操作按钮的显示、隐藏和交互
 */
import { Node, Label } from 'cc';
import { UIManager } from '../managers/UIManager';
import { ActionDebouncer } from '../managers/ActionDebouncer';

export class ActionButtonManager {
    
    private _playersActionNode: Node;
    private _uiManager: UIManager;
    private _actionDebouncer: ActionDebouncer;
    private _actionNode: Node;
    private _potLabel: Label;
    
    // 存储从服务端获取的可用操作
    private _serverAvailableActions: any[] = null;
    
    // 防重复显示相关
    private _lastShowActionsTime: number = 0;
    private _lastShowActionsTimestamp: number = 0;
    
    // 回调函数
    private _onFoldCallback: (() => void) | null = null;
    private _onCallCallback: (() => void) | null = null;
    private _onRaiseCallback: (() => void) | null = null;
    private _onCheckCallback: (() => void) | null = null;
    private _onAllInCallback: (() => void) | null = null;
    private _onBetCallback: (() => void) | null = null;
    private _onConfirmCallback: (() => void) | null = null;
    
    constructor(
        playersActionNode: Node, 
        uiManager: UIManager, 
        actionDebouncer: ActionDebouncer,
        potLabel: Label
    ) {
        this._playersActionNode = playersActionNode;
        this._uiManager = uiManager;
        this._actionDebouncer = actionDebouncer;
        this._potLabel = potLabel;
        
        // 获取action子节点
        this._actionNode = playersActionNode?.getChildByName('action') || playersActionNode;
    }
    
    /**
     * 设置按钮回调
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
    }
    
    /**
     * 显示玩家操作按钮
     */
    showPlayerActions(data: any, notify: any) {
        //LogService.info('ActionButtonManager', `needToCall: ${notify?.needToCall || 0}, playerChips: ${notify?.playerChips || 0}`);
        
        // ✅ [修复] 检查当前行动玩家索引，避免在非自己回合时显示操作按钮
        const currentActIndex = data.currentActIndex;
        const mySeatIndex = notify?.seatIndex;
        
        // 如果服务端明确指定了当前行动玩家，且不是自己，则隐藏操作按钮
        if (currentActIndex !== undefined && mySeatIndex !== undefined && currentActIndex !== mySeatIndex) {
            LogService.info('ActionButtonManager', `当前行动玩家是 seatIndex=${currentActIndex}，不是自己 (seatIndex=${mySeatIndex})，隐藏操作按钮`);
            this.hideAllActionButtons();
            return;
        }
        
        // ✅ [修复] 防重复调用机制：只在真实玩家回合时进行防重复检查
        // AI回合时不进行防重复，确保按钮能正确更新
        const now = Date.now();
        const timeDiff = now - this._lastShowActionsTime;
        
        // 真实玩家回合时使用较长的防重复时间（1000ms）
        const isMyTurn = notify?.isMyTurn;
        const minTimeDiff = isMyTurn ? 1000 : 0;
        
        if (timeDiff < minTimeDiff) {
            return;
        }
        
        // 防重复调用机制2：检查消息时间戳（防止处理重复消息）
        const messageTimestamp = notify?.timestamp || data?.timestamp;
        if (messageTimestamp && messageTimestamp === this._lastShowActionsTimestamp) {
            return;
        }
        
        // 更新时间戳
        this._lastShowActionsTime = now;
        if (messageTimestamp) {
            this._lastShowActionsTimestamp = messageTimestamp;
        }
        
        // 隐藏所有按钮，然后根据可用操作显示对应按钮
        this.hideAllActionButtons();
        
        const needToCall = notify.needToCall || 0;
        const playerChips = notify.playerChips || 0;
        const currentBet = notify.currentBet || data.currentBet || 0;

        // ✅ [修复] 更新UI显示
        if (this._uiManager) {
            this._uiManager.updateCurrentBet(currentBet);
            // 优先使用 totalPot，因为它包含所有玩家的投注
            const potValue = data.totalPot !== undefined ? data.totalPot : (notify.totalPot !== undefined ? notify.totalPot : (data.mainPot !== undefined ? data.mainPot : (notify.mainPot !== undefined ? notify.mainPot : 0)));
            // ✅ [日志增强] 使用INFO级别确保日志显示
            this._uiManager.updatePotAmount(this._potLabel, potValue);
            // 注意：这里我们没有PlayerManager的引用，所以不更新玩家筹码
            // this._uiManager.updatePlayerChips(playerSeat, playerChips);
            this._uiManager.updateNeedToCall(needToCall);
        }

        // 优先使用服务端推送的availableActions（确保按钮正确）
        let availableActions = null;
        // 1. 先从data根级别找
        if (data.availableActions && Array.isArray(data.availableActions)) {
            availableActions = data.availableActions;
        } 
        // 2. 再从data.validationResult找
        else if (data.validationResult && data.validationResult.availableActions && 
                   Array.isArray(data.validationResult.availableActions)) {
            availableActions = data.validationResult.availableActions;
        }
        // 3. 最后从notify找
        else if (notify.availableActions && Array.isArray(notify.availableActions)) {
            availableActions = notify.availableActions;
        }
        
        if (availableActions) {
            
            // 保存到成员变量，供后续操作使用
            this._serverAvailableActions = availableActions;
            
            // 日志记录：输出接收到的所有可用操作
            const actionsLog = availableActions.map((action: any) => {
                return `${action.actionType}(${action.betAmount || 0})`;
            }).join(', ');
            //LogService.info('ActionButtonManager', `接收到服务端推送的 availableActions: [${actionsLog}]`);
            
            const shownButtons = new Set<string>(); // 防止重复显示按钮
            
            availableActions.forEach((action: any) => {
                let buttonName = action.actionType;
                
                // 兼容ALL_IN和ALLIN
                if (buttonName === 'ALL_IN') {
                    buttonName = 'ALLIN';
                }
                
                // 防止重复显示
                if (!shownButtons.has(buttonName)) {
                    this.showActionButton(buttonName);
                    shownButtons.add(buttonName);
                    
                    // 使用服务端发送的金额更新按钮显示
                    if (action.betAmount !== undefined && action.betAmount !== null) {
                        this._uiManager.showActiveBtnValue(this._actionNode || this._playersActionNode, buttonName, action.betAmount);
                    }
                }
            });
            
        } else {
            // 降级方案：如果没有availableActions，按服务端规则生成按钮
           // LogService.warn('ActionButtonManager', '没有availableActions，使用降级方案');
            
            // FOLD - always available
            this.showActionButton('FOLD');
            
            if (needToCall <= 0) {
                // CHECK - when no bet to call
                this.showActionButton('CHECK');
                
                // BET/RAISE - when no bet to call
                const bigBlind = notify.bigBlind || data.bigBlind || 10;
                if (playerChips >= bigBlind) {
                    this.showActionButton('RAISE');
                }
            } else {
                // CALL - 德州规则：无论筹码是否足够，都应该显示CALL
                // 当筹码不足时，CALL金额为玩家全部筹码（短筹码跟注）
                if (playerChips > 0) {
                    this.showActionButton('CALL');
                }
                
                // RAISE - minRaise = needToCall + minRaiseAmount
                const minRaiseAmount = notify.minRaiseAmount || notify.lastRaiseAmount || (notify.bigBlind || data.bigBlind || 10);
                const minRaise = needToCall + minRaiseAmount;
                if (playerChips >= minRaise) {
                    this.showActionButton('RAISE');
                }
            }
            
            // ALL_IN - always available when player has chips
            if (playerChips > 0) {
                this.showActionButton('ALLIN');
            }
        }
        
        // 显示操作面板
        if (this._playersActionNode) {
            this._playersActionNode.active = true;
        }
    }
    
    /**
     * 隐藏所有操作按钮
     */
    hideAllActionButtons() {
        const buttons = ['FOLD', 'CALL', 'RAISE', 'CHECK', 'BET', 'ALLIN'];
        buttons.forEach(name => {
            const btn = this._playersActionNode?.getChildByName(name);
            if (btn) {
                btn.active = false;
            }
        });
        
        // 同时隐藏操作面板
        if (this._playersActionNode) {
            this._playersActionNode.active = false;
        }
    }
    
    /**
     * 显示指定操作按钮
     */
    showActionButton(name: string) {
        const btn = this._playersActionNode?.getChildByName(name);
        if (btn) {
            btn.active = true;
        }
    }
    
    /**
     * 获取服务端提供的可用操作
     */
    getServerAvailableActions(): any[] | null {
        return this._serverAvailableActions;
    }
    
    /**
     * 查找按钮辅助方法
     */
    private getButton(name: string): Node | null {
        if (this._actionNode) {
            const btn = this._actionNode.getChildByName(name);
            if (btn) {
                return btn;
            }
        }
        return this._playersActionNode?.getChildByName(name) || null;
    }
}
