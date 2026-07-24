/**
 * 游戏网络管理器
 * 负责游戏的网络连接、登录等
 */
import { game, Game } from 'cc';
import { LogService } from '../utils/LogService';
import { WebSocketManager } from './WebSocketManager';
import { NetworkOptimizer } from './NetworkOptimizer';
import { CommandType } from './Protocol';
import { ResponseCode } from '../types';
import { Web3WalletManager } from '../utils/Web3WalletManager';
import { SettingsManager } from '../managers/SettingsManager';
import { UserInfoManager } from '../managers/UserInfoManager';
import { DialogManager } from '../components/Dialog/dialogManager';
import { NetworkEvent } from './NetworkEvent';
import { EventBus } from '../utils/EventBus';

export class GameNetwork {
    private static _instance: GameNetwork = null;
    private _wsManager: WebSocketManager = null;
    private _optimizer: NetworkOptimizer = null;
    private _walletManager: Web3WalletManager = null;
    private _userId: number = 0;
    private _token: string = '';
    private _walletAddress: string = '';
    private _roomId: number = 0;
    private _hostUserId: any = null; // 房主用户 ID
    private _roomType: string = 'PVE'; // 房间类型：PVE 或 PVP
    private _gameConfig: any = null;
    private _playersData: any[] = [];
    private _roomConfig: any = null; // 保存房间配置（人数、局数、规则、底注等）
    private _pendingJoinRoomId: number | null = null; // 待加入的房间 ID

    // 签名相关
    private _currentNonce: string = '';
    private _currentChallenge: string = '';
    private _currentSignature: string = '';
    private _challengeTimestamp: number = 0;

    // 超时定时器
    private _loginTimeout: any = null;
    private _createRoomTimeout: any = null;

    // 重连状态
    private _isReconnecting: boolean = false;
    private _currentRoomId: number | null = null;
    private _authToken: string = '';
    private _lastGameState: any = null; // 保存最后一次游戏状态用于重连恢复
    private _roomCode: string = ''; // 房间显示码（用于玩家显示和加入房间）

    // 消息压缩开关
    private _compressionEnabled: boolean = true;

    // ✅ 登录状态标志，防止并发登录
    private _isLoggingIn: boolean = false;
    private _loginPromise: Promise<boolean> | null = null;

    // ✅ 服务端 WebSocket 会话是否已绑定（重连后需 LOGIN_VERIFY 恢复）
    private _sessionRestored: boolean = false;
    private _sessionRestorePromise: Promise<boolean> | null = null;

    // ✅ 登录回调，用于重连失败时触发自动重新登录
    private _loginCallback: ((reason: string) => void) | null = null;

    // 重连失败回调
    private _onReconnectFailed: (error: string) => void = null;

    private static readonly AUTH_TOKEN_KEY = 'richman_auth_token';
    private static readonly WALLET_ADDRESS_KEY = 'richman_wallet_address';
    private static readonly CHALLENGE_TTL = 5 * 60 * 1000; // 有效期 5 分钟

    /**
     * 设置要加入的房间ID
     * @param roomId 要加入的房间ID
     */
    public setPendingJoinRoomId(roomId: number) {
        this._pendingJoinRoomId = roomId;
    }

    /**
     * 获取保存的房间数据（用于场景切换后恢复）
     */
    public getSavedRoomData(): any {
        if (this._roomId && this._gameConfig) {
            return {
                code: 0,
                roomId: this._roomId,
                roomCode: this._roomCode,
                hostUserId: this._hostUserId,
                ...this._gameConfig,
                players: this._playersData
            };
        }
        return null;
    }

    /**
     * 检查是否已有保存的房间数据
     */
    public hasSavedRoomData(): boolean {
        return this._roomId > 0 && this._gameConfig !== null;
    }

    /**
     * ✅ [新增] 重置房间ID（用于PVE场景切换时清除之前的房间状态）
     * 防止进入新场景时因为有旧的房间ID而自动开始游戏
     */
    public resetRoomId(): void {
        this._roomId = 0;
        this._currentRoomId = null;
        this._hostUserId = null;
        this._gameConfig = null;
        this._playersData = [];
        this._pendingJoinRoomId = null;
        this._isReconnecting = false;
    }

    // 回调
    private _onLoginSuccess: (data: any) => void = null;
    private _onLoginFailed: (error: string) => void = null;
    private _onRoomCreated: (data: any) => void = null;
    private _onMessage: (cmd: number, data: any) => void = null;
    private _onPlayerActionNotify: (data: any) => void = null;
    private _onReconnectSuccess: (gameState: any) => void = null;
    private _onConnected: () => void = null;
    private _onDisconnected: () => void = null;
    private _onPlayerExit: (data: any) => void = null;

    // ✅ 消息监听器数组（支持多个监听器）
    private _messageListeners: Array<{ cmd: number; callback: (data: any) => void }> = [];

    // ✅ 消息队列：用于存储在回调设置前收到的消息
    private _messageQueue: Array<{ cmd: number; data: any }> = [];

    public static getInstance(): GameNetwork {
        if (GameNetwork._instance === null) {
            GameNetwork._instance = new GameNetwork();
        }
        return GameNetwork._instance;
    }

    constructor() {
        this._wsManager = WebSocketManager.getInstance();
        this._optimizer = NetworkOptimizer.getInstance();
        this._walletManager = Web3WalletManager.getInstance();
        this._walletAddress = this._walletManager.getWalletAddress();
        // ✅ [修改] 页面刷新/应用重启时，不恢复持久化的token，用户需要手动登录
        // this.loadPersistedAuth();
        this.setupCallbacks();

        // ✅ [新增] 息屏/切后台恢复时，WebSocketManager 会自行处理 socket 层面的
        // 探活/重连，但服务端会话（token 校验/RECONNECT）恢复需要 GameNetwork 主动
        // 触发，不能只等下一次业务请求时被动调用 ensureSessionReady()
        game.on(Game.EVENT_SHOW, this._onAppResume, this);
    }

    /**
     * ✅ [新增] App 恢复前台时的兜底：确保登录会话尽快恢复
     * 延迟一小段时间，给 WebSocketManager 留出时间完成 socket 层的探活/重连
     */
    private _onAppResume(): void {
        setTimeout(() => {
            if (this.isLoggedIn() && !this._sessionRestored) {
                LogService.info('GameNetwork', '📱 App 恢复前台，主动检查/恢复登录会话');
                this.ensureSessionReady().catch((e) => {
                    LogService.warn('GameNetwork', '恢复前台后会话恢复失败: ' + e);
                });
            }
        }, 800);
    }

    /**
     * 从 localStorage 恢复 token / userId（页面刷新或重连后使用）
     */
    private loadPersistedAuth(): void {
        try {
            const token = localStorage.getItem(GameNetwork.AUTH_TOKEN_KEY);
            const wallet = localStorage.getItem(GameNetwork.WALLET_ADDRESS_KEY);
            const userId = localStorage.getItem('richman_user_id');
            if (token) {
                this._token = token;
                this._authToken = token;
            }
            if (wallet?.startsWith('0x')) {
                this._walletAddress = wallet;
            }
            if (userId) {
                const parsed = parseInt(userId, 10);
                if (parsed > 0) {
                    this._userId = parsed;
                }
            }
        } catch (e) {
           // LogService.warn('GameNetwork', '无法从 localStorage 恢复登录信息');
        }
    }

    private persistAuthData(): void {
        try {
            if (this._token) {
                localStorage.setItem(GameNetwork.AUTH_TOKEN_KEY, this._token);
            }
            if (this._walletAddress) {
                localStorage.setItem(GameNetwork.WALLET_ADDRESS_KEY, this._walletAddress);
            }
            if (this._userId > 0) {
                localStorage.setItem('richman_user_id', String(this._userId));
            }
        } catch (e) {
            //LogService.warn('GameNetwork', '无法保存登录信息到 localStorage');
        }
    }

    private clearPersistedAuth(): void {
        try {
            localStorage.removeItem(GameNetwork.AUTH_TOKEN_KEY);
            localStorage.removeItem(GameNetwork.WALLET_ADDRESS_KEY);
        } catch (e) {
            // ignore
        }
    }

    public getAuthToken(): string {
        return this._authToken || this._token;
    }

    /**
     * 确保 WebSocket 重连后服务端会话已恢复，再发业务请求
     */
    public async ensureSessionReady(): Promise<boolean> {
        if (this._sessionRestored || !this.isLoggedIn()) {
            return true;
        }
        if (this._isReconnecting) {
            return false;
        }
        if (!this._wsManager.isConnected()) {
            return false;
        }
        return this.restoreSessionAfterReconnect();
    }

    /**
     * 重连后通过 token 恢复服务端登录会话
     */
    private async restoreSessionAfterReconnect(): Promise<boolean> {
        if (this._sessionRestored) {
            return true;
        }
        if (this._sessionRestorePromise) {
            return this._sessionRestorePromise;
        }
        if (!this._wsManager.isConnected() || !this.isLoggedIn() || !this.getAuthToken()) {
            return false;
        }

        this._sessionRestorePromise = this._doRestoreSession();
        try {
            return await this._sessionRestorePromise;
        } finally {
            this._sessionRestorePromise = null;
        }
    }

