import { Node, Prefab, instantiate, Label, Button, UITransform, Sprite, Color, Vec3, tween, find } from 'cc';
import { ViewPresenter } from './BasePresenter';
import { LogService } from '../utils/LogService';
import { WinPanelComponent } from '../WinPanelComponent';
import { CardManager } from '../managers/CardManager';
import { pokerCard } from '../pokerCard';

/**
 * 结算显示配置
 */
export interface SettlementDisplayConfig {
    winPanelPrefab: Prefab;
    parent: Node;
    playersContainer?: Node;
}

/**
 * 结算结果
 */
export interface SettlementResult {
    winners: any[];
    totalPot: number;
    handInfo?: string;
    sidePots?: any[];
}

/**
 * 胜利面板显示数据
 */
export interface WinnerDisplayData {
    winnerIndex: number;
    handTypeName: string;
    handStrength: number;
    pot: number;
    playerSeat: number;
    winnerNickname?: string;
    communityCards?: number[];      // 公牌数组（card_0-card_4）
    winnerHandCards?: number[];     // 胜利者手牌数组（card_5-card_6）
    winners?: number[];             // 所有赢家列表（平局时多个）
    isTie?: boolean;                // 是否是平局
}

/**
 * 结算 Presenter
 * 负责管理结算面板的显示和动画
 * 与 gaming.ts 现有实现保持兼容
 */
export class SettlementPresenter extends ViewPresenter {
    private _config: SettlementDisplayConfig | null = null;
    private _winPanel: Node | null = null;
    private _settlementCallback: ((continueToNextHand: boolean) => void) | null = null;
    private _confirmCallback: ((playerIndex: number) => void) | null = null;
    private _autoConfirmTimeout: any = null;
    private static readonly AUTO_CONFIRM_DELAY = 20000; // 20 秒自动确认

    /**
     * 构造函数
     */
    constructor(winPanelPrefab?: Prefab, parent?: Node) {
        super(parent);
        if (winPanelPrefab && parent) {
            this._config = { winPanelPrefab, parent };
        }
    }

    /**
     * 初始化
     */
    initWithConfig(config: SettlementDisplayConfig): void {
        this._config = config;
        this._view = config.parent;
        this.init();
    }

    protected onInit(): void {
    }

    protected onDestroy(): void {
        super.onDestroy();
        this.hideSettlement();
        this._settlementCallback = null;
        this._config = null;
    }

    protected onReset(): void {
        this.hideSettlement();
    }

    // ==================== 与 gaming.ts 兼容的公共方法 ====================

    /**
     * 显示结算面板（与 gaming.ts 中的 showSettlementPanel 对应）
     */
    showSettlement(result: SettlementResult): void {
        if (!this._config?.winPanelPrefab || !this._config.parent) {
            LogService.error('SettlementPresenter', 'Settlement config not set');
            return;
        }

        LogService.info('SettlementPresenter', 'Showing settlement', result);

        // 隐藏已有的结算面板
        this.hideSettlement();

        // 创建新的结算面板
        this._winPanel = instantiate(this._config.winPanelPrefab);
        this._config.parent.addChild(this._winPanel);

        // ✅ [修复] 设置高层级，确保结算面板显示在最顶层，不被其他组件遮挡
        // 在 Cocos Creator 3.x 中使用 setSiblingIndex 来控制层级
        const parent = this._winPanel.parent;
        if (parent) {
            this._winPanel.setSiblingIndex(parent.children.length);
        }

        // 设置结算数据
        this.updateSettlementDisplay(result);

        // 显示面板
        this._winPanel.active = true;
        this.showAnimation();
    }

    /**
     * 显示结算面板（别名，保持兼容性）
     */
    showSettlementPanel(result: SettlementResult): void {
        this.showSettlement(result);
    }

