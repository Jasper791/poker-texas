import { Node, Button, Label, EventHandler } from 'cc';
import { ViewPresenter } from './BasePresenter';
import { ActionType } from '../types';
import { LogService } from '../utils/LogService';

/**
 * 简化的操作按钮配置（与 gaming.ts 现有结构兼容）
 */
export interface ActionButtonConfig {
    /**
     * 按钮容器节点（通常是 playersActionNode）
     */
    buttonContainer: Node;
}

/**
 * 操作按钮状态
 */
export interface ActionButtonState {
    canFold: boolean;
    canCheck: boolean;
    canCall: boolean;
    canRaise: boolean;
    canAllIn: boolean;
    canBet?: boolean;
    callAmount: number;
    raiseMin: number;
    raiseMax: number;
}

/**
 * 操作回调
 */
export type ActionCallback = (action: ActionType, amount?: number) => void;

/**
 * 操作按钮 Presenter
 * 负责管理所有操作按钮的显示、隐藏和交互
 * 与 gaming.ts 现有实现保持兼容
 */
export class ActionButtonPresenter extends ViewPresenter {
    private _config: ActionButtonConfig | null = null;
    private _actionCallback: ActionCallback | null = null;
    private _currentState: ActionButtonState = {
        canFold: false,
        canCheck: false,
        canCall: false,
        canRaise: false,
        canAllIn: false,
        canBet: false,
        callAmount: 0,
        raiseMin: 0,
        raiseMax: 0
    };
    private _raiseAmount: number = 0;
    
    // 默认按钮标签映射（统一使用中文）
    private static readonly DEFAULT_BUTTON_LABELS: { [key: string]: string } = {
        'FOLD': '弃牌',
        'CALL': '跟注',
        'RAISE': '加注',
        'CHECK': '过牌',
        'BET': '下注',
        'ALLIN': '全押',
        'CONFIRM': '确认'
    };

    /**
     * 构造函数
     */
    constructor(buttonContainer?: Node) {
        super(buttonContainer);
        if (buttonContainer) {
            this._config = { buttonContainer };
        }
    }

    /**
     * 初始化（简化版，与 gaming.ts 现有结构兼容）
     */
    initWithConfig(config: ActionButtonConfig): void {
        this._config = config;
        this._view = config.buttonContainer;
        this.init();
    }

    protected onInit(): void {
        // 清理按钮节点下的多余子节点
        this._cleanupDuplicateNodes();
        this.hideAllButtons();
    }
    
    /**
     * 清理按钮节点下的多余子节点（修复场景编辑器中的节点结构问题）
     */
    private _cleanupDuplicateNodes(): void {
        if (!this._config?.buttonContainer) return;
        
        const buttonNames = ['FOLD', 'CHECK', 'BET', 'CALL', 'RAISE', 'ALLIN'];
        
        buttonNames.forEach(buttonName => {
            const buttonNode = this._config!.buttonContainer.getChildByName(buttonName);
            if (!buttonNode) return;
            
            // 统计 Label 子节点数量
            const labelNodes: Node[] = [];
            buttonNode.children.forEach(child => {
                if (child.name === 'Label') {
                    labelNodes.push(child);
                }
            });
            
            // 如果有多个 Label 节点，保留第一个，删除其余的
            if (labelNodes.length > 1) {
                for (let i = 1; i < labelNodes.length; i++) {
                    labelNodes[i].destroy();
                }
            }
        });
    }

    protected onDestroy(): void {
        super.onDestroy();
        this._actionCallback = null;
        this._config = null;
    }

    protected onReset(): void {
        this.hideAllButtons();
        this._raiseAmount = 0;
    }

    /**
     * 设置操作回调
     */
    setActionCallback(callback: ActionCallback): void {
        this._actionCallback = callback;
    }

    /**
     * 更新按钮标签
     */
    private updateButtonLabel(button: Node, text: string): void {
        // 尝试获取直接子节点 Label（主标签）
        const labelNode = button.getChildByName('Label');
        if (labelNode) {
            const label = labelNode.getComponent(Label);
            if (label) {
                label.string = text;
                return;
            }
        }
        
        // 备用：获取第一个 Label 组件
        const label = button.getComponentInChildren(Label);
        if (label) {
            label.string = text;
        }
    }
    
    /**
     * 更新按钮值（金额）
     */
    private updateButtonValue(button: Node, value: string): void {
        const valueNode = button.getChildByName('value');
        if (valueNode) {
            const label = valueNode.getComponent(Label) || valueNode.getComponentInChildren(Label);
            if (label) {
                label.string = value;
            }
        }
    }
    
    /**
     * 重置按钮标签到默认值
     */
    private resetButtonLabel(buttonName: string): void {
        const button = this.getButton(buttonName);
        if (button) {
            const defaultLabel = ActionButtonPresenter.DEFAULT_BUTTON_LABELS[buttonName];
            if (defaultLabel) {
                this.updateButtonLabel(button, defaultLabel);
            }
        }
    }
    
