/**
 * 玩家管理器
 * 负责玩家的管理，包括玩家操作、AI 操作等
 */
import { Node, Label, Sprite, UITransform, Color, Vec3, tween, Layers } from 'cc';
import { SettingsManager } from './SettingsManager';
import { LogService } from '../utils/LogService';

export class PlayerManager {
    private _playersNum: number = 0;
    private _currentPlayer: number = 0;
    private _playerSeat: number = 0; // 随机分配真实玩家位置
    private _isFirstGame: boolean = true; // 标记是否是首次游戏
    private _actionHistory: Array<{ player: number, action: string, amount: number }> = [];
    private _foldedPlayers: Set<number> = new Set(); // 记录弃牌的玩家
    private _blinkTweens: Map<number, any> = new Map(); // 保存每个玩家的闪烁 tween 实例
    private _activePlayers: boolean[] = []; // 记录哪些玩家参与了当前游戏（还有筹码）
    private _allInPlayers: boolean[] = []; // 记录哪些玩家已经全下（来自服务端同步）
    private _aiPlayers: boolean[] = []; // 标记哪些是 AI 玩家（来自服务器数据）
    private _playersContainer: Node = null; // 玩家容器节点引用
    private _readyStates: Map<number, boolean> = new Map(); // 记录玩家的准备状态（key: userId, value: isReady）
    private _seatToUserId: Map<number, number> = new Map(); // 记录座位到用户ID的映射（key: seatIndex, value: userId）
    private _seatToIsHost: Map<number, boolean> = new Map(); // 记录座位到房主状态的映射（key: seatIndex, value: isHost）
    private _seatToIsOnline: Map<number, boolean> = new Map(); // 记录座位到在线状态的映射（key: seatIndex, value: isOnline）
    private _seatToIsInRound: Map<number, boolean> = new Map(); // 记录座位是否在当前回合玩家列表中（key: seatIndex, value: isInRound）
    private _isInSettlement: boolean = false; // 标记是否处于结算阶段
    private _scoreType: number = 0; // 规则类型 (0=计分, 1=筹码扣减, 2=代币)

    constructor() {
        this.reset();
    }

    /**
     * 设置玩家容器节点
     * @param container 玩家容器节点
     */
    setPlayersContainer(container: Node) {
        this._playersContainer = container;
    }

    /**
     * 获取玩家容器节点
     * @returns 玩家容器节点
     */
    getPlayersContainer(): Node | null {
        return this._playersContainer;
    }

    /**
     * 重置玩家状态
     */
    reset(randomizePlayerSeat: boolean = true) {
        const settingsManager = SettingsManager.getInstance();
        const oldPlayersNum = this._playersNum;
        this._playersNum = settingsManager.getPlayerCount();
        
        this._currentPlayer = 0;
        // 只有在首次游戏且允许随机时才随机分配真实玩家位置
        if (this._isFirstGame && randomizePlayerSeat) {
            this._playerSeat = Math.floor(Math.random() * this._playersNum);
            this._isFirstGame = false;
        }
        // 每次游戏都重新初始化活跃玩家数组，确保长度正确
        this._activePlayers = new Array(this._playersNum).fill(true);
        
        // 每次游戏都重置全下玩家状态
        this._allInPlayers = new Array(this._playersNum).fill(false);
        
        // 不要重置 _aiPlayers 和 _playerSeat，它们应该只在游戏开始时设置
        // 只在玩家数量变化时重新初始化 _aiPlayers
        if (oldPlayersNum !== this._playersNum) {
            this._aiPlayers = new Array(this._playersNum).fill(false);
        }
        
        this._actionHistory = [];
        this._foldedPlayers = new Set();
        this._blinkTweens.clear();
    }

    /**
     * 标记指定索引的玩家为 AI 玩家
     * @param playerIndex 玩家索引
     */
    markAI(playerIndex: number) {
        this._aiPlayers[playerIndex] = true;
    }

    /**
     * 检查是否是AI玩家（优先使用服务器数据，如果没有则使用座位判断）
     * @param playerIndex 玩家索引
     * @returns 是否是AI玩家
     */
    isAIPlayer(playerIndex: number): boolean {
        // 优先使用服务器数据（如果有AI标记）
        if (this._aiPlayers && this._aiPlayers.length > 0) {
            return this._aiPlayers[playerIndex] || false;
        }
        // 如果没有服务器数据，则使用座位判断（旧逻辑）
        return playerIndex !== this._playerSeat;
    }

