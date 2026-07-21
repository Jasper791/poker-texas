import { LogService } from './utils/LogService';
import { _decorator, Component, Node, director, Button, Label, Sprite, SpriteFrame, resources } from 'cc';
import { ScreenAdapter } from './utils/ScreenAdapter';
import { GameNetwork } from './net/GameNetwork';
import { CommandType } from './net/Protocol';
import { UserInfoManager } from './managers/UserInfoManager';
import { LoadingManager } from './components/Loading/LoadingManager';
import { DialogManager } from './components/Dialog/dialogManager';
import { SceneLoader } from './managers/SceneLoader';
import { SoundManager } from './managers/SoundManager';
const { ccclass, property } = _decorator;

// ✅ 钱包类型定义
interface WalletProvider {
    name: string;       // 钱包名称
    icon: string;       // 钱包图标（可使用 emoji）
    provider: any;      // 钱包提供对象
    isEIP1193: boolean; // 是否符合 EIP-1193 标准
}

@ccclass('index')
export class index extends Component {
    @property({ type: Node })
    public pvpBtn: Node = null;

    @property({ type: Node })
    public pveBtn: Node = null;

    @property({ type: Node })
    public recordBtn: Node = null;

    @property({ type: Node })
    public connectWalletBtn: Node = null;

    @property({ type: Node })
    public buyCardBtn: Node = null;

    @property({ type: Node })
    public meBtn: Node = null;

    @property({ type: Label })
    public walletAddressLabelText: Label = null;

    @property({ type: Node, tooltip: '音效开关按钮' })
    public offSoundBtn: Node = null;

    @property({ type: Node, tooltip: '背景音乐开关按钮' })
    public offBackGroundMusicBtn: Node = null;

    private _isWalletConnected: boolean = false;
    private _connectionStatus: string = 'disconnected'; // disconnected, connecting, connected, signed
    private _walletAddress: string = '';
    private _currentWalletProvider: any = null;
    private _openMusicSpriteFrame: SpriteFrame = null;
    private _closeMusicSpriteFrame: SpriteFrame = null;

    /**
     * 尽可能在首帧渲染前恢复 UI（早于 start）
     */
    onLoad() {
        this.applyPersistedLoginUI();
        this.setupNetworkCallbacks();
        if (!this.syncLoginUIFromCache() && !UserInfoManager.getInstance().isLoggedIn()) {
            this.updateWalletAddressDisplay('');
            this.updateConnectWalletButtonVisibility();
        }
    }

    start() {
        // Loading test
        //LoadingManager.show();
        ScreenAdapter.getInstance().adaptToScreen(this.node);
        this.bindButtonEvents();

        // onLoad 已同步过，此处再执行一次确保绑定完成后状态正确
        this.syncLoginUIFromCache();

        // ✅ 加载音乐开关图片并绑定音效按钮事件
        this._loadMusicSpriteFrames();
        this._bindAudioButtons();

        // ✅ 延迟再次检查（兼容移动端钱包注入较慢的情况）
        this.scheduleOnce(() => {
            this.tryRestoreConnection();
        }, 1);

        // ✅ 监听窗口加载完成事件，再次尝试检测钱包
        if (typeof window !== 'undefined') {
            window.addEventListener('load', () => {
                this.scheduleOnce(() => {
                    this.tryRestoreConnection();
                }, 0.5);
            });
        }

        // ✅ 监听 ethereum 注入事件（部分钱包使用）
        this.listenForEthereumInjection();

        // ✅ 延迟预加载资源（等待 index 场景渲染完成后再开始，避免卡顿）
        this.scheduleOnce(() => {
            this._startPreloading();
        }, 0.5);
    }

    private _loadMusicSpriteFrames() {
        resources.load('material/texture/open_music/spriteFrame', SpriteFrame, (err, frame) => {
            if (!err && frame) {
                this._openMusicSpriteFrame = frame;
                this._updateAudioButtonStates();
            }
        });
        
        resources.load('material/texture/close_music/spriteFrame', SpriteFrame, (err, frame) => {
            if (!err && frame) {
                this._closeMusicSpriteFrame = frame;
                this._updateAudioButtonStates();
            }
        });
    }

