/**
 * UI 管理器
 * 负责 UI 相关的管理，包括操作按钮、倒计时、底池显示等
 */
import { Node, Label, Sprite, UITransform, Color, Vec3, tween, Button, SpriteFrame, Prefab, instantiate, HorizontalTextAlignment, VerticalTextAlignment, find } from 'cc';
import { WinPanelComponent } from '../WinPanelComponent';
import { LogService } from '../utils/LogService';
import { CardManager } from './CardManager';

export class UIManager {
    private _actionTimer: number = null;
    private _actionTime: number = 30;
    private _isActionPhase: boolean = false;
    private _playerManager: any = null;
    private _gameManager: any = null;

    /**
     * 显示玩家可操作按钮（根据国际德州扑克规则）
     * @param playersActionNode 操作按钮节点
     * @param gameManager 游戏管理器
     * @param playerManager 玩家管理器
     * @param onStartActionTimer 开始倒计时的回调
     */
    showPlayerActive(playersActionNode: Node, gameManager: any, playerManager: any, onStartActionTimer: () => void) {
        if (!playersActionNode) {
            return;
        }

        playersActionNode.active = true;
        playersActionNode.children.forEach(node => node.active = false);

        const uiTransform = playersActionNode.getComponent(UITransform);
        if (uiTransform) {
            playersActionNode.setSiblingIndex(9999);
        }

        const actionNode = playersActionNode.getChildByName('action');

        const currentPlayer = playerManager.getCurrentPlayer();
        const currentHighestBet = gameManager.getCurrentHighestBet();
        const playerCurrentBet = gameManager.getPlayerBet(currentPlayer);
        const callAmount = gameManager.getCallAmount(currentPlayer);
        const playerChips = gameManager.getPlayerChips(currentPlayer);
        const minBet = gameManager.getMinBet();
        const maxBet = gameManager.getMaxBet();

        const getButton = (name: string): Node => {
            if (actionNode) {
                const btn = actionNode.getChildByName(name);
                if (btn) {
                    return btn;
                }
            }
            return playersActionNode.getChildByName(name);
        };

        const foldBtn = getButton('FOLD');
        if (foldBtn) {
            foldBtn.active = true;
        }

        const canFullCall = playerChips >= callAmount;
        const canRaise = playerChips >= callAmount + minBet;

        if (currentHighestBet === 0) {
            const checkBtn = getButton('CHECK');
            if (checkBtn) {
                checkBtn.active = true;
            }

            const betBtn = getButton('BET');
            if (betBtn && playerChips >= minBet) {
                betBtn.active = true;
                this.showActiveBtnValue(actionNode || playersActionNode, 'BET', minBet);
            }

            // 始终显示 ALLIN 按钮（只要玩家还有筹码）
            if (playerChips > 0) {
                const allInBtn = getButton('ALLIN');
                if (allInBtn) {
                    allInBtn.active = true;
                    this.showActiveBtnValue(actionNode || playersActionNode, 'ALLIN', playerChips);
                }
            }
        } else {
            if (canFullCall) {
                const callBtn = getButton('CALL');
                if (callBtn) {
                    callBtn.active = true;
                    this.showActiveBtnValue(actionNode || playersActionNode, 'CALL', callAmount);
                }
            }

            if (canRaise) {
                const raiseBtn = getButton('RAISE');
                if (raiseBtn) {
                    raiseBtn.active = true;
                    const raiseAmount = callAmount + minBet;
                    this.showActiveBtnValue(actionNode || playersActionNode, 'RAISE', raiseAmount);
                }
            } else {
                // 不显示 RAISE 按钮
            }

            // 始终显示 ALLIN 按钮（只要玩家还有筹码）
            if (playerChips > 0) {
                const allInBtn = getButton('ALLIN');
                if (allInBtn) {
                    allInBtn.active = true;
                    this.showActiveBtnValue(actionNode || playersActionNode, 'ALLIN', playerChips);
                }
            }
        }

        // 开始倒计时
        onStartActionTimer();
    }

    /**
     * 显示可操作按钮和设置数量
     * @param playersActionNode 操作按钮节点
     * @param name 按钮名称
     * @param value 金额
     */
    showActiveBtnValue(playersActionNode: Node, name: string, value: number) {
        if (playersActionNode) {
            let _btn = playersActionNode.getChildByName(name);
            
            if (!_btn) {
                const actionNode = playersActionNode.getChildByName('action');
                if (actionNode) {
                    _btn = actionNode.getChildByName(name);
                }
            }
            
            if (_btn) {
                _btn.active = true;
                
                const button = _btn.getComponent(Button);
                if (button) {
                    button.interactable = true;
                }
                
                const _value = _btn.getChildByName('value');
                if (_value) {
                    const label = _value.getComponent(Label);
                    if (label) {
                        label.string = value.toString();
                    }
                }
            }
        }
    }