    /**
     * 设置玩家座位
     * @param seat 座位索引
     */
    setPlayerSeat(seat: number) {
        this._playerSeat = seat;
    }

    /**
     * 记录玩家弃牌
     * @param playerIndex 玩家索引
     */
    setPlayerFolded(playerIndex: number) {
        this._foldedPlayers.add(playerIndex);
    }

    /**
     * 取消玩家弃牌状态
     * @param playerIndex 玩家索引
     */
    unsetPlayerFolded(playerIndex: number) {
        this._foldedPlayers.delete(playerIndex);
    }

    /**
     * 检查玩家是否已弃牌
     * @param playerIndex 玩家索引
     * @returns 是否已弃牌
     */
    isPlayerFolded(playerIndex: number): boolean {
        return this._foldedPlayers.has(playerIndex);
    }

    /**
     * 获取弃牌玩家数量
     * @returns 弃牌玩家数量
     */
    getFoldedPlayersCount(): number {
        return this._foldedPlayers.size;
    }

    /**
     * 检查是否还有活跃玩家（未弃牌且非全下）
     * @returns 是否有活跃玩家
     */
    hasActivePlayers(): boolean {
        return (this._playersNum - this._foldedPlayers.size) > 1;
    }

    /**
     * 获取玩家数量
     * @returns 玩家数量
     */
    getPlayersNum(): number {
        return this._playersNum;
    }

    /**
     * 更新活跃玩家列表（根据筹码和是否有实际玩家）
     * @param gameManager 游戏管理器，用于获取玩家筹码
     */
    updateActivePlayers(gameManager: any): void {
        this._activePlayers = [];
        const isScoreMode = this._scoreType === 0;
        const details: string[] = [];
        for (let i = 0; i < this._playersNum; i++) {
            const chips = gameManager.getPlayerChips(i);
            // ✅ [关键修复] 只有有实际玩家（_seatToUserId 中存在映射）的座位才被标记为活跃
            // 这样计分模式下不会为空闲座位创建头像
            const hasActualPlayer = this._seatToUserId.has(i);
            const isOnline = this._seatToIsOnline.get(i) !== false;
            let isActive = false;
            if (isScoreMode) {
                isActive = hasActualPlayer && isOnline; // 计分模式：有实际玩家且在线才活跃
                details.push(`seat${i}=${isActive ? 'ACTIVE' : 'SKIP'}(计分模式,hasPlayer=${hasActualPlayer},isOnline=${isOnline},chips=${chips})`);
            } else {
                isActive = hasActualPlayer && isOnline && chips > 0; // 非计分模式：有实际玩家、在线且筹码>0才活跃
                details.push(`seat${i}=${isActive ? 'ACTIVE' : 'INACTIVE'}(chips=${chips},hasPlayer=${hasActualPlayer},isOnline=${isOnline})`);
            }
            this._activePlayers.push(isActive);
        }
    }

    /**
     * 清空座位到用户ID的映射（用于玩家列表重建）
     */
    clearSeatToUserId(): void {
        this._seatToUserId.clear();
        this._seatToIsHost.clear();
        this._seatToIsOnline.clear();
        this._seatToIsInRound.clear();
        this._readyStates.clear();
    }

    /**
     * 设置座位的在线状态
     * @param seatIndex 座位索引
     * @param isOnline 是否在线
     */
    setSeatToIsOnline(seatIndex: number, isOnline: boolean): void {
        this._seatToIsOnline.set(seatIndex, isOnline);
    }

    /**
     * 设置座位是否在当前回合玩家列表中
     * @param seatIndex 座位索引
     * @param isInRound 是否在回合中
     */
    setSeatToIsInRound(seatIndex: number, isInRound: boolean): void {
        this._seatToIsInRound.set(seatIndex, isInRound);
    }

    /**
     * 获取座位的在线状态
     * @param seatIndex 座位索引
     * @returns 是否在线
     */
    getIsOnlineBySeatIndex(seatIndex: number): boolean {
        return this._seatToIsOnline.get(seatIndex) !== false;
    }

    /**
     * 设置结算阶段状态
     * @param isInSettlement 是否处于结算阶段
     */
    setInSettlement(isInSettlement: boolean): void {
        this._isInSettlement = isInSettlement;
    }