    /**
     * 更新结算显示
     */
    private updateSettlementDisplay(result: SettlementResult): void {
        if (!this._winPanel) return;

        // 更新赢家标题 (WinnerTitle) - 显示"牌型:"
        const winnerTitleLabel = this.findChildLabel(this._winPanel, 'WinnerTitle');
        if (winnerTitleLabel) {
            winnerTitleLabel.string = '牌型:';
        }

        // 更新牌型信息 (HandType) - 显示牌型如"顺子"、"两对"等
        const handTypeLabel = this.findChildLabel(this._winPanel, 'HandType');
        if (handTypeLabel) {
            handTypeLabel.string = result.handInfo || '未知';
        }

        // 更新底池金额 (Pot) - 显示"获得底池: XXXX"
        const potLabel = this.findChildLabel(this._winPanel, 'Pot');
        if (potLabel) {
            potLabel.string = `获得底池: ${result.totalPot}`;
        }

        // 更新确认提示 (ConfirmHint) - 显示"等待所有玩家确认..."
        const confirmHintLabel = this.findChildLabel(this._winPanel, 'ConfirmHint');
        if (confirmHintLabel) {
            confirmHintLabel.string = '等待所有玩家确认...';
        }

        // 绑定按钮事件
        this.bindSettlementButtons();
    }

    /**
     * 绑定结算面板按钮
     */
    private bindSettlementButtons(): void {
        if (!this._winPanel) return;

        // 确认按钮 (CONFIRM) - WinPanel 预制体中的按钮
        const confirmButton = this._winPanel.getChildByName('CONFIRM') ||
                             this._winPanel.getChildByName('ContinueButton') ||
                             this._winPanel.getChildByName('continueBtn') ||
                             this._winPanel.getChildByName('nextBtn');
        if (confirmButton) {
            const button = confirmButton.getComponent(Button);
            if (button) {
                button.node.on('click', () => {
                    this.continueToNextHand();
                }, this);
            }
        }

        // 返回大厅按钮
        const backButton = this._winPanel.getChildByName('BackButton') ||
                          this._winPanel.getChildByName('backBtn') ||
                          this._winPanel.getChildByName('exitBtn');
        if (backButton) {
            const button = backButton.getComponent(Button);
            if (button) {
                button.node.on('click', () => {
                    this.returnToLobby();
                }, this);
            }
        }
    }

    /**
     * 显示动画（直接显示，无缩放动画）
     */
    private showAnimation(): void {
        if (!this._winPanel) return;

        // 直接显示，无动画效果
        this._winPanel.setScale(1, 1, 1);
    }

    /**
     * 隐藏结算面板
     */
    hideSettlement(): void {
        if (this._winPanel) {
            this._winPanel.removeFromParent();
            this._winPanel.destroy();
            this._winPanel = null;
        }
    }

    /**
     * 隐藏结算面板（别名，保持兼容性）
     */
    hideSettlementPanel(): void {
        this.hideSettlement();
    }

    /**
     * 设置继续按钮回调
     */
    setContinueCallback(callback: (continueToNextHand: boolean) => void): void {
        this._settlementCallback = callback;
    }

    /**
     * 设置确认回调函数
     */
    setConfirmCallback(callback: (playerIndex: number) => void): void {
        this._confirmCallback = callback;
    }

    /**
     * 继续下一局
     */
    continueToNextHand(): void {
        this.hideSettlement();
        if (this._settlementCallback) {
            this._settlementCallback(true);
        }
    }

    /**
     * 返回大厅
     */
    returnToLobby(): void {
        this.hideSettlement();
        if (this._settlementCallback) {
            this._settlementCallback(false);
        }
    }

    /**
     * 获取结算面板节点
     */
    getWinPanel(): Node | null {
        return this._winPanel;
    }

    // ==================== 胜利面板显示方法（从 UIManager 迁移）====================

    /**
     * 显示胜利结果（带确认按钮）
     * 与 UIManager.showWinnerResultWithConfirmation 对应
     */
    showWinnerResultWithConfirmation(data: WinnerDisplayData, onConfirm: (playerIndex: number) => void): void {
        
        // 显示胜利面板（移除胜利者头像动画）
        this.showWinnerInfoWithConfirmButton(data, onConfirm);
    }