    private async _doRestoreSession(): Promise<boolean> {
        const token = this.getAuthToken();
        //LogService.info('GameNetwork', '重连后恢复服务端会话...');

        try {
            // const response = await this.sendCommand({
            //     cmd: CommandType.LOGIN_VERIFY,
            //     data: {
            //         token,
            //         userId: this._userId,
            //         user_id: this._userId,
            //         wallet_address: this._walletAddress,
            //         walletAddress: this._walletAddress,
            //         device_id: this.generateDeviceId(),
            //         timestamp: Date.now()
            //     }
            // }, { skipSessionCheck: true });

            // if (response?.code === ResponseCode.SUCCESS) {
            //     this.applySessionFromResponse(response);
            //     this._sessionRestored = true;
            //     this._isReconnecting = false;
            //     LogService.info('GameNetwork', '✅ LOGIN_VERIFY 会话恢复成功');
            //     return true;
            // }

            // 第二步：RECONNECT
            const roomId = this._currentRoomId || this._roomId || 0;
            const recRes = await this.sendCommand({
                cmd: CommandType.RECONNECT,
                data: {
                    token,
                    userId: this._userId,
                    wallet_address: this._walletAddress,
                    signature: this._currentSignature,
                    nonce: this._currentNonce,
                    challenge: this._currentChallenge,
                    roomId,
                    timestamp: Date.now()
                }
            }, { skipSessionCheck: true });

            if (recRes?.code === ResponseCode.SUCCESS || recRes?.success) {
                this.applySessionFromResponse(recRes);
                this._sessionRestored = true;
                this._isReconnecting = false;
                if (roomId > 0) this.handleReconnectResponse(recRes);
                return true;
            }

           // LogService.warn('GameNetwork', `RECONNECT 失败: code=${recRes?.code}, msg=${recRes?.message || recRes?.msg}`);
        } catch (error) {
           // LogService.warn('GameNetwork', 'RECONNECT 异常，尝试 RECONNECT:', error);
        }

        return this._restoreSessionViaReconnect(token);
    }

    private async _restoreSessionViaReconnect(token: string): Promise<boolean> {
        try {

            const roomId = this._currentRoomId || this._roomId || 0;

            const response = await this.sendCommand({
                cmd: CommandType.RECONNECT,
                data: {
                    token,
                    userId: this._userId,
                    user_id: this._userId,
                    wallet_address: this._walletAddress,
                    walletAddress: this._walletAddress,
                    signature: this._currentSignature,
                    nonce: this._currentNonce,
                    challenge: this._currentChallenge,
                    roomId,
                    timestamp: Date.now()
                }
            }, { skipSessionCheck: true });

            if (response?.code === ResponseCode.SUCCESS || response?.success) {
                this.applySessionFromResponse(response);
                this._sessionRestored = true;
                this._isReconnecting = false;
                if (roomId > 0) {
                    this.handleReconnectResponse(response);
                }
                return true;
            }

           // LogService.error('GameNetwork', `会话恢复失败: code=${response?.code}, msg=${response?.message || response?.msg}`);
        } catch (error) {
            //LogService.error('GameNetwork', 'RECONNECT 会话恢复异常:', error);
        }
        return false;
    }

    private applySessionFromResponse(data: any): void {
        const userId = data.user_id || data.userId;
        if (userId) {
            this._userId = userId;
            this._wsManager.setUserId(this._userId); // ✅ 登录成功后设置 userId 到 WebSocketManager
        }
        const newToken = data.token;
        if (newToken) {
            this._token = newToken;
            this._authToken = newToken;
        }
        const wallet = data.wallet_address || data.walletAddress;
        if (wallet?.startsWith('0x')) {
            this._walletAddress = wallet;
        }
        // this.persistAuthData();
        UserInfoManager.getInstance().setWebSocketConnected(this._wsManager.isConnected());
    }

    /**
     * ❌ [已删除] 禁止使用模拟钱包地址
     * 必须通过真实钱包签名验证才能登录
     * 任何绕过真实钱包签名的行为都是不安全的
     */

    private setupCallbacks(): void {
        this._wsManager.setOnConnected(() => {
            UserInfoManager.getInstance().setWebSocketConnected(true);

            if (this._isReconnecting) {
                this._sessionRestored = false;
                this._sessionRestorePromise = null;
                this._isLoggingIn = false;
                this._loginPromise = null;

                LogService.info('GameNetwork', '🔄 WebSocket重连成功，开始恢复连接状态...');
                if (this._roomId <= 0 && !this._currentRoomId) {
                    this.sendReconnectByCurrentPage();
                } else {
                    LogService.info('GameNetwork', '牌桌重连由 gamingPvp 发送 PLAYER_RECONNECT(530)');
                }

                if (this._onConnected) {
                    this._onConnected();
                }
                return;
            }

            if (this._onConnected) {
                this._onConnected();
            }

            if (this._userId > 0) {
                this._isReconnecting = false;
                this._sessionRestored = true;
            }
        });

        this._wsManager.setOnDisconnected(() => {
            this._isReconnecting = true;
            this._sessionRestored = false;
            UserInfoManager.getInstance().setWebSocketConnected(false);
            // ✅ [修改] 保留登录信息，便于断线重连后自动重新登录
            // ✅ [新增] 保存当前房间ID到pendingJoinRoomId，登录成功后自动恢复房间
            if (this._roomId > 0 && !this._pendingJoinRoomId) {
                this._pendingJoinRoomId = this._roomId;
                LogService.info('GameNetwork', `⚠️  WebSocket 断开，保存房间ID ${this._roomId}，等待重连后恢复`);
            }
            LogService.info('GameNetwork', '⚠️  WebSocket 断开，保留登录信息，等待自动重连...');

            if (this._onDisconnected) {
                this._onDisconnected();
            }
        });

        this._wsManager.setOnError((error) => {
            LogService.error('GameNetwork', '❌ Network error:', error);
        });

        // 设置心跳超时回调
        this._wsManager.setOnHeartbeatTimeout(() => {
            this._isReconnecting = true;
            // ✅ [修改] 保留登录信息，不清除，等待后续的自动重连恢复
            LogService.warn('GameNetwork', '心跳超时，连接已断开，将在重连后发送 RECONNECT 请求恢复会话');

            if (this._onHeartbeatTimeout) {
                this._onHeartbeatTimeout();
            }
        });

        // 设置重连失败回调（达到最大重连次数时触发）
        this._wsManager.setOnReconnectFailed(() => {
            LogService.error('GameNetwork', '❌ WebSocket 重连失败，已达到最大重连次数');
            if (this._onReconnectFailed) {
                this._onReconnectFailed('WebSocket 重连失败，已达到最大重连次数');
            }
        });

        this._wsManager.setOnMessage((message) => {
            // 消息统计
            if (message.body) {
                const size = JSON.stringify(message.body).length;
                this._optimizer.updateStats('received', size);
            }

            // 处理心跳响应（兼容 HEARTBEAT 与 HEARTBEAT_REQUEST）
            if (message.cmd === CommandType.HEARTBEAT || message.cmd === CommandType.HEARTBEAT_REQUEST) {
                this._wsManager.handleHeartbeatResponse(message.body?.server_time);
                if (message.cmd === CommandType.HEARTBEAT &&
                    (message.body?.success !== undefined || message.body?.code !== undefined)) {
                    this.handleSessionBindingResponse(message.body);
                }
                return;
            }

            this.handleMessage(message);
        });
    }

    /**
     * 发送重连请求
     */
    private sendReconnectRequest(): void {
        const token = this.getAuthToken();
        const roomId = this._currentRoomId || this._roomId || 0;
        
        if (!token) {
            this._isReconnecting = false;
            LogService.warn('GameNetwork', 'sendReconnectRequest skipped: missing token');
            return;
        }

        const body = {
            token: token,
            roomId: roomId,
            userId: this._userId,
            wallet_address: this._walletAddress,
            signature: this._currentSignature,
            nonce: this._currentNonce,
            challenge: this._currentChallenge,
            timestamp: Date.now()
        };

        if (roomId > 0) {
            LogService.info('GameNetwork', '📤 发送 RECONNECT 请求（带房间），token=***, roomId={}', roomId);
            this.sendMessage(CommandType.RECONNECT, body);
        } else {
            LogService.info('GameNetwork', '📤 发送 RECONNECT 请求（不带房间），仅验证 token');
            this.sendMessage(CommandType.RECONNECT, body);
        }
    }

    /**
     * 保存当前游戏状态（用于重连恢复）
     * @param gameState 游戏状态对象
     */
    public saveGameState(gameState: any): void {
        this._lastGameState = JSON.parse(JSON.stringify(gameState));
        this._optimizer.saveGameState(gameState);
    }

    /**
     * 获取保存的游戏状态
     */
    public getSavedGameState(): any {
        return this._optimizer.getSavedGameState();
    }

    /**
     * 清除保存的游戏状态
     */
    public clearSavedGameState(): void {
        this._lastGameState = null;
        this._optimizer.clearGameState();
    }

    /**
     * 设置心跳超时回调
     */
    public setOnHeartbeatTimeout(callback: () => void): void {
        this._onHeartbeatTimeout = callback;
    }

    // 心跳超时回调
    private _onHeartbeatTimeout: () => void = null;

    /**
     * 在重连成功后发送 RECONNECT 请求恢复服务器会话
     * 不走钱包登录或签名流程
     */
    public async reconnectAndLogin(): Promise<void> {
        if (this._isLoggingIn) {
            return;
        }

        // 已登录且会话有效，直接返回
        if (this.isLoggedIn() && this._sessionRestored && this._wsManager.isConnected()) {
            return;
        }

        this._isLoggingIn = true;
        this._loginPromise = Promise.resolve(true);

        try {
            if (this._wsManager.isConnected()) {
                this.sendReconnectRequest();
            } else {
                // ✅ [修复] 之前这里只打日志、什么都不做，导致断线后如果调用方
                // 只依赖 reconnectAndLogin() 就永远恢复不了。现在主动触发底层重连。
                LogService.warn('GameNetwork', 'WebSocket 未连接，主动触发重新连接');
                this.connect();
            }
        } finally {
            this._isLoggingIn = false;
            this._loginPromise = null;
        }
    }

    /**
     * 连接到服务器
     * @param url WebSocket地址，默认为配置文件中的地址
     */
    public connect(url?: string): void {
        const serverUrl = url || SettingsManager.getInstance().getServerUrl();
        this._wsManager.connect(serverUrl);
    }