    /**
     * 设置规则类型
     * @param scoreType 规则类型 (0=计分, 1=筹码扣减, 2=代币)
     */
    setScoreType(scoreType: number): void {
        this._scoreType = scoreType;
    }

    /**
     * 检查是否处于结算阶段
     * @returns 是否处于结算阶段
     */
    isInSettlement(): boolean {
        return this._isInSettlement;
    }

    /**
     * 检查玩家是否活跃（还有筹码）
     * @param playerIndex 玩家索引
     * @returns 是否活跃
     */
    isPlayerActive(playerIndex: number): boolean {
        return this._activePlayers[playerIndex] || false;
    }

    /**
     * 判断玩家是否在当前回合玩家列表中
     * @param playerIndex 玩家索引
     * @returns 是否在回合中
     */
    isPlayerInRound(playerIndex: number): boolean {
        return this._seatToIsInRound.get(playerIndex) || false;
    }

    /**
     * 获取活跃玩家数量
     * @returns 活跃玩家数量
     */
    getActivePlayersCount(): number {
        return this._activePlayers.filter(active => active).length;
    }

    /**
     * 获取当前玩家
     * @returns 当前玩家索引
     */
    getCurrentPlayer(): number {
        return this._currentPlayer;
    }

    /**
     * 设置当前玩家
     * @param player 玩家索引
     */
    setCurrentPlayer(player: number) {
        this._currentPlayer = player;
    }

    /**
     * 获取玩家座位
     * @returns 玩家座位索引
     */
    getPlayerSeat(): number {
        return this._playerSeat;
    }

    /**
     * 切换到下一个玩家
     * @returns 下一个玩家索引
     */
    nextPlayer(): number {
        this._currentPlayer = (this._currentPlayer + 1) % this._playersNum;
        return this._currentPlayer;
    }

    /**
     * 记录玩家操作
     * @param action 操作类型
     * @param amount 金额
     */
    recordAction(action: string, amount: number) {
        this._actionHistory.push({
            player: this._currentPlayer,
            action: action,
            amount: amount
        });
    }

    /**
     * 获取玩家操作历史
     * @returns 操作历史
     */
    getActionHistory(): Array<{ player: number, action: string, amount: number }> {
        return this._actionHistory;
    }

    /**
     * 清空玩家操作历史
     */
    clearActionHistory() {
        this._actionHistory = [];
    }

    /**
     * 清空弃牌玩家集合
     */
    clearFoldedPlayers() {
        this._foldedPlayers.clear();
    }

    /**
     * 重置当前玩家
     */
    resetCurrentPlayer() {
        this._currentPlayer = 0;
        this._foldedPlayers.clear();
    }

    /**
     * 为指定玩家开始闪烁动画
     * @param playersContainer 玩家容器节点
     * @param player 玩家索引
     */
    startPlayerBlink(playersContainer: Node, player: number) {
        if (!playersContainer) {
            return;
        }

        const avatarContainer = playersContainer.getChildByName('avatar');
        if (!avatarContainer) {
            return;
        }

        const avatarNode = avatarContainer.getChildByName(`avatar_${player + 1}`);
        if (avatarNode) {
            // 停止之前的动画（如果有）
            const oldTween = this._blinkTweens.get(player);
            if (oldTween) {
                oldTween.stop();
            }

            // ✅ [修复] 不修改预制体尺寸，使用默认尺寸
            // avatarNode.setScale(1, 1, 1); // 移除尺寸修改，使用预制体默认设置

            // 创建并保存新的闪烁动画
            const newTween = tween(avatarNode)
                .to(0.3, { scale: new Vec3(1.1, 1.1, 1) })
                .to(0.3, { scale: new Vec3(1, 1, 1) })
                .union()
                .repeatForever()
                .start();

            this._blinkTweens.set(player, newTween);
        }
    }

    /**
     * 停止所有玩家的闪烁动画
     * @param playersContainer 玩家容器节点
     */
    stopAllPlayersBlink(playersContainer: Node) {
        if (!playersContainer) {
            return;
        }

        const avatarContainer = playersContainer.getChildByName('avatar');
        if (!avatarContainer) {
            return;
        }


        // 遍历所有玩家，停止他们的闪烁动画
        for (let i = 0; i < this._playersNum; i++) {
            const tweenInstance = this._blinkTweens.get(i);
            if (tweenInstance) {
                tweenInstance.stop();
            }

            // ✅ [修复] 不修改预制体尺寸，使用默认尺寸
            // const avatarNode = avatarContainer.getChildByName(`avatar_${i + 1}`);
            // if (avatarNode) {
            //     avatarNode.setScale(1, 1, 1);
            // }
        }

        // 清空保存的 tween 引用
        this._blinkTweens.clear();
    }