    /**
     * 开始操作倒计时
     * @param node 根节点
     * @param playersContainer 玩家容器节点
     * @param currentPlayer 当前玩家
     * @param onTimeout 超时回调
     */
    /**
     * 开始操作倒计时（统一管理）
     * @param node 根节点
     * @param playersContainer 玩家容器节点
     * @param currentPlayer 当前玩家
     * @param timeoutCallback 超时回调函数（自动弃牌）
     * @param duration 倒计时时长（默认30秒）
     */
    startActionTimer(node: Node, playersContainer: Node, currentPlayer: number, timeoutCallback: () => void, duration: number = 30) {
        // 清除之前的计时器
        if (this._actionTimer) {
            clearInterval(this._actionTimer);
            this._actionTimer = null;
        }

        this._actionTime = duration;
        this._isActionPhase = true;

        // 创建或更新倒计时UI
        this.updateTimerUI(node, playersContainer, currentPlayer);

        // 开始倒计时
        this._actionTimer = setInterval(() => {
            this._actionTime--;
            this.updateTimerUI(node, playersContainer, currentPlayer);

            if (this._actionTime <= 0) {
                clearInterval(this._actionTimer);
                this._actionTimer = null;
                this._isActionPhase = false;
                LogService.warn('UIManager', '[WARNING] 操作超时，执行回调');
                // 超时自动执行回调（弃牌）
                timeoutCallback();
            }
        }, 1000);
    }

    /**
     * 更新倒计时UI（显示在玩家头像附近）
     * @param node 根节点
     * @param playersContainer 玩家容器节点
     * @param currentPlayer 当前玩家
     */
    updateTimerUI(node: Node, playersContainer: Node, currentPlayer: number) {
        // 获取玩家头像节点
        const avatarContainer = playersContainer.getChildByName('avatar');
        const avatarNode = avatarContainer ? avatarContainer.getChildByName(`avatar_${currentPlayer + 1}`) : null;
        
        // 检查是否已存在倒计时节点
        let timerNode = node.getChildByName('ActionTimer');
        if (!timerNode) {
            timerNode = new Node('ActionTimer');
            node.addChild(timerNode);

            const uiTransform = timerNode.addComponent(UITransform);
            uiTransform.setContentSize(80, 30);

            const sprite = timerNode.addComponent(Sprite);
            sprite.color = new Color(0, 0, 0, 200);
        }

        // 更新倒计时文本
        let timerLabel = timerNode.getChildByName('TimerLabel');
        if (!timerLabel) {
            timerLabel = new Node('TimerLabel');
            timerLabel.setPosition(0, 0);
            timerNode.addChild(timerLabel);

            const label = timerLabel.addComponent(Label);
            label.fontSize = 18;
            label.color = new Color(255, 215, 0);
        }

        // 如果玩家头像存在，将倒计时节点移到头像附近
        if (avatarNode) {
            const avatarWorldPos = avatarNode.worldPosition;
            timerNode.setWorldPosition(avatarWorldPos.x, avatarWorldPos.y + 80, avatarWorldPos.z);
        } else {
            // 默认位置（屏幕中央上方）
            timerNode.setPosition(0, 300);
        }

        const label = timerLabel.getComponent(Label);
        if (label) {
            label.string = `${this._actionTime}s`;
        }
    }

    /**
     * 获取当前操作倒计时剩余时间
     * @returns 剩余秒数
     */
    getActionTimeRemaining(): number {
        return this._actionTime;
    }

    /**
     * 停止倒计时
     * @param node 根节点
     */
    stopActionTimer(node: Node) {
        // 清除计时器
        if (this._actionTimer) {
            clearInterval(this._actionTimer);
            this._actionTimer = null;
        }
        this._isActionPhase = false;

        // 移除倒计时UI（增强防御性检查）
        if (node && node.isValid) {
            try {
                const timerNode = node.getChildByName('ActionTimer');
                if (timerNode) {
                    timerNode.removeFromParent();
                }
            } catch (error) {
                LogService.error('UIManager', 'stopActionTimer - 移除倒计时UI失败', error);
            }
        }
    }

    /**
     * 更新底池显示
     * @param potLabel 底池标签
     * @param pot 底池金额
     */
    updatePotDisplay(potLabel: Label, pot: number) {
        if (potLabel) {
            potLabel.string = pot.toString();
        }
    }

    /**
     * 更新边池列表显示
     * @param sidePotsContainer 边池容器节点
     * @param sidePots 边池数组，每个边池包含金额和合格玩家索引列表
     */
    updateSidePotsDisplay(sidePotsContainer: Node, sidePots: { amount: number, eligiblePlayers: number[] }[]) {
        if (!sidePotsContainer) {
            return;
        }

        const container = sidePotsContainer;
        const existingChildren = container.children.length;

        if (!sidePots || sidePots.length === 0) {
            for (let i = 0; i < existingChildren; i++) {
                container.children[i].active = false;
            }
            return;
        }

        for (let i = 0; i < sidePots.length; i++) {
            const sidePot = sidePots[i];
            let sidePotNode: Node;

            if (i < existingChildren) {
                sidePotNode = container.children[i];
                sidePotNode.active = true;
            } else {
                sidePotNode = new Node('sidePot_' + i);
                sidePotNode.parent = container;
                const transform = sidePotNode.addComponent(UITransform);
                transform.setContentSize(150, 30);
            }

            let label = sidePotNode.getComponent(Label);
            if (!label) {
                label = sidePotNode.addComponent(Label);
            }

            const potName = '边池' + (i + 1);
            label.string = `${potName}: ${sidePot.amount}`;
            label.fontSize = 16;
            label.horizontalAlign = HorizontalTextAlignment.LEFT;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            label.color = new Color(255, 215, 0);
        }

        for (let i = sidePots.length; i < existingChildren; i++) {
            container.children[i].active = false;
        }
    }