    /**
     * 连接到服务器（带房间类型）
     * 统一的服务器连接入口，封装房间类型设置和URL获取逻辑
     * @param roomType 房间类型：'PVE' 或 'PVP'
     * @param url 服务器地址（可选，不传则使用配置文件中的地址）
     */
    public connectToServer(roomType: string = 'PVE', url?: string): void {

        // 设置房间类型
        this.setRoomType(roomType);

        // 使用传入的URL或配置文件中的地址
        const serverUrl = url || SettingsManager.getInstance().getServerUrl();

        // 执行连接
        this.connect(serverUrl);
    }

    /**
     * 断开连接
     */
    public disconnect(): void {
        this._wsManager.disconnect();
    }

    /**
     * 使用保存的签名数据直接重新登录（断线重连时使用）
     */
    private sendWalletLoginWithSavedSignature(): void {
        LogService.info('GameNetwork', '🔐 使用保存的签名数据重新登录...');

        try {
            // 检查是否有必需的数据
            if (!this._walletAddress || !this._currentSignature || !this._currentNonce || !this._currentChallenge) {
                LogService.warn('GameNetwork', '⚠️ 缺少登录必需的数据，尝试重新获取challenge...');
                // ✅ [修复] 没有保存的签名数据，重新获取challenge并签名
                this.sendWalletLogin();
                return;
            }

            // 先清除可能存在的超时
            if (this._loginTimeout) {
                clearTimeout(this._loginTimeout);
            }

            // 设置超时 (15 秒)
            this._loginTimeout = setTimeout(() => {
                LogService.error('GameNetwork', '========== 使用保存的签名登录超时 ==========');
                this.notifyLoginFailed('Login timeout (15s)');
            }, 15000);

            const loginRequest = {
                wallet_address: this._walletAddress,
                signature: this._currentSignature,
                nonce: this._currentNonce,
                challenge: this._currentChallenge,
                nickname: 'Player',
                avatar: '',
                device_id: this.generateDeviceId(),
                timestamp: Date.now()
            };

            LogService.info('GameNetwork', '📤 发送 WALLET_LOGIN 请求（使用保存的签名）');
            this._wsManager.sendMessage(CommandType.WALLET_LOGIN, loginRequest);

        } catch (error) {
            LogService.error('GameNetwork', '❌ 使用保存的签名登录失败:', error);
            this.notifyLoginFailed('Login with saved signature failed: ' + error.message);
        }
    }

    /**
     * 发送钱包登录请求
     * 流程：
     * 1. 连接钱包获取地址（如果尚未连接）
     * 2. 生成挑战 nonce
     * 3. 用户对挑战签名
     * 4. 发送签名到服务端验证
     */
    public async sendWalletLogin(): Promise<void> {
        LogService.info('GameNetwork', '这是正式的签名登录流程，将触发钱包密码输入');

        try {
            // ==================== 步骤 1: 连接钱包并获取地址 ====================
            let walletAddress = this._walletAddress;

            // ✅ 如果已有钱包地址，跳过连接步骤（避免重复弹窗）
            if (!walletAddress || walletAddress.length === 0) {
                walletAddress = await this._walletManager.connectWallet();
                this._walletAddress = walletAddress;
            } else {
            }

            const providerType = this._walletManager.getProviderType();
            const providerName = providerType === 'metamask' ? 'MetaMask' :
                providerType === 'app_injected' ? 'App Injected Wallet' : 'Unknown';



            // ==================== 步骤 2: 获取登录挑战（向服务端请求）====================
            const { challenge, nonce } = await this._getLoginChallengeFromServer(walletAddress);
            this._currentChallenge = challenge;
            this._currentNonce = nonce;
            this._challengeTimestamp = Date.now();

            // ==================== 步骤 3: 对进行签名 ====================


            const signature = await this._walletManager.signChallenge(challenge);
            this._currentSignature = signature;

            LogService.info('GameNetwork', '✅ 签名成功，准备发送登录请求');

            // ==================== 步骤 4: 发送签名到服务端 ===================
            // 先清除可能存在的超时
            if (this._loginTimeout) {
                clearTimeout(this._loginTimeout);
            }

            // 设置超时 (15 秒)
            this._loginTimeout = setTimeout(() => {
                LogService.error('GameNetwork', '========== 钱包登录超时 ==========');
                this.notifyLoginFailed('Login timeout (15s)');
                this._challengeTimestamp = 0;
                this._currentSignature = '';
                this._currentNonce = '';
                this._currentChallenge = '';
            }, 15000);

            const loginRequest = {
                wallet_address: walletAddress,
                signature: signature,
                nonce: nonce,
                challenge: challenge,
                nickname: 'Player',
                avatar: '',
                device_id: this.generateDeviceId(),
                timestamp: Date.now()
            };

            this._wsManager.sendMessage(CommandType.WALLET_LOGIN, loginRequest);
            LogService.info('GameNetwork', '📤 WALLET_LOGIN 请求已发送，等待响应...');
            // 成功后重置
            this._sessionRestored = true;

        } catch (error) {
            LogService.error('GameNetwork', '   - 错误信息: ' + error.message);
            this.notifyLoginFailed('Wallet login failed: ' + error.message);
        }
    }

    /**
     * 发送玩家准备请求
     * 服务端收到后会调用 startGamePhase2 并发送 DEAL_CARDS_NOTIFY
     */
    public sendPlayerReadyRequest(): void {
        const request = {
            roomId: this._roomId,
            userId: this._userId,
            timestamp: Date.now()
        };
        this._wsManager.sendMessage(CommandType.PLAYER_READY_REQUEST, request);
    }

    /**
     * 发送玩家取消准备请求
     */
    public sendPlayerCancelReadyRequest(): void {
        const request = {
            roomId: this._roomId,
            userId: this._userId,
            timestamp: Date.now()
        };
        this._wsManager.sendMessage(CommandType.PLAYER_CANCEL_READY_REQUEST, request);
    }

    /**
     * 发送退出房间请求
     * 通知服务端玩家离开房间，服务端会更新房间人数、在线人数和Redis
     * @param callback 回调函数，参数为是否成功
     */
    public leaveRoom(callback?: (success: boolean) => void): void {

        if (!this._roomId || !this._userId) {
            callback?.(false);
            return;
        }

        const request = {
            roomId: this._roomId,
            userId: this._userId,
            timestamp: Date.now()
        };

        try {
            this._wsManager.sendMessage(CommandType.EXIT_ROOM, request);
            callback?.(true);
        } catch (error) {
            LogService.error('GameNetwork', `Failed to send EXIT_ROOM request: ${error}`);
            callback?.(false);
        }
    }

    /**
     * 发送继续游戏请求
     * 服务端收到后会开始新一局游戏
     */
    public sendContinueGame(data?: { remainingPlayers?: number[], eliminatedPlayers?: number[] }): void {
        const request: any = {
            roomId: this._roomId,
            userId: this._userId,
            timestamp: Date.now()
        };

        // 如果有额外数据，添加到请求中
        if (data) {
            if (data.remainingPlayers) {
                request.remainingPlayers = data.remainingPlayers;
            }
            if (data.eliminatedPlayers) {
                request.eliminatedPlayers = data.eliminatedPlayers;
            }
        }

        this._wsManager.sendMessage(CommandType.CONTINUE_GAME, request);

    }

    /**
     * 创建房间
     * @param joinRoomId 可选：要加入的已有房间ID，如果提供则加入该房间，否则创建新房间
     */
    public createRoom(joinRoomId?: number): void {

        // 如果还没登录，先保存要加入的房间ID，等登录后再处理
        if (!this._userId) {
            if (joinRoomId !== undefined && joinRoomId !== null) {
                this._pendingJoinRoomId = joinRoomId;
            } else {
                // 如果没有传入joinRoomId，确保pendingJoinRoomId是null
                this._pendingJoinRoomId = null;
            }
            return;
        }

        // 先清除可能存在的超时
        if (this._createRoomTimeout) {
            clearTimeout(this._createRoomTimeout);
        }

        // 设置超时 (15秒)
        this._createRoomTimeout = setTimeout(() => {

            LogService.error('GameNetwork', '没有收到服务端的任何响应！');
            if (this._onRoomCreated) {
                EventBus.getInstance().emit(NetworkEvent.CreateRoom, { code: -1, msg: 'Create room timeout (15s)' });
                // 用空数据触发回退
                this._onRoomCreated({ code: -1, msg: 'Create room timeout (15s)' });
            }
        }, 15000);

        // 在发送请求前记录房间类型

        // ✅ [修改] 必须从 room 传递配置，不设置默认值
        if (!this._roomConfig) {
            LogService.error('GameNetwork', '创建房间失败：未设置房间配置（_roomConfig 为空）');
            if (this._onRoomCreated) {
                EventBus.getInstance().emit(NetworkEvent.CreateRoom, { code: -1, msg: '房间配置未设置' });
                this._onRoomCreated({ code: -1, msg: '房间配置未设置' });
            }
            return;
        }

        const createRoomRequest: any = {
            room_type: this._roomConfig.roomType || this._roomType,
            game_id: 1,
            maxPlayers: this._roomConfig.maxPlayers,  // ✅ 必须从配置获取
            minPlayers: this._roomConfig.minPlayers,  // ✅ 必须从配置获取
            nickname: this._roomConfig.nickname || 'Player',
            ante: this._roomConfig.ante,  // ✅ 必须从配置获取
            smallBlind: this._roomConfig.smallBlind,  // ✅ 必须从配置获取
            bigBlind: this._roomConfig.bigBlind,  // ✅ 必须从配置获取
            rounds: this._roomConfig.rounds,  // ✅ 必须从配置获取
            ruleType: this._roomConfig.ruleType,  // ✅ 必须从配置获取
            initialChips: this._roomConfig.initialChips,  // ✅ 必须从配置获取
            gameType: this._roomConfig.gameType || 'TEXAS',  // ✅ 必须从配置获取
            // ✅ [新增] 传递钱包地址
            address: this._walletAddress,
            // 保存原始配置选项用于后续使用
            maxPlayersOption: this._roomConfig.maxPlayersOption,
            roundsOption: this._roomConfig.roundsOption,
            ruleTypeOption: this._roomConfig.ruleTypeOption,
            anteOption: this._roomConfig.anteOption
        };

        // 优先使用传入的joinRoomId，如果没有传入则使用pendingJoinRoomId
        let actualJoinRoomId: number | null = null;
        if (joinRoomId !== undefined && joinRoomId !== null) {
            actualJoinRoomId = joinRoomId;
        } else if (this._pendingJoinRoomId) {
            actualJoinRoomId = this._pendingJoinRoomId;
        }

        if (actualJoinRoomId) {
            createRoomRequest.requestedRoomId = actualJoinRoomId;
        }

        this._wsManager.sendMessage(CommandType.CREATE_ROOM, createRoomRequest);

        // 清除待加入的房间ID
        this._pendingJoinRoomId = null;
    }