    private _bindAudioButtons() {
        if (this.offSoundBtn) {
            const btn = this.offSoundBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onOffSoundBtnClick, this);
            }
        }

        if (this.offBackGroundMusicBtn) {
            const btn = this.offBackGroundMusicBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onOffBackGroundMusicBtnClick, this);
            }
        }
    }

    private _updateAudioButtonStates() {
        if (!this._openMusicSpriteFrame || !this._closeMusicSpriteFrame) {
            return;
        }
        
        this._updateSoundButtonState();
        this._updateBgmButtonState();
    }

    private _updateSoundButtonState() {
        if (!this.offSoundBtn) {
            return;
        }
        
        const sprite = this.offSoundBtn.getComponent(Sprite);
        if (!sprite) {
            return;
        }
        
        const soundManager = SoundManager.getInstance();
        sprite.spriteFrame = soundManager.isSoundEnabled() ? this._openMusicSpriteFrame : this._closeMusicSpriteFrame;
    }

    private _updateBgmButtonState() {
        if (!this.offBackGroundMusicBtn) {
            return;
        }
        
        const sprite = this.offBackGroundMusicBtn.getComponent(Sprite);
        if (!sprite) {
            return;
        }
        
        const soundManager = SoundManager.getInstance();
        sprite.spriteFrame = soundManager.isBgmEnabled() ? this._openMusicSpriteFrame : this._closeMusicSpriteFrame;
    }

    onOffSoundBtnClick() {
        const soundManager = SoundManager.getInstance();
        const newState = !soundManager.isSoundEnabled();
        soundManager.setSoundEnabled(newState);
        this._updateSoundButtonState();
    }

    onOffBackGroundMusicBtnClick() {
        const soundManager = SoundManager.getInstance();
        const newState = !soundManager.isBgmEnabled();
        soundManager.setBgmEnabled(newState);
        this._updateBgmButtonState();
    }

    private _startPreloading(): void {
        const sceneLoader = SceneLoader.getInstance();

        sceneLoader.preloadScene('scene_pvp', (completedCount, totalCount, item) => {
            const progress = Math.round((completedCount / totalCount) * 100);
            LogService.info('index', `scene_pvp 场景预加载进度: ${progress}%`);
        }, (error) => {
            if (!error) {
                LogService.info('index', 'scene_pvp 场景预加载完成');
                this._onScenePvpPreloaded();
            } else {
                LogService.error('index', 'scene_pvp 场景预加载失败:', error);
            }
        });
    }

    private _onScenePvpPreloaded(): void {
        const sceneLoader = SceneLoader.getInstance();

        sceneLoader.preloadAllAudio((successCount, totalCount) => {
            LogService.info('index', `音频资源预加载完成: ${successCount}/${totalCount}`);
        });

        sceneLoader.preloadTextureDir('material/chip', (completedCount, totalCount) => {
            LogService.info('index', `筹码纹理预加载完成: ${completedCount}/${totalCount}`);
        });

        sceneLoader.preloadTextureDir('material/texture', (completedCount, totalCount) => {
            LogService.info('index', `纹理资源预加载完成: ${completedCount}/${totalCount}`);
        });

        sceneLoader.preloadTextureDir('pokers/Spade', (completedCount, totalCount) => {
            LogService.info('index', `黑桃牌预加载完成: ${completedCount}/${totalCount}`);
        });

        sceneLoader.preloadTextureDir('pokers/Heart', (completedCount, totalCount) => {
            LogService.info('index', `红心牌预加载完成: ${completedCount}/${totalCount}`);
        });

        sceneLoader.preloadTextureDir('pokers/Diamond', (completedCount, totalCount) => {
            LogService.info('index', `方块牌预加载完成: ${completedCount}/${totalCount}`);
        });

        sceneLoader.preloadTextureDir('pokers/Club', (completedCount, totalCount) => {
            LogService.info('index', `梅花牌预加载完成: ${completedCount}/${totalCount}`);
        });
    }

    /**
     * ✅ 设置网络回调
     */
    private setupNetworkCallbacks(): void {
        const gameNetwork = GameNetwork.getInstance();

        gameNetwork.setOnDisconnected(() => {
            UserInfoManager.getInstance().setWebSocketConnected(false);
            this._isWalletConnected = true;
            this._connectionStatus = 'reconnecting';
            const walletAddr = gameNetwork.getWalletAddress() || UserInfoManager.getInstance().getWalletAddress();
            if (walletAddr) {
                this.updateWalletAddressDisplay(this.maskWalletAddress(walletAddr));
            } else {
                this.updateWalletAddressDisplay('');
            }

            this.updateConnectWalletButtonVisibility();
        });

        gameNetwork.setOnConnected(() => {
            UserInfoManager.getInstance().setWebSocketConnected(true);
            this.syncLoginUIFromCache();
            if (gameNetwork.isLoggedIn()) {
                gameNetwork.fetchRoomCardBalance().catch((err) => {
                });
            }
        });

        gameNetwork.setOnLoginCallback((reason: string) => {
            LogService.info('index', `登录回调触发，原因: ${reason}`);
            const walletAddr = gameNetwork.getWalletAddress() || UserInfoManager.getInstance().getWalletAddress();
            if (walletAddr && this._currentWalletProvider) {
                LogService.info('index', '自动重新登录...');
                this.startWalletLoginFlow(this._currentWalletProvider);
            } else {
                LogService.warn('index', '无法自动登录：钱包地址或钱包提供者为空');
            }
        });
    }

    /**
     * 从 UserInfoManager 持久化缓存立即恢复 UI（场景默认文案渲染前生效）
     */
    private applyPersistedLoginUI(): void {
        const { walletDisplayText, hideConnectBtn } = UserInfoManager.getInstance().getPersistedIndexLoginUI();
        if (!walletDisplayText) {
            return;
        }
        if (this.walletAddressLabelText) {
            this.walletAddressLabelText.string = walletDisplayText;
        }
        if (this.connectWalletBtn) {
            this.connectWalletBtn.active = !hideConnectBtn;
        }
    }

    private persistLoginUIState(walletDisplayText: string, hideConnectBtn: boolean): void {
        UserInfoManager.getInstance().persistIndexLoginUI(walletDisplayText, hideConnectBtn);
    }

    /**
     * 从 GameNetwork / UserInfoManager 单例立即同步登录 UI（无延迟）
     */
    private syncLoginUIFromCache(): boolean {
        const gameNetwork = GameNetwork.getInstance();
        const userInfoManager = UserInfoManager.getInstance();

        const walletAddress = gameNetwork.getWalletAddress() || userInfoManager.getWalletAddress();
        const userId = gameNetwork.getUserId() || userInfoManager.getUserId();

        if (!userId || !walletAddress?.startsWith('0x')) {
            return false;
        }

        this._walletAddress = walletAddress;
        this._isWalletConnected = true;
        this._connectionStatus = gameNetwork.isConnected() ? 'signed' : 'reconnecting';

        userInfoManager.setWebSocketConnected(gameNetwork.isConnected());
        if (!userInfoManager.isLoggedIn()) {
            userInfoManager.setUserInfo({
                userId,
                nickname: userInfoManager.getNickname(),
                walletAddress,
                roomCard: userInfoManager.getRoomCard(),
                gameCoin: userInfoManager.getGameCoin()
            });
        }

        const masked = this.maskWalletAddress(walletAddress);
        if (gameNetwork.isConnected()) {
            this.updateWalletAddressDisplay(masked);
        } else {
            this.updateWalletAddressDisplay(masked);
        }
        this.updateConnectWalletButtonVisibility();
        return true;
    }

    /**
     * ✅ [新增] 监听 ethereum 注入事件
     * 部分移动端钱包会在页面加载后才注入 window.ethereum
     */
    private listenForEthereumInjection() {
        if (typeof window === 'undefined') return;

        const win = window as any;

        // 如果已经注入了，直接检测
        if (win.ethereum) {
           // LogService.info('index', 'ethereum 已存在，无需等待注入');
            return;
        }

        LogService.info('index', '开始监听 ethereum 注入事件');

        // 监听 ethereum#initialized 事件（MetaMask 等使用）
        const onEthereumInitialized = () => {
           // LogService.info('index', '收到 ethereum#initialized 事件');
            this.scheduleOnce(() => {
                this.tryRestoreConnection();
            }, 0.3);
        };

        // 添加事件监听
        win.addEventListener('ethereum#initialized', onEthereumInitialized);

        // 同时使用定时检测作为兜底
        let checkCount = 0;
        const maxChecks = 20; // 最多检测 20 次
        const checkInterval = setInterval(() => {
            checkCount++;
            if (win.ethereum) {
               // LogService.info('index', `定时检测第 ${checkCount} 次发现 ethereum`);
                clearInterval(checkInterval);
                win.removeEventListener('ethereum#initialized', onEthereumInitialized);
                this.scheduleOnce(() => {
                    this.tryRestoreConnection();
                }, 0.3);
            } else if (checkCount >= maxChecks) {
               // LogService.info('index', `定时检测超过 ${maxChecks} 次，停止检测`);
                clearInterval(checkInterval);
                win.removeEventListener('ethereum#initialized', onEthereumInitialized);
            }
        }, 500); // 每 500ms 检测一次
    }

    /**
     * ✅ [新增] 检测所有可用的 EVM 钱包
     * 支持 MetaMask, TokenPocket, Trust Wallet, OKX Wallet, Phantom 等
     */
    private detectAvailableWallets(): WalletProvider[] {
        const wallets: WalletProvider[] = [];
        const win = window as any;

        // ✅ [修复] 检测是否在手机 WebView 环境中
        const isMobileWebView = this._isMobileWebView();

        // ✅ [修复] WebView 环境中，一些钱包不会设置 isXxx 属性，但仍然存在 ethereum 对象
        // 检查 ethereum 对象是否有 request 方法（EIP-1193 标准）
        const hasValidEthereumProvider = win.ethereum && typeof win.ethereum.request === 'function';

        // 钱包检测配置
        const walletConfigs = [
            { name: 'MetaMask', icon: '🦊', provider: win.ethereum, condition: () => win.ethereum?.isMetaMask },
            { name: 'TokenPocket', icon: '🔷', provider: win.ethereum, condition: () => win.ethereum?.isTokenPocket },
            { name: 'Trust Wallet', icon: '🟦', provider: win.ethereum, condition: () => win.ethereum?.isTrust || win.ethereum?.isTrustWallet },
            { name: 'OKX Wallet', icon: '🟩', provider: win.ethereum, condition: () => win.ethereum?.isOkxWallet },
            { name: 'Phantom', icon: '👻', provider: win.ethereum, condition: () => win.ethereum?.isPhantom },
            { name: 'BitKeep', icon: '📱', provider: win.ethereum, condition: () => win.ethereum?.isBitKeep },
            { name: 'ImToken', icon: '💎', provider: win.ethereum, condition: () => win.ethereum?.isImToken },
            { name: 'TP Wallet', icon: '🔷', provider: win.ethereum, condition: () => win.ethereum?.isTP },
            { name: 'MathWallet', icon: '🧮', provider: win.ethereum, condition: () => win.ethereum?.isMathWallet },
            { name: 'Huobi Wallet', icon: '🔥', provider: win.ethereum, condition: () => win.ethereum?.isHuobiWallet },
            { name: 'Coinex Wallet', icon: '🟢', provider: win.ethereum, condition: () => win.ethereum?.isCoinEx },
        ];

        // 检查每个钱包
        for (const config of walletConfigs) {
            try {
                if (config.condition()) {
                    wallets.push({
                        name: config.name,
                        icon: config.icon,
                        provider: config.provider,
                        isEIP1193: true
                    });
                }
            } catch (e) {
            }
        }

        // ✅ [修复] WebView 环境中，如果有 valid ethereum provider 但没有检测到特定钱包，也认为是有效的钱包
        // 手机 WebView 中很多钱包不会设置 isXxx 属性，但仍然可以正常使用
        if (wallets.length === 0 && hasValidEthereumProvider) {
            // 尝试从 ethereum 对象获取更多信息来识别钱包
            let walletName = 'EVM Wallet';
            
            // 检查 provider 的标识信息
            if (win.ethereum?.chainId) {
                walletName = 'EVM Wallet';
            }
            
            // WebView 环境下更友好的钱包名称
            if (isMobileWebView) {
                walletName = '手机钱包';
            }

            wallets.push({
                name: walletName,
                icon: '💰',
                provider: win.ethereum,
                isEIP1193: true
            });
        }

        return wallets;
    }

    /**
     * ✅ [新增] 检测是否在手机 WebView 环境中
     */
    private _isMobileWebView(): boolean {
        const win = window as any;
        const userAgent = navigator.userAgent.toLowerCase();

        // 检测手机浏览器
        const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(userAgent);
        
        // 检测 WebView 特征
        const isWebView = 
            // Android WebView
            userAgent.includes('wv') || 
            // iOS WebView (UIWebView/WKWebView)
            (userAgent.includes('iphone') || userAgent.includes('ipad')) && !userAgent.includes('safari') ||
            // 微信/QQ 等内置浏览器
            userAgent.includes('micromessenger') || 
            userAgent.includes('qqbrowser') ||
            // 钱包内置浏览器
            userAgent.includes('tokenpocket') ||
            userAgent.includes('trust') ||
            userAgent.includes('metamask');

        return isMobile && isWebView;
    }

    /**
     * 绑定按钮事件
     */
    private bindButtonEvents(): void {
        // PVP 按钮
        if (this.pvpBtn) {
            const btn = this.pvpBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onPvpButtonClick, this);
            }
        }

        // PVE 按钮
        if (this.pveBtn) {
            const btn = this.pveBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onPveButtonClick, this);
            }
        }

        // 记录按钮
        if (this.recordBtn) {
            const btn = this.recordBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onRecordButtonClick, this);
            }
        }

        // 连接钱包按钮
        if (this.connectWalletBtn) {
            const btn = this.connectWalletBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onConnectWalletClick, this);
            }
        }

        // 购买房卡按钮
        if (this.buyCardBtn) {
            const btn = this.buyCardBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onBuyCardButtonClick, this);
            }
        }

        // 我的按钮
        if (this.meBtn) {
            const btn = this.meBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onMeButtonClick, this);
            }
        }
    }

    /**
     * ✅ [修改] 尝试恢复已有连接状态
     * 如果已经登录且 WebSocket 已连接，直接使用现有连接，无需重新签名
     * 注意：必须同时满足以下条件才认为已登录：
     * 1. WebSocket 已连接
     * 2. 有钱包地址
     * 3. 有用户ID（表示已完成签名验证登录）
     * 
     * ✅ 用户必须点击按钮才能连接钱包，不会自动连接
     */
    private async tryRestoreConnection() {

        const gameNetwork = GameNetwork.getInstance();

        if (this.syncLoginUIFromCache()) {
            if (gameNetwork.isConnected()) {
                gameNetwork.fetchRoomCardBalance().catch((err) => {
                   // LogService.warn('index', '恢复连接时刷新房卡余额失败:', err);
                });
            }
            return;
        }

        const userInfoManager = UserInfoManager.getInstance();
        if (userInfoManager.isLoggedIn()) {
            return;
        }

       // LogService.info('index', '⏳ 等待用户点击连接钱包按钮');
        this._isWalletConnected = false;
        this._walletAddress = '';
        this._connectionStatus = 'disconnected';
        // this.updateWalletAddressDisplay('未连接');
        // this.updateWalletAddressDisplay('');
        this.updateConnectWalletButtonVisibility();
    }

    /**
     * ✅ [新增] 从当前连接的钱包获取真实地址
     */
    private async getCurrentWalletAddress(): Promise<string | null> {
        try {
           // LogService.info('index', '开始获取钱包地址');
            const wallets = this.detectAvailableWallets();

            if (wallets.length === 0) {
              //  LogService.info('index', '没有检测到任何钱包');
                return null;
            }

            for (const wallet of wallets) {
                try {
                   // LogService.info('index', `尝试从 ${wallet.name} 获取地址`);

                    // 方法 1: 使用 eth_accounts
                   // LogService.info('index', '方法 1: 尝试 eth_accounts');
                    let accounts = await wallet.provider.request({ method: 'eth_accounts' });
                   // LogService.info('index', `eth_accounts 返回:`, accounts);

                    if (accounts && accounts.length > 0) {
                        const address = accounts[0];
                        if (address && address.startsWith('0x') && address.length === 42) {
                            LogService.info('index', `从 ${wallet.name} 获取到真实钱包地址: ${address}`);
                            return address;
                        }
                    }

                    // 方法 2: 尝试直接获取 provider 属性
                   // LogService.info('index', '方法 2: 尝试直接访问 provider 属性');
                    if (wallet.provider.selectedAddress) {
                        const address = wallet.provider.selectedAddress;
                       // LogService.info('index', `从 selectedAddress 获取到: ${address}`);
                        if (address && address.startsWith('0x') && address.length === 42) {
                          //  LogService.info('index', `从 ${wallet.name} selectedAddress 获取到钱包地址: ${address}`);
                            return address;
                        }
                    }

                } catch (e) {
                    LogService.error('index', `尝试从 ${wallet.name} 获取地址时出错:`, e);
                }
            }

           // LogService.info('index', '未从任何钱包获取到地址');
            return null;
        } catch (e) {
            LogService.error('index', '获取钱包地址异常:', e);
            return null;
        }
    }

    /**
     * ✅ [新增] 建立 WebSocket 连接
     * 注意：只建立 WebSocket 连接，不自动连接钱包
     * 用户必须点击按钮才能触发钱包连接和签名流程
     */
    private connectWebSocket() {
        const gameNetwork = GameNetwork.getInstance();

        // 设置连接成功回调
        gameNetwork.setOnConnected(() => {
           // LogService.info('index', 'WebSocket 连接成功');
            // ✅ [修改] 不再自动连接钱包，等待用户点击按钮
        });

        // 开始连接
       // LogService.info('index', '开始连接 WebSocket...');
        gameNetwork.connect();
    }

    /**
     * ✅ [新增] 自动连接钱包
     */
    private async autoConnectWallet() {
        try {
            const wallets = this.detectAvailableWallets();

            if (wallets.length === 0) {
              //  LogService.warn('index', '未检测到任何 Web3 钱包');
                return;
            }

          //  LogService.info('index', `检测到 ${wallets.length} 个钱包，开始尝试自动连接...`);

            // 尝试从所有检测到的钱包中找到已连接的
            for (const wallet of wallets) {
                try {
                  //  LogService.info('index', `尝试连接 ${wallet.name}...`);
                    const accounts = await wallet.provider.request({ method: 'eth_accounts' });
                   // LogService.info('index', `${wallet.name} eth_accounts 返回:`, accounts);

                    if (accounts && accounts.length > 0) {
                        this._walletAddress = accounts[0];
                        this._currentWalletProvider = wallet.provider;
                        this._isWalletConnected = true; // ✅ 标记钱包已连接

                        // 更新 GameNetwork 的钱包地址
                        GameNetwork.getInstance().setWalletAddress(this._walletAddress);

                        this.updateWalletAddressDisplay(this.maskWalletAddress(this._walletAddress));

                        // 自动触发登录流程
                        await this.startWalletLoginFlow(wallet);
                        return; // 找到一个已连接的钱包就停止
                    } else {
                      //  LogService.info('index', `${wallet.name} 未返回账户，继续尝试下一个钱包`);
                    }
                } catch (e) {
                }
            }

          //  LogService.warn('index', '⚠️ 所有钱包都未返回账户，需要用户手动点击连接');

        } catch (error) {
            LogService.error('index', `❌ 自动连接钱包失败：${error}`);
        }
    }

    /**
     * 更新钱包地址显示
     */
    private updateWalletAddressDisplay(address: string): void {
        if (this.walletAddressLabelText) {
            this.walletAddressLabelText.string = address;
        }
        const hideConnectBtn = this._connectionStatus === 'signed' || this._connectionStatus === 'reconnecting';
        if (hideConnectBtn && address && address !== '未连接' && address !== '已断开') {
            this.persistLoginUIState(address, true);
        }
    }

    /**
     * 登录失败时重置本地钱包连接状态，允许用户重新点击连接
     */
    private resetLocalWalletState(): void {
        this._isWalletConnected = false;
        this._connectionStatus = 'disconnected';
        this._walletAddress = '';
        this._currentWalletProvider = null;
        UserInfoManager.getInstance().clearIndexLoginUI();
        this.updateConnectWalletButtonVisibility();
    }

    /**
     * ✅ 更新连接钱包按钮的显示状态
     * - WebSocket 已连接且钱包已登录 → 隐藏按钮
     * - 其他情况 → 显示按钮
     */
    private updateConnectWalletButtonVisibility(): void {
        const gameNetwork = GameNetwork.getInstance();
        const userInfoManager = UserInfoManager.getInstance();
        const walletAddress = gameNetwork.getWalletAddress() || userInfoManager.getWalletAddress();
        const userId = gameNetwork.getUserId() || userInfoManager.getUserId();
        const isLoggedIn = userId > 0 && walletAddress?.startsWith('0x');
        const shouldHide = isLoggedIn && (
            gameNetwork.isConnected() ||
            this._connectionStatus === 'signed' ||
            this._connectionStatus === 'reconnecting'
        );

        if (this.connectWalletBtn) {
            this.connectWalletBtn.active = !shouldHide;
            if (shouldHide) {
                const displayText = this.walletAddressLabelText?.string || '';
                if (displayText) {
                    this.persistLoginUIState(displayText, true);
                }
            } else {
            }
        }
    }

    /**
     * ✅ [修改] 连接钱包按钮点击事件 - 直接调用签名
     */
    private async onConnectWalletClick(): Promise<void> {


        // ✅ 防重复点击检查

        // return
        if (this._connectionStatus === 'connecting') {
            //LogService.warn('index', '正在连接中，请勿重复点击');
            return;
        }

        if (this._isWalletConnected) {
           // LogService.info('index', '钱包已连接，无需重复连接');
            return;
        }
        this._connectionStatus = 'connecting';
        this.updateWalletAddressDisplay('');

        try {
            // ✅ 检测钱包
            const wallets = this.detectAvailableWallets();

            if (wallets.length === 0) {
               // LogService.warn('index', '未检测到任何 Web3 钱包');
                // alert('请安装 MetaMask、TokenPocket、Trust Wallet 或其他 Web3 钱包');
                DialogManager.show({
                    title: '未检测到钱包',
                    content: '请安装 MetaMask、TokenPocket、Trust Wallet 或其他 Web3 钱包，并刷新页面后重试。',
                });
                this.resetLocalWalletState();
                this.updateWalletAddressDisplay('');
                return;
            }

            // ✅ 使用第一个检测到的钱包直接连接
            const wallet = wallets[0];
            //LogService.info('index', `使用 ${wallet.name} 钱包进行连接`);

            // ✅ 连接钱包并执行登录流程
            await this.connectWithWallet(wallet);

        } catch (error) {
           // LogService.error('index', '❌ 连接钱包异常:', error);
            this.resetLocalWalletState();
            // this.updateWalletAddressDisplay('连接失败');
        }
    }

    /**
     * ✅ [修改] 使用指定钱包连接 - 直接调用签名
     */
    private async connectWithWallet(wallet: WalletProvider) {
       // LogService.info('index', `开始连接 ${wallet.name} 钱包`);

        try {
            // ✅ 再次检查是否已连接，避免重复弹窗
            if (this._isWalletConnected) {
                LogService.info('index', '钱包已连接，跳过 eth_requestAccounts');
                return;
            }

            // Step 1: 请求连接钱包
            LoadingManager.show()
           // LogService.info('index', '请求钱包授权 eth_requestAccounts');
            const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
           // LogService.info('index', 'eth_requestAccounts 返回:', accounts);

            if (!accounts || accounts.length === 0) {
              //  LogService.warn('index', '用户拒绝了钱包连接请求或没有账户');
                LoadingManager.hide();
                this.resetLocalWalletState();
                this.updateWalletAddressDisplay('');
                DialogManager.show({
                    title: '提示',
                    content: '用户拒绝了钱包连接请求或没有账户',
                })
                return;
            }

            this._walletAddress = accounts[0];
            this._currentWalletProvider = wallet.provider;
            this._isWalletConnected = true;
            //LogService.info('index', `${wallet.name} 连接成功：${this._walletAddress}`);

            const userInfoManager = UserInfoManager.getInstance();
            const oldAddress = userInfoManager.getWalletAddress();
            if (oldAddress && oldAddress.toLowerCase() !== this._walletAddress.toLowerCase()) {
              //  LogService.info('index', `钱包地址已变更，重置用户信息: ${oldAddress} -> ${this._walletAddress}`);
                userInfoManager.reset();
            }

            // ✅ 直接开始登录流程（包含签名）
           // LogService.info('index', '开始登录流程...');
            await this.startWalletLoginFlow(wallet);

            
            // 更新地址显示
            this.updateWalletAddressDisplay(this.maskWalletAddress(this._walletAddress));


        } catch (error: any) {
            LoadingManager.hide();
           // LogService.error('index', `钱包连接失败：${error?.message || error}`);
            this.resetLocalWalletState();
            if (error?.code === 4001) {
                LogService.warn('index', '用户拒绝了钱包连接请求');
                this.updateWalletAddressDisplay('');
            } else {
                this.updateWalletAddressDisplay('');
            }
            DialogManager.show({
                title: '提示',
                content: '钱包连接失败，请重试。'
            });
        }
    }

    /**
     * ✅ [修改] 钱包登录流程（使用 GameNetwork 的现有登录流程）
     */
    private async startWalletLoginFlow(wallet: WalletProvider) {
        try {
            const gameNetwork = GameNetwork.getInstance();

            // ✅ 使用 GameNetwork 的连接和登录方法
            // GameNetwork 内部会处理：连接钱包 → 获取挑战 → 签名 → 发送登录请求
           // LogService.info('index', '当前钱包地址:', this._walletAddress);

            const success = await gameNetwork.connectWalletAndLogin(
                (data) => {
                    // 登录成功回调
                    this._isWalletConnected = true;
                    this._connectionStatus = 'signed';

                    // ✅ [新增] 将用户信息保存到 UserInfoManager
                    const userInfoManager = UserInfoManager.getInstance();
                    userInfoManager.setUserInfo({
                        userId: data.user_id || data.userId || 0,
                        nickname: data.nickname || '',
                        walletAddress: data.wallet_address || data.walletAddress || this._walletAddress || '',
                        roomCard: data.room_card || data.roomCard || 0,
                        gameCoin: data.game_coin || data.gameCoin || 0,  // ✅ [新增] 游戏币数量
                        createdAt: data.created_at || data.createdAt,
                        updatedAt: data.updated_at || data.updatedAt
                    });

                    // ✅ [新增] 设置 WebSocket 连接状态
                    userInfoManager.setWebSocketConnected(gameNetwork.isConnected());

                    gameNetwork.fetchRoomCardBalance().then((balance) => {
                      //  LogService.info('index', `房卡余额已刷新: ${balance}`);
                    }).catch((err) => {
                        LogService.warn('index', '登录后刷新房卡余额失败:', err);
                    });

                   // LogService.info('index', `用户信息已缓存: userId=${userInfoManager.getUserId()}, roomCard=${userInfoManager.getRoomCard()}`);

                    // 更新钱包地址显示
                    const walletAddr = data.wallet_address || data.walletAddress || this._walletAddress || gameNetwork.getWalletAddress();
                    const maskedAddr = this.maskWalletAddress(walletAddr);
                    this.updateWalletAddressDisplay(maskedAddr);

                    // ✅ 更新连接钱包按钮显示状态（隐藏按钮）
                    this.updateConnectWalletButtonVisibility();

                    if (data.signature_verified !== undefined) {
                    }
                     LoadingManager.hide();
                },
                (error) => {
                    LoadingManager.hide();
                    // 登录失败回调（GameNetwork 已重置钱包连接对象）
                   // LogService.error('index', '❌ 钱包登录失败:', error);
                    this.resetLocalWalletState();
                    // this.updateWalletAddressDisplay('登录失败');
                }
            );

            if (success) {
            } else {
               // LogService.error('index', '❌ 钱包连接流程启动失败');
                this.resetLocalWalletState();
                LoadingManager.hide();
                // this.updateWalletAddressDisplay('登录失败');
            }

        } catch (error: any) {
          //  LogService.error('index', `登录流程失败：${error?.message || error}`);
            this.resetLocalWalletState();
            LoadingManager.hide();
            // this.updateWalletAddressDisplay('登录失败');
        }
    }

    /**
     * ✅ [新增] 直接调用签名 - 不做任何 provider ready 检查！
     * 移动端钱包需要用户交互才能激活，签名请求本身就是激活触发器
     */
    private async signWithWalletDirectly(walletProvider: any, message: string, address: string): Promise<string | null> {
        try {
            // ✅ 浏览器环境下将字符串转换为十六进制
            const hexMessage = this.stringToHex(message);
            //LogService.info('index', `原始消息: ${message}`);
           // LogService.info('index', `十六进制消息: ${hexMessage}`);

            // ✅ 直接调用 eth_sign，不做任何降级！
            // 移动端钱包会在此时弹出密码输入框
            const signature = await walletProvider.request({
                method: 'eth_sign',
                params: [address, hexMessage]
            });
            return signature;

        } catch (error: any) {
            LogService.error('index', `签名失败：${error?.message || error}`);
            if (error?.code === 4001) {
                //LogService.warn('index', '用户拒绝了签名请求');
                alert('请在钱包中同意签名');
            } else if (error?.code === 4100) {
                //LogService.warn('index', 'Provider not ready - 移动端钱包需要用户交互');
                // 在移动端，这个错误通常会在用户授权后自动恢复
                // 可以尝试再次调用
                try {
                    LogService.info('index', '尝试再次调用签名...');
                    const hexMessage = this.stringToHex(message);
                    const signature = await walletProvider.request({
                        method: 'eth_sign',
                        params: [address, hexMessage]
                    });
                    return signature;
                } catch (e) {
                   // LogService.error('index', '再次签名也失败:', e);
                }
            }
            return null;
        }
    }

    /**
     * ✅ [新增] 将字符串转换为十六进制（兼容浏览器环境）
     */
    private stringToHex(str: string): string {
        let hex = '';
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i).toString(16);
            hex += code.length === 1 ? '0' + code : code;
        }
        return '0x' + hex;
    }

    /**
     * ✅ [新增] 通过 WebSocket 获取 challenge
     */
    private getChallengeViaWebSocket(gameNetwork: GameNetwork): Promise<{ challenge: string; nonce: string }> {
        return new Promise((resolve, reject) => {
            const originalOnMessage = (gameNetwork as any)._onMessage;

            (gameNetwork as any)._onMessage = (cmd: number, data: any) => {
              //  LogService.info('index', `收到消息: cmd=${cmd}, data=`, data);

                if (cmd === CommandType.GET_LOGIN_CHALLENGE) {
                    (gameNetwork as any)._onMessage = originalOnMessage;

                    if (data.code === 0) {
                        resolve({
                            challenge: data.challenge,
                            nonce: data.nonce
                        });
                    } else {
                        reject(new Error(data.message || '获取 challenge 失败'));
                    }
                } else if (originalOnMessage) {
                    originalOnMessage(cmd, data);
                }
            };

            // 发送获取 challenge 请求
            gameNetwork.sendMessage(CommandType.GET_LOGIN_CHALLENGE, {
                walletAddress: this._walletAddress
            });

            setTimeout(() => {
                (gameNetwork as any)._onMessage = originalOnMessage;
                reject(new Error('获取 challenge 超时'));
            }, 30000);
        });
    }

    /**
     * 钱包地址脱敏显示
     */
    private maskWalletAddress(address: string): string {
        if (!address || address.length < 10) {
            return address;
        }
        return address.substring(0, 6) + '...' + address.substring(address.length - 4);
    }

    update(deltaTime: number) {
    }

    onPvpButtonClick() {
        const userInfoManager = UserInfoManager.getInstance();
        if (!userInfoManager.canAccessFeatures()) {
            const reason = !userInfoManager.isLoggedIn() ? '请先连接钱包并登录' : 'WebSocket连接中，请稍候';
           // LogService.warn('index', `无法进入PVP房间: ${reason}`);
            alert(reason);
            return;
        }
        SceneLoader.getInstance().loadScene('room');
    }

    onPveButtonClick() {
        GameNetwork.getInstance().setRoomType('PVE');
        SceneLoader.getInstance().loadScene('room_pve');
    }

    onRecordButtonClick() {
        const userInfoManager = UserInfoManager.getInstance();
        if (!userInfoManager.canAccessFeatures()) {
            const reason = !userInfoManager.isLoggedIn() ? '请先连接钱包并登录' : 'WebSocket连接中，请稍候';
           // LogService.warn('index', `无法进入游戏记录: ${reason}`);
            alert(reason);
            return;
        }
        SceneLoader.getInstance().loadScene('record');
    }

    onBuyCardButtonClick() {
        const userInfoManager = UserInfoManager.getInstance();
        if (!userInfoManager.canAccessFeatures()) {
            const reason = !userInfoManager.isLoggedIn() ? '请先连接钱包并登录' : 'WebSocket连接中，请稍候';
           // LogService.warn('index', `无法进入购买房卡: ${reason}`);
            alert(reason);
            return;
        }
        SceneLoader.getInstance().loadScene('card');
    }

    onMeButtonClick() {
        const userInfoManager = UserInfoManager.getInstance();
        if (!userInfoManager.canAccessFeatures()) {
            const reason = !userInfoManager.isLoggedIn() ? '请先连接钱包并登录' : 'WebSocket连接中，请稍候';
           // LogService.warn('index', `无法进入个人中心: ${reason}`);
            alert(reason);
            return;
        }
        SceneLoader.getInstance().loadScene('me');
    }
}