    /**
     * 显示胜利者信息（带确认按钮）
     */
    private showWinnerInfoWithConfirmButton(data: WinnerDisplayData, onConfirm: (playerIndex: number) => void): void {
        if (!this._config?.winPanelPrefab || !this._config.parent) {
            LogService.error('SettlementPresenter', '结算配置未设置');
            return;
        }

        // 保存确认回调
        this._confirmCallback = onConfirm;

        // 先清理所有相关的面板
        this.cleanupWinnerUI();

        // 1. 显示已有的 mask 节点
        const maskNode = this.findMaskNode();
        if (maskNode) {
            maskNode.active = true;
            maskNode.setSiblingIndex(9998);
            if (maskNode.parent) {
                maskNode.parent.active = true;
            }
        } else {
            LogService.warn('SettlementPresenter', '未找到 mask 节点');
        }

        // 2. 创建胜利面板
        const winnerInfoNode = instantiate(this._config.winPanelPrefab);
        winnerInfoNode.name = 'WinnerPanel';
        winnerInfoNode.active = true;

        // 设置父节点和层级
        if (maskNode && maskNode.parent) {
            maskNode.parent.addChild(winnerInfoNode);
            winnerInfoNode.setSiblingIndex(maskNode.getSiblingIndex() + 1);
        } else {
            this._config.parent.addChild(winnerInfoNode);
            winnerInfoNode.setSiblingIndex(9999);
        }

        // 设置尺寸
        const uiTransform = winnerInfoNode.getComponent(UITransform);
        if (uiTransform) {
            if (uiTransform.width === 0 || uiTransform.height === 0) {
                uiTransform.setContentSize(400, 300);
            }
        }

        // 设置面板在屏幕中央
        winnerInfoNode.setPosition(0, 0, 0);

        // 保存引用
        this._winPanel = winnerInfoNode;

        // 设置胜利信息（支持平局）
        const displayName = data.winnerNickname || `玩家 ${data.winnerIndex + 1}`;
        this.setWinnerInfo(winnerInfoNode, displayName, data.handTypeName, data.handStrength, data.pot, data.communityCards, data.winnerHandCards, data.isTie);

        // 设置确认按钮回调
        this.setConfirmButtonCallback(winnerInfoNode, onConfirm, data.playerSeat);

        // 添加弹出动画
        this.playShowAnimation(winnerInfoNode);
    }

    /**
     * 查找 mask 节点
     */
    private findMaskNode(): Node | null {
        const possiblePaths = [
            'start/mask',
            '/start/mask',
            'Canvas/start/mask',
            'Canvas_pvp/start/mask',
            '/Canvas/start/mask',
            '/Canvas_pvp/start/mask',
            'bg/start/mask'
        ];

        for (const path of possiblePaths) {
            const maskNode = find(path);
            if (maskNode) {
                return maskNode;
            }
        }

        // 尝试从当前节点向上遍历查找
        let current = this._config?.parent;
        let depth = 0;
        while (current && depth < 10) {
            const startNode = current.getChildByName('start');
            if (startNode) {
                const maskNode = startNode.getChildByName('mask');
                if (maskNode) {
                    return maskNode;
                }
            }
            current = current.parent;
            depth++;
        }

        // 最后尝试全局查找
        return find('mask');
    }