    /**
     * 生成设备ID
     * ✅ [修复] 使用用户ID作为设备ID，确保同一用户始终使用相同的设备标识
     * 首次登录前使用临时随机ID，登录成功后使用 userId 作为设备ID
     */
    private generateDeviceId(): string {
        const STORAGE_KEY = 'richman_device_id';
        const USER_ID_KEY = 'richman_user_id';

        // 如果已经登录，直接使用 userId 作为设备ID
        if (this._userId > 0) {
            const userDeviceId = 'device_user_' + this._userId;
            try {
                localStorage.setItem(STORAGE_KEY, userDeviceId);
                localStorage.setItem(USER_ID_KEY, String(this._userId));
            } catch (e) {
            }
            return userDeviceId;
        }

        // 尝试从本地存储获取已保存的设备ID
        let deviceId = null;
        let savedUserId = null;
        try {
            deviceId = localStorage.getItem(STORAGE_KEY);
            savedUserId = localStorage.getItem(USER_ID_KEY);
        } catch (e) {
        }

        // 如果本地有保存的用户设备ID，直接使用
        if (savedUserId && deviceId && deviceId.startsWith('device_user_')) {

            return deviceId;
        }

        // 首次登录前，生成临时随机ID
        if (!deviceId) {
            deviceId = 'device_temp_' + Math.random().toString(36).substr(2, 9);
            try {
                localStorage.setItem(STORAGE_KEY, deviceId);

            } catch (e) {
                LogService.warn('GameNetwork', '无法保存临时设备ID到 localStorage');
            }
        } else {
        }

        return deviceId;
    }

    /**
     * 获取命令名称（用于调试）
     */
    private getCommandName(cmd: number): string {
        for (const key in CommandType) {
            if (CommandType[key] === cmd) {
                return key;
            }
        }
        return 'UNKNOWN';
    }

    /**
     * 处理消息
     */
    private handleMessage(message: any): void {
        if (!message || typeof message !== 'object') {
            LogService.error('GameNetwork', 'Invalid message received:', message);
            return;
        }

        const cmd = message.cmd;
        const body = message.body;

        if (cmd === undefined || cmd === null) {
            LogService.error('GameNetwork', 'Message missing cmd field:', message);
            return;
        }

        switch (cmd) {
            case CommandType.WALLET_LOGIN:
                this.handleLoginResponse(body);
                break;
            case CommandType.LOGIN_VERIFY:
                this.handleSessionVerifyResponse(body);
                break;
            case CommandType.RECONNECT:
                this.handleReconnectResponse(body);
                break;
            case CommandType.PLAYER_RECONNECT:
                this.handleReconnectResponse(body);
                break;
            case CommandType.CREATE_ROOM:
                this.handleCreateRoomResponse(body);
                break;
            case CommandType.JOIN_ROOM:
                this.handleJoinRoomResponse(body);
                break;
            case CommandType.HEARTBEAT:
                if (body && (body.success !== undefined || body.code !== undefined)) {
                    this.handleSessionBindingResponse(body);
                } else {
                    this.handleHeartbeat(body);
                }
                break;
            case CommandType.GAME_STATE_SYNC:
                this.handleGameStateSync(body);
                break;
            case CommandType.PLAYER_ACTION_NOTIFY:
                this.handlePlayerActionNotify(body);
                break;
            case CommandType.GAME_START_NOTIFY:
                this.handleGameStartNotify(body);
                break;
            case CommandType.DEAL_CARDS_NOTIFY:
                this.handleDealCardsNotify(body);
                // ✅ [修复] 同时更新游戏状态，因为服务端在DEAL_CARDS_NOTIFY中包含了完整的gameState
                if (body && body.gameState) {
                    this.handleGameStateSync(body.gameState);
                }
                break;
            case CommandType.NOTIFY_PLAYER_TURN:
                this.handlePlayerTurnNotify(body);
                break;
            case CommandType.PLAYER_ACTION_RESPONSE:
                this.handlePlayerActionResponse(body);
                break;
            case CommandType.ERROR:
                this.handleError(body);
                break;
            case CommandType.CONTINUE_GAME:
                this.handleContinueGameResponse(body);
                break;
            case CommandType.PLAYER_JOIN:
                this.handlePlayerJoin(body);
                break;
            case CommandType.PLAYER_DISCONNECTED:
                this.handlePlayerDisconnected(body);
                break;
            case CommandType.PLAYER_EXIT:
                this.handlePlayerExit(body);
                break;
            case CommandType.PLAYER_READY:
                this.handlePlayerReady(body);
                break;
            case CommandType.DEAL_BUTTON_SHOW_NOTIFY:
                LogService.info('GameNetwork', `收到 DEAL_BUTTON_SHOW_NOTIFY(208), body=${JSON.stringify(body)}, _onMessage=${this._onMessage ? '已设置' : '未设置'}, 队列长度=${this._messageQueue.length}`);
                break;
            case CommandType.ACT_OPERATION:
                // 这个命令会通过_onMessage传递给gamingPvp处理
                break;
            case CommandType.DEAL_COMPLETE:
                // 这个命令会通过_onMessage传递给gamingPvp处理
                break;
            case CommandType.GAME_SETTLEMENT:
                // 这个命令会通过_onMessage传递给gamingPvp处理
                break;
            case CommandType.ACTION_COMPLETE:
                // 这个命令会通过_onMessage 传递给 gamingPvp 处理
                break;
            case CommandType.ROOM_END:
                // 房间结束通知，会通过_onMessage 传递给 gamingPvp 处理
                this.handleRoomEnd(body);
                break;
            case CommandType.QUICK_MSG:
                // 快捷消息，会通过_onMessage 传递给 gamingPvp 处理
                break;
            default:
                LogService.info('GameNetwork', `📥 收到未知命令: cmd=${cmd}, body=${JSON.stringify(body)}`);
                break;
        }

        if (this._onMessage) {
            LogService.info('GameNetwork', `📥 转发消息给 gamingPvp: cmd=${cmd}, body=${JSON.stringify(body)}`);
            this._onMessage(cmd, body);
        } else {
            // ✅ 回调未设置，将消息加入队列等待处理
            LogService.info('GameNetwork', `📥 消息回调未设置，加入队列: cmd=${cmd}, body=${JSON.stringify(body)}`);
            this._messageQueue.push({ cmd, data: body });
        }

        // ✅ 调用消息监听器
        this.notifyMessageListeners(cmd, body);
    }

    /**
     * ✅ 设置消息回调，同时处理队列中的消息
     * @param callback 消息回调函数
     */
    public setOnMessage(callback: (cmd: number, data: any) => void): void {
        LogService.info('GameNetwork', `setOnMessage: callback=${callback ? '已设置' : '未设置'}, 消息队列长度=${this._messageQueue.length}`);

        // ✅ [修复] 如果 callback 为 null，保留队列中的消息，等待后续设置回调后处理
        if (callback) {
            this._onMessage = callback;

            // ✅ 处理队列中的消息
            if (this._messageQueue.length > 0) {
                LogService.info('GameNetwork', `开始处理消息队列，共 ${this._messageQueue.length} 条消息`);
                const queue = [...this._messageQueue]; // 复制队列避免在处理过程中修改
                this._messageQueue = []; // 清空队列

                // 按顺序处理每条消息
                for (const item of queue) {
                    callback(item.cmd, item.data);
                }
            }
        } else {
            // ✅ [关键修复] 设置 null 时不清空队列，保留消息等待后续处理
            this._onMessage = null;
            LogService.info('GameNetwork', `setOnMessage 设置为 null，保留队列中的 ${this._messageQueue.length} 条消息`);
        }
    }

    /**
     * ✅ 添加消息监听器
     * @param cmd 命令类型
     * @param callback 回调函数
     */
    public addMessageListener(cmd: number, callback: (data: any) => void): void {
        // 检查是否已存在相同的监听器
        const existing = this._messageListeners.find(l => l.cmd === cmd && l.callback === callback);
        if (existing) {
            LogService.warn('GameNetwork', `消息监听器已存在: cmd=${cmd}`);
            return;
        }
        this._messageListeners.push({ cmd, callback });
    }

    /**
     * ✅ 移除消息监听器
     * @param cmd 命令类型
     * @param callback 回调函数
     */
    public removeMessageListener(cmd: number, callback: (data: any) => void): void {
        const index = this._messageListeners.findIndex(l => l.cmd === cmd && l.callback === callback);
        if (index >= 0) {
            this._messageListeners.splice(index, 1);
        }
    }

    /**
     * ✅ 通知所有匹配的监听器
     * @param cmd 命令类型
     * @param data 消息数据
     */
    private notifyMessageListeners(cmd: number, data: any): void {
        const listeners = this._messageListeners.filter(l => l.cmd === cmd);
        listeners.forEach(listener => {
            try {
                listener.callback(data);
            } catch (e) {
                LogService.error('GameNetwork', `消息监听器执行异常: cmd=${cmd}`, e);
            }
        });
    }

