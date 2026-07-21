import { Node, Prefab, instantiate, Label, SpriteFrame, Sprite, Color, UIOpacity } from 'cc';
import { ViewPresenter } from './BasePresenter';
import { LogService } from '../utils/LogService';

/**
 * 玩家头像显示配置
 */
export interface PlayerAvatarConfig {
    avatarPrefab: Prefab;
    parent: Node;
    seatIcons?: SpriteFrame[];
}

/**
 * 玩家信息 Presenter
 * 负责管理所有玩家头像、筹码显示和状态更新
 * 与 gaming.ts 现有实现保持兼容
 */
export class PlayerInfoPresenter extends ViewPresenter {
    private _config: PlayerAvatarConfig | null = null;
    private _playerAvatars: Map<number, Node> = new Map();
    private _playerLabels: Map<number, { nickname?: Label, chips?: Label, action?: Label }> = new Map();
    private _currentPlayers: any[] = [];

    /**
     * 构造函数
     */
    constructor(avatarPrefab?: Prefab, parent?: Node) {
        super(parent);
        if (avatarPrefab && parent) {
            this._config = { avatarPrefab, parent };
        }
    }

    /**
     * 初始化
     */
    initWithConfig(config: PlayerAvatarConfig): void {
        this._config = config;
        this._view = config.parent;
        this.init();
    }

    protected onInit(): void {
    }

    protected onDestroy(): void {
        super.onDestroy();
        this.clearAllPlayers();
        this._playerAvatars.clear();
        this._playerLabels.clear();
        this._config = null;
    }

    protected onReset(): void {
        this.hideAllPlayers();
    }

    // ==================== 与 gaming.ts 兼容的公共方法 ====================

    /**
     * 批量初始化玩家
     */
    initPlayers(players: any[]): void {
        this.clearAllPlayers();
        this._currentPlayers = [...players];

        players.forEach((player, index) => {
            this.createPlayerAvatar(player);
        });
    }

    /**
     * 创建玩家头像
     */
    private createPlayerAvatar(player: any): void {
        if (!this._config?.avatarPrefab || !this._config.parent) return;

        const avatar = instantiate(this._config.avatarPrefab);
        
        // 设置位置 - 这里需要与 gaming.ts 的座位计算逻辑配合
        // 暂时先添加到父节点，位置由外部设置
        this._config.parent.addChild(avatar);

        this._playerAvatars.set(player.seatIndex, avatar);
        this._playerLabels.set(player.seatIndex, {});

        // 更新显示
        this.updatePlayerDisplay(player);
    }

    /**
     * 更新玩家显示
     */
    updatePlayerDisplay(player: any): void {
        const seatIndex = player.seatIndex;
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        // 更新昵称
        if (player.nickname !== undefined) {
            this.updatePlayerNickname(seatIndex, player.nickname);
        }
        
        // 更新筹码
        if (player.chips !== undefined || player.gameCoin !== undefined) {
            this.updatePlayerChips(seatIndex, player.chips !== undefined ? player.chips : player.gameCoin);
        }
        
        // 更新状态
        if (player.status !== undefined) {
            this.updatePlayerStatus(seatIndex, player.status);
        }

        // 更新座位索引
        if (player.seatIndex !== undefined) {
            this.updatePlayerSeatIndex(seatIndex, player.seatIndex);
        }
    }

    /**
     * 更新玩家头像（与 gaming.ts 中的 updatePlayerAvatar 对应）
     */
    updatePlayerAvatar(seatIndex: number, playerData: any): void {
        this.updatePlayerDisplay({ ...playerData, seatIndex });
    }

    /**
     * 更新玩家昵称
     */
    updatePlayerNickname(seatIndex: number, nickname: string): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        // 查找昵称标签并更新
        const nicknameLabel = this.findChildLabel(avatar, 'NicknameLabel') || 
                              this.findChildLabel(avatar, 'nickname') ||
                              avatar.getComponentInChildren(Label);
        if (nicknameLabel) {
            nicknameLabel.string = nickname;
        }