    /**
     * 在玩家头像附近显示操作
     * @param playersContainer 玩家容器节点
     * @param player 玩家索引 (seatIndex)
     * @param action 操作类型
     * @param amount 金额
     */
    showPlayerActionNearAvatar(playersContainer: Node, player: number, action: string, amount: number, nickname?: string) {
        // ✅ [修复] 检查 playersContainer 是否有效
        if (!playersContainer || playersContainer.isValid === false) {
            return;
        }

        // 检查玩家是否活跃
        if (!this.isPlayerActive(player)) {
            return;
        }
        // 获取avatar节点（playersContainer下的子容器）
        let avatarContainer: Node | null = null;
        try {
            avatarContainer = playersContainer.getChildByName('avatar');
        } catch (e) {
            return;
        }
        if (!avatarContainer) {
            return;
        }
        

        const avatarNode = avatarContainer.getChildByName(`avatar_${player + 1}`);
        if (!avatarNode) {
            // ✅ [修复] 延迟重试，但检查 playersContainer 是否有效
            setTimeout(() => {
                if (!playersContainer || playersContainer.isValid === false) {
                    return;
                }
                this.showPlayerActionNearAvatar(playersContainer, player, action, amount, nickname);
            }, 500);
            return;
        }

        // 转换操作类型为中文
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
            case 'ready':
            case '已准备':
                actionText = '已准备';
                break;
            case 'unready':
            case 'cancel_ready':
            case '取消准备':
                actionText = '取消准备';
                break;
        }

        // 如果action为空，清空action_label
        if (!actionText || actionText.trim() === '') {
            const actionLabel = avatarNode.getChildByName('action_label');
            if (actionLabel) {
                const label = actionLabel.getComponent(Label);
                if (label) {
                    label.string = '';
                }
            }
            return;
        }

        // 显示动作和金额，不显示昵称和牌力
        const displayText = amount > 0 ? `${actionText} ${amount}` : actionText;

        // 获取或创建 action_label 节点
        let actionLabel = avatarNode.getChildByName('action_label');
        
        if (!actionLabel) {
            // 动态创建 action_label 节点
            actionLabel = new Node('action_label');
            avatarNode.addChild(actionLabel);
            
            // 添加 UITransform 组件
            const uiTransform = actionLabel.addComponent(UITransform);
            uiTransform.setContentSize(100, 50);
            
            // 添加 Label 组件
            const label = actionLabel.addComponent(Label);
            label.string = displayText;
            label.fontSize = 20;
            label.color = new Color(255, 255, 255, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            
            // 设置 Layer
            actionLabel.layer = Layers.Enum.UI_2D;
        } else {
            // ✅ [关键修复] 先将节点设置为可见（如果之前被隐藏）
            actionLabel.active = true;
            // 获取 Label 组件并设置文本
            const label = actionLabel.getComponent(Label);
            if (label) {
                label.string = displayText;
            }
        }
        
        // 设置初始状态（透明和小尺寸）用于动画
        actionLabel.setPosition(0, 50, 0);
        actionLabel.setScale(0.1, 0.1, 1);
        
        // 添加冒泡弹出动画效果
        tween(actionLabel)
            .to(0.15, { scale: new Vec3(1.2, 1.2, 1), position: new Vec3(0, 55, 0) })
            .to(0.1, { scale: new Vec3(1, 1, 1), position: new Vec3(0, 50, 0) })
            .start();
        
        // ✅ [新增功能] 2秒后自动清空并隐藏 action_label
        const savedPlayerIndex = player; // 保存座位索引供 setTimeout 使用（使用参数中的 player）
        const savedContainer = playersContainer; // 保存容器引用
        setTimeout(() => {
            // ✅ [修复] 首先检查 savedContainer 是否有效
            if (!savedContainer || savedContainer.isValid === false) {
                return;
            }
            
            // 先查找 avatar 容器（与前面的查找逻辑一致）
            // ✅ [修复] 在调用 getChildByName 之前确保 savedContainer 不为 null
            let avatarContainer: Node | null = null;
            try {
                avatarContainer = savedContainer.getChildByName('avatar');
            } catch (e) {
                return;
            }
            
            if (!avatarContainer) {
                return;
            }
            
            // 查找该玩家的 avatar 节点（与前面的查找逻辑一致：avatar_${player+1}）
            const avatarName = `avatar_${savedPlayerIndex + 1}`;
            // ✅ [修复] 使用可选链确保 avatarContainer 不为 null
            const avatarNode = avatarContainer?.getChildByName(avatarName);
            
            if (avatarNode) {
                const actionLabelNode = avatarNode.getChildByName('action_label');
                if (actionLabelNode) {
                    // 清空 label 内容
                    const label = actionLabelNode.getComponent(Label);
                    if (label) {
                        label.string = '';
                    }
                    // ✅ [新增功能] 隐藏 action_label 节点
                    actionLabelNode.active = false;
                }
            }
        }, 2000); // 2秒后清空并隐藏
    }