    /**
     * 更新迷你黑卡显示
     * @param miniBlackCardLabel 迷你黑卡标签
     * @param currentBet 当前下注金额
     */
    updateMiniBlackCard(miniBlackCardLabel: Label, currentBet: number) {
        if (miniBlackCardLabel) {
            miniBlackCardLabel.string = currentBet.toString();
        }
    }

    /**
     * 显示玩家当轮下注金额（显示在chip_label）
     * @param playersContainer 玩家容器节点
     * @param playerIndex 玩家索引
     * @param amount 当轮下注金额
     */
    showPlayerActionChip(playersContainer: Node, playerIndex: number, amount: number) {
        if (playersContainer) {
            const avatarContainer = playersContainer.getChildByName('avatar');
            if (avatarContainer) {
                const avatarNode = avatarContainer.getChildByName(`avatar_${playerIndex + 1}`);
                if (avatarNode) {
                    const chipLabel = avatarNode.getChildByName('chip_label');
                    if (chipLabel) {
                        const label = chipLabel.getComponent(Label);
                        if (label) {
                            label.string = amount.toString();
                        }
                    }
                }
            }
        }
    }

    /**
     * 更新avatar节点中的amount组件，显示玩家当前筹码余额
     * @param playersContainer 玩家容器节点
     * @param playerIndex 玩家索引
     * @param amount 筹码余额
     */
    updateAvatarAmount(playersContainer: Node, playerIndex: number, amount: number) {
        if (playersContainer) {
            const avatarContainer = playersContainer.getChildByName('avatar');
            if (avatarContainer) {
                const avatarNode = avatarContainer.getChildByName(`avatar_${playerIndex + 1}`);
                if (avatarNode) {
                    const amountNode = avatarNode.getChildByName('amount');
                    if (amountNode) {
                        const label = amountNode.getComponent(Label);
                        if (label) {
                            label.string = amount.toString();
                        }
                    }
                }
            }
        }
    }

    /**
     * 显示操作记录
     * @param node 根节点
     * @param playerIndex 玩家索引
     * @param action 操作类型
     * @param amount 金额
     */
    showActionLog(node: Node, playerIndex: number, action: string, amount: number) {
        // 将英文操作类型转换为中文
        let actionText = action;
        switch (action.toLowerCase()) {
            case 'fold':
                actionText = '弃牌';
                break;
            case 'call':
                actionText = '跟注';
                break;
            case 'raise':
                actionText = '加注';
                break;
            case 'check':
                actionText = '看牌';
                break;
            case 'bet':
                actionText = '下注';
                break;
            case 'all-in':
            case 'all_in':
            case 'allin':
                actionText = '全下';
                break;
            case 'check-raise':
            case 'check_raise':
                actionText = '过牌加注';
                break;
            case 'dead_blind':
            case 'deadblind':
                actionText = '死盲';
                break;
            case 'small_blind':
            case 'smallblind':
            case 'sb':
                actionText = '小盲注';
                break;
            case 'big_blind':
            case 'bigblind':
            case 'bb':
                actionText = '大盲注';
                break;
            case 'straddle':
                actionText = '抓瞎';
                break;
        }
    }



    /**
     * 显示胜利者结果
     * @param node 根节点
     * @param playersContainer 玩家容器节点
     * @param winnerIndex 胜利者索引
     * @param handType 牌型等级
     * @param handStrength 牌力
     * @param pot 底池金额
     * @param onRestart 重新开始的回调
     */
    showWinnerResult(node: Node, playersContainer: Node, winnerIndex: number, handType: number, handStrength: number, pot: number, onRestart: () => void) {
        
        // 获取胜利者的牌型名称
        const handTypeName = CardManager.getHandTypeName(handType);
        
        // 显示胜利者信息（移除胜利者头像动画）
        this.showWinnerInfo(node, winnerIndex, handTypeName, handStrength, pot);
        
        // 3秒后重新开始游戏
        setTimeout(() => {
            this.cleanupWinnerUI(node, playersContainer);
            onRestart();
        }, 5000);
    }

    /**
     * 显示胜利者结果（带确认功能）
     * @param node 根节点
     * @param playersContainer 玩家容器节点
     * @param winnerIndex 胜利者索引
     * @param handType 牌型等级
     * @param handStrength 牌力
     * @param pot 底池金额
     * @param onConfirm 玩家确认的回调
     * @param playerSeat 真实玩家座位号
     * @param winnerNickname 胜利者昵称
     */
    showWinnerResultWithConfirmation(
        winPanelPrefab: Prefab, 
        node: Node, 
        playersContainer: Node, 
        winnerIndex: number, 
        handTypeName: string, 
        handStrength: number, 
        pot: number, 
        onConfirm: (playerIndex: number) => void, 
        playerSeat: number, 
        winnerNickname?: string, 
        communityCards?: number[], 
        winnerHandCards?: number[],
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
        
        // 显示胜利者信息和确认按钮（移除胜利者头像动画）
        this.showWinnerInfoWithConfirmButton(
            winPanelPrefab, 
            node, 
            winnerIndex, 
            handTypeName, 
            handStrength, 
            pot, 
            onConfirm, 
            playerSeat, 
            winnerNickname, 
            communityCards, 
            winnerHandCards,
            isTie,
            currentPlayerIsWinner,
            currentPlayerWonAmount,
            winnerDetails
        );
    }

