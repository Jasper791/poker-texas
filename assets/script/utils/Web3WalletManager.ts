import { LogService } from './LogService';

export enum WalletProviderType {
    NONE = 'none',
    METAMASK = 'metamask',
    APP_INJECTED = 'app_injected',
    UNKNOWN = 'unknown'
}

export class Web3WalletManager {
    private static _instance: Web3WalletManager = null;
    private _isConnected: boolean = false;
    private _walletAddress: string = '';
    private _currentNonce: string = '';
    private _currentChallenge: string = '';
    private _providerType: WalletProviderType = WalletProviderType.NONE;

    public static getInstance(): Web3WalletManager {
        if (Web3WalletManager._instance === null) {
            Web3WalletManager._instance = new Web3WalletManager();
        }
        return Web3WalletManager._instance;
    }

    constructor() {
        this._loadWalletFromStorage();
    }

    /**
     * 获取当前钱包提供者类型
     */
    public getProviderType(): WalletProviderType {
        return this._providerType;
    }

    /**
     * 从本地存储加载钱包地址
     */
    private _loadWalletFromStorage(): void {
        const STORAGE_KEY = 'richman_wallet_address';
        try {
            if (typeof localStorage !== 'undefined') {
                const savedAddress = localStorage.getItem(STORAGE_KEY);
                if (savedAddress && savedAddress.startsWith('0x')) {
                    this._walletAddress = savedAddress;
                    this._isConnected = true;
                }
            }
        } catch (e) {
        }
    }

