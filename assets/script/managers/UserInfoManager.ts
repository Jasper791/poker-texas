/**
 * 用户信息管理器 - 全局单例
 * 负责管理当前登录用户的信息，包括房卡数量等
 */
import { LogService } from '../utils/LogService';

export interface UserInfo {
    userId: number;
    nickname: string;
    walletAddress: string;
    roomCard: number;
    gameCoin: number;           // ✅ [新增] 游戏币数量
    createdAt?: string;
    updatedAt?: string;
}

export class UserInfoManager {
    private static _instance: UserInfoManager | null = null;
    
    private _userInfo: UserInfo | null = null;
    private _isLoggedIn: boolean = false;
    private _isWebSocketConnected: boolean = false;
    /** 主页钱包 UI 缓存（跨场景切换时避免闪现默认「未连接」） */
    private _indexWalletDisplayText: string = '';
    private _indexHideConnectBtn: boolean = false;
    
    private constructor() {
        // 私有构造函数，防止外部实例化
    }
    
    /**
     * 获取单例实例
     */
    public static getInstance(): UserInfoManager {
        if (!UserInfoManager._instance) {
            UserInfoManager._instance = new UserInfoManager();
        }
        return UserInfoManager._instance;
    }
    
    /**
     * 设置用户信息
     * @param userInfo 用户信息
     */
    public setUserInfo(userInfo: UserInfo): void {
        this._userInfo = userInfo;
        this._isLoggedIn = true;
        //LogService.info('UserInfoManager', `用户信息已更新: userId=${userInfo.userId}, roomCard=${userInfo.roomCard}`);
    }
    
    /**
     * 获取用户信息
     * @returns 用户信息，如果未登录返回null
     */
    public getUserInfo(): UserInfo | null {
        return this._userInfo;
    }
    
    /**
     * 获取用户ID
     * @returns 用户ID，如果未登录返回0
     */
    public getUserId(): number {
        return this._userInfo?.userId || 0;
    }
    
    /**
     * 获取房卡数量
     * @returns 房卡数量，如果未登录返回0
     */
    public getRoomCard(): number {
        return this._userInfo?.roomCard || 0;
    }
    
    /**
     * ✅ [新增] 获取游戏币数量
     * @returns 游戏币数量，如果未登录返回0
     */
    public getGameCoin(): number {
        return this._userInfo?.gameCoin || 0;
    }
    
    /**
     * 更新房卡数量（客户端本地更新）
     * @param newRoomCard 新的房卡数量
     */
    public updateRoomCard(newRoomCard: number): void {
        if (this._userInfo) {
            const oldCard = this._userInfo.roomCard;
            this._userInfo.roomCard = newRoomCard;
           // LogService.info('UserInfoManager', `房卡数量已更新: ${oldCard} -> ${newRoomCard}`);
        }
    }
    
    /**
     * 检查是否已登录
     * @returns 是否已登录
     */
    public isLoggedIn(): boolean {
        return this._isLoggedIn && this._userInfo !== null;
    }
    
    /**
     * ✅ [重命名] 检查是否可以访问需要登录的功能（替代 canCreateRoom）
     * @returns 是否可以访问
     */
    public canAccessFeatures(): boolean {
        const canAccess = this.isLoggedIn() && this.isWebSocketConnected();
        return canAccess;
    }
    
    /**
     * 设置WebSocket连接状态
     * @param connected 是否已连接
     */
    public setWebSocketConnected(connected: boolean): void {
        this._isWebSocketConnected = connected;
        LogService.info('UserInfoManager', `WebSocket连接状态: ${connected ? '已连接' : '已断开'}`);
    }
    
    /**
     * 检查WebSocket是否已连接
     * @returns 是否已连接
     */
    public isWebSocketConnected(): boolean {
        return this._isWebSocketConnected;
    }
    
    /**
     * 检查是否可以创建房间（已登录且WebSocket已连接）
     * @returns 是否可以创建房间
     */
    public canCreateRoom(): boolean {
        const canCreate = this.isLoggedIn() && this.isWebSocketConnected();
        return canCreate;
    }
    
    /**
     * 检查房卡是否足够
     * @param requiredCard 需要的房卡数量
     * @returns 是否足够
     */
    public hasEnoughRoomCard(requiredCard: number): boolean {
        const currentCard = this.getRoomCard();
        const hasEnough = currentCard >= requiredCard;
        return hasEnough;
    }
    
    /**
     * 检查创建房间的条件
     * @param requiredCard 需要的房卡数量
     * @returns 检查结果对象
     */
    public checkCreateRoomConditions(requiredCard: number): {
        canCreate: boolean;
        reason?: string;
        currentRoomCard: number;
        requiredRoomCard: number;
    } {
        const currentRoomCard = this.getRoomCard();
        
        if (!this.isLoggedIn()) {
            return {
                canCreate: false,
                reason: '请先登录',
                currentRoomCard,
                requiredRoomCard: requiredCard
            };
        }
        
        if (!this.isWebSocketConnected()) {
            return {
                canCreate: false,
                reason: '请先连接WebSocket',
                currentRoomCard,
                requiredRoomCard: requiredCard
            };
        }

        const walletAddress = this.getWalletAddress();
        if (!walletAddress || !walletAddress.startsWith('0x')) {
            return {
                canCreate: false,
                reason: '请先连接钱包',
                currentRoomCard,
                requiredRoomCard: requiredCard
            };
        }
        
        if (!this.hasEnoughRoomCard(requiredCard)) {
            return {
                canCreate: false,
                reason: `房卡不足（当前: ${currentRoomCard}, 需要: ${requiredCard}）`,
                currentRoomCard,
                requiredRoomCard: requiredCard
            };
        }
        
        return {
            canCreate: true,
            currentRoomCard,
            requiredRoomCard: requiredCard
        };
    }
    
    /**
     * 重置用户信息（登出时调用）
     */
    public reset(): void {
        this._userInfo = null;
        this._isLoggedIn = false;
        this._isWebSocketConnected = false;
        this.clearIndexLoginUI();
        LogService.info('UserInfoManager', '用户信息已重置（登出）');
    }

    /**
     * 缓存主页钱包展示状态（场景重载后 onLoad 可立即恢复）
     */
    public persistIndexLoginUI(walletDisplayText: string, hideConnectBtn: boolean): void {
        this._indexWalletDisplayText = walletDisplayText;
        this._indexHideConnectBtn = hideConnectBtn;
    }

    public getPersistedIndexLoginUI(): { walletDisplayText: string; hideConnectBtn: boolean } {
        return {
            walletDisplayText: this._indexWalletDisplayText,
            hideConnectBtn: this._indexHideConnectBtn
        };
    }

    public clearIndexLoginUI(): void {
        this._indexWalletDisplayText = '';
        this._indexHideConnectBtn = false;
    }
    
    /**
     * 获取钱包地址
     * @returns 钱包地址，如果未登录返回空字符串
     */
    public getWalletAddress(): string {
        return this._userInfo?.walletAddress || '';
    }
    
    /**
     * 获取昵称
     * @returns 昵称，如果未登录返回空字符串
     */
    public getNickname(): string {
        return this._userInfo?.nickname || '';
    }
}