    /**
     * 处理 LOGIN_VERIFY 响应（重连恢复会话，不触发完整登录流程）
     */
    private handleSessionVerifyResponse(data: any): void {
        if (data.code === ResponseCode.SUCCESS) {
            this.applySessionFromResponse(data);
            this._sessionRestored = true;
            this._isReconnecting = false;
        } else {
            LogService.warn('GameNetwork', `LOGIN_VERIFY 失败: code=${data.code}, msg=${data.message || data.msg}`);
        }
    }

    /**
     * 处理登录响应
     */
    private handleLoginResponse(data: any): void {
        LogService.info('GameNetwork', '========== 收到登录响应 ==========');
        LogService.info('GameNetwork', '登录响应数据:', JSON.stringify(data));

        // 清除登录超时
        if (this._loginTimeout) {
            clearTimeout(this._loginTimeout);
            this._loginTimeout = null;
        }

        if (data.code === ResponseCode.SUCCESS) {
            LogService.info('GameNetwork', '✅ 登录成功！');
            this._userId = data.user_id || data.userId || 0;
            this._wsManager.setUserId(this._userId); // ✅ 登录成功后设置 userId 到 WebSocketManager
            this._token = data.token || '';
            this._authToken = this._token;
            this._sessionRestored = true;
            this.persistAuthData();

            // ✅ [新增] 登录成功后，使用 userId 作为设备ID并保存
            if (this._userId > 0) {
                const userDeviceId = 'device_user_' + this._userId;
                try {
                    localStorage.setItem('richman_device_id', userDeviceId);
                    localStorage.setItem('richman_user_id', String(this._userId));
                } catch (e) {
                    LogService.warn('GameNetwork', '无法保存用户设备ID到 localStorage');
                }
            }

            // ✅ 更新钱包地址（使用服务端返回的地址）
            const serverWalletAddress = data.wallet_address || data.walletAddress;
            if (serverWalletAddress && serverWalletAddress.startsWith('0x')) {
                this._walletAddress = serverWalletAddress;
            }

            // ==================== 登录成功日志 ====================

            // 显示服务端签名验证结果
            const signatureVerified = data.signature_verified !== undefined ? data.signature_verified : true;

            // 显示 Token 信息
            if (this._token) {
            }

            // 显示游戏币余额
            if (data.game_coin !== undefined || data.gameCoin !== undefined) {
            }

            // 同步用户信息并刷新房卡余额
            const userInfoManager = UserInfoManager.getInstance();
            userInfoManager.setUserInfo({
                userId: this._userId,
                nickname: data.nickname || '',
                walletAddress: this._walletAddress,
                roomCard: data.room_card ?? data.roomCard ?? 0,
                gameCoin: data.game_coin ?? data.gameCoin ?? 0,
                createdAt: data.created_at || data.createdAt,
                updatedAt: data.updated_at || data.updatedAt
            });
            userInfoManager.setWebSocketConnected(this._wsManager.isConnected());
            this.fetchRoomCardBalance().catch((err) => {
                LogService.warn('GameNetwork', '登录后刷新房卡余额失败:', err?.message || err);
            });

            // 显示会话状态

            if (this._onLoginSuccess) {
                this._onLoginSuccess(data);
            }

            // ✅ [关键修复] 登录成功后根据房间类型处理
            // 必须使用 room code 进入房间，不自动创建房间
            if (this._pendingJoinRoomId) {
                this.createRoom(this._pendingJoinRoomId);
            } else if (this._roomType === 'PVP') {
                // ✅ PVP模式：等待用户输入 room code 后再加入，不自动创建房间
            } else if (this._roomType === 'PVE') {
                // ✅ PVE模式：不自动创建房间！
                // 等待用户在游戏场景中点击 deal 按钮后才创建房间
            } else {
            }
        } else {
            LogService.error('GameNetwork', '========== 钱包登录失败！==========');
            LogService.error('GameNetwork', '❌ 错误码: ' + data.code);
            LogService.error('GameNetwork', '❌ 错误信息: ' + (data.message || data.msg || 'Unknown error'));

            this._currentNonce = '';
            this._currentChallenge = '';
            this._currentSignature = '';
            this._challengeTimestamp = 0;
            this._sessionRestored = false;

            // 显示服务端签名验证失败信息
            if (data.signature_verified !== undefined && !data.signature_verified) {
                LogService.error('GameNetwork', '🔐 服务端签名验证: ❌ 失败');
                LogService.error('GameNetwork', '💡 可能原因: 签名无效或 nonce 已过期');
                this._currentNonce = '';
                this._currentChallenge = '';
                this._currentSignature = '';
                this._challengeTimestamp = 0;
            }

            this.notifyLoginFailed(data.message || data.msg || 'Login failed');
        }
    }

    /**
     * 处理创建房间响应
     */
    private handleCreateRoomResponse(data: any): void {
        // 清除创建房间超时
        if (this._createRoomTimeout) {
            clearTimeout(this._createRoomTimeout);
            this._createRoomTimeout = null;
        }

         EventBus.getInstance().emit(NetworkEvent.CreateRoom,data);

        if (data.code === ResponseCode.SUCCESS) {
            // ✅ 服务端返回的是 ResponseDTO，实际数据在 data.data 中
            const roomData = data.data || data;

            this._roomId = roomData.roomId || roomData.room_id || roomData.id || 0;
            // 保存房主 ID
            this._hostUserId = roomData.hostUserId || roomData.host_user_id || roomData.hostUserId || null;
            // ✅ [新增] 保存房间显示码（从 data.data 中获取）
            this._roomCode = roomData.roomCode || roomData.room_code || '';
            this._gameConfig = {
                smallBlind: roomData.smallBlind || roomData.small_blind,
                bigBlind: roomData.bigBlind || roomData.big_blind,
                playerCount: roomData.playerCount || roomData.player_count,
                maxPlayers: roomData.maxPlayers || roomData.max_players,
                initialChips: roomData.initialChips || roomData.initial_chips,
                gameType: roomData.gameType || roomData.game_type,
                minBet: roomData.minBet || roomData.min_bet,
                maxBet: roomData.maxBet || roomData.max_bet,
                actionTimeout: roomData.actionTimeout || roomData.action_timeout,
                soundEnabled: roomData.soundEnabled
            };
            this._playersData = roomData.players || [];

            // ✅ [新增] 更新本地房卡数量（服务端已扣除房卡）
            const newRoomCard = roomData.room_card || roomData.roomCard;
            if (newRoomCard !== undefined && newRoomCard !== null) {
                const userInfoManager = UserInfoManager.getInstance();
                userInfoManager.updateRoomCard(newRoomCard);
            }

            if (this._onRoomCreated) {
                this._onRoomCreated(data);
            }
        } else {
            LogService.error('GameNetwork', 'Create room failed:', data.message || data.msg);
            // 失败也调用回调，让回退到本地模式
            if (this._onRoomCreated) {
                this._onRoomCreated(data);
            }
        }
    }

    /**
     * 处理心跳
     */
    private handleHeartbeat(data: any): void {
        this._wsManager.handleHeartbeatResponse(data?.server_time);
    }

    /**
     * 处理游戏状态同步
     */
    private handleGameStateSync(data: any): void {
    }

    /**
     * 处理玩家操作通知
     */
    private handlePlayerActionNotify(data: any): void {
        if (this._onPlayerActionNotify) {
            this._onPlayerActionNotify(data);
        }
    }

    /**
     * 处理游戏开始通知
     */
    private handleGameStartNotify(data: any): void {
    }

    /**
     * 处理发牌通知
     */
    private handleDealCardsNotify(data: any): void {
    }

    /**
     * 处理错误
     */
    private handleError(data: any): void {
        // ✅ [修改] 尝试解析错误消息
        let errorMessage = 'Unknown error';
        let errorCode = -1;

        if (data && typeof data === 'object') {
            if (data.message) {
                errorMessage = data.message;
                errorCode = data.code || -1;
            } else if (data instanceof Uint8Array) {
                // 尝试解析 JSON
                try {
                    const jsonStr = String.fromCharCode.apply(null, Array.from(data));
                    const parsed = JSON.parse(jsonStr);
                    errorMessage = parsed.message || 'Unknown error';
                    errorCode = parsed.code || -1;
                } catch (e) {
                    errorMessage = 'Failed to parse error message';
                }
            }
        }

        DialogManager.show({
            title: 'Server Error',
            content: `${errorMessage || 'Unknown error'}`,
        })

        LogService.error('GameNetwork', `Server error: code=${errorCode}, message=${errorMessage}`);

        if (this._onError) {
            this._onError({
                code: errorCode,
                message: errorMessage,
                originalData: data
            });
        }
    }

    // 错误回调
    private _onError: (error: any) => void = null;

    /**
     * 设置错误回调
     */
    public setOnError(callback: (error: any) => void): void {
        this._onError = callback;
    }

    /**
     * 设置断开连接回调
     */
    public setOnDisconnected(callback: () => void): void {
        this._onDisconnected = callback;
    }

    /**
     * 设置连接成功回调
     */
    public setOnConnected(callback: () => void): void {
        this._onConnected = callback;
    }

    /**
     * 设置登录成功回调
     */
    public setOnLoginSuccess(callback: (data: any) => void): void {
        this._onLoginSuccess = callback;
    }

    /**
     * 设置登录失败回调
     */
    public setOnLoginFailed(callback: (error: string) => void): void {
        this._onLoginFailed = callback;
    }

    /**
     * 设置重连成功回调
     */
    public setOnReconnectSuccess(callback: (gameState: any) => void): void {
        this._onReconnectSuccess = callback;
    }

    /**
     * 设置重连失败回调（达到最大重连次数时触发）
     */
    public setOnReconnectFailed(callback: () => void): void {
        this._onReconnectFailed = callback;
    }

    /**
     * 设置登录回调（用于重连失败时触发自动重新登录）
     */
    public setOnLoginCallback(callback: (reason: string) => void): void {
        this._loginCallback = callback;
    }

    /**
     * 设置房间创建成功回调
     */
    public setOnRoomCreated(callback: (data: any) => void): void {
        this._onRoomCreated = callback;
    }