    /**
     * 重置所有按钮标签
     */
    private resetAllButtonLabels(): void {
        // CONFIRM 按钮不在玩家操作按钮组中（属于结算面板），不包含在这里
        const buttonNames = ['FOLD', 'CALL', 'RAISE', 'CHECK', 'BET', 'ALLIN'];
        buttonNames.forEach(name => this.resetButtonLabel(name));
    }

    /**
     * 获取指定名称的按钮节点
     */
    private getButton(name: string): Node | null {
        if (!this._config?.buttonContainer) {
            return null;
        }
        
        // 优先在 action 子节点中查找
        const actionNode = this._config.buttonContainer.getChildByName('action');
        if (actionNode) {
            const btn = actionNode.getChildByName(name);
            if (btn) {
                return btn;
            }
        }
        
        // 如果 action 节点中没有，在容器中直接查找
        const btn = this._config.buttonContainer.getChildByName(name);
        return btn;
    }

    /**
     * 统一按钮名称格式
     */
    private _normalizeButtonName(name: string): string {
        const nameMap: { [key: string]: string } = {
            'ALL_IN': 'ALLIN',
            'ALL-IN': 'ALLIN',
            'allin': 'ALLIN',
            'call': 'CALL',
            'fold': 'FOLD',
            'raise': 'RAISE',
            'check': 'CHECK',
            'bet': 'BET'
        };
        
        const normalized = nameMap[name];
        return normalized || name.toUpperCase();
    }

    /**
     * 根据按钮类型更新金额值（不修改Label）
     */
    private _updateButtonWithAmount(buttonName: string, amount: number): void {
        const button = this.getButton(buttonName);
        if (!button) {
            return;
        }
        
        // 只更新金额值，不修改Label
        this.updateButtonValue(button, String(amount));
    }

    // ==================== 与 gaming.ts 兼容的公共方法 ====================

    /**
     * 初始化按钮（与 gaming.ts 中的 initButtons 对应）
     */
    initButtons(): void {
        // 按钮事件在 gaming.ts 中绑定，这里只做初始化
        this.hideAllButtons();
    }

    /**
     * 显示单个操作按钮
     */
    showActionButton(name: string): void {
        const button = this.getButton(name);
        if (button) {
            button.active = true;
        }
    }

    /**
     * 隐藏单个操作按钮
     */
    hideActionButton(name: string): void {
        const button = this.getButton(name);
        if (button) {
            button.active = false;
        }
    }

    /**
     * 隐藏所有操作按钮（与 gaming.ts 中的 hideAllActionButtons 对应）
     * @param hideContainer 是否同时隐藏容器（默认true，保持与 gaming.ts 行为一致）
     */
    hideAllButtons(hideContainer: boolean = true): void {
        if (!this._config?.buttonContainer) return;

        // CONFIRM 按钮不在玩家操作按钮组中（属于结算面板），不包含在这里
        const buttonNames = ['FOLD', 'CALL', 'RAISE', 'CHECK', 'BET', 'ALLIN'];
        
        buttonNames.forEach(name => {
            const button = this.getButton(name);
            if (button) {
                button.active = false;
            }
        });

        // 同时隐藏容器本身（与 gaming.ts 行为一致）
        if (hideContainer && this._config.buttonContainer) {
            this._config.buttonContainer.active = false;
        }
    }

    /**
     * 隐藏所有操作按钮（别名，与 gaming.ts 函数名一致）
     */
    hideAllActionButtons(): void {
        this.hideAllButtons();
    }