    /**
     * 显示玩家的倒计时
     * @param playersContainer 玩家容器节点
     * @param player 玩家索引
     * @param timeRemaining 剩余时间（秒）
     */
    showPlayerCountdown(playersContainer: Node, player: number, timeRemaining: number) {
        //LogService.info('PlayerManager', `⏱️ showPlayerCountdown开始: player=${player}, time=${timeRemaining}`);
        
        if (!playersContainer) {
            //LogService.warn('PlayerManager', `⏱️ showPlayerCountdown: playersContainer为空`);
            return;
        }

        //LogService.info('PlayerManager', `⏱️ showPlayerCountdown: playersContainer=${playersContainer.name}, childrenCount=${playersContainer.children.length}`);
        
        let avatarContainer = playersContainer.getChildByName('avatar');
        if (!avatarContainer) {
            //LogService.warn('PlayerManager', `⏱️ showPlayerCountdown: avatarContainer未找到，尝试playersContainer`);
            // 尝试其他路径
            const avatarContainer2 = playersContainer.getChildByName('playersContainer');
            if (avatarContainer2) {
                avatarContainer = avatarContainer2;
                //LogService.info('PlayerManager', `⏱️ 使用playersContainer作为avatar容器`);
            } else {
                // 列出所有子节点帮助调试
                const childrenNames = playersContainer.children.map(c => c.name).join(',');
                //LogService.warn('PlayerManager', `⏱️ showPlayerCountdown: 未找到容器，可用子节点: ${childrenNames}`);
                return;
            }
        }

        //LogService.info('PlayerManager', `⏱️ avatarContainer=${avatarContainer.name}, childrenCount=${avatarContainer.children.length}`);

        let avatarNode = avatarContainer.getChildByName(`avatar_${player + 1}`);
        if (!avatarNode) {
            return;
        }

        //LogService.info('PlayerManager', `⏱️ 找到avatar节点: ${avatarNode.name}`);
        this._showCountdownOnNode(avatarNode, timeRemaining);
    }
    
    /**
     * 在指定节点上显示倒计时
     */
    private _showCountdownOnNode(avatarNode: Node, timeRemaining: number) {
        //LogService.info('PlayerManager', `⏱️ _showCountdownOnNode: avatar=${avatarNode.name}, time=${timeRemaining}`);
        
        const clockNode = avatarNode.getChildByName('clock');
        if (!clockNode) {
            //LogService.warn('PlayerManager', `⏱️ showPlayerCountdown: clock节点未找到`);
            // 列出avatar的子节点帮助调试
            const avatarChildren = avatarNode.children.map(c => c.name).join(',');
            //LogService.info('PlayerManager', `⏱️ avatar子节点: ${avatarChildren}`);
            return;
        }

        //LogService.info('PlayerManager', `⏱️ 找到clock节点`);

        const timeLabel = clockNode.getChildByName('time');
        if (!timeLabel) {
            //LogService.warn('PlayerManager', `⏱️ showPlayerCountdown: time节点未找到`);
            return;
        }

        const label = timeLabel.getComponent(Label);
        if (label) {
            label.string = timeRemaining.toString();
            //LogService.info('PlayerManager', `⏱️ 设置时间文本: ${timeRemaining}`);
        } else {
            //LogService.warn('PlayerManager', `⏱️ showPlayerCountdown: Label组件未找到`);
            return;
        }

        clockNode.active = true;
        clockNode.setScale(1, 1, 1);
        // ⚠️ 不要强制设置位置，保留预制体中的原始位置
        // clockNode.setPosition(0, 0, 0);
        
        //LogService.info('PlayerManager', `⏱️ showPlayerCountdown成功: 显示${timeRemaining}秒`);
    }