    /**
     * 设置玩家操作通知回调
     */
    public setOnPlayerActionNotify(callback: (data: any) => void): void {
        this._onPlayerActionNotify = callback;
    }

    /**
     * 发送玩家操作
     */
    public sendPlayerAction(roomId: number, actionType: number | string, betAmount: number, turnId: number): void {
        // ✅ [关键修复] 支持字符串枚举和数字枚举
        let actionStr = '';

        // 先尝试作为字符串处理
        if (typeof actionType === 'string') {
            actionStr = actionType;
        } else {
            // 数字枚举转换
            switch (actionType) {
                case 0: actionStr = 'FOLD'; break;
                case 1: actionStr = 'CHECK'; break;
                case 2: actionStr = 'CALL'; break;
                case 3: actionStr = 'RAISE'; break;
                case 4: actionStr = 'ALLIN'; break;
                case 5: actionStr = 'BET'; break;
                default: actionStr = 'FOLD';
            }
        }

        // ✅ [日志增强] 记录发送的操作

        const actionRequest = {
            room_id: roomId,
            roomId: roomId,
            action: actionStr,
            turnId,
            amount: betAmount,
            betAmount: betAmount
        };

        this._wsManager.sendMessage(CommandType.ACT_OPERATION, actionRequest);
    }

    /**
     * 发送操作完成通知
     */
    public sendActionComplete(roomId: number): void {
        const completeRequest = {
            room_id: roomId,
            user_id: this._userId,
            timestamp: Date.now()
        };

        this._wsManager.sendMessage(CommandType.ACTION_COMPLETE, completeRequest);
    }

    /**
     * 发送发牌完成通知
     */
    public sendDealComplete(roomId: number): void {
        const dealCompleteRequest = {
            room_id: roomId,
            user_id: this._userId,
            timestamp: Date.now()
        };

        this._wsManager.sendMessage(CommandType.DEAL_COMPLETE, dealCompleteRequest);
    }

    /**
     * 发送快捷消息
     * @param msgKey 消息key
     * @param msgLabel 消息标签
     */
    public sendQuickMsg(msgKey: string, msgLabel: string): void {
        const request = {
            roomId: this._roomId,
            userId: this._userId,
            msgKey: msgKey,
            msgLabel: msgLabel,
            timestamp: Date.now()
        };
        LogService.info('GameNetwork', `📤 发送 QUICK_MSG(402): ${JSON.stringify(request)}`);
        this._wsManager.sendMessage(CommandType.QUICK_MSG, request);
    }

    /**
     * 获取用户ID
     */
    public getUserId(): number {
        return this._userId;
    }

    /**
     * 是否已完成钱包签名登录
     */
    public isLoggedIn(): boolean {
        return this._userId > 0 && !!this._walletAddress?.startsWith('0x');
    }

    /**
     * 获取房间ID
     */
    public getRoomId(): number {
        return this._roomId;
    }

    /**
     * 设置房间ID（用于场景切换时传递房间信息）
     * @param roomId 房间ID
     */
    public setRoomId(roomId: number): void {
        this._roomId = roomId;
    }

    /**
     * 获取房间显示码
     */
    public getRoomCode(): string {
        return this._roomCode;
    }

    /**
     * 获取待加入的房间ID
     */
    public getPendingJoinRoomId(): number | null {
        return this._pendingJoinRoomId;
    }

    /**
     * 设置房间显示码（用于玩家显示和加入房间）
     * @param roomCode 房间显示码
     */
    public setRoomCode(roomCode: string): void {
        this._roomCode = roomCode;
    }

    /**
     * 重置房间显示码（用于房间结束后清理）
     */
    public resetRoomCode(): void {
        this._roomCode = '';
    }

    /**
     * 获取房主用户ID
     */
    public getHostUserId(): any {
        return this._hostUserId;
    }

    /**
     * 获取游戏配置
     */
    public getGameConfig(): any {
        return this._gameConfig;
    }

    /**
     * 获取玩家数据
     */
    public getPlayersData(): any[] {
        return this._playersData;
    }

    /**
     * 设置房间类型
     * @param roomType 房间类型：'PVE' 或 'PVP'
     */
    public setRoomType(roomType: string): void {
        this._roomType = roomType;
    }

    /**
     * 获取房间类型
     */
    public getRoomType(): string {
        return this._roomType;
    }

    /**
     * 设置房间配置（从 roomPve 传递的配置）
     * @param config 房间配置对象
     */
    public setRoomConfig(config: any): void {
        this._roomConfig = config;
    }

    /**
     * 获取保存的房间配置
     */
    public getRoomConfig(): any {
        return this._roomConfig;
    }

    /**
     * 是否已连接
     */
    public isConnected(): boolean {
        return this._wsManager.isConnected();
    }

    /**
     * ✅ [新增] 向服务端请求登录
     * @param walletAddress 钱包地址
     * @returns Promise<{challenge: string, nonce: string}>
     */
    private async _getLoginChallengeFromServer(walletAddress: string): Promise<{ challenge: string, nonce: string }> {
        LogService.info('GameNetwork', '📡 向服务端发送 GET_LOGIN_CHALLENGE 请求');

        return new Promise((resolve, reject) => {
            // 保存原始消息处理函数
            const originalOnMessage = (this as any)._onMessage;

            // ✅ [修复] 创建临时处理函数引用，用于后续检查
            const tempOnMessage = (cmd: number, data: any) => {
                LogService.info('GameNetwork', `收到消息: cmd=${cmd}, data=`, data);

                if (cmd === CommandType.GET_LOGIN_CHALLENGE) {
                    // ✅ [关键修复] 恢复原始消息处理函数前，检查当前 _onMessage 是否还是临时处理函数
                    // 如果期间有新的回调被设置（如重连后重新设置），则保留新值
                    const currentOnMessage = (this as any)._onMessage;
                    if (currentOnMessage === tempOnMessage) {
                        (this as any)._onMessage = originalOnMessage;
                        LogService.info('GameNetwork', `恢复 _onMessage: originalOnMessage=${originalOnMessage ? '已设置' : '未设置'}`);
                    } else {
                        LogService.info('GameNetwork', `_onMessage 已被其他代码修改，保留新值，不恢复`);
                    }

                    if (data.code === 0) {
                        this._currentChallenge = data.challenge;
                        this._currentNonce = data.nonce;
                        this._challengeTimestamp = Date.now();
                        resolve({
                            challenge: data.challenge,
                            nonce: data.nonce
                        });
                    } else {
                        LogService.error('GameNetwork', '获取向服务端请求登录失败 _getLoginChallengeFromServer :', data.message);
                        reject(new Error(data.message || '获取向服务端请求登录失败 _getLoginChallengeFromServer'));
                    }
                } else if (originalOnMessage) {
                    originalOnMessage(cmd, data);
                } else {
                    // ✅ [关键修复] 如果 originalOnMessage 为 null，将消息加入队列，等待后续处理
                    this._messageQueue.push({ cmd, data });
                    LogService.info('GameNetwork', `消息已加入队列等待处理: cmd=${cmd}`);
                }
            };

            // 设置临时消息处理函数来接收响应
            (this as any)._onMessage = tempOnMessage;

            // 发送获取请求
            this._wsManager.sendMessage(CommandType.GET_LOGIN_CHALLENGE, {
                walletAddress: walletAddress
            });

            // 设置超时
            setTimeout(() => {
                // ✅ [关键修复] 超时恢复时同样检查当前 _onMessage 是否还是临时处理函数
                const currentOnMessage = (this as any)._onMessage;
                if (currentOnMessage === tempOnMessage) {
                    (this as any)._onMessage = originalOnMessage;
                    LogService.info('GameNetwork', `超时恢复 _onMessage: originalOnMessage=${originalOnMessage ? '已设置' : '未设置'}`);
                } else {
                    LogService.info('GameNetwork', `超时恢复时 _onMessage 已被其他代码修改，保留新值`);
                }
                reject(new Error('获取_getLoginChallengeFromServer超时'));
            }, 10000);
        });
    }

    /**
     * 获取网络统计信息
     */
    public getNetworkStats(): any {
        return this._wsManager.getNetworkStats();
    }

    /**
     * 获取网络优化器实例
     */
    public getOptimizer(): NetworkOptimizer {
        return this._optimizer;
    }

    /**
     * 设置是否启用消息压缩
     */
    public setCompressionEnabled(enabled: boolean): void {
        this._compressionEnabled = enabled;
        this._optimizer.setCompressionEnabled(enabled);
    }

    /**
     * 是否启用消息压缩
     */
    public isCompressionEnabled(): boolean {
        return this._compressionEnabled;
    }

    /**
     * 处理重连响应
     */
    private handleReconnectResponse(data: any) {
        this._isReconnecting = false;
        const response = data?.data || data || {};
        const success = response?.success === true || response?.code === ResponseCode.SUCCESS || response?.code === 0;
        const gameState = response?.gameState || response?.game_state || response?.data?.gameState || response?.data?.game_state || this._lastGameState;
        const message = response?.message || response?.msg || '重连失败';
        const code = response?.code || 0;

        LogService.info('GameNetwork', '处理重连响应', { success, roomId: response?.roomId || response?.room_id, gameStateExists: !!response?.gameState, message, code });

        if (success) {
            this.applySessionFromResponse(response);
            this._sessionRestored = true;
            const reconnectStatus = response?.reconnectStatus || response?.reconnect_status;
            if (gameState) {
                this.saveGameState(gameState);
                this.handleGameStateSync(gameState);
            }

            if (this._onReconnectSuccess) {
                this._onReconnectSuccess({
                    ...response,
                    gameState,
                    reconnectStatus
                });
            }
            return;
        }

        LogService.warn('GameNetwork', '重连响应失败', response);
        
        if (code === 401 || code === 403 || message?.includes('未登录') || message?.includes('Forbidden')) {
            LogService.warn('GameNetwork', '重连失败：认证过期，触发自动重新登录');
            this._triggerAutoLogin();
        }

        if (code === 404) {
            this.resetRoomId();
            this.clearSavedGameState();
        }

        if (this._onReconnectFailed) {
            this._onReconnectFailed(message);
        }
    }