    /**
     * 显示胜利者信息
     * @param node 根节点
     * @param winnerIndex 胜利者索引
     * @param handTypeName 牌型名称
     * @param handStrength 牌力
     * @param pot 底池金额
     */
    private showWinnerInfo(node: Node, winnerIndex: number, handTypeName: string, handStrength: number, pot: number) {
        // 创建胜利者信息节点
        let winnerInfoNode = node.getChildByName('WinnerInfo');
        if (winnerInfoNode) {
            winnerInfoNode.destroy();
        }

        winnerInfoNode = new Node('WinnerInfo');
        node.addChild(winnerInfoNode);
        
        const uiTransform = winnerInfoNode.addComponent(UITransform);
        uiTransform.setContentSize(400, 200);
        
        // 添加背景
        const bgNode = new Node('Background');
        bgNode.setPosition(0, 0);
        winnerInfoNode.addChild(bgNode);
        
        const bgTransform = bgNode.addComponent(UITransform);
        bgTransform.setContentSize(400, 200);
        
        const bgSprite = bgNode.addComponent(Sprite);
        bgSprite.color = new Color(0, 0, 0, 200);

        // 添加胜利者信息文本
        this.createLabelNode(winnerInfoNode, 'WinnerTitle', `🎉 胜利者: 玩家 ${winnerIndex + 1} 🎉`, 
            new Vec3(0, 60, 0), 24, new Color(255, 215, 0));
        
        this.createLabelNode(winnerInfoNode, 'HandType', `牌型: ${handTypeName}`, 
            new Vec3(0, 20, 0), 20, new Color(255, 255, 255));
        
        // 不再显示牌力（HandStrength）
        // this.createLabelNode(winnerInfoNode, 'HandStrength', `牌力: ${handStrength}`, 
        //     new Vec3(0, -20, 0), 20, new Color(255, 255, 255));
        
        this.createLabelNode(winnerInfoNode, 'Pot', `获得底池: ${pot}`, 
            new Vec3(0, -60, 0), 24, new Color(255, 215, 0));

        // 显示位置（屏幕中心下方）
        winnerInfoNode.setPosition(0, -200);
    }

    /**
     * 显示胜利者信息（带确认按钮）
     * @param node 根节点
     * @param winnerIndex 胜利者索引
     * @param handTypeName 牌型名称
     * @param handStrength 牌力
     * @param pot 底池金额
     * @param onConfirm 玩家确认的回调
     * @param playerSeat 真实玩家座位号
     * @param winnerNickname 胜利者昵称
     * @param communityCards 公牌数组（card_0-card_4）
     * @param winnerHandCards 胜利者手牌数组（card_5-card_6）
     */
    private showWinnerInfoWithConfirmButton(
        winPanelPrefab: Prefab, 
        node: Node, 
        winnerIndex: number, 
        handTypeName: string, 
        handStrength: number, 
        pot: number, 
        onConfirm: (playerIndex: number) => void, 
        playerSeat: number, 
        winnerNickname?: string, 
        communityCards?: number[], 
        winnerHandCards?: number[],
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
        // 先清理所有相关的面板（包括allHandTypeDisplay）
        let oldPanel = node.getChildByName('WinnerPanel');
        if (oldPanel) {
            oldPanel.destroy();
        }
        
        let oldHandTypeDisplay = node.getChildByName('allHandTypeDisplay');
        if (oldHandTypeDisplay) {
            oldHandTypeDisplay.destroy();
        }

        // 使用预制体创建胜利面板
        if (!winPanelPrefab) {
            LogService.error('UIManager', 'WinPanel预制体未设置，无法显示胜利面板');
            return;
        }

        // 1. 显示已有的 mask 节点
        let maskNode: Node | null = null;
        
        // 根据场景结构: scene_pvp -> start -> mask
        // 尝试各种可能的路径
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
            maskNode = find(path);
            if (maskNode) {
                break;
            }
        }
        
        // 如果上面都没找到，尝试从当前节点向上遍历查找
        if (!maskNode) {
            let current = node;
            let depth = 0;
            while (current && !maskNode && depth < 10) {
                const startNode = current.getChildByName('start');
                if (startNode) {
                    maskNode = startNode.getChildByName('mask');
                }
                current = current.parent;
                depth++;
            }
        }
        
        // ✅ [关键修复] 移除危险的全局 find('mask') 查找
        // 全局查找可能找到场景中其他名为 'mask' 的节点（如游戏容器下的裁剪遮罩）
        // 这会导致错误地显示或隐藏游戏内容
        
        if (maskNode) {
            maskNode.active = true;
            
            // 设置 mask 节点在胜利面板下层
            maskNode.setSiblingIndex(9998);
            
            // 确保 mask 节点的父节点也可见
            if (maskNode.parent) {
                maskNode.parent.active = true;
            }
        } else {
            LogService.error('UIManager', '未找到 mask 节点');
        }