    /**
     * 隐藏玩家的倒计时
     * @param playersContainer 玩家容器节点
     * @param player 玩家索引
     */
    hidePlayerCountdown(playersContainer: Node, player: number) {
        if (!playersContainer) {
            return;
        }

        const avatarContainer = playersContainer.getChildByName('avatar');
        if (!avatarContainer) {
            return;
        }

        const avatarNode = avatarContainer.getChildByName(`avatar_${player + 1}`);
        if (!avatarNode) {
            return;
        }

        const clockNode = avatarNode.getChildByName('clock');
        if (clockNode) {
            clockNode.active = false;
            
            // 重置时间为30
            const timeLabel = clockNode.getChildByName('time');
            if (timeLabel) {
                const label = timeLabel.getComponent(Label);
                if (label) {
                    label.string = '30';
                }
            }
        }
    }

    /**
     * 更新玩家的倒计时时间
     * @param playersContainer 玩家容器节点
     * @param player 玩家索引
     * @param timeRemaining 剩余时间（秒）
     */
    updatePlayerCountdown(playersContainer: Node, player: number, timeRemaining: number) {
        if (!playersContainer) {
            return;
        }

        let avatarContainer = playersContainer.getChildByName('avatar');
        if (!avatarContainer) {
            // 尝试备用路径
            const avatarContainer2 = playersContainer.getChildByName('playersContainer');
            if (avatarContainer2) {
                avatarContainer = avatarContainer2;
            } else {
                return;
            }
        }

        let avatarNode = avatarContainer.getChildByName(`avatar_${player + 1}`);
        if (!avatarNode) {
            return;
        }

        const clockNode = avatarNode.getChildByName('clock');
        if (!clockNode) {
            return;
        }

        // ✅ [修复] 确保clock节点处于激活状态
        if (!clockNode.active) {
            clockNode.active = true;
            clockNode.setScale(1, 1, 1);
        }

        const timeLabel = clockNode.getChildByName('time');
        if (!timeLabel) {
            return;
        }

        const label = timeLabel.getComponent(Label);
        if (label) {
            label.string = timeRemaining.toString();
        }
    }

    /**
     * 清除玩家头像附近的操作显示
     * @param playersContainer 玩家容器节点
     * @param player 玩家索引
     */
    clearActionNearAvatar(playersContainer: Node, player: number) {
        if (playersContainer) {
            // 获取avatar节点（playersContainer下的子容器）
            const avatarContainer = playersContainer.getChildByName('avatar');
            if (!avatarContainer) {
                return;
            }

            const avatarNode = avatarContainer.getChildByName(`avatar_${player + 1}`);
            if (avatarNode) {
                const actionLabel = avatarNode.getChildByName('action_label');
                if (actionLabel) {
                    // 停止所有正在进行的动画
                    tween(actionLabel).stop();
                    // 重置位置和缩放
                    actionLabel.setPosition(0, 50, 0);
                    actionLabel.setScale(1, 1, 1);
                    // 获取 label 组件并清空文本
                    const label = actionLabel.getComponent(Label);
                    if (label) {
                        label.string = '';
                    }
                }
            }
        }
    }

    /**
     * 清除所有玩家的操作显示
     * @param playersContainer 玩家容器节点
     * @param playersNum 玩家数量
     */
    clearAllActionsNearAvatar(playersContainer: Node, playersNum: number) {
        for (let i = 0; i < playersNum; i++) {
            this.clearActionNearAvatar(playersContainer, i);
        }
    }

    /**
     * 记录玩家最后操作（用于服务端同步）
     * @param playerIndex 玩家索引
     * @param action 操作类型
     */
    setPlayerLastAction(playerIndex: number, action: string) {
        // 暂时不做存储，只在显示时使用
    }

    /**
     * 设置玩家全下状态（用于服务端同步）
     * @param playerIndex 玩家索引
     */
    setPlayerAllIn(playerIndex: number) {
        if (playerIndex >= 0 && playerIndex < this._playersNum) {
            this._allInPlayers[playerIndex] = true;
        }
    }

