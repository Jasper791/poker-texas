import { _decorator, Component, Node, Label, Button, Sprite, Vec3, SpriteFrame, resources, director } from 'cc';
const { ccclass, property } = _decorator;
import { LogService } from './utils/LogService';
import { CardManager } from './managers/CardManager';
import { GameNetwork } from './net/GameNetwork';
import { SceneLoader } from './managers/SceneLoader';

/**
 * 胜利面板组件
 * 用于动态设置胜利面板的内容
 */
@ccclass('WinPanelComponent')
export class WinPanelComponent extends Component {
    @property({ type: Label })
    public winnerTitle: Label = null;

    @property({ type: Label })
    public handTypeLabel: Label = null;

    @property({ type: Label })
    public potLabel: Label = null;

    @property({ type: Label })
    public confirmHint: Label = null;

    @property({ type: Button })
    public confirmButton: Button = null;

    @property({ type: Button })
    public returnBtn: Button = null;

    private _onConfirmCallback: ((playerIndex: number) => void) = null;
    private _playerSeat: number = -1;
    private _autoConfirmTimeout: any = null;
    private static readonly AUTO_CONFIRM_DELAY = 20000; // 20 秒自动确认

    start() {
        if (this.returnBtn) {
            this.returnBtn.node.on('click', this.onReturnButtonClick, this);
        }
    }

    /**
     * 设置胜利者信息（支持平局）
     * @param winnerName 胜利者名称
     * @param handTypeName 牌型名称
     * @param handStrength 牌力值
     * @param pot 底池金额
     * @param isTie 是否平局
     */
    setWinnerInfo(winnerName: string, handTypeName: string, handStrength: number, pot: number, isTie?: boolean) {
        if (this.winnerTitle) {
            this.winnerTitle.string = isTie ? `🎉 平局 🎉` : `胜利: ${winnerName}`;
        }

        if (this.handTypeLabel) {
            this.handTypeLabel.string = `牌型: ${handTypeName}`;
        }

        if (this.potLabel) {
            this.potLabel.string = isTie ? `底池总额: ${pot}` : `获得底池: ${pot}`;
        }

        if (this.confirmHint) {
            this.confirmHint.string = '等待所有玩家确认...';
        }
    }

    /**
     * ✅ [修改] 设置平局和胜利者信息
     * 只有在平局或边池分配时，才显示不同玩家的信息
     * 单一赢家时，所有玩家都看到相同的胜利者信息
     * @param isTie 是否平局
     * @param currentPlayerIsWinner 当前玩家是否是赢家
     * @param currentPlayerWonAmount 当前玩家赢得的金额
     * @param winnerDetails 所有赢家的详细信息
     */
    setTieInfo(
        isTie?: boolean, 
        currentPlayerIsWinner?: boolean, 
        currentPlayerWonAmount?: number, 
        winnerDetails?: Array<{
            userId: number;
            seatIndex: number;
            nickname: string;
            wonAmount: number;
            handTypeName?: string;
        }>
    ) {
        if (this.winnerTitle) {
            if (isTie) {
                // ✅ [修改] 只有在平局时，才显示不同的信息
                if (currentPlayerIsWinner && currentPlayerWonAmount !== undefined) {
                    this.winnerTitle.string = `🎉 平局！你获得: ${currentPlayerWonAmount} 🎉`;
                } else {
                    this.winnerTitle.string = `🎉 平局！ 🎉`;
                }
            }
            // ✅ [修改] 单一赢家时，所有玩家都看到相同的信息（不修改 winnerTitle，保持 setWinnerInfo 中的设置）
        }

        if (this.potLabel) {
            if (isTie && currentPlayerIsWinner && currentPlayerWonAmount !== undefined) {
                // ✅ [修改] 只有在平局时，才显示"你获得: X"
                this.potLabel.string = `你获得: ${currentPlayerWonAmount}`;
            }
            // ✅ [修改] 单一赢家时，所有玩家都看到相同的信息（保持 setWinnerInfo 中的设置）
        }
    }

    /**
     * 设置公牌 (card_0-card_4)
     * @param cards 公牌数组（卡牌数字ID），最多5张，为空或null则隐藏
     */
    setCommunityCards(cards: number[] | null) {
        // 隐藏所有公牌（card_0-card_4）
        for (let i = 0; i < 5; i++) {
            const cardNode = this.node.getChildByName(`card_${i}`);
            if (cardNode) {
                cardNode.active = false;
            }
        }

        // 如果有公牌，显示并设置
        if (cards && cards.length > 0) {
            cards.forEach((cardId, index) => {
                if (index < 5 && cardId !== null && cardId !== undefined) {
                    const cardNode = this.node.getChildByName(`card_${index}`);
                    if (cardNode) {
                        cardNode.active = true;
                        this._setCardSprite(cardNode, cardId);
                    }
                }
            });
        }
    }