        // 2. 创建胜利面板
        const winnerInfoNode = instantiate(winPanelPrefab);
        winnerInfoNode.name = 'WinnerPanel';

        // 确保节点可见
        winnerInfoNode.active = true;

        // 如果找到了 mask 节点，将胜利面板添加到与 mask 相同的父节点下
        if (maskNode && maskNode.parent) {
            // 将胜利面板添加到 mask 的父节点下
            maskNode.parent.addChild(winnerInfoNode);
            // 设置层级确保在 mask 上层
            winnerInfoNode.setSiblingIndex(maskNode.getSiblingIndex() + 1);
        } else {
            // 否则添加到传入的 node 下
            node.addChild(winnerInfoNode);
            winnerInfoNode.setSiblingIndex(9999);
        }
        
        // 获取预制体的UITransform确保有尺寸
        const uiTransform = winnerInfoNode.getComponent(UITransform);
        if (uiTransform) {
            // 如果尺寸为0，设置为合适的大小
            if (uiTransform.width === 0 || uiTransform.height === 0) {
                uiTransform.setContentSize(400, 300);
            }
        }
        
        // 设置面板在屏幕中央
        winnerInfoNode.setPosition(0, 0, 0);

        // 尝试获取 WinPanelComponent 组件（优先使用组件动态赋值）
        const winPanelComponent = winnerInfoNode.getComponent(WinPanelComponent);
        const displayName = winnerNickname || `玩家 ${winnerIndex + 1}`;

        if (winPanelComponent) {
            // 使用组件方法设置内容（支持平局）
            winPanelComponent.setWinnerInfo(displayName, handTypeName, handStrength, pot, isTie);
            winPanelComponent.setConfirmCallback(onConfirm, playerSeat);
            // ✅ [新增] 设置公牌和手牌
            winPanelComponent.setCommunityCards(communityCards || null);
            winPanelComponent.setHandCards(winnerHandCards || null);
            // ✅ [新增] 设置平局和当前玩家获胜信息
            winPanelComponent.setTieInfo(isTie, currentPlayerIsWinner, currentPlayerWonAmount, winnerDetails);
        } else {
            // 查找 WinnerInfo 节点
            const winnerInfoChild = winnerInfoNode.getChildByName('WinnerInfo');
            if (!winnerInfoChild) {
                LogService.error('UIManager', '未找到WinnerInfo节点，无法设置内容');
                return;
            }

            // 确保 WinnerInfo 可见
            winnerInfoChild.active = true;
            
            // 确保 Background 可见
            const background = winnerInfoChild.getChildByName('Background');
            if (background) {
                background.active = true;
            }
            
            // 设置 WinnerTitle
            const winnerTitle = winnerInfoChild.getChildByName('WinnerTitle');
            if (winnerTitle) {
                winnerTitle.active = true;
                const label = winnerTitle.getComponent(Label);
                if (label) {
                    if (isTie) {
                        // ✅ [修改] 只有在平局时，才显示不同的信息
                        if (currentPlayerIsWinner && currentPlayerWonAmount !== undefined) {
                            label.string = `🎉 平局！你获得: ${currentPlayerWonAmount} 🎉`;
                        } else {
                            label.string = `🎉 平局！ 🎉`;
                        }
                    } else {
                        // ✅ [修改] 单一赢家时，所有玩家都看到相同的信息
                        label.string = `🎉 胜利者: ${displayName} 🎉`;
                    }
                }
            }
            
            // 设置 HandType
            const handTypeLabel = winnerInfoChild.getChildByName('HandType');
            if (handTypeLabel) {
                handTypeLabel.active = true;
                const label = handTypeLabel.getComponent(Label);
                if (label) {
                    label.string = `牌型: ${handTypeName}`;
                }
            }
            
            // 设置 Pot
            const potLabel = winnerInfoChild.getChildByName('Pot');
            if (potLabel) {
                potLabel.active = true;
                const label = potLabel.getComponent(Label);
                if (label) {
                    if (isTie && currentPlayerIsWinner && currentPlayerWonAmount !== undefined) {
                        // ✅ [修改] 只有在平局时，才显示"你获得: X"
                        label.string = `你获得: ${currentPlayerWonAmount}`;
                    } else {
                        // ✅ [修改] 单一赢家时，所有玩家都看到相同的信息
                        label.string = `获得底池: ${pot}`;
                    }
                }
            }
            
            // 设置 ConfirmHint
            const confirmHint = winnerInfoChild.getChildByName('ConfirmHint');
            if (confirmHint) {
                confirmHint.active = true;
                const label = confirmHint.getComponent(Label);
                if (label) {
                    label.string = '等待所有玩家确认...';
                }
            }

            // 添加确认按钮事件（只对真实玩家显示）
            if (playerSeat >= 0) {
                const confirmBtn = winnerInfoChild.getChildByName('CONFIRM');
                if (confirmBtn) {
                    confirmBtn.active = true;
                    const button = confirmBtn.getComponent(Button);
                    if (button) {
                        button.node.on('click', () => {
                            if (onConfirm) {
                                onConfirm(playerSeat);
                            }
                            this.cleanupWinnerUI(node, null);
                        });
                    }
                }
            }
        }
        