    /**
     * 保存钱包地址到本地存储
     */
    private _saveWalletToStorage(address: string): void {
        const STORAGE_KEY = 'richman_wallet_address';
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, address);
            }
        } catch (e) {
        }
    }

    /**
     * 检查是否存在 App 注入的钱包 SDK
     */
    private _hasAppWallet(): boolean {
        // @ts-ignore - 检查 App 是否注入了钱包 API
        return typeof window !== 'undefined' && typeof window.richmanWallet !== 'undefined';
    }

    /**
     * 将字符串转换为十六进制（兼容浏览器环境，不使用 Buffer）
     */
    private _stringToHex(str: string): string {
        let hex = '';
        for (let i = 0; i < str.length; i++) {
            hex += str.charCodeAt(i).toString(16).padStart(2, '0');
        }
        return '0x' + hex;
    }

    /**
     * 获取 App 钱包实例
     */
    private _getAppWallet(): any {
        // @ts-ignore
        return window.richmanWallet;
    }

    /**
     * 检测钱包提供者类型
     */
    public detectProvider(): WalletProviderType {
        if (typeof window === 'undefined') {
            return WalletProviderType.NONE;
        }

        // 检查 App 注入的钱包
        if (this._hasAppWallet()) {
            return WalletProviderType.APP_INJECTED;
        }

        // 检查 MetaMask
        // @ts-ignore
        if (typeof window.ethereum !== 'undefined') {
            // @ts-ignore
            if (window.ethereum.isMetaMask) {
                return WalletProviderType.METAMASK;
            }
            return WalletProviderType.APP_INJECTED; // 可能是 App 注入的标准 API
        }

        return WalletProviderType.NONE;
    }

    /**
     * 检查钱包是否可用（支持多种提供者）
     */
    public isWalletAvailable(): boolean {
        return this.detectProvider() !== WalletProviderType.NONE;
    }
    
    /**
     * 检查钱包 provider 是否准备就绪
     */
    public async isProviderReady(): Promise<boolean> {
        const providerType = this.detectProvider();
        
        if (providerType === WalletProviderType.NONE) {
            return false;
        }

        // App 注入的钱包，假设注入了就可用
        if (providerType === WalletProviderType.APP_INJECTED) {
            return true;
        }

        // MetaMask 需要检查
        if (providerType === WalletProviderType.METAMASK) {
            try {
                // @ts-ignore
                const ready = await window.ethereum.request({ method: 'eth_chainId' });
                const result = ready !== undefined && ready !== null;
                return result;
            } catch (error) {
                return false;
            }
        }

        return false;
    }

    /**
     * 连接钱包
     * @returns Promise<string> 钱包地址
     * @throws Error 钱包不可用或连接失败时抛出异常
     */
    public async connectWallet(): Promise<string> {
        // ✅ [修复] 移除 Promise 包装，使用纯 async/await 模式避免 this 上下文丢失
        
        // 检查是否已连接
        if (this._isConnected && this._walletAddress) {
            return this._walletAddress;
        }

        // 检测钱包提供者
        const providerType = this.detectProvider();

        // ✅ [修复] 移除 provider ready 检查
        // 移动端 WebView 中钱包需要用户交互才能激活
        // 连接操作本身会触发钱包授权流程（包括弹出密码输入框）

        try {
            let address: string;

            // 根据不同的钱包提供者进行连接
            if (providerType === WalletProviderType.APP_INJECTED && this._hasAppWallet()) {
                // 使用 App 注入的钱包 SDK (window.richmanWallet)
                const appWallet = this._getAppWallet();
                
                if (typeof appWallet.connect === 'function') {
                    address = await appWallet.connect();
                } else if (typeof appWallet.request === 'function') {
                    const accounts = await appWallet.request({ method: 'eth_requestAccounts' });
                    address = accounts && accounts.length > 0 ? accounts[0] : '';
                } else {
                    throw new Error('App wallet API not supported - missing connect or request method');
                }
            } else {
                // 使用标准 ethereum API (MetaMask 或 App 注入的标准 API)
                // @ts-ignore
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                address = accounts && accounts.length > 0 ? accounts[0] : '';
            }

            if (!address || !address.startsWith('0x')) {
                const error = new Error('未获取到有效的钱包地址');
                LogService.error('Web3WalletManager', '❌ 未获取到有效的钱包地址');
                LogService.error('Web3WalletManager', '   - 获取到的地址:', address || 'null');
                throw error;
            }

            this._providerType = providerType;
            this._setConnected(address);
            return address;

        } catch (error) {
            LogService.error('Web3WalletManager', '❌ 连接钱包失败');
            LogService.error('Web3WalletManager', '   - 错误:', error.message || error);
            throw error;
        }
    }

    /**
     * 断开钱包连接
     */
    public disconnectWallet(): void {
        this._isConnected = false;
        this._walletAddress = '';
        this._currentNonce = '';
        this._currentChallenge = '';
        
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('richman_wallet_address');
            }
        } catch (e) {
        }
    }

    /**
     * 获取钱包地址
     */
    public getWalletAddress(): string {
        return this._walletAddress;
    }

    /**
     * 检查是否已连接
     */
    public isConnected(): boolean {
        return this._isConnected;
    }

    /**
     * 获取登录挑战
     * @returns Promise<{challenge: string, nonce: string}>
     */
    public async getLoginChallenge(): Promise<{challenge: string, nonce: string}> {
        return new Promise((resolve, reject) => {
            if (!this._walletAddress) {
                reject(new Error('钱包未连接'));
                return;
            }

            // 生成随机 nonce
            const nonce = this._generateNonce();
            const challenge = this._formatChallenge(nonce);
            
            this._currentNonce = nonce;
            this._currentChallenge = challenge;
            resolve({ challenge, nonce });
        });
    }

    /**
     * ✅ [修复] 对挑战进行签名（移除 provider ready 检查，让签名操作触发钱包授权）
     * 在移动端 WebView 中，provider 需要用户交互才能激活
     * 签名操作本身会触发钱包弹出密码输入框，不需要预先检查 provider ready
     * @param challenge 挑战内容
     * @returns Promise<string> 签名结果
     * @throws Error 签名失败时抛出异常
     */
    public async signChallenge(challenge: string): Promise<string> {
        // ✅ [修复] 移除 Promise 包装，使用纯 async/await 模式避免 this 上下文丢失
        if (!this._walletAddress) {
            const error = new Error('钱包未连接');
            LogService.error('Web3WalletManager', '❌ 签名失败：钱包未连接');
            throw error;
        }

        // ✅ [修复] 移除 provider ready 检查
        // 移动端 WebView 中钱包需要用户交互才能激活
        // 签名操作本身会触发钱包授权流程（包括弹出密码输入框）

        try {
            let signature: string;
            const providerType = this._providerType || this.detectProvider();
            // @ts-ignore
            const ethereum = (window as any).ethereum;
            // @ts-ignore
            const richmanWallet = (window as any).richmanWallet;

            LogService.info('Web3WalletManager', '=== 开始签名 ===');
            LogService.info('Web3WalletManager', '🔑 挑战内容:', challenge);
            LogService.info('Web3WalletManager', '🔑 钱包地址:', this._walletAddress);
            LogService.info('Web3WalletManager', '🔑 提供者类型:', providerType);
            LogService.info('Web3WalletManager', '🔑 window.ethereum 存在:', typeof ethereum !== 'undefined');
            LogService.info('Web3WalletManager', '🔑 window.richmanWallet 存在:', typeof richmanWallet !== 'undefined');

            // ✅ [修复] 当 providerType 为 NONE 但 ethereum 存在时，仍然尝试签名
            // 移动端可能存在 provider 延迟注入的情况
            const hasEthereumProvider = ethereum && typeof ethereum.request === 'function';
            const hasAppWallet = typeof richmanWallet !== 'undefined';

            // 根据不同的钱包提供者进行签名
            if (hasAppWallet && (providerType === WalletProviderType.APP_INJECTED || !hasEthereumProvider)) {
                // 使用 App 注入的钱包 SDK
                
                // ✅ 添加重试机制处理 provider not ready (4100) 错误
                signature = await this._retryWithBackoff(async () => {
                    return await this._trySignWithAppWallet(richmanWallet, challenge);
                }, 3, 1000);
            } else if (hasEthereumProvider) {
                // 使用标准 ethereum API (MetaMask 或 App 注入的标准 API)
                
                // ✅ 添加重试机制处理 provider not ready (4100) 错误
                signature = await this._retryWithBackoff(async () => {
                    return await this._trySignWithEthereumAPI(challenge);
                }, 3, 1000);
            } else {
                throw new Error('未检测到可用的钱包提供者');
            }

            if (!signature || signature.length < 66) {
                const error = new Error('签名无效');
                LogService.error('Web3WalletManager', '❌ 签名无效');
                LogService.error('Web3WalletManager', '   - 签名长度:', signature ? signature.length : 0);
                LogService.error('Web3WalletManager', '   - 签名内容:', signature || 'null');
                throw error;
            }
            LogService.info('Web3WalletManager', '✍️ 签名长度:', signature.length);
            LogService.info('Web3WalletManager', '✍️ 签名预览:', signature.substring(0, 20) + '...');
            return signature;

        } catch (error) {
            LogService.error('Web3WalletManager', '❌ 签名失败');
            LogService.error('Web3WalletManager', '   - 错误:', error.message || error);
            throw error;
        }
    }

    /**
     * 执行完整的登录签名流程
     * @returns Promise<{walletAddress: string, nonce: string, signature: string, challenge: string}>
     */
    public async performLoginSignature(): Promise<{
        walletAddress: string;
        nonce: string;
        signature: string;
        challenge: string;
    }> {
        // 1. 连接钱包
        await this.connectWallet();
        
        // 2. 获取挑战
        const { challenge, nonce } = await this.getLoginChallenge();
        
        // 3. 签名挑战
        const signature = await this.signChallenge(challenge);
        
        // 4. 返回签名结果
        return {
            walletAddress: this._walletAddress,
            nonce,
            signature,
            challenge
        };
    }

    /**
     * 设置连接状态
     */
    private _setConnected(address: string): void {
        this._isConnected = true;
        this._walletAddress = address;
        this._saveWalletToStorage(address);
    }

    /**
     * 生成随机 nonce
     */
    private _generateNonce(): string {
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 10);
        return timestamp + '-' + random;
    }

    /**
     * 格式化挑战字符串
     */
    private _formatChallenge(nonce: string): string {
        return `Richman Poker Login - ${nonce}`;
    }

    /**
     * 监听钱包账户变化（MetaMask）
     * @param callback 回调函数
     */
    public onAccountsChanged(callback: (accounts: string[]) => void): void {
        if (this.isWalletInstalled()) {
            // @ts-ignore
            window.ethereum.on('accountsChanged', callback);
        }
    }

    /**
     * 监听网络变化（MetaMask）
     * @param callback 回调函数
     */
    public onChainChanged(callback: (chainId: string) => void): void {
        if (this.isWalletInstalled()) {
            // @ts-ignore
            window.ethereum.on('chainChanged', callback);
        }
    }

    /**
     * 尝试使用 App 钱包进行签名（支持多种 API）
     * 参考版本逻辑：优先使用 eth_sign（十六进制消息），再尝试 personal_sign（原始字符串）
     * @param appWallet App 注入的钱包对象
     * @param challenge 挑战内容
     * @returns Promise<string> 签名结果
     */
    private async _trySignWithAppWallet(appWallet: any, challenge: string): Promise<string> {
        const hexMessage = this._stringToHex(challenge);

        const methods = [
            // 方法1: request({method: personal_sign}) - 原始字符串（优先使用，兼容性最好）
            async () => {
                if (typeof appWallet.request === 'function') {
                    const signature = await appWallet.request({
                        method: 'personal_sign',
                        params: [challenge, this._walletAddress]
                    });
                    return signature;
                }
                throw new Error('request personal_sign not available');
            },
            // 方法2: signMessage(challenge, address) - 原始字符串
            async () => {
                if (typeof appWallet.signMessage === 'function') {
                    const signature = await appWallet.signMessage(challenge, this._walletAddress);
                    return signature;
                }
                throw new Error('signMessage not available');
            },
            // 方法3: sign(challenge, address) - 原始字符串
            async () => {
                if (typeof appWallet.sign === 'function') {
                    const signature = await appWallet.sign(challenge, this._walletAddress);
                    return signature;
                }
                throw new Error('sign not available');
            },
            // 方法4: request({method: eth_sign}) - 传递十六进制消息
            async () => {
                if (typeof appWallet.request === 'function') {
                    const signature = await appWallet.request({
                        method: 'eth_sign',
                        params: [this._walletAddress, hexMessage]
                    });
                    return signature;
                }
                throw new Error('request eth_sign not available');
            },
            // 方法5: signMessage(hexMessage) - 十六进制消息
            async () => {
                if (typeof appWallet.signMessage === 'function') {
                    const signature = await appWallet.signMessage(hexMessage, this._walletAddress);
                    return signature;
                }
                throw new Error('signMessage hex not available');
            },
            // 方法6: eth_signTypedData_v4 (EIP-712)
            async () => {
                if (typeof appWallet.request === 'function') {
                    const typedData = {
                        types: {
                            EIP712Domain: [],
                            Message: [{ name: 'message', type: 'string' }]
                        },
                        domain: {},
                        primaryType: 'Message',
                        message: { message: challenge }
                    };
                    const signature = await appWallet.request({
                        method: 'eth_signTypedData_v4',
                        params: [this._walletAddress, JSON.stringify(typedData)]
                    });
                    return signature;
                }
                throw new Error('request eth_signTypedData_v4 not available');
            }
        ];

        let lastError: any = null;
        for (let i = 0; i < methods.length; i++) {
            try {
                const result = await methods[i]();
                if (result && result.length >= 66) {
                    return result;
                }
            } catch (error: any) {
                lastError = error;
            }
        }

        // ✅ 输出最终错误摘要
        LogService.error('Web3WalletManager', '❌ App 钱包所有签名方法均失败:');
        LogService.error('Web3WalletManager', `   - 最后错误消息: ${lastError?.message || 'Unknown error'}`);
        LogService.error('Web3WalletManager', `   - 最后错误代码: ${lastError?.code || 'N/A'}`);
        LogService.error('Web3WalletManager', `   - 挑战内容: ${challenge}`);
        LogService.error('Web3WalletManager', `   - 钱包地址: ${this._walletAddress}`);
        
        throw new Error(`所有签名方法均失败: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * 尝试使用标准 Ethereum API 进行签名（支持多种 API）
     * 参考版本逻辑：先尝试 eth_sign(十六进制), 再尝试 personal_sign(原始字符串)
     * @param challenge 挑战内容
     * @returns Promise<string> 签名结果
     */
    private async _trySignWithEthereumAPI(challenge: string): Promise<string> {
        // @ts-ignore
        const ethereum = window.ethereum;
        if (!ethereum || typeof ethereum.request !== 'function') {
            throw new Error('Ethereum provider not available');
        }

        const hexMessage = this._stringToHex(challenge);

        const methods = [
            // 方法1: personal_sign - MetaMask 默认，传递原始字符串（优先使用，兼容性最好）
            async () => {
                const signature = await ethereum.request({
                    method: 'personal_sign',
                    params: [challenge, this._walletAddress]
                });
                return signature;
            },
            // 方法2: eth_sign - 传递十六进制消息
            async () => {
                const signature = await ethereum.request({
                    method: 'eth_sign',
                    params: [this._walletAddress, hexMessage]
                });
                return signature;
            },
            // 方法3: eth_signTypedData_v4 (EIP-712)
            async () => {
                const typedData = {
                    types: {
                        EIP712Domain: [],
                        Message: [{ name: 'message', type: 'string' }]
                    },
                    domain: {},
                    primaryType: 'Message',
                    message: { message: challenge }
                };
                const signature = await ethereum.request({
                    method: 'eth_signTypedData_v4',
                    params: [this._walletAddress, JSON.stringify(typedData)]
                });
                return signature;
            }
        ];

        let lastError: any = null;
        for (let i = 0; i < methods.length; i++) {
            try {
                const result = await methods[i]();
                if (result && result.length >= 66) {
                    return result;
                }
            } catch (error: any) {
                lastError = error;
            }
        }

        // ✅ 输出最终错误摘要
        LogService.error('Web3WalletManager', '❌ 所有签名方法均失败:');
        LogService.error('Web3WalletManager', `   - 最后错误消息: ${lastError?.message || 'Unknown error'}`);
        LogService.error('Web3WalletManager', `   - 最后错误代码: ${lastError?.code || 'N/A'}`);
        LogService.error('Web3WalletManager', `   - 挑战内容: ${challenge}`);
        LogService.error('Web3WalletManager', `   - 钱包地址: ${this._walletAddress}`);
        
        throw new Error(`所有签名方法均失败: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * ✅ [新增] 带指数退避的重试机制
     * 处理 provider not ready (4100) 错误，等待钱包初始化完成
     * @param fn 要执行的异步函数
     * @param maxRetries 最大重试次数
     * @param baseDelay 基础延迟时间(ms)
     * @returns Promise<T> 函数执行结果
     */
    private async _retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number, baseDelay: number): Promise<T> {
        let lastError: any = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await fn();
                return result;
            } catch (error: any) {
                lastError = error;
                
                // ✅ [修复] 多种方式提取错误代码，适配不同钱包 SDK
                const errorCode = error.code || 
                                 (error.data && error.data.code) || 
                                 (error.message && typeof error.message.includes === 'function' && error.message.includes('4100') ? 4100 : null) ||
                                 null;
                
                // 只有 provider not ready (4100) 错误才重试
                if (errorCode !== 4100) {
                    throw error;
                }
                
                // 4100 错误：provider not ready，等待后重试
                
                // 如果不是最后一次尝试，等待后重试
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
                }
            }
        }
        
        // 所有重试都失败了
        LogService.error('Web3WalletManager', `❌ 重试 ${maxRetries} 次后仍然失败`);
        throw lastError || new Error('重试失败');
    }
}