        const labels = this._playerLabels.get(seatIndex) || {};
        labels.nickname = nicknameLabel;
        this._playerLabels.set(seatIndex, labels);
    }

    /**
     * 更新玩家筹码（与 gaming.ts 中的 updatePlayerChips 对应）
     */
    updatePlayerChips(seatIndex: number, chips: number): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        // 查找筹码标签并更新
        const chipsLabel = this.findChildLabel(avatar, 'ChipsLabel') || 
                          this.findChildLabel(avatar, 'chips') ||
                          this.findChildLabel(avatar, 'amount');
        if (chipsLabel) {
            chipsLabel.string = chips.toString();
        }

        const labels = this._playerLabels.get(seatIndex) || {};
        labels.chips = chipsLabel;
        this._playerLabels.set(seatIndex, labels);
    }

    /**
     * 更新玩家座位索引
     */
    updatePlayerSeatIndex(seatIndex: number, displayIndex: number): void {
        // 这里可以根据需要更新座位标识
    }

    /**
     * 更新玩家操作标签（与 gaming.ts 中的 updatePlayerActionLabel 对应）
     */
    updatePlayerActionLabel(seatIndex: number, action: string, amount: number = 0): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        // 在头像旁边显示操作
        const actionLabel = this.findChildLabel(avatar, 'ActionLabel') || 
                           this.findChildLabel(avatar, 'action');
        if (actionLabel) {
            let text = action;
            if (amount > 0) {
                text += ` $${amount}`;
            }
            actionLabel.string = text;
            actionLabel.node.active = true;
        }
    }

    /**
     * 隐藏玩家操作标签
     */
    hidePlayerActionLabel(seatIndex: number): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        const actionLabel = this.findChildLabel(avatar, 'ActionLabel') || 
                           this.findChildLabel(avatar, 'action');
        if (actionLabel) {
            actionLabel.node.active = false;
        }
    }

    /**
     * 高亮当前玩家（与 gaming.ts 中的 highlightCurrentPlayer 对应）
     */
    highlightCurrentPlayer(seatIndex: number, highlight: boolean = true): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        // 简单的高亮效果 - 可以根据实际需求调整
        const sprite = avatar.getComponent(Sprite);
        if (sprite) {
            sprite.color = highlight ? new Color(255, 255, 200, 255) : new Color(255, 255, 255, 255);
        }
    }

    /**
     * 更新玩家座位图标（与 gaming.ts 中的 updatePlayerSeatIcon 对应）
     */
    updatePlayerSeatIcon(seatIndex: number, iconType: string): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar || !this._config?.seatIcons) return;

        // 查找座位图标节点
        let iconNode = avatar.getChildByName('SeatIcon');
        if (!iconNode) {
            iconNode = new Node('SeatIcon');
            avatar.addChild(iconNode);
        }

        const sprite = iconNode.getComponent(Sprite) || iconNode.addComponent(Sprite);
        
        // 根据图标类型选择对应的 SpriteFrame
        let iconIndex = 0;
        switch (iconType.toLowerCase()) {
            case 'btn':
            case 'button':
                iconIndex = 0;
                break;
            case 'sb':
            case 'smallblind':
                iconIndex = 1;
                break;
            case 'bb':
            case 'bigblind':
                iconIndex = 2;
                break;
            default:
                iconNode.active = false;
                return;
        }

        if (this._config.seatIcons[iconIndex]) {
            sprite.spriteFrame = this._config.seatIcons[iconIndex];
            iconNode.active = true;
        }
    }

    /**
     * 更新玩家状态
     */
    updatePlayerStatus(seatIndex: number, status: string): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        // 根据状态更新显示
        switch (status?.toLowerCase()) {
            case 'folded':
                // 显示弃牌状态
                this.setPlayerFolded(seatIndex, true);
                break;
            case 'allin':
                // 显示全下状态
                this.setPlayerAllIn(seatIndex, true);
                break;
            case 'out':
                // 显示出局状态
                this.setPlayerOut(seatIndex, true);
                break;
            default:
                // 显示正常状态
                this.setPlayerNormal(seatIndex);
                break;
        }
    }

    /**
     * 设置玩家弃牌状态
     */
    setPlayerFolded(seatIndex: number, folded: boolean): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        // 降低透明度表示弃牌
        avatar.active = true;
        const uiOpacity = avatar.getComponent(UIOpacity) || avatar.addComponent(UIOpacity);
        uiOpacity.opacity = folded ? 128 : 255;
    }

    /**
     * 设置玩家全下状态
     */
    setPlayerAllIn(seatIndex: number, allIn: boolean): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;
    }

    /**
     * 设置玩家出局状态
     */
    setPlayerOut(seatIndex: number, out: boolean): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        avatar.active = !out;
    }

    /**
     * 设置玩家正常状态
     */
    setPlayerNormal(seatIndex: number): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        const uiOpacity = avatar.getComponent(UIOpacity);
        if (uiOpacity) {
            uiOpacity.opacity = 255;
        }
        avatar.active = true;
    }

    /**
     * 显示玩家操作（与 gaming.ts 中的 showPlayerActionNearAvatar 对应）
     */
    showPlayerAction(seatIndex: number, action: string, amount: number = 0, nickname?: string): void {
        this.updatePlayerActionLabel(seatIndex, action, amount);
    }

    /**
     * 显示倒计时
     */
    showCountdown(seatIndex: number, timeRemaining: number): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        const countdownNode = avatar.getChildByName('Countdown');
        if (countdownNode) {
            const label = countdownNode.getComponent(Label);
            if (label) {
                label.string = Math.ceil(timeRemaining).toString();
            }
            countdownNode.active = true;
        }
    }

    /**
     * 隐藏倒计时
     */
    hideCountdown(seatIndex: number): void {
        const avatar = this._playerAvatars.get(seatIndex);
        if (!avatar) return;

        const countdownNode = avatar.getChildByName('Countdown');
        if (countdownNode) {
            countdownNode.active = false;
        }
    }

    /**
     * 隐藏所有玩家
     */
    hideAllPlayers(): void {
        for (const [seatIndex, avatar] of this._playerAvatars.entries()) {
            avatar.active = false;
        }
    }

    /**
     * 显示所有玩家
     */
    showAllPlayers(): void {
        for (const [seatIndex, avatar] of this._playerAvatars.entries()) {
            avatar.active = true;
        }
    }

    /**
     * 清除所有玩家
     */
    clearAllPlayers(): void {
        for (const [seatIndex, avatar] of this._playerAvatars.entries()) {
            avatar.destroy();
        }
        this._playerAvatars.clear();
        this._playerLabels.clear();
        this._currentPlayers = [];
    }

    /**
     * 获取玩家头像节点
     */
    getPlayerAvatar(seatIndex: number): Node | undefined {
        return this._playerAvatars.get(seatIndex);
    }

    /**
     * 辅助方法：查找子节点中的 Label
     */
    private findChildLabel(parent: Node, name: string): Label | null {
        const child = parent.getChildByName(name);
        if (child) {
            return child.getComponent(Label);
        }
        return null;
    }
}