    /**
     * 播放玩家操作（用于服务端同步后的UI更新）
     * @param playerIndex 玩家索引
     * @param action 操作类型
     * @param amount 金额
     * @param nickname 玩家昵称
     */
    playPlayerAction(playerIndex: number, action: string, amount: number, nickname?: string) {
        // 显示操作在头像附近
        if (this._playersContainer) {
            this.showPlayerActionNearAvatar(this._playersContainer, playerIndex, action, amount, nickname);
        }
    }

    /**
     * 设置玩家准备状态（通过userId）
     * @param userId 用户ID
     * @param isReady 是否准备
     */
    setPlayerReady(userId: number, isReady: boolean) {
        this._readyStates.set(userId, isReady);
    }

    /**
     * 批量设置玩家准备状态
     * @param allReadyStates 所有玩家的准备状态（key: userId, value: isReady）
     */
    setAllReadyStates(allReadyStates: Record<number, boolean>) {
        this._readyStates.clear();
        for (const userId in allReadyStates) {
            this._readyStates.set(Number(userId), allReadyStates[userId]);
        }
    }

    /**
     * ✅ [新增] 重置所有玩家的准备状态为未准备
     * 用于开始游戏失败时（如玩家数量不足），让玩家重新准备
     */
    resetAllReadyStates(): void {
        for (const [userId] of this._readyStates) {
            this._readyStates.set(userId, false);
        }
    }

    /**
     * 检查玩家是否准备（通过userId）
     * @param userId 用户ID
     * @returns 是否准备
     */
    isPlayerReadyByUserId(userId: number): boolean {
        return this._readyStates.get(userId) || false;
    }

    /**
     * 根据座位索引获取准备状态
     * @param seatIndex 座位索引
     * @returns 是否准备
     */
    getIsReadyBySeatIndex(seatIndex: number): boolean {
        const userId = this._seatToUserId.get(seatIndex);
        if (userId === undefined) {
            return false;
        }
        return this._readyStates.get(userId) || false;
    }

    /**
     * 设置座位和用户ID的映射
     * @param seatIndex 座位索引
     * @param userId 用户ID
     */
    setSeatToUserId(seatIndex: number, userId: number) {
        this._seatToUserId.set(seatIndex, userId);
    }

    /**
     * 根据座位索引获取用户ID
     * @param seatIndex 座位索引
     * @returns 用户ID，找不到返回 undefined
     */
    getUserIdBySeatIndex(seatIndex: number): number | undefined {
        return this._seatToUserId.get(seatIndex);
    }

    /**
     * 设置座位的房主状态
     * @param seatIndex 座位索引
     * @param isHost 是否是房主
     */
    setSeatToIsHost(seatIndex: number, isHost: boolean) {
        this._seatToIsHost.set(seatIndex, isHost);
    }

    /**
     * 根据座位索引获取房主状态
     * @param seatIndex 座位索引
     * @returns 是否是房主，找不到返回 false
     */
    getIsHostBySeatIndex(seatIndex: number): boolean {
        return this._seatToIsHost.get(seatIndex) || false;
    }
    
    /**
     * 清理指定座位的玩家数据（用于玩家退出房间）
     * @param seatIndex 座位索引
     */
    clearPlayer(seatIndex: number) {
        // 获取该座位的用户ID
        const userId = this._seatToUserId.get(seatIndex);
        
        // 从座位映射中移除
        this._seatToUserId.delete(seatIndex);
        
        // 如果找到了用户ID，也从准备状态中移除
        if (userId !== undefined) {
            this._readyStates.delete(userId);
        }
        
        // 设置该座位为非活跃状态
        if (seatIndex >= 0 && seatIndex < this._activePlayers.length) {
            this._activePlayers[seatIndex] = false;
        }
    }

    /**
     * 根据用户ID获取玩家座位索引
     * @param userId 用户ID
     * @returns 座位索引，找不到返回 -1
     */
    getPlayerIndexByUserId(userId: number | string): number {
        // 转换为数字类型进行比较
        const targetUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        
        for (const [seatIndex, uid] of this._seatToUserId) {
            // 处理可能的类型差异
            const currentUid = typeof uid === 'string' ? parseInt(uid, 10) : uid;
            if (currentUid === targetUserId) {
                return seatIndex;
            }
        }
        
        LogService.warn('PlayerManager', `getPlayerIndexByUserId: 找不到 userId=${userId} 对应的座位索引`);
        return -1;
    }