        // ✅ [修改] 直接显示，无缩放动画
        winnerInfoNode.setScale(1, 1, 1);
    }

    /**
     * 创建标签节点
     * @param parent 父节点
     * @param name 节点名称
     * @param text 文本内容
     * @param position 位置
     * @param fontSize 字体大小
     * @param color 颜色
     */
    private createLabelNode(parent: Node, name: string, text: string, position: Vec3, fontSize: number, color: Color) {
        if (!parent) return;
        const labelNode = new Node(name);
        labelNode.setPosition(position.x, position.y, position.z);
        parent.addChild(labelNode);

        const uiTransform = labelNode.addComponent(UITransform);
        uiTransform.setAnchorPoint(0.5, 0.5);

        const label = labelNode.addComponent(Label);
        label.fontSize = fontSize;
        label.color = color;
        label.string = text;
    }

    /**
     * 清理胜利者UI
     * @param node 根节点
     * @param playersContainer 玩家容器节点
     * @param clearCards 是否同时清理卡牌（默认false，只有新局开始时才清理）
     */
    public cleanupWinnerUI(node: Node, playersContainer: Node, clearCards: boolean = false) {
        // ✅ [修改] 只有在新局开始时（clearCards=true）才清空卡牌
        // 玩家确认结算时不清理公牌，保持公牌显示直到所有玩家确认完成
        if (clearCards) {
            this.cleanupCards();
        }
        
        // ✅ [新增] 尝试查找所有可能的胜利面板节点
        const panelNames = ['WinnerPanel', 'WinnerInfo', 'winPanel', 'WinPanel', 'winnerPanel'];
        
        // 1. 先尝试从当前节点查找
        for (const name of panelNames) {
            const panelNode = node.getChildByName(name);
            if (panelNode) {
                panelNode.destroy();
            }
        }
        
        // 2. 尝试从 start 节点查找
        const startNode = find('Canvas/start') || find('Canvas_pvp/start') || find('start');
        if (startNode) {
            for (const name of panelNames) {
                const panelNode = startNode.getChildByName(name);
                if (panelNode) {
                    panelNode.destroy();
                }
            }
        }
        
        // 3. 全局查找并销毁
        for (const name of panelNames) {
            const panelNode = find(name);
            if (panelNode) {
                panelNode.destroy();
            }
        }
        
        // 隐藏已有的 mask 节点
        let maskNode: Node | null = null;
        
        // 尝试各种可能的路径
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
            maskNode = find(path);
            if (maskNode) {
                break;
            }
        }
        
        // 如果上面都没找到，尝试从当前节点向上遍历
        if (!maskNode) {
            let current = node;
            while (current && !maskNode) {
                const startNode = current.getChildByName('start');
                if (startNode) {
                    maskNode = startNode.getChildByName('mask');
                }
                current = current.parent;
            }
        }
        
        // ✅ [关键修复] 移除危险的全局 find('mask') 查找
        // 全局查找可能找到场景中其他名为 'mask' 的节点（如游戏容器下的裁剪遮罩）
        // 这会导致错误地隐藏游戏内容，导致玩家头像和手牌消失
        // 只使用上面通过特定路径找到的 mask 节点
        
        if (maskNode) {
            maskNode.active = false;
            // ✅ [关键修复] 恢复 mask 节点的层级，避免影响游戏内容的渲染顺序
            // 之前胜利面板显示时将 mask 设置到了 9998 层级，隐藏后需要恢复
            maskNode.setSiblingIndex(0);
        }
        
        // 移除牌型显示节点
        const handTypeDisplay = node.getChildByName('allHandTypeDisplay');
        if (handTypeDisplay) {
            handTypeDisplay.destroy();
        }
        
        // ✅ [新增] 检查并移除确认提示文本
        const confirmHint = find('confirmHint');
        if (confirmHint) {
            confirmHint.destroy();
        }

        // 恢复所有玩家头像的原始缩放
        if (playersContainer) {
            const avatarContainer = playersContainer.getChildByName('avatar');
            if (avatarContainer) {
                for (let i = 0; i < 6; i++) {
                    const avatarNode = avatarContainer.getChildByName(`avatar_${i + 1}`);
                    if (avatarNode && (avatarNode as any)._originalScale) {
                        tween(avatarNode)
                            .to(0.3, {
                                scale: (avatarNode as any)._originalScale
                            })
                            .start();
                    }
                }
            }
        }
    }

    /**
     * 清空手牌和公牌
     * @param container 可选的 container 节点，如果提供则直接使用
     */
    cleanupCards(container?: Node) {
        let cleaned = false;
        
        // 如果提供了 container 参数，只清理牌相关节点，保留其他 UI
        if (container) {
            for (let i = container.children.length - 1; i >= 0; i--) {
                const child = container.children[i];
                const name = child.name;
                if (name.startsWith('board_card_') || 
                    name.startsWith('card_') || 
                    name.startsWith('Poker_') ||
                    name === 'Deck') {
                    child.destroy();
                    cleaned = true;
                }
            }
        }
        
        // ✅ [修复] 专门清理公牌节点（board_card_0 到 board_card_4）
        this.clearBoardCards();
        
        // ✅ [关键修复] 只清理牌相关节点，保留 avatar 容器和其他 UI
        const container1 = find('Canvas/gaming_/gaming/container');
        if (container1) {
            for (let i = container1.children.length - 1; i >= 0; i--) {
                const child = container1.children[i];
                const name = child.name;
                if (name.startsWith('board_card_') || 
                    name.startsWith('card_') || 
                    name.startsWith('Poker_') ||
                    name === 'Deck') {
                    child.destroy();
                    cleaned = true;
                }
            }
        }
        
        // ✅ [关键修复] 只清理牌相关节点，保留 avatar 容器和其他 UI
        const container2 = find('gaming_/gaming/container');
        if (container2) {
            for (let i = container2.children.length - 1; i >= 0; i--) {
                const child = container2.children[i];
                const name = child.name;
                if (name.startsWith('board_card_') || 
                    name.startsWith('card_') || 
                    name.startsWith('Poker_') ||
                    name === 'Deck') {
                    child.destroy();
                    cleaned = true;
                }
            }
        }
        
        // ✅ [关键修复] 只清理牌相关节点，保留 avatar 容器和其他 UI
        const gamingNode = find('Canvas/gaming');
        if (gamingNode) {
            const container3 = gamingNode.getChildByName('container');
            if (container3) {
                for (let i = container3.children.length - 1; i >= 0; i--) {
                    const child = container3.children[i];
                    const name = child.name;
                    if (name.startsWith('board_card_') || 
                        name.startsWith('card_') || 
                        name.startsWith('Poker_') ||
                        name === 'Deck') {
                        child.destroy();
                        cleaned = true;
                    }
                }
            }
        }
        
        // 查找并清空桌面上的牌堆区域
        const deck = find('Canvas/gaming_/gaming/container/Dealer/Deck');
        if (deck) {
            const deckCount = deck.children.length;
            deck.removeAllChildren();
        }
    }
    
    /**
     * 专门清空公牌节点
     */
    private clearBoardCards() {
        
        // 尝试多种可能的 container 路径
        const containerPaths = [
            'Canvas/gaming_/gaming/container',
            'gaming_/gaming/container',
            'Canvas/gaming/container'
        ];
        
        let removedCount = 0;
        
        for (const path of containerPaths) {
            const container = find(path);
            if (container) {
                // 查找所有公牌节点（board_card_0 到 board_card_4）
                for (let i = 0; i < 5; i++) {
                    const boardCard = container.getChildByName(`board_card_${i}`);
                    if (boardCard) {
                        boardCard.destroy();
                        removedCount++;
                    }
                }
                
                // 也尝试移除所有名为 board_card 的子节点（不限制索引）
                const boardCards = container.children.filter(child => 
                    child.name && child.name.startsWith('board_card_')
                );
                for (const card of boardCards) {
                    card.destroy();
                    removedCount++;
                }
            }
        }
    }

    /**
     * 更新当前下注显示（用于网络模式）
     * @param currentBet 当前下注金额
     */
    updateCurrentBet(currentBet: number) {
    }

    /**
     * 更新底池金额（用于网络模式）
     * @param potLabel 底池标签
     * @param potAmount 底池金额
     */
    updatePotAmount(potLabel: Label, potAmount: number) {
        if (potLabel) {
            potLabel.string = potAmount.toString();
            // ✅ [日志增强] 使用INFO级别确保日志显示
        } else {
            LogService.warn('UIManager', `无法更新底池金额: potLabel为null`);
        }
    }

    /**
     * 更新玩家筹码（用于网络模式）
     * @param playerIndex 玩家索引
     * @param chips 筹码金额
     * @param retryCount 重试次数（内部使用）
     */
    updatePlayerChips(playerIndex: number, chips: number, retryCount: number = 0) {
        if (this._playerManager && this._gameManager) {
            // ✅ 使用正确的方法更新玩家筹码
            this._gameManager.setPlayerChips(playerIndex, chips);
            const playersContainer = this._playerManager.getPlayersContainer();
            if (playersContainer) {
                this.updateAvatarAmount(playersContainer, playerIndex, chips);
            }
        } else {
           // LogService.warn('UIManager', `无法更新玩家筹码: _playerManager=${this._playerManager ? 'OK' : 'null'}, _gameManager=${this._gameManager ? 'OK' : 'null'}，重试次数: ${retryCount}`);
            if (retryCount < 5) {
                setTimeout(() => this.updatePlayerChips(playerIndex, chips, retryCount + 1), 200);
            }
        }
    }

    /**
     * 更新需要跟注金额（用于网络模式）
     * @param needToCall 需要跟注的金额
     */
    updateNeedToCall(needToCall: number) {
        // ✅ [关键修复] 更新需要跟注金额显示
        // 这个方法需要在 gaming.ts 中调用具体的UI更新逻辑
        //LogService.info('UIManager', `💰 需要跟注: ${needToCall}`);
    }

    /**
     * 设置 playerManager 实例
     * @param playerManager 玩家管理器实例
     */
    setPlayerManager(playerManager: any) {
        this._playerManager = playerManager;
    }

    /**
     * 设置 gameManager 实例
     * @param gameManager 游戏管理器实例
     */
    setGameManager(gameManager: any) {
        this._gameManager = gameManager;
    }

    /**
     * 显示等待其他玩家确认的提示
     * @param node 父节点
     */
    showWaitingConfirmation(node: Node) {
        
        if (!node) {
            LogService.error('UIManager', 'showWaitingConfirmation: node 为 null');
            return;
        }
        
        // 查找胜利面板节点
        const winPanel = node.getChildByName('WinnerInfo');
        if (!winPanel) {
            LogService.warn('UIManager', '未找到胜利面板节点');
            return;
        }
        
        // 查找确认按钮
        const confirmBtn = winPanel.getChildByName('confirmBtn');
        if (confirmBtn) {
            confirmBtn.active = false;
        }
        
        // 查找确认提示标签
        const confirmHint = winPanel.getChildByName('confirmHint');
        if (confirmHint) {
            const label = confirmHint.getComponent(Label);
            if (label) {
                label.string = '已确认，等待其他玩家...';
            }
        }
    }

    /**
     * 计算座位位置（基于椭圆方程）
     * 规则：
     * 1. 玩家入座是随机的（_playerSeat可以是0-8任意一个）
     * 2. 从真实玩家的第一视角看，自己始终在下方位置
     * 3. 玩家编号是实际座位号（1-9），不是相对编号
     * 
     * @param playersNum 玩家总数
     * @param playerSeat 真实玩家的实际座位
     * @param isPlayerActive 检查玩家是否活跃的回调函数
     * @param returnLocal 是否返回本地坐标（相对于椭圆中心）
     * @returns 座位位置数组
     */
    calculateSeatPositions(
        playersNum: number, 
        playerSeat: number, 
        isPlayerActive: (seatIndex: number) => boolean,
        returnLocal: boolean = true
    ) {
        const positions = [];
        
        // 椭圆参数（根据实际桌面大小调整）
        const ellipseWidth = 600;  // 椭圆宽度（减小以确保所有玩家都在可视区域内）
        const ellipseHeight = 1000; // 椭圆高度（减小以确保所有玩家都在可视区域内）
        const margin = 50; // 边缘留白（增加以确保所有玩家都在可视区域内）
        
        // 真实玩家的实际座位（传入参数）
        const realPlayerSeat = playerSeat;
        
        // 收集活跃玩家的实际座位
        const activeSeats = [];
        for (let i = 0; i < playersNum; i++) {
            if (isPlayerActive(i)) {
                activeSeats.push(i);
            }
        }
        
        // 活跃玩家数量
        const activePlayersNum = activeSeats.length;

        
        // 计算每个活跃玩家的"视觉索引"
        // 视觉索引0 = 真实玩家的位置（下方）
        // 视觉索引1 = 真实玩家顺时针方向下一个座位（右边）
        // 视觉索引2 = 真实玩家顺时针方向再下一个座位
        // 依此类推，视觉索引按顺时针方向递增
        
        for (let i = 0; i < activePlayersNum; i++) {
            const actualSeat = activeSeats[i];
            const playerNumber = actualSeat + 1;
            
            // 计算这个座位相对于真实玩家的视觉位置
            let visualIndex: number;
            if (actualSeat === realPlayerSeat) {
                visualIndex = 0; // 真实玩家在视觉索引0（下方）
            } else {
                // 计算从真实玩家到当前位置在活跃玩家中的顺时针距离
                let distanceFromReal = 0;
                let currentSeat = realPlayerSeat;
                while (true) {
                    currentSeat = (currentSeat + 1) % playersNum;
                    // 只计算活跃玩家
                    if (isPlayerActive(currentSeat)) {
                        distanceFromReal++;
                    }
                    if (currentSeat === actualSeat) {
                        break;
                    }
                }
                visualIndex = distanceFromReal;
            }
            
            // 计算角度（弧度）
            // 视觉索引0（真实玩家）在下方（-π/2）
            // 其他视觉索引按顺时针方向排列
            const angleOffset = -Math.PI / 2; // 真实玩家在正下方
            const angleInterval = (Math.PI * 2) / activePlayersNum;
            // 负号表示顺时针方向（三角函数中默认是逆时针）
            const angle = angleOffset - (angleInterval * visualIndex);
            
            // 椭圆方程：x = a * cos(θ), y = b * sin(θ)
            const a = (ellipseWidth - margin * 2) / 2;
            const b = (ellipseHeight - margin * 2) / 2;
            
            const x = a * Math.cos(angle);
            const y = b * Math.sin(angle);
            
            // 计算旋转角度，使玩家面向桌子中心
            const rotation = (Math.atan2(y, x) * 180 / Math.PI) - 90;
            
            // 判断是否为真实玩家
            const isPlayer = (actualSeat === realPlayerSeat);
            
            positions.push({
                x: returnLocal ? x : x + ellipseWidth / 2,
                y: returnLocal ? y : y + ellipseHeight / 2,
                rotation: rotation,
                isPlayer: isPlayer,
                playerNumber: playerNumber,
                actualSeat: actualSeat, // 实际座位号
                visualIndex: visualIndex // 视觉索引，用于排序
            });
        }
        
        // 按视觉索引排序，确保顺时针顺序
        positions.sort((a, b) => a.visualIndex - b.visualIndex);
        
        return positions;
    }
}