    /**
     * 设置胜利者手牌 (card_5-card_6)
     * @param cards 手牌数组（卡牌数字ID），最多2张，为空或null则隐藏
     */
    setHandCards(cards: number[] | null) {
        // 隐藏所有手牌（card_5-card_6）
        for (let i = 5; i < 7; i++) {
            const cardNode = this.node.getChildByName(`card_${i}`);
            if (cardNode) {
                cardNode.active = false;
            }
        }

        // 如果有手牌，显示并设置
        if (cards && cards.length > 0) {
            cards.forEach((cardId, index) => {
                if (index < 2 && cardId !== null && cardId !== undefined) {
                    const cardNode = this.node.getChildByName(`card_${5 + index}`);
                    if (cardNode) {
                        cardNode.active = true;
                        this._setCardSprite(cardNode, cardId);
                    }
                }
            });
        }
    }

    /**
     * 根据卡牌ID设置卡牌显示
     */
    private _setCardSprite(cardNode: Node, cardId: number) {
        try {
            // 直接创建 CardManager 实例来获取卡牌信息
            const cardManager = new CardManager();
            
            const poker = cardManager.getPokerById(cardId);
            if (!poker) {
                LogService.error('WinPanelComponent', `无法获取卡牌信息，cardId=${cardId}`);
                return;
            }
            
            // 尝试获取 img 子节点，如果没有就直接使用当前节点
            let targetNode = cardNode.getChildByName('img');
            if (!targetNode) {
                targetNode = cardNode;
            }
            
            // 获取 Sprite 组件
            const sprite = targetNode.getComponent(Sprite);
            if (!sprite) {
                LogService.error('WinPanelComponent', `无法找到 Sprite 组件: nodeName=${targetNode.name}`);
                return;
            }
            
            // 构造资源路径
            const path = `pokers/${poker.suit}/${poker.suit}_${poker.point}/spriteFrame`;
            
            // 加载卡牌资源
            resources.load(path, SpriteFrame, (err, spriteFrame) => {
                if (err) {
                    LogService.error('WinPanelComponent', `加载卡牌资源失败: ${path}`, err);
                    return;
                }
                
                sprite.spriteFrame = spriteFrame as SpriteFrame;
            });
            
        } catch (error) {
            LogService.error('WinPanelComponent', `设置卡牌失败: ${error}`);
        }
    }

    /**
     * 设置确认按钮回调
     * @param callback 确认回调函数
     * @param playerSeat 玩家座位号
     */
    setConfirmCallback(callback: (playerIndex: number) => void, playerSeat: number) {
        this._onConfirmCallback = callback;
        this._playerSeat = playerSeat;

        if (this.confirmButton && playerSeat >= 0) {
            this.confirmButton.node.active = true;
            this.confirmButton.node.off('click', this.onConfirmClicked, this);
            this.confirmButton.node.on('click', this.onConfirmClicked, this);
            this.startAutoConfirmTimer();
        } else if (this.confirmButton) {
            this.confirmButton.node.active = false;
        }
    }

    private startAutoConfirmTimer(): void {
        this.clearAutoConfirmTimer();
        this._autoConfirmTimeout = setTimeout(() => {
            if (this._onConfirmCallback && this._playerSeat >= 0) {
                LogService.info('WinPanelComponent', `自动确认胜利面板: playerSeat=${this._playerSeat}`);
                this.onConfirmClicked();
            }
        }, WinPanelComponent.AUTO_CONFIRM_DELAY);
    }

    private clearAutoConfirmTimer(): void {
        if (this._autoConfirmTimeout) {
            clearTimeout(this._autoConfirmTimeout);
            this._autoConfirmTimeout = null;
        }
    }

    /**
     * 确认按钮点击处理
     */
    private onConfirmClicked() {
        this.clearAutoConfirmTimer();
        if (this._onConfirmCallback && this._playerSeat >= 0) {
            this._onConfirmCallback(this._playerSeat);
            this.hide();
        }
    }

    /**
     * 设置确认状态为已确认
     */
    setConfirmed() {
        if (this.confirmButton) {
            this.confirmButton.node.active = false;
        }
        if (this.confirmHint) {
            this.confirmHint.string = '已确认，等待其他玩家...';
        }
    }

    /**
     * 显示面板（直接显示，无动画）
     */
    show() {
        this.node.scale = new Vec3(1, 1, 1); // 确保缩放为1
        this.node.active = true;
    }

    /**
     * 隐藏面板（直接隐藏，无动画）
     */
    hide() {
        this.clearAutoConfirmTimer();
        this.node.active = false;
    }

    onDestroy() {
        this.clearAutoConfirmTimer();
    }

    /**
     * 获取确认按钮节点
     */
    getConfirmButtonNode(): Node | null {
        return this.confirmButton ? this.confirmButton.node : null;
    }

    /**
     * 返回按钮点击处理
     * 退出房间并返回 index 场景
     */
    private onReturnButtonClick() {
        // 发送退出房间请求
        GameNetwork.getInstance().leaveRoom((success: boolean) => {
            // 无论成功与否，都返回 index 场景
            SceneLoader.getInstance().loadScene('index');
        });
    }
}