    /**
     * 设置胜利信息（支持平局）
     */
    private setWinnerInfo(winnerInfoNode: Node, displayName: string, handTypeName: string, handStrength: number, pot: number, communityCards?: number[], winnerHandCards?: number[], isTie?: boolean): void {
        const winPanelComponent = winnerInfoNode.getComponent(WinPanelComponent);

        if (winPanelComponent) {
            winPanelComponent.setWinnerInfo(displayName, handTypeName, handStrength, pot, isTie);
            // ✅ [新增] 设置公牌和手牌
            winPanelComponent.setCommunityCards(communityCards || null);
            winPanelComponent.setHandCards(winnerHandCards || null);
        } else {
            const winnerInfoChild = winnerInfoNode.getChildByName('WinnerInfo');
            if (!winnerInfoChild) {
                LogService.error('SettlementPresenter', '未找到WinnerInfo节点');
                return;
            }

            winnerInfoChild.active = true;

            // 确保 Background 可见
            const background = winnerInfoChild.getChildByName('Background');
            if (background) {
                background.active = true;
            }

            // 设置 WinnerTitle（支持平局）
            const titleText = isTie ? `🎉 平局 🎉` : `🎉 胜利者: ${displayName} 🎉`;
            this.setLabelText(winnerInfoChild, 'WinnerTitle', titleText);

            // 设置 HandType
            this.setLabelText(winnerInfoChild, 'HandType', `牌型: ${handTypeName}`);

            // 设置 Pot（支持平局）
            const potText = isTie ? `底池总额: ${pot}` : `获得底池: ${pot}`;
            this.setLabelText(winnerInfoChild, 'Pot', potText);

            // 设置 ConfirmHint
            this.setLabelText(winnerInfoChild, 'ConfirmHint', '等待所有玩家确认...');

            // ✅ [新增] 设置公牌 (card_0-card_4)
            this.setCommunityCards(winnerInfoChild, communityCards);

            // ✅ [新增] 设置胜利者手牌 (card_5-card_6)
            this.setHandCards(winnerInfoChild, winnerHandCards);
        }
    }

    /**
     * 设置公牌
     */
    private setCommunityCards(parentNode: Node, cards: number[] | undefined): void {
        // 隐藏所有公牌（card_0-card_4）
        for (let i = 0; i < 5; i++) {
            const cardNode = parentNode.getChildByName(`card_${i}`);
            if (cardNode) {
                cardNode.active = false;
            }
        }

        // 如果有公牌，显示并设置
        if (cards && cards.length > 0) {
            const cardManager = new CardManager();

            cards.forEach((cardId, index) => {
                if (index < 5) {
                    const cardNode = parentNode.getChildByName(`card_${index}`);
                    if (cardNode) {
                        const poker = cardManager.getPokerById(cardId);
                        if (poker) {
                            const pokerCardComp = cardNode.getComponent(pokerCard);
                        if (pokerCardComp) {
                            pokerCardComp.showPoker(poker.suit, poker.point);
                        }
                        }
                        cardNode.active = true;
                    }
                }
            });
        }
    }

    /**
     * 设置胜利者手牌
     */
    private setHandCards(parentNode: Node, cards: number[] | undefined): void {
        // 隐藏所有手牌（card_5-card_6）
        for (let i = 5; i < 7; i++) {
            const cardNode = parentNode.getChildByName(`card_${i}`);
            if (cardNode) {
                cardNode.active = false;
            }
        }

        // 如果有手牌，显示并设置
        if (cards && cards.length > 0) {
            const cardManager = new CardManager();

            cards.forEach((cardId, index) => {
                if (index < 2) {
                    const cardNode = parentNode.getChildByName(`card_${5 + index}`);
                    if (cardNode) {
                        const poker = cardManager.getPokerById(cardId);
                        if (poker) {
                            const pokerCardComp = cardNode.getComponent(pokerCard);
                        if (pokerCardComp) {
                            pokerCardComp.showPoker(poker.suit, poker.point);
                        }
                        }
                        cardNode.active = true;
                    }
                }
            });
        }
    }

    /**
     * 设置确认按钮回调
     */
    private setConfirmButtonCallback(winnerInfoNode: Node, onConfirm: (playerIndex: number) => void, playerSeat: number): void {
        if (playerSeat < 0) {
            return;
        }

        const winnerInfoChild = winnerInfoNode.getChildByName('WinnerInfo');
        if (!winnerInfoChild) {
            return;
        }

        const confirmBtn = winnerInfoChild.getChildByName('CONFIRM') ||
                          winnerInfoChild.getChildByName('ContinueButton') ||
                          winnerInfoChild.getChildByName('continueBtn') ||
                          winnerInfoChild.getChildByName('nextBtn');

        if (confirmBtn) {
            confirmBtn.active = true;
            const button = confirmBtn.getComponent(Button);
            if (button) {
                button.node.off('click');
                button.node.on('click', () => {
                    this.clearAutoConfirmTimer();
                    onConfirm(playerSeat);
                    this.hideSettlement();
                }, this);
            }
            this.startAutoConfirmTimer(playerSeat, winnerInfoChild, confirmBtn);
        }
    }