    /**
     * 触发自动重新登录
     */
    private _triggerAutoLogin(): void {
        try {
            const walletAddress = this._walletAddress;
            if (!walletAddress) {
                LogService.warn('GameNetwork', '_triggerAutoLogin: 钱包地址为空，无法自动登录');
                return;
            }

            LogService.info('GameNetwork', `_triggerAutoLogin: 尝试使用钱包 ${walletAddress.substring(0, 8)}... 重新登录`);
            
            this._currentSignature = null;
            this._currentNonce = null;
            this._currentChallenge = null;
            
            if (this._loginCallback) {
                this._loginCallback('reconnect');
            }
        } catch (e) {
            LogService.error('GameNetwork', '_triggerAutoLogin failed:', e);
        }
    }

    /**
     * WebSocket 重连成功后，根据当前是否仍在牌桌选择会话绑定方式。
     * 大厅使用 cmd=1，牌桌使用 cmd=530；两者都只依赖 token。
     */
    private sendReconnectByCurrentPage(): void {
        const token = this.getAuthToken();
        if (!token) {
            LogService.warn('GameNetwork', '重连恢复跳过：token 为空');
            this._triggerAutoLogin();
            return;
        }

        if (this._roomId > 0 || this._currentRoomId) {
            const roomId = this._currentRoomId || this._roomId;
            this.sendMessage(CommandType.PLAYER_RECONNECT, {
                token,
                ...(roomId > 0 ? { roomId } : {})
            });
            return;
        }

        this.sendMessage(CommandType.HEARTBEAT, {
            token,
            timestamp: Date.now()
        });
    }

    /**
     * 发送牌桌重连请求。
     * 由 gamingPvp 在监听到断线并确认 WebSocket 恢复后调用。
     */
    public sendPlayerReconnect(roomId?: number): void {
        const token = this.getAuthToken();
        const reconnectRoomId = roomId || this._currentRoomId || this._roomId;

        if (!token) {
            LogService.warn('GameNetwork', 'PLAYER_RECONNECT(530) 跳过：token 为空');
            this._triggerAutoLogin();
            return;
        }

        this.sendMessage(CommandType.PLAYER_RECONNECT, {
            token,
            ...(reconnectRoomId > 0 ? { roomId: reconnectRoomId } : {})
        });
    }

    /** 处理大厅重连后的 cmd=1 会话绑定响应。 */
    private handleSessionBindingResponse(data: any): void {
        const code = Number(data?.code ?? (data?.success ? 0 : -1));
        if (data?.success === true || code === ResponseCode.SUCCESS || code === 0) {
            this._sessionRestored = true;
            this._isReconnecting = false;
            return;
        }

        this._sessionRestored = false;
        if (code === 401 || code === 403) {
            this._triggerAutoLogin();
        }
    }

    /**
     * 处理玩家轮到操作通知
     */
    private handlePlayerTurnNotify(data: any) {
        if (this._onPlayerTurnNotify) {
            this._onPlayerTurnNotify(data);
        }
    }

    /**
     * 处理玩家操作响应
     */
    private handlePlayerActionResponse(data: any) {
        if (this._onPlayerActionResponse) {
            this._onPlayerActionResponse(data);
        }
    }

    /**
     * 处理继续游戏响应
     */
    private handleContinueGameResponse(data: any) {
        // 触发回调通知游戏层
        if (this._onContinueGame) {
            this._onContinueGame(data);
        }
    }

    /**
     * 处理房间结束通知
     */
    private handleRoomEnd(data: any) {

        // 触发回调通知游戏层
        if (this._onRoomEnd) {
            this._onRoomEnd(data);
        }
    }

    // 房间结束回调
    private _onRoomEnd: (data: any) => void = null;

    /**
     * 设置房间结束回调
     */
    public setOnRoomEnd(callback: (data: any) => void): void {
        this._onRoomEnd = callback;
    }

    // 继续游戏响应回调
    private _onContinueGame: (data: any) => void = null;

    /**
     * 设置继续游戏响应回调
     */
    public setOnContinueGame(callback: (data: any) => void): void {
        this._onContinueGame = callback;
    }

    // 回调
    private _onPlayerTurnNotify: (data: any) => void = null;
    private _onPlayerActionResponse: (data: any) => void = null;

    /**
     * 设置玩家轮到操作通知回调
     */
    public setOnPlayerTurnNotify(callback: (data: any) => void): void {
        this._onPlayerTurnNotify = callback;
    }

    /**
     * 设置玩家操作响应回调
     */
    public setOnPlayerActionResponse(callback: (data: any) => void): void {
        this._onPlayerActionResponse = callback;
    }

    /**
     * 处理玩家加入通知
     */
    private handlePlayerJoin(data: any): void {

        if (this._onPlayerJoin) {
            this._onPlayerJoin(data);
        } else {
            this._cachedPlayerJoinMessages.push(data);
        }
    }

    /**
     * 处理玩家断开连接通知
     */
    private handlePlayerDisconnected(data: any): void {

        if (this._onPlayerDisconnected) {
            this._onPlayerDisconnected(data);
        }
    }

    /**
     * 处理玩家退出房间通知
     */
    private handlePlayerExit(data: any): void {

        if (this._onPlayerExit) {
            this._onPlayerExit(data);
        } else {
            LogService.warn('GameNetwork', '_onPlayerExit callback is not set!');
        }
    }

    /**
     * 处理玩家准备通知
     */
    private handlePlayerReady(data: any): void {
        if (this._onPlayerReady) {
            this._onPlayerReady(data);
        }
    }

    /**
     * 发送准备请求
     * @param roomId 房间ID
     * @param userId 用户ID
     */
    public sendPlayerReady(roomId: number, userId: number): void {
        const request = {
            roomId: roomId,
            userId: userId,
            timestamp: Date.now()
        };
        this._wsManager.sendMessage(CommandType.PLAYER_READY_REQUEST, request);
    }

    /**
     * 发送开始游戏请求（房主专用）
     * @param roomId 房间ID
     * @param userId 用户ID（房主）
     */
    public sendStartGame(roomId: number, userId: number): void {
        const request = {
            roomId: roomId,
            userId: userId,
            timestamp: Date.now()
        };
        this._wsManager.sendMessage(CommandType.GAME_START, request);
    }

    // 玩家加入回调
    private _onPlayerJoin: (data: any) => void = null;

    // 玩家加入消息缓存（防止回调设置前消息丢失）
    private _cachedPlayerJoinMessages: any[] = [];

    /**
     * 设置玩家加入回调
     */
    public setOnPlayerJoin(callback: (data: any) => void): void {
        this._onPlayerJoin = callback;

        // 如果有缓存的消息，立即处理
        if (this._cachedPlayerJoinMessages.length > 0) {
            const cachedMessages = [...this._cachedPlayerJoinMessages];
            this._cachedPlayerJoinMessages = [];

            for (const msg of cachedMessages) {
                this._onPlayerJoin(msg);
            }
        }
    }

    // 玩家断开连接回调
    private _onPlayerDisconnected: (data: any) => void = null;

    /**
     * 设置玩家断开连接回调
     */
    public setOnPlayerDisconnected(callback: (data: any) => void): void {
        this._onPlayerDisconnected = callback;
    }

    // 玩家退出房间回调
    /**
     * 设置玩家退出房间回调
     */
    public setOnPlayerExit(callback: (data: any) => void): void {
        this._onPlayerExit = callback;
    }

    // 玩家准备回调
    private _onPlayerReady: (data: any) => void = null;

    /**
     * 设置玩家准备回调
     */
    public setOnPlayerReady(callback: (data: any) => void): void {
        this._onPlayerReady = callback;
    }

    // 加入房间回调
    private _onJoinRoom: (data: any) => void = null;

    /**
     * 加入房间（通过 roomCode）
     * @param roomCode 房间显示码（4 位数）
     * @param roomType 房间类型：'PVE' 或 'PVP'
     * @param nickname 玩家昵称
     * @param password 房间密码（可选）
     */
    public joinRoom(roomCode: string | number, roomType: string = 'PVP', nickname: string = 'Player', password: string = ''): void {
        const roomCodeStr = typeof roomCode === 'number' ? roomCode.toString() : roomCode;

        // 如果还没登录，先保存要加入的房间信息，等登录后再处理
        if (!this._userId) {
            this._pendingJoinRoomId = typeof roomCode === 'number' ? roomCode : parseInt(roomCode);
            return;
        }

        const joinRoomRequest: any = {
            roomCode: roomCodeStr,
            roomType: roomType,
            nickname: nickname,
            password: password
        };
        this._wsManager.sendMessage(CommandType.JOIN_ROOM, joinRoomRequest);
    }

    /**
     * ✅ [新增] 退出房间请求
     * 发送退出房间请求给服务端，不断开WebSocket连接
     * @param roomId 房间ID
     */
    public exitRoom(roomId: number): void {
        if (!roomId || roomId <= 0) {
            LogService.warn('GameNetwork', `exitRoom: 无效的房间ID ${roomId}`);
            return;
        }

        const exitRoomRequest: any = {
            roomId: roomId
        };
        this._wsManager.sendMessage(CommandType.EXIT_ROOM, exitRoomRequest);
    }

