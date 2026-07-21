/**
 * 玩家 UI 更新器
 * 负责处理玩家的头像、昵称、筹码等显示更新
 */
import { Node, Label } from 'cc';
import { UIManager } from '../managers/UIManager';
import { PlayerManager } from '../managers/PlayerManager';
import { LogService } from '../utils/LogService';

export class PlayerUIUpdater {
    
    private _playerManager: PlayerManager;
    private _uiManager: UIManager;
    private _playersContainer: Node;
    
    // 待显示操作的临时存储
    private _pendingActions: Map<number, { action: string; amount: number; nickname: string }> = new Map();
    
    constructor(playerManager: PlayerManager, uiManager: UIManager, playersContainer: Node) {
        this._playerManager = playerManager;
        this._uiManager = uiManager;
        this._playersContainer = playersContainer;
    }
    
    /**
     * 更新单个玩家的 UI
     */
    updateSinglePlayerUI(seatIndex: number, playerState: any) {
        
        // 更新玩家筹码显示（直接使用服务端发送的余额）
        if (playerState.gameCoin !== undefined) {
            this._uiManager.updateAvatarAmount(this._playersContainer, seatIndex, playerState.gameCoin);
        }
        
        // 更新昵称显示
        if (playerState.nickname !== undefined) {
            this.updateAvatarNickname(seatIndex, playerState.nickname);
        }
        
        // 更新操作筹码显示
        if (playerState.roundBet > 0) {
            this._uiManager.showPlayerActionChip(this._playersContainer, seatIndex, playerState.roundBet);
        }
        
        // 显示操作标签（action_label）
        // 优先使用待显示的操作信息（防止立即更新被服务端返回覆盖）
        let actionToShow = playerState.lastAction;
        let amountToShow = playerState.lastActionBet || 0;
        let nicknameToShow = playerState.nickname;
        
        if (this._pendingActions.has(seatIndex)) {
            const pendingAction = this._pendingActions.get(seatIndex);
            actionToShow = pendingAction.action;
            amountToShow = pendingAction.amount;
            nicknameToShow = pendingAction.nickname;
            
            // 清除待显示的操作信息
            this._pendingActions.delete(seatIndex);
        }
        
        // 所有操作都应该显示 action_label，包括 fold、check 等没有下注金额的操作
        if (actionToShow) {
            this._uiManager.showActionLog(this._playersContainer.parent, seatIndex, actionToShow, amountToShow);
            this._playerManager.showPlayerActionNearAvatar(this._playersContainer, seatIndex, actionToShow, amountToShow, nicknameToShow);
        }
    }
    
    /**
     * 设置待显示的操作（用于在收到服务端响应前立即显示）
     */
    setPendingAction(seatIndex: number, action: string, amount: number, nickname: string) {
        this._pendingActions.set(seatIndex, { action, amount, nickname });
    }
    
    /**
     * 更新指定玩家头像的 nick_name 显示
     */
    updateAvatarNickname(playerIndex: number, nickname: string) {
        const avatarContainer = this._playersContainer.getChildByName('avatar');
        if (!avatarContainer) {
            return;
        }
        
        const avatarNode = avatarContainer.getChildByName(`avatar_${playerIndex + 1}`);
        if (avatarNode) {
            const nickNameNode = avatarNode.getChildByName('nick_name');
            if (nickNameNode) {
                const label = nickNameNode.getComponent(Label);
                if (label) {
                    label.string = nickname;
                }
            }
        }
    }
    
    /**
     * 更新所有玩家的 UI
     */
    updateAllPlayersUI(players: any[]) {
        for (const playerState of players) {
            const seatIndex = playerState.seatIndex;
            if (seatIndex === undefined || seatIndex === null) {
                continue;
            }
            this.updateSinglePlayerUI(seatIndex, playerState);
        }
    }
}