    private startAutoConfirmTimer(playerSeat: number, winnerInfoChild: Node, confirmBtn: Node): void {
        this.clearAutoConfirmTimer();
        this._autoConfirmTimeout = setTimeout(() => {
            if (this._confirmCallback) {
                LogService.info('SettlementPresenter', `自动确认胜利面板: playerSeat=${playerSeat}`);
                this._confirmCallback(playerSeat);
                this.hideSettlement();
            }
        }, SettlementPresenter.AUTO_CONFIRM_DELAY);
    }

    private clearAutoConfirmTimer(): void {
        if (this._autoConfirmTimeout) {
            clearTimeout(this._autoConfirmTimeout);
            this._autoConfirmTimeout = null;
        }
    }

    /**
     * 设置标签文本
     */
    private setLabelText(parent: Node, childName: string, text: string): void {
        const child = parent.getChildByName(childName);
        if (child) {
            child.active = true;
            const label = child.getComponent(Label);
            if (label) {
                label.string = text;
            }
        }
    }

    /**
     * 播放弹出动画（直接显示，无缩放动画）
     */
    private playShowAnimation(node: Node): void {
        node.setScale(1, 1, 1); // 直接设置为正常大小，无动画
    }

    /**
     * 清理胜利UI
     */
    cleanupWinnerUI(): void {        this.clearAutoConfirmTimer();
        if (!this._config?.parent) {
            return;
        }

        // 清理 WinnerPanel
        const oldPanel = this._config.parent.getChildByName('WinnerPanel');
        if (oldPanel) {
            oldPanel.destroy();
        }

        // 清理 allHandTypeDisplay
        const oldHandTypeDisplay = this._config.parent.getChildByName('allHandTypeDisplay');
        if (oldHandTypeDisplay) {
            oldHandTypeDisplay.destroy();
        }

        this._winPanel = null;
    }

    /**
     * 隐藏胜利面板（与 gaming.ts 兼容）
     */
    hideWinnerPanel(): void {
        this.clearAutoConfirmTimer();
        this.hideSettlement();
    }

    /**
     * 显示多条获胜信息（边池结算）
     */
    showMultipleSettlements(results: SettlementResult[]): void {
        if (!this._config?.winPanelPrefab || !this._config.parent) {
            LogService.error('SettlementPresenter', 'Settlement config not set');
            return;
        }

        LogService.info('SettlementPresenter', 'Showing multiple settlements', results);

        // 隐藏现有面板
        this.hideSettlement();

        // 为每个结算结果创建面板
        results.forEach((result, index) => {
            const panel = instantiate(this._config!.winPanelPrefab);
            panel.setPosition(index * 100, 0); // 横向排列
            this._config!.parent.addChild(panel);
            
            // 更新显示
            const oldWinPanel = this._winPanel;
            this._winPanel = panel;
            this.updateSettlementDisplay(result);
            this._winPanel = oldWinPanel;
        });
    }

    /**
     * 更新结算信息（与 gaming.ts 中的 updateSettlementInfo 对应）
     */
    updateSettlementInfo(winners: any[], totalPot: number, handInfo?: string): void {
        this.showSettlement({ winners, totalPot, handInfo });
    }

    /**
     * 辅助方法：查找子节点中的 Label
     */
    private findChildLabel(parent: Node, name: string): Label | null {
        const child = parent.getChildByName(name);
        if (child) {
            return child.getComponent(Label);
        }
        // 如果找不到，尝试查找任意 Label
        return parent.getComponentInChildren(Label);
    }
}