    /**
     * 检查玩家是否准备（通过seatIndex）
     * @param seatIndex 座位索引
     * @returns 是否准备
     */
    isPlayerReady(seatIndex: number): boolean {
        const userId = this._seatToUserId.get(seatIndex);
        if (userId === undefined) {
            return false;
        }
        return this._readyStates.get(userId) || false;
    }

    /**
     * 检查是否所有玩家都已准备
     * @returns 是否全部准备
     */
    areAllPlayersReady(): boolean {
        // ✅ [修复] 使用 _seatToUserId（实际玩家映射）来检查所有玩家的准备状态
        // 而不是依赖 _readyStates.size，因为它可能与实际玩家数不一致
        const actualPlayerCount = this._seatToUserId.size;
        
        // 至少需要 2 个玩家才能开始游戏
        if (actualPlayerCount < 2) {
            return false;
        }
        
        // 检查每个实际玩家的准备状态
        let readyCount = 0;
        let missingReadyInfo = 0;
        for (const [seatIndex, userId] of this._seatToUserId) {
            const isReady = this._readyStates.get(userId) || false;
            if (isReady) {
                readyCount++;
            } else {
                // 检查是否在 _readyStates 中有记录但为 false，还是完全没有记录
                if (!this._readyStates.has(userId)) {
                    missingReadyInfo++;
                }
            }
        }
        
        const allReady = readyCount === actualPlayerCount;
        return allReady;
    }

    /**
     * 清除所有准备状态
     */
    clearReadyStates() {
        this._readyStates.clear();
        // ✅ [修复] 不清除 _seatToUserId 映射，保留座位和用户ID的对应关系
        // this._seatToUserId.clear();
    }

    /**
     * 获取玩家状态（用于服务端模式）
     * 返回一个包含玩家状态信息的对象
     * @param playerIndex 玩家索引
     * @returns 玩家状态对象
     */
    getPlayerState(playerIndex: number): { isAllIn: boolean, isFold: boolean } | null {
        if (playerIndex < 0 || playerIndex >= this._playersNum) {
            return null;
        }
        
        // ✅ [修复] 优先使用服务端同步的 isAllIn 状态，如果未设置则使用筹码判断作为备用
        const isAllIn = this._allInPlayers[playerIndex] !== undefined 
            ? this._allInPlayers[playerIndex] 
            : !this.isPlayerActive(playerIndex);
        
        return {
            isAllIn: isAllIn,
            isFold: this.isPlayerFolded(playerIndex)
        };
    }

    /**
     * 根据用户ID移除玩家
     * @param userId 用户ID
     */
    removePlayerByUserId(userId: number | string) {
        const targetUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        
        // 查找对应的座位索引
        let seatIndexToRemove = -1;
        for (const [seatIndex, uid] of this._seatToUserId) {
            const currentUid = typeof uid === 'string' ? parseInt(uid, 10) : uid;
            if (currentUid === targetUserId) {
                seatIndexToRemove = seatIndex;
                break;
            }
        }
        
        if (seatIndexToRemove !== -1) {
            // 从映射中移除
            this._seatToUserId.delete(seatIndexToRemove);
            this._readyStates.delete(targetUserId);
            
            // 标记该座位为非活跃
            if (seatIndexToRemove < this._activePlayers.length) {
                this._activePlayers[seatIndexToRemove] = false;
            }
            
            // 标记为弃牌
            this._foldedPlayers.add(seatIndexToRemove);
            
            LogService.info('PlayerManager', `已移除玩家: userId=${userId}, seatIndex=${seatIndexToRemove}`);
        } else {
            LogService.warn('PlayerManager', `removePlayerByUserId: 找不到 userId=${userId}`);
        }
    }

    /**
     * ✅ [新增] 清空座位到用户ID的映射（用于玩家退出时重新同步）
     */
    clearSeatMappings() {
        this._seatToUserId.clear();
    }

    /**
     * 清理所有状态
     */
    clear() {
        this._playersNum = 0;
        this._currentPlayer = 0;
        this._playerSeat = 0;
        this._isFirstGame = true;
        this._actionHistory = [];
        this._foldedPlayers.clear();
        this._blinkTweens.clear();
        this._activePlayers = [];
        this._allInPlayers = [];
        this._aiPlayers = [];
        this._readyStates.clear();
        this._seatToUserId.clear();
        LogService.info('PlayerManager', '所有状态已清理');
    }
}