    /**
     * 连接钱包并登录（供 index 场景调用）
     * @param onLoginSuccess 登录成功回调
     * @param onLoginFailed 登录失败回调
     */
    public async connectWalletAndLogin(
        onLoginSuccess?: (data: any) => void,
        onLoginFailed?: (error: string) => void
    ): Promise<boolean> {
        // ✅ 防止并发登录：如果正在登录中，返回已有的登录 Promise
        if (this._isLoggingIn && this._loginPromise) {
            return this._loginPromise;
        }

        // 设置回调
        if (onLoginSuccess) {
            this._onLoginSuccess = onLoginSuccess;
        }
        if (onLoginFailed) {
            this._onLoginFailed = onLoginFailed;
        }

        // ✅ 创建登录 Promise 并设置标志
        this._isLoggingIn = true;
        this._loginPromise = this._doConnectWalletAndLogin();

        try {
            const result = await this._loginPromise;
            return result;
        } finally {
            // ✅ 登录完成后清除标志
            this._isLoggingIn = false;
            this._loginPromise = null;
        }
    }

    /**
     * ✅ 实际执行连接钱包并登录的逻辑
     */
    private async _doConnectWalletAndLogin(): Promise<boolean> {
        try {
            // ==================== 步骤 1: 检查当前连接状态 ====================

            // ==================== 步骤 2: 建立 WebSocket 连接 ====================
            if (!this._wsManager.isConnected()) {

                this.connectToServer(this._roomType);

                // 等待连接建立（最多等待 5 秒）
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        LogService.error('GameNetwork', '❌ WebSocket 连接超时（5秒）');
                        reject(new Error('WebSocket connection timeout'));
                    }, 5000);

                    const checkConnection = setInterval(() => {
                        if (this._wsManager.isConnected()) {
                            clearInterval(checkConnection);
                            clearTimeout(timeout);
                            LogService.info('GameNetwork', '   - 连接状态: OPEN（TCP层）');
                            LogService.info('GameNetwork', '   - ⚠️ 注意：还需完成钱包签名验证才能真正登录');
                            LogService.info('GameNetwork', '   - 开始心跳检测...');
                            resolve();
                        }
                    }, 100);
                });
            } else {
            }

            // 已登录且连接有效时跳过重复签名
            if (this._wsManager.isConnected() && this.isLoggedIn()) {
                UserInfoManager.getInstance().setWebSocketConnected(true);
                return true;
            }

            // ==================== 步骤 3: 执行钱包登录流程 ====================
            await this.sendWalletLogin();

            return true;
        } catch (error) {
            LogService.error('GameNetwork', '❌ 连接钱包并登录失败:', error);
            this.notifyLoginFailed('Connect wallet failed: ' + error.message);
            return false;
        }
    }

    /**
     * 登录失败时重置钱包连接状态，允许用户重新连接
     */
    public resetWalletConnection(): void {
        if (this._loginTimeout) {
            clearTimeout(this._loginTimeout);
            this._loginTimeout = null;
        }
        this._currentChallenge = '';
        this._currentNonce = '';
        this._currentSignature = '';
        this._sessionRestored = false;
        this.disconnectWallet();
        this.clearPersistedAuth();
        UserInfoManager.getInstance().reset();
        LogService.info('GameNetwork', '钱包连接状态已重置（登录失败）');
    }

    private notifyLoginFailed(error: string): void {
        // ✅ [修复] 只清空登录相关的临时数据，保留钱包地址，以便重连后重新登录
        if (this._loginTimeout) {
            clearTimeout(this._loginTimeout);
            this._loginTimeout = null;
        }
        this._currentChallenge = '';
        this._currentNonce = '';
        this._currentSignature = '';
        this._sessionRestored = false;
        UserInfoManager.getInstance().reset();
        // 清除所有的缓存
        localStorage.clear()
        
        if (this._onLoginFailed) {
            this._onLoginFailed(error);
        }
    }

    /**
     * 钱包地址脱敏显示
     */
    private maskAddress(address: string): string {
        if (!address || address.length < 10) {
            return address;
        }
        return address.substring(0, 6) + '...' + address.substring(address.length - 4);
    }

    /**
     * 获取当前钱包地址
     */
    public getWalletAddress(): string {
        return this._walletAddress;
    }

    /**
     * 设置钱包地址
     * @param walletAddress 钱包地址
     */
    public setWalletAddress(walletAddress: string): void {
        if (walletAddress?.startsWith('0x')) {
            this._walletAddress = walletAddress;
        }
    }

    /**
     * 检查钱包是否已连接
     */
    public isWalletConnected(): boolean {
        return this._walletManager && this._walletManager.isConnected();
    }

    /**
     * 断开钱包连接
     */
    public disconnectWallet(): void {
        if (this._walletManager) {
            this._walletManager.disconnectWallet();
        }
        this._walletAddress = '';
        this._userId = 0;
        this._token = '';
    }

    /**
     * 从服务端响应中解析房卡余额
     */
    private parseRoomCardBalance(response: any): number {
        if (response == null) {
            return 0;
        }
        if (typeof response === 'number') {
            return response;
        }
        const payload = response.data ?? response;
        if (typeof payload === 'number') {
            return payload;
        }
        const balance = payload?.room_card ?? payload?.roomCard
            ?? payload?.balance ?? payload?.room_card_balance ?? payload?.roomCardBalance;
        return Number(balance) || 0;
    }

    /**
     * 从服务端获取当前地址的房卡余额并更新本地缓存
     */
    public async fetchRoomCardBalance(): Promise<number> {
        if (!this._userId || !this._walletAddress) {
            LogService.warn('GameNetwork', '无法获取房卡余额：用户未登录或钱包地址为空');
            return 0;
        }

        await this.ensureSessionReady();

        const response = await this.sendCommand({
            cmd: CommandType.GET_ROOM_CARD_BALANCE,
            data: {
                userId: this._userId,
                user_id: this._userId,
                address: this._walletAddress,
                wallet_address: this._walletAddress,
                token: this.getAuthToken()
            }
        });

        if (response?.code !== undefined && response.code !== ResponseCode.SUCCESS) {
            throw new Error(response.message || response.msg || '获取房卡余额失败');
        }

        const balance = this.parseRoomCardBalance(response);
        UserInfoManager.getInstance().updateRoomCard(balance);
        LogService.info('GameNetwork', `房卡余额已刷新: address=${this.maskAddress(this._walletAddress)}, balance=${balance}`);
        return balance;
    }

    /**
     * ✅ [新增] 发送消息的通用方法
     * @param cmd 命令类型
     * @param body 消息体
     */
    public sendMessage(cmd: number, body: any): void {
        if (this._wsManager) {
            const token = this.getAuthToken();
            if (token && body && typeof body === 'object' && !body.token) {
                body.token = token;
            }
            this._wsManager.sendMessage(cmd, body);
        } else {
            LogService.warn('GameNetwork', 'WebSocketManager 未初始化，无法发送消息');
        }
    }

    /**
     * ✅ [新增] 发送命令并等待响应（Promise 版本）
     * 使用一次性回调等待特定命令的响应
     * @param request 请求对象 { cmd: number, data: any }
     * @returns Promise<any> 响应数据
     */
    public async sendCommand(
        request: { cmd: number, data: any },
        options?: { skipSessionCheck?: boolean }
    ): Promise<any> {
        if (!this._wsManager) {
            throw new Error('WebSocketManager 未初始化');
        }

        if (!this._wsManager.isConnected()) {
            throw new Error('WebSocket 未连接');
        }

        if (!options?.skipSessionCheck) {
            const ready = await this.ensureSessionReady();
            if (!ready) {
                throw new Error('登录会话未恢复，请稍后重试');
            }
        }

        return new Promise((resolve, reject) => {
            const timeout = 10000;
            let resolved = false;
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    this._wsManager.setOnMessage(originalCallback);
                    reject(new Error('请求超时'));
                }
            }, timeout);

            const originalCallback = this._wsManager.getOnMessage();

            // ✅ 临时替换回调，等待响应
            this._wsManager.setOnMessage((message: any) => {
                // ✅ 添加调试日志

                // ✅ 检查是否是期望的响应
                // 使用宽松比较（==）处理字符串和数字类型差异
                const messageCmd = message?.cmd;
                const messageType = message?.type;
                const requestCmd = request.cmd;

                const isExpectedResponse = message && (
                    messageCmd == requestCmd ||
                    messageCmd == requestCmd + 1 ||
                    messageType == requestCmd ||
                    messageType == requestCmd + 1
                );

                if (isExpectedResponse) {
                    // 这是期望的响应
                    resolved = true;
                    clearTimeout(timeoutId);
                    // ✅ 解析响应数据（可能在不同字段中）
                    const responseData = message.body || message.data || message;
                    resolve(responseData);
                    // 恢复原始回调
                    this._wsManager.setOnMessage(originalCallback);
                } else {
                    // 其他消息，交给原始回调处理
                    if (originalCallback) {
                        originalCallback(message);
                    }
                }
            });

            // 发送消息
            this._wsManager.sendMessage(request.cmd, request.data);
        });
    }

    /**
     * 设置加入房间回调
     */
    public setOnJoinRoom(callback: (data: any) => void): void {
        this._onJoinRoom = callback;
    }

    /**
     * 处理加入房间响应
     */
    private handleJoinRoomResponse(data: any): void {

        EventBus.getInstance().emit(NetworkEvent.JoinRoom, data);

        if (data.code === ResponseCode.SUCCESS) {
            this._roomId = data.roomId || data.room_id || 0;
            this._roomType = data.roomType || data.room_type || 'PVP';

            // 保存房间信息
            if (data.smallBlind) this._gameConfig = { ...this._gameConfig, smallBlind: data.smallBlind };
            if (data.bigBlind) this._gameConfig = { ...this._gameConfig, bigBlind: data.bigBlind };
            if (data.hostUserId) this._hostUserId = data.hostUserId;
            if (data.maxPlayers) this._gameConfig = { ...this._gameConfig, maxPlayers: data.maxPlayers };

            // ✅ 保存玩家信息！这是关键修复！
            if (data.players && data.players.length > 0) {
                this._playersData = data.players;
            } else {
                LogService.warn('GameNetwork', '⚠️ JOIN_ROOM响应中没有玩家信息');
            }
        }

        if (this._onJoinRoom) {
            this._onJoinRoom(data);
        }
    }
}