    /**
     * 显示操作按钮（与 gaming.ts 中的 showPlayerActions 配合使用）
     */
    showPlayerActions(availableActions?: string[], data?: any, notify?: any): void {
        if (!this._config?.buttonContainer) return;

        // 显示容器
        this._config.buttonContainer.active = true;

        // 先重置所有按钮标签
        this.resetAllButtonLabels();

        // 先隐藏所有按钮，但保持容器显示
        this.hideAllButtons(false);

        // 获取 needToCall 用于 CALL 按钮显示
        const needToCall = notify?.needToCall ?? 0;

        if (availableActions && Array.isArray(availableActions)) {
            // 使用服务端提供的可用操作
            const shownButtons = new Set<string>();
            
            // 日志记录：输出接收到的所有可用操作
            const actionsLog = availableActions.map((action: any) => {
                const name = typeof action === 'string' ? action : action.actionType;
                const amount = typeof action === 'object' && action.betAmount !== undefined ? action.betAmount : 0;
                return `${name}(${amount})`;
            }).join(', ');
            //LogService.info('ActionButtonPresenter', `接收到服务端推送的 availableActions: [${actionsLog}]`);
            
            availableActions.forEach((action: any) => {
                let buttonName = typeof action === 'string' ? action : action.actionType;
                
                if (!buttonName) {
                    return;
                }
                
                // 统一按钮名称格式
                buttonName = this._normalizeButtonName(buttonName);
                
                if (!shownButtons.has(buttonName)) {
                    this.showActionButton(buttonName);
                    shownButtons.add(buttonName);
                    
                    // 如果有下注金额，更新按钮显示
                    let betAmount = null;
                    if (typeof action === 'object') {
                        if (action.betAmount !== undefined) {
                            betAmount = action.betAmount;
                        } else if (buttonName === 'CALL' && needToCall > 0) {
                            // ✅ [修复] CALL按钮如果没有betAmount，使用needToCall
                            betAmount = needToCall;
                        }
                    }
                    
                    if (betAmount !== null && betAmount !== undefined) {
                        this._updateButtonWithAmount(buttonName, betAmount);
                    }
                }
            });
        } else if (notify) {
            // 降级到旧的逻辑
            const playerChips = notify.playerChips || 0;
            const bigBlind = notify.bigBlind || data?.bigBlind || 10;

            // FOLD - always available
            this.showActionButton('FOLD');

            if (needToCall <= 0) {
                // CHECK - when no bet to call
                this.showActionButton('CHECK');
                
                // BET/RAISE - when no bet to call
                if (playerChips >= bigBlind) {
                    this.showActionButton('RAISE');
                }
            } else {
                // CALL - 德州规则：无论筹码是否足够，都应该显示CALL
                // 当筹码不足时，CALL金额为玩家全部筹码（短筹码跟注）
                if (playerChips > 0) {
                    this.showActionButton('CALL');
                    const callAmount = playerChips >= needToCall ? needToCall : playerChips;
                    this._updateButtonWithAmount('CALL', callAmount);
                }
                
                // RAISE - minRaise = needToCall + minRaiseAmount
                const minRaiseAmount = notify.minRaiseAmount || notify.lastRaiseAmount || bigBlind;
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
    }

    /**
     * 更新按钮状态
     */
    updateButtonState(state: Partial<ActionButtonState>): void {
        this._currentState = { ...this._currentState, ...state };
        this.updateButtonDisplay();
    }

    /**
     * 更新按钮显示
     */
    private updateButtonDisplay(): void {
        if (!this._config) return;

        // 弃牌按钮
        if (this._currentState.canFold) {
            this.showActionButton('FOLD');
        } else {
            this.hideActionButton('FOLD');
        }

        // 过牌按钮
        if (this._currentState.canCheck) {
            this.showActionButton('CHECK');
        } else {
            this.hideActionButton('CHECK');
        }

        // 跟注按钮
        if (this._currentState.canCall) {
            this.showActionButton('CALL');
            const callBtn = this.getButton('CALL');
            if (callBtn) {
                this.updateButtonLabel(callBtn, `跟注 ${this._currentState.callAmount}`);
            }
        } else {
            this.hideActionButton('CALL');
        }

        // 下注按钮
        if (this._currentState.canBet) {
            this.showActionButton('BET');
        } else {
            this.hideActionButton('BET');
        }

        // 加注按钮
        if (this._currentState.canRaise) {
            this.showActionButton('RAISE');
        } else {
            this.hideActionButton('RAISE');
        }

        // 全下按钮
        if (this._currentState.canAllIn) {
            this.showActionButton('ALLIN');
        } else {
            this.hideActionButton('ALLIN');
        }
    }

    // ==================== 兼容旧接口的方法 ====================

    /**
     * 显示按钮（保留旧接口）
     */
    showButtons(state: ActionButtonState): void {
        this.updateButtonState(state);
        if (this._config?.buttonContainer) {
            this._config.buttonContainer.active = true;
        }
    }

    // ==================== 加注金额控制 ====================

    /**
     * 增加加注金额
     */
    increaseRaiseAmount(delta: number = 10): void {
        this._raiseAmount = Math.min(this._raiseAmount + delta, this._currentState.raiseMax);
        this.updateRaiseDisplay();
    }

    /**
     * 减少加注金额
     */
    decreaseRaiseAmount(delta: number = 10): void {
        this._raiseAmount = Math.max(this._raiseAmount - delta, this._currentState.raiseMin);
        this.updateRaiseDisplay();
    }

    /**
     * 设置加注金额
     */
    setRaiseAmount(amount: number): void {
        this._raiseAmount = Math.max(this._currentState.raiseMin, Math.min(amount, this._currentState.raiseMax));
        this.updateRaiseDisplay();
    }

    /**
     * 更新加注显示
     */
    private updateRaiseDisplay(): void {
        const raiseBtn = this.getButton('RAISE');
        if (raiseBtn) {
            this.updateButtonLabel(raiseBtn, `加注 ${this._raiseAmount}`);
        }
    }

    /**
     * 获取当前加注金额
     */
    getRaiseAmount(): number {
        return this._raiseAmount;
    }
}
