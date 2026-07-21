import { _decorator, Component, Node, ScrollView, director, EditBox, Label, Toggle, Button, UITransform, Sprite, SpriteFrame, resources, sys, Prefab, instantiate, Color } from 'cc';
const { ccclass, property } = _decorator;

import { LogService } from './utils/LogService';
import { GameNetwork } from './net/GameNetwork';
import { CommandType } from './net/Protocol';
import { Web3WalletManager } from './utils/Web3WalletManager';
import { ToastManager } from './components/Toast/ToastManager';
import { LoadingManager } from './components/Loading/LoadingManager';
import { DialogManager } from './components/Dialog/dialogManager';
import { depositItem} from '../Prefabs/deposit-item';
import { SceneLoader } from './managers/SceneLoader';

// ✅ 使用 UMD 版本避免 Buffer 未定义问题（直接从 CDN 加载）
let ethers: any = null;

// ✅ 原生代币地址（与 Vue 前端保持一致）
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

async function ensureEthersLoaded(): Promise<any> {
    if (ethers) return ethers;

    if ((window as any).ethers) {
        ethers = (window as any).ethers;
        return ethers;
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js';
        script.onload = () => {
            ethers = (window as any).ethers;
            resolve(ethers);
        };
        script.onerror = () => reject(new Error('ethers.js 加载失败'));
        document.head.appendChild(script);
    });
}

/**
 * 代币配置信息接口
 */
interface TokenConfig {
    tokenAddress: string;
    symbol: string;
    decimals: number;
    roomcardPerToken: string;
    minRoomCards: string;
    maxRoomCards: string;
    chainId: string;
    chainName: string;
    chainSymbol?: string; // ✅ 新增链原生代币符号
    contractAddress: string;
    isActive: boolean;
    rpcUrl?: string; // ✅ 新增 RPC URL 字段
}

@ccclass('card')
export class card extends Component {
    @property(Node)
    returnBtn: Node = null;

    // UI 组件
    @property(EditBox)
    cardValue: EditBox = null;

    // ✅ tokenType 是 ToggleGroup 容器节点，用于动态生成代币类型单选框
    @property({ type: Node, tooltip: '代币类型 ToggleGroup 容器节点' })
    tokenType: Node = null;

    // ✅ 面板切换相关属性
    @property({ type: Node, tooltip: '详情按钮' })
    detailBtn: Node = null;

    @property({ type: Node, tooltip: '其他按钮' })
    otherBtn: Node = null;

    @property({ type: Node, tooltip: '详情面板' })
    detailPanel: Node = null;

    @property({ type: Node, tooltip: '其他面板' })
    otherPanel: Node = null;

    @property({ type: Node, tooltip: '标题节点' })
    cardTitle: Node = null;

    // ✅ 链上充值记录（t_chain_deposit）相关属性
    @property({ type: ScrollView, tooltip: '其他面板的 ScrollView（用于显示链上充值记录）' })
    depositScrollView: ScrollView = null;

    @property({ type: Node, tooltip: '充值记录 ScrollView 的 content 节点' })
    depositContentNode: Node = null;

    @property({ type: Prefab, tooltip: '充值记录项预制体（deposit_item）' })
    depositItemPrefab: Prefab = null;

    @property(Label)
    symbolValue: Label = null;

    @property(Label)
    rateValue: Label = null;

    @property(Label)
    maxValue: Label = null;

    @property(Label)
    minValue: Label = null;

    @property(Label)
    chainNameValue: Label = null;

    @property(Label)
    chainIdValue: Label = null;

    @property(Label)
    statusLabel: Label = null;

    @property(Button)
    buyCardBtn: Button = null;

    // 数据
    private tokenConfigs: TokenConfig[] = [];
    private selectedTokenConfig: TokenConfig = null;

    start() {
        if (this.returnBtn) {
            this.returnBtn.on('click', this.onReturnBtnClick, this);
        }

        if (this.buyCardBtn) {
            this.buyCardBtn.node.on('click', this.onBuyCardBtnClick, this);
        }

        // ✅ 绑定面板切换按钮
        if (this.detailBtn) {
            this.detailBtn.on('click', this.onDetailBtnClick, this);
        }
        if (this.otherBtn) {
            this.otherBtn.on('click', this.onOtherBtnClick, this);
        }

        // ✅ 初始化：显示详情面板，隐藏其他面板
        this.showDetailPanel();

        // ✅ 自动查找充值记录 ScrollView 相关节点
        this.autoFindDepositContentNode();

        // ✅ 设置充值记录 ScrollView 白色背景
        this.setDepositScrollViewWhiteBackground();

        // ✅ 注册 WebSocket 消息监听器（充值记录响应）
        this.registerMessageListener();

        const gameNetwork = GameNetwork.getInstance();

        if (!gameNetwork.isConnected() || !gameNetwork.getWalletAddress()) {
            LogService.warn('card', 'WebSocket 未连接或未登录');
            LogService.warn('card', '即将返回 index 场景，请先连接钱包');

            this.scheduleOnce(() => {
                SceneLoader.getInstance().loadScene('index');
            }, 0.5);
            return;
        }

        // 初始化输入框限制
        this.initInputRestrictions();

        // 请求获取代币配置
        this.requestTokenConfig();
    }

    /**
     * 初始化输入框限制
     */
    private initInputRestrictions() {
        if (this.cardValue) {
            // 只允许输入数字
            this.cardValue.inputMode = 2; // NUMERIC

            // 添加输入验证
            this.cardValue.node.on('editing-did-begin', () => {
                LogService.debug('card', '开始输入房卡数量');
            });

            this.cardValue.node.on('text-changed', () => {
                this.validateCardInput();
            });

            this.cardValue.node.on('editing-did-end', () => {
                this.validateCardInput();
            });
        }
    }

    /**
     * 验证房卡输入
     */
    private validateCardInput() {
        if (!this.cardValue || !this.selectedTokenConfig) {
            return;
        }

        let input = this.cardValue.string;

        // 移除非数字字符
        input = input.replace(/[^\d]/g, '');
        this.cardValue.string = input;

        if (!input || input === '') {
            return;
        }

        const inputValue = parseInt(input);
        const min = parseFloat(this.selectedTokenConfig.minRoomCards);
        const max = parseFloat(this.selectedTokenConfig.maxRoomCards);

        // 限制输入范围
        if (inputValue < min) {
            this.cardValue.string = min.toString();
            LogService.warn('card', `输入数量不能小于最小值 ${min}`);
        } else if (inputValue > max) {
            this.cardValue.string = max.toString();
            LogService.warn('card', `输入数量不能大于最大值 ${max}`);
        }
    }

    /**
     * 请求代币配置
     */
    async requestTokenConfig() {
        LogService.info('card', '已发送获取代币配置请求');

        const gameNetwork = GameNetwork.getInstance();
        // ✅ 使用正确的命令类型 GET_ROOMCARD_TOKEN_CONFIG = 304
        const response = await gameNetwork.sendCommand({
            cmd: CommandType.GET_ROOMCARD_TOKEN_CONFIG,
            data: {}
        });

        LogService.info('card', '获取代币配置响应:', response);

        // ✅ 处理响应数据格式（可能是数组或对象）
        let responseData = response;
        if (Array.isArray(response) && response.length > 0) {
            responseData = response[0];
        }

        if (responseData && responseData.configs && Array.isArray(responseData.configs)) {
            this.tokenConfigs = responseData.configs;
            LogService.info('card', `获取到 ${this.tokenConfigs.length} 个代币配置`);

            // 更新 UI
            this.populateTokenTypeOptions();

            // 默认选中第一个
            if (this.tokenConfigs.length > 0) {
                this.onTokenTypeChanged(this.tokenConfigs[0]);
            }
        } else {
            LogService.error('card', '获取代币配置失败：响应数据格式不正确');
        }
    }

    // ✅ 新增属性：代币 Toggle 预制体
    @property({ type: Prefab, tooltip: '代币类型 Toggle 预制体' })
    tokenTogglePrefab: Prefab = null;

    /**
     * 动态生成代币类型单选框
     */
    private populateTokenTypeOptions() {
        if (!this.tokenConfigs || this.tokenConfigs.length === 0) {
            LogService.warn('card', '没有可用的代币配置');
            return;
        }

        if (!this.tokenType) {
            LogService.error('card', 'tokenType 容器节点未绑定');
            return;
        }

        if (!this.tokenTogglePrefab) {
            LogService.error('card', 'tokenTogglePrefab 预制体未绑定');
            return;
        }

        LogService.info('card', `开始动态渲染代币类型选项，配置数量：${this.tokenConfigs.length}`);

        // 清空所有子节点
        const children = this.tokenType.children.slice();
        for (const child of children) {
            child.destroy();
        }

        const self = this;
        this.tokenConfigs.forEach((config, index) => {
            // 实例化预制体
            const toggleNode = instantiate(this.tokenTogglePrefab);
            toggleNode.name = `TokenToggle_${index}`;
            toggleNode.setParent(this.tokenType);

            // 设置位置（水平排列）
            toggleNode.setPosition((index - (this.tokenConfigs.length - 1) / 2) * 150, 0);

            // 更新 Label 内容
            const labelNode = toggleNode.getChildByName('Label');
            if (labelNode) {
                const label = labelNode.getComponent(Label);
                if (label) {
                    label.string = config.symbol;
                }
            }

            const toggle = toggleNode.getComponent(Toggle);
            if (toggle) {
                toggle.isChecked = index === 0;
            }

            // 绑定点击事件
            toggleNode.off('toggle');
            toggleNode.on('toggle', function (event: any) {
                const t = (event.target as Node).getComponent(Toggle);
                if (t && t.isChecked) {
                    self.onTokenTypeChanged(config);
                }
            });

            // 设置第一个为默认选中
            if (index === 0) {
                this.onTokenTypeChanged(config);
            }

            LogService.info('card', `创建代币 Toggle: ${config.symbol}`);
        });

        LogService.info('card', '代币类型选项动态渲染完成');
    }

    /**
     * 代币类型选择改变
     */
    private onTokenTypeChanged(config: TokenConfig) {
        this.selectedTokenConfig = config;

        // 更新 UI
        if (this.symbolValue) {
            this.symbolValue.string = config.symbol;
        }

        if (this.rateValue) {
            this.rateValue.string = config.roomcardPerToken;
        }

        if (this.maxValue) {
            this.maxValue.string = this.formatNumber(config.maxRoomCards);
        }

        if (this.minValue) {
            this.minValue.string = this.formatNumber(config.minRoomCards);
        }

        if (this.chainNameValue) {
            this.chainNameValue.string = config.chainName;
        }

        if (this.chainIdValue) {
            this.chainIdValue.string = config.chainId;
        }

        // ✅ 输入框是用户输入的，不需要自动赋值，只需要验证现有输入
        if (this.cardValue && this.cardValue.string) {
            this.validateCardInput();
        }

        LogService.info('card', `选择代币：${config.symbol}, 链：${config.chainName}`);
    }

    /**
     * 购买房卡按钮点击
     */
    async onBuyCardBtnClick() {
        // ⭐先加载
        await ensureEthersLoaded();
        if (!this.selectedTokenConfig || !this.cardValue) {
            DialogManager.show({
                title: '提示',
                content: '请选择代币类型并输入购买数量？',
                confirmText: '确定',
            });

            // ToastManager.show('请选择代币类型并输入购买数量')
            LogService.warn('card', '请选择代币类型并输入购买数量');
            return;
        }

        const buyCount = parseInt(this.cardValue.string);
        if (!buyCount || buyCount <= 0) {
            // ToastManager.show('请输入有效的购买数量')

            DialogManager.show({
                title: '提示',
                content: '请输入有效的购买数量？',
                confirmText: '确定',
            });

            LogService.warn('card', '请输入有效的购买数量');
            return;
        }

        const min = parseFloat(this.selectedTokenConfig.minRoomCards);
        const max = parseFloat(this.selectedTokenConfig.maxRoomCards);

        if (buyCount < min || buyCount > max) {
            // ToastManager.show(`购买数量必须在 ${min} - ${max} 之间`)

            DialogManager.show({
                title: '提示',
                content: `购买数量必须在 ${min} - ${max} 之间`,
                confirmText: '确定',
            });

            LogService.warn('card', `购买数量必须在 ${min} - ${max} 之间`);
            return;
        }

        const decimals = this.selectedTokenConfig.decimals;
        const roomcardPerToken = parseFloat(this.selectedTokenConfig.roomcardPerToken) || 1;

        // 实际需要支付多少 Token
        const displayAmount = buyCount * roomcardPerToken;


        // 转换为链上最小单位
        const tokenAmount = ethers.utils.parseUnits(
            displayAmount.toString(),
            decimals
        );
        const valid = await this.checkeTokenBalance(tokenAmount)
        if (!valid) {
            ToastManager.show('代币余额不足')
            return
        }
        LoadingManager.show()

        // 调用合约购买房卡
        this.callBuyRoomCardContract(buyCount);
    }

    /**
     * 调用合约购买房卡（完整流程：授权 + 购买）
     * 合约方法：purchaseRoomCards(address _token, uint256 _tokenAmount)
     */
    private async callBuyRoomCardContract(buyCount: number) {
        if (!this.selectedTokenConfig) {
            LogService.error('card', '未选择代币配置');
            return;
        }

        // ✅ 检查平台
        if (!sys.isBrowser) {
            LogService.error('card', '当前仅支持Web平台');
            return;
        }

        // ✅ 检查 MetaMask
        if (!(window as any).ethereum) {
            LogService.error('card', '未检测到MetaMask钱包，请先安装');
            return;
        }

        const contractAddress = this.selectedTokenConfig.contractAddress;
        const tokenAddress = this.selectedTokenConfig.tokenAddress;
        const decimals = this.selectedTokenConfig.decimals;
        const chainId = this.selectedTokenConfig.chainId;

        try {
            // ✅ 确保 ethers.js 已加载（UMD 版本避免 Buffer 问题）
            await ensureEthersLoaded();

            // ✅ 创建 provider 和 signer
            const provider = new ethers.providers.Web3Provider((window as any).ethereum);
            const signer = provider.getSigner();
            const walletAddress = await signer.getAddress();

            LogService.info('card', `钱包地址：${walletAddress}`);

            // ✅ 切换到正确的网络
            await this.switchToChain(chainId);

            // ✅ 切换链后重新创建 provider（关键修复）
            // MetaMask 切换链后，原有的 provider 对象不会自动更新
            // 必须重新创建 provider 才能在新链上正确调用合约
            const newProvider = new ethers.providers.Web3Provider((window as any).ethereum);
            const newSigner = newProvider.getSigner();
            const newWalletAddress = await newSigner.getAddress();

            LogService.info('card', `切换链后重新创建provider，钱包地址：${newWalletAddress}`);

            // ✅ 计算代币数量
            // roomcardPerToken 表示 1 个代币可以兑换多少房卡
            const roomCardPerToken = parseFloat(this.selectedTokenConfig.roomcardPerToken) || 1;

            // tokensPerRoomCard 表示兑换 1 张房卡需要多少代币
            const tokensPerRoomCard = roomCardPerToken > 0 ? roomCardPerToken : 1;

            // 计算需要的代币数量（房卡数量 × 每张房卡需要的代币数）
            const totalTokens = (buyCount * tokensPerRoomCard).toString();

            // 使用 parseUnits 转换为带小数的代币数量（以 wei 为单位）
            const tokenAmount = ethers.utils.parseUnits(totalTokens, decimals);

            LogService.info('card', `========== 开始兑换房卡流程 ==========`);
            LogService.info('card', `调用合约购买房卡:`);
            LogService.info('card', `  - 合约地址：${contractAddress}`);
            LogService.info('card', `  - 代币地址：${tokenAddress}`);
            LogService.info('card', `  - 房卡数量：${buyCount}`);
            LogService.info('card', `  - 兑换比例：${roomCardPerToken} 代币 = 1 房卡`);
            LogService.info('card', `  - 需要代币：${totalTokens} (未转换精度)`);
            LogService.info('card', `  - 代币数量 (wei): ${tokenAmount.toString()}`);
            LogService.info('card', `  - 链 ID: ${chainId}`);

            // ✅ 判断是否为原生代币（AIA）
            const isNativeToken = this.isNativeToken(tokenAddress);

            // ✅ 检查代币配置格式（与 Vue 前端保持一致）
            const contractABI = ['function getTokenInfo(address token) view returns (tuple(uint256 roomCardPerToken, uint256 minRoomCards, uint256 maxRoomCards, bool isActive))'];
            const infoContract = new ethers.Contract(contractAddress, contractABI, newProvider);
            //const tokenInfo = await infoContract.getTokenInfo(tokenAddress);

            // 使用原始计算的代币数量（已通过 parseUnits 转换为 wei）
            const adjustedTokenAmount = ethers.BigNumber.from(tokenAmount.toString());

            if (!isNativeToken) {
                // ✅ ERC20 代币：步骤1 - 检查代币授权（使用调整后的数量）
                LogService.info('card', '🔷 [步骤 1/2] 检查代币授权...');
                const isApproved = await this.checkTokenAllowance(newSigner, newWalletAddress, tokenAddress, contractAddress, adjustedTokenAmount);

                if (!isApproved) {
                    // ✅ ERC20 代币：步骤2 - 发起代币授权（使用调整后的数量）
                    LogService.info('card', '🔷 [步骤 2/2] 当前授权不足，发起代币授权...');
                    await this.approveToken(newSigner, tokenAddress, contractAddress, adjustedTokenAmount);
                    LogService.info('card', '✅ 代币授权成功');
                } else {
                    LogService.info('card', '✅ 当前授权充足，跳过授权步骤');
                }
            } else {
                LogService.info('card', '✅ 原生代币（AIA）无需授权，跳过授权步骤');
            }

            // ✅ 步骤3：发起购买交易（ERC20 使用调整后的数量，原生代币使用原始数量）
            LogService.info('card', '🔷 [步骤 3/3] 发起购买房卡交易...');
            const txHash = await this.executePurchase(newSigner, contractAddress, tokenAddress, isNativeToken ? tokenAmount : adjustedTokenAmount, isNativeToken);

            LogService.info('card', `✅ 交易已发送，哈希：${txHash}`);
            LogService.info('card', `✅ 房卡购买成功！`);
            LogService.info('card', `========== 兑换房卡流程完成 ==========`);

            // ✅ 通知游戏端兑换成功
            this.notifyPurchaseSuccess(buyCount, txHash);

        } catch (error: any) {
            LoadingManager.hide()
            LogService.error('card', `❌ 合约调用失败：${error.message || error}`);

            // ✅ 处理常见错误
            if (error.code === 4001) {
                LogService.error('card', '用户拒绝了交易签名');
            } else if (error.message && error.message.includes('insufficient funds')) {
                LogService.error('card', '账户余额不足');
            } else if (error.code) {
                LogService.error('card', `错误码：${error.code}`);
            }
        } finally {
            LoadingManager.hide()
        }
    }

    /**
     * 判断是否为原生代币（与 Vue 前端保持一致）
     */
    private isNativeToken(tokenAddress: string): boolean {
        return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
    }

    /**
     * 检查代币授权额度
     */
    private async checkTokenAllowance(signer: any, owner: string, tokenAddress: string, spender: string, amount: any): Promise<boolean> {
        try {
            const erc20ABI = ['function allowance(address owner, address spender) view returns (uint256)'];
            const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, signer);

            const allowance = await tokenContract.allowance(owner, spender);
            LogService.info('card', `当前授权额度：${ethers.utils.formatUnits(allowance, 18)}`);

            return allowance.gte(amount);
        } catch (error) {
            LoadingManager.hide()
            LogService.warn('card', `检查授权失败：${error.message || error}`);
            return false;
        }
    }


    /**
 * 检查钱包余额
 * @param needAmount 需要支付的数量（已经是最小单位，例如 wei）
 */
    private async checkeTokenBalance(needAmount: any): Promise<boolean> {
        try {
            if (!this.selectedTokenConfig) {
                LogService.error('card', '未选择代币');
                return false;
            }

            await ensureEthersLoaded();

            const provider = new ethers.providers.Web3Provider((window as any).ethereum);
            const signer = provider.getSigner();
            const walletAddress = await signer.getAddress();

            // ✅ 切换到正确的网络
            // const chainId = this.selectedTokenConfig.chainId;
            // await this.switchToChain(chainId);

            // ✅ 切换链后重新创建 provider（关键修复）
            // MetaMask 切换链后，原有的 provider 对象不会自动更新
            // 必须重新创建 provider 才能在新链上正确查询余额
            const newProvider = new ethers.providers.Web3Provider((window as any).ethereum);
            const newSigner = newProvider.getSigner();
            const newWalletAddress = await newSigner.getAddress();

            LogService.info('card', `切换链后重新创建provider，钱包地址：${newWalletAddress}`);

            const tokenAddress = this.selectedTokenConfig.tokenAddress;
            const decimals = this.selectedTokenConfig.decimals;

            let balance;

            // 是否原生币
            if (this.isNativeToken(tokenAddress)) {

                // ETH / AIA
                balance = await newProvider.getBalance(newWalletAddress);

                LogService.info(
                    'card',
                    `钱包原生币余额：${ethers.utils.formatEther(balance)}`
                );

            } else {

                // ERC20
                const erc20ABI = [
                    'function balanceOf(address owner) view returns (uint256)'
                ];

                const tokenContract = new ethers.Contract(
                    tokenAddress,
                    erc20ABI,
                    newProvider
                );

                balance = await tokenContract.balanceOf(newWalletAddress);

                LogService.info(
                    'card',
                    `钱包${this.selectedTokenConfig.symbol}余额：${ethers.utils.formatUnits(balance, decimals)}`
                );
            }

            // 判断余额是否足够
            if (balance.lt(needAmount)) {

                LogService.warn(
                    'card',
                    `余额不足，需要：${ethers.utils.formatUnits(
                        needAmount,
                        decimals
                    )}，当前：${ethers.utils.formatUnits(balance, decimals)}`
                );

                // if (this.statusLabel) {
                //     ToastManager.show(`余额不足`)
                //     this.statusLabel.string = `余额不足`;
                // }

                return false;
            }

            LogService.info('card', '余额充足');

            return true;

        } catch (error: any) {

            LogService.error(
                'card',
                `检查余额失败：${error.message || error}`
            );

            return false;
        }
    }

    /**
     * 发起代币授权
     */
    private async approveToken(signer: any, tokenAddress: string, spender: string, amount: any): Promise<void> {
        const erc20ABI = ['function approve(address spender, uint256 amount) returns (bool)'];
        const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, signer);

        LogService.info('card', '正在发起代币授权...');
        try {
            const tx = await tokenContract.approve(spender, amount);

            LogService.info('card', `授权交易已发送，哈希：${tx.hash}`);
            LogService.info('card', '等待授权交易确认...');

            const receipt = await tx.wait();

            if (receipt.status === 1) {
                LogService.info('card', `授权交易已确认，区块号：${receipt.blockNumber}`);
            } else {
                LoadingManager.hide()
                throw new Error('授权交易失败');
            }
        } catch (error) {
            LoadingManager.hide()
            LogService.error('card', `代币授权失败：${error.message || error}`);
            throw error;
        }

    }

    /**
     * 执行购买交易
     */
    private async executePurchase(signer: any, contractAddress: string, tokenAddress: string, tokenAmount: any, isNativeToken: boolean = false): Promise<string> {
        const contractABI = [
            'function purchaseRoomCards(address _token, uint256 _tokenAmount) payable'
        ];

        const contract = new ethers.Contract(contractAddress, contractABI, signer);

        LogService.info('card', '正在发起购买交易...');

        // ✅ 设置手动 gas limit，避免 gas 估算失败
        const gasLimit = ethers.BigNumber.from('2000000'); // 200万 gas

        let tx;
        if (isNativeToken) {
            // ✅ 原生代币：使用 payable 方式发送交易，将代币作为 value 传递
            LogService.info('card', '使用原生代币支付方式...');
            tx = await contract.purchaseRoomCards(tokenAddress, tokenAmount, {
                value: tokenAmount,
                gasLimit: gasLimit
            });
        } else {
            // ✅ ERC20 代币：正常调用合约方法
            tx = await contract.purchaseRoomCards(tokenAddress, tokenAmount, {
                gasLimit: gasLimit
            });
        }

        LogService.info('card', `购买交易已发送，哈希：${tx.hash}`);
        LogService.info('card', '等待购买交易确认...');

        const receipt = await tx.wait();

        if (receipt.status === 1) {
            LogService.info('card', `购买交易已确认，区块号：${receipt.blockNumber}`);
            return tx.hash;
        } else {
            throw new Error('购买交易失败');
        }
    }

    /**
     * 通知游戏端兑换成功
     */
    private notifyPurchaseSuccess(buyCount: number, txHash: string) {
        LoadingManager.hide()
        // 显示提示信息给用户
        LogService.info('card', `📢 通知游戏端：兑换成功，房卡数量：${buyCount}，交易哈希：${txHash}`);
        ToastManager.show(`兑换成功！已购买 ${buyCount} 张房卡，稍后发放`)

    }

    /**
     * 切换到指定链
     */
    private async switchToChain(chainId: string) {
        try {
            // ✅ 链 ID 需要带 0x 前缀
            const hexChainId = '0x' + parseInt(chainId).toString(16);

            // @ts-ignore
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: hexChainId }]
            });
            LogService.info('card', `成功切换到链：${chainId} (${hexChainId})`);
        } catch (error: any) {
            // 如果链不存在，尝试添加
            if (error.code === 4902) {
                LogService.warn('card', '链不存在，尝试添加:', error.message);
                const hexChainId = '0x' + parseInt(chainId).toString(16);
                // @ts-ignore
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: hexChainId,
                        chainName: this.selectedTokenConfig?.chainName || 'Unknown',
                        nativeCurrency: {
                            name: this.selectedTokenConfig?.chainSymbol || this.selectedTokenConfig?.chainName || 'Unknown',
                            symbol: this.selectedTokenConfig?.chainSymbol || 'ETH',
                            decimals: 18
                        },
                        rpcUrls: [this.selectedTokenConfig?.rpcUrl],
                        blockExplorerUrls: []
                    }]
                });
                LogService.info('card', '成功添加并切换到链:', chainId);
            } else {
                throw error;
            }
        }
    }

    /**
     * 点击详情按钮
     */
    private onDetailBtnClick() {
        this.showDetailPanel();
    }

    /**
     * 点击其他按钮
     */
    private onOtherBtnClick() {
        this.showOtherPanel();
        // ✅ 切换到其他面板时自动查询链上充值记录（t_chain_deposit）
        this.queryDepositList();
    }

    /**
     * 显示详情面板
     */
    private showDetailPanel() {
        if (this.detailPanel) {
            this.detailPanel.active = true;
        }
        if (this.otherPanel) {
            this.otherPanel.active = false;
        }
        const sprite = this.cardTitle?.getComponent(Sprite);
        if (sprite) {
            resources.load('material/texture/tabs-duihuanfangka/spriteFrame', SpriteFrame, (err, frame) => {
                if (!err && frame && sprite && sprite.node && sprite.node.isValid) {
                    sprite.spriteFrame = frame;
                }
            });
        }
    }

    /**
     * 显示其他面板
     */
    private showOtherPanel() {
        if (this.detailPanel) {
            this.detailPanel.active = false;
        }
        if (this.otherPanel) {
            this.otherPanel.active = true;
        }
        const sprite = this.cardTitle?.getComponent(Sprite);
        if (sprite) {
            resources.load('material/texture/tabs-duihuan-jilu/spriteFrame', SpriteFrame, (err, frame) => {
                if (!err && frame && sprite && sprite.node && sprite.node.isValid) {
                    sprite.spriteFrame = frame;
                }
            });
        }
    }

    onReturnBtnClick() {
        SceneLoader.getInstance().loadScene('index');
    }

    onDestroy() {
        // ✅ 移除 WebSocket 消息监听器
        this.unregisterMessageListener();
    }

    // ==================== ✅ 链上充值记录（t_chain_deposit）相关方法 ====================

    /**
     * 注册 WebSocket 消息监听器
     */
    private registerMessageListener() {
        const gameNetwork = GameNetwork.getInstance();
        gameNetwork.addMessageListener(CommandType.CHAIN_DEPOSIT_LIST_RESPONSE, this.onChainDepositListResponse.bind(this));
        //LogService.info('card', '已注册链上充值记录响应监听器');
    }

    /**
     * 移除 WebSocket 消息监听器
     */
    private unregisterMessageListener() {
        const gameNetwork = GameNetwork.getInstance();
        gameNetwork.removeMessageListener(CommandType.CHAIN_DEPOSIT_LIST_RESPONSE, this.onChainDepositListResponse.bind(this));
        //LogService.info('card', '已移除链上充值记录响应监听器');
    }

    /**
     * ✅ 自动查找 depositContentNode / depositScrollView
     * 在编辑器未手动绑定时，从 otherPanel 节点按路径自动查找
     */
    private autoFindDepositContentNode() {
        if (!this.depositContentNode && this.depositScrollView) {
            this.depositContentNode = this.depositScrollView.content;
            if (this.depositContentNode) {
                //LogService.info('card', '通过 depositScrollView.content 自动找到 depositContentNode');
            }
        }

        if (!this.depositContentNode && this.otherPanel) {
            const scrollViewNode = this.otherPanel.getChildByName('ScrollView');
            if (scrollViewNode) {
                if (!this.depositScrollView) {
                    this.depositScrollView = scrollViewNode.getComponent(ScrollView);
                }
                const view = scrollViewNode.getChildByName('view');
                if (view) {
                    this.depositContentNode = view.getChildByName('content');
                    if (this.depositContentNode) {
                       // LogService.info('card', '通过 otherPanel 节点路径自动找到 depositContentNode');
                    }
                }
            }
        }

        if (!this.depositContentNode) {
           // LogService.warn('card', '未能自动找到 depositContentNode，请在编辑器中绑定');
        }
    }

    /**
     * ✅ 设置 depositScrollView 白色背景
     */
    private setDepositScrollViewWhiteBackground() {
        if (!this.depositScrollView) {
            return;
        }
        const viewNode = this.depositScrollView.node.getChildByName('view');
        if (!viewNode) {
            return;
        }
        let sprite = viewNode.getComponent(Sprite);
        if (!sprite) {
            sprite = viewNode.addComponent(Sprite);
        }
        sprite.color = new Color(255, 255, 255, 255);
    }

    /**
     * 处理链上充值记录列表响应
     */
    private onChainDepositListResponse(data: any) {
       // LogService.info('card', `收到链上充值记录响应: ${JSON.stringify(data)}`);

        // 解析 body（可能是字符串或对象）
        let result = data;
        if (typeof data === 'string') {
            try {
                result = JSON.parse(data);
            } catch (e) {
                //LogService.error('card', `解析充值记录响应数据失败: ${e.message}`);
                return;
            }
        }

        if (result && result.code === 0 && Array.isArray(result.data)) {
           // LogService.info('card', `充值记录数据解析成功，共 ${result.data.length} 条记录`);
            if (result.data.length === 0) {
              //  LogService.info('card', '充值记录为空，可能服务端没有返回数据或该用户没有充值记录');
            }
            this.renderDepositList(result.data);
        } else {
           // LogService.warn('card', `查询充值记录失败: ${result ? (result.message || '未知错误') : '响应为空'}, code=${result ? result.code : 'N/A'}`);
        }
    }

    /**
     * ✅ 通过 WebSocket 查询当前用户的链上充值记录
     * 提交用户 ID 和钱包地址，服务端通过 scanchain 服务查询 t_chain_deposit 表
     */
    private queryDepositList() {
        const gameNetwork = GameNetwork.getInstance();
        const userId = gameNetwork.getUserId();
        const walletAddress = gameNetwork.getWalletAddress() || '';

      //  LogService.info('card', `查询链上充值记录: userId=${userId}, walletAddress=${walletAddress}`);

        if (!userId || !walletAddress) {
            //LogService.warn('card', '用户未登录或未获取到钱包地址，无法查询充值记录');
            return;
        }

        // 通过 WebSocket 发送请求
        gameNetwork.sendMessage(CommandType.GET_CHAIN_DEPOSIT_LIST, {
            userId: userId,
            address: walletAddress,
            page: 1,
            size: 50
        });

       // LogService.info('card', `已发送链上充值记录请求: userId=${userId}, address=${walletAddress}, cmd=GET_CHAIN_DEPOSIT_LIST(${CommandType.GET_CHAIN_DEPOSIT_LIST})`);
    }

    /**
     * ✅ 渲染充值记录列表
     */
    private renderDepositList(records: Array<any>) {
        if (!this.depositContentNode) {
           // LogService.warn('card', 'depositContentNode 未设置，无法渲染充值记录');
            return;
        }

        // 清空现有内容
        this.clearDepositItems();

       // LogService.info('card', `渲染充值记录列表: ${records.length} 条记录`);

        if (records.length === 0) {
            this.updateDepositContentSize();
            return;
        }

        // 由于 resources.load 是异步的，需要等待所有预制体加载完成后再更新高度
        let loadedCount = 0;
        const totalCount = records.length;

        const onItemLoaded = () => {
            loadedCount++;
            if (loadedCount >= totalCount) {
                this.updateDepositContentSize();
                if (this.depositScrollView) {
                    this.depositScrollView.scrollToTop();
                }
               // LogService.info('card', `所有充值记录项加载完成: ${loadedCount}/${totalCount}`);
            }
        };

        records.forEach((record, index) => {
            this.createDepositItem(record, index, onItemLoaded);
        });
    }

    /**
     * ✅ 更新充值记录 ScrollView content 高度
     */
    private updateDepositContentSize() {
        if (!this.depositContentNode || !this.depositScrollView) {
            return;
        }
        const firstChild = this.depositContentNode.children[0];
        if (!firstChild) return;

        const firstChildTransform = firstChild.getComponent(UITransform);
        const itemHeight = firstChildTransform ? firstChildTransform.contentSize.height : 120;
        const itemCount = this.depositContentNode.children.length;
        const spacing = 10;
        const topOffset = 100;

        const totalHeight = itemCount * (itemHeight + spacing) + spacing + topOffset;
        const uiTransform = this.depositContentNode.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(uiTransform.contentSize.width, totalHeight);
        }
       // LogService.info('card', `更新充值记录 content 高度: ${totalHeight}`);
    }

    /**
     * ✅ 清空充值记录项
     */
    private clearDepositItems() {
        if (!this.depositContentNode) return;

        const childrenToDestroy: Node[] = [];
        for (let i = 0; i < this.depositContentNode.children.length; i++) {
            const child = this.depositContentNode.children[i];
            if (child.name.startsWith('depositItem_')) {
                childrenToDestroy.push(child);
            }
        }
        childrenToDestroy.forEach(child => {
            child.destroy();
        });
       // LogService.info('card', `已清空充值记录列表，删除了 ${childrenToDestroy.length} 个动态创建的项`);
    }

    /**
     * ✅ 创建单个充值记录项
     * 优先使用属性绑定的预制体；未绑定时尝试从 content 子节点查找 deposit_item 模板
     */
    private createDepositItem(record: any, index: number, onLoaded?: () => void) {
        if (!this.depositContentNode) {
           // LogService.warn('card', 'depositContent 节点未设置');
            onLoaded?.();
            return;
        }

        if (this.depositItemPrefab) {
            this.createDepositItemWithPrefab(record, index, onLoaded);
            return;
        }

        // 兜底：如果未绑定 prefab，尝试从 content 子节点查找 deposit_item 作为模板
        const templateNode = this.depositContentNode.getChildByName('deposit_item');
        if (templateNode) {
            const itemNode = instantiate(templateNode);
            itemNode.name = `depositItem_${index}`;

            const uiTransform = itemNode.getComponent(UITransform);
            const itemHeight = uiTransform ? uiTransform.contentSize.height : 120;
            const spacing = 10;
            const topOffset = 100;
            const yPosition = -topOffset - (index * (itemHeight + spacing));
            itemNode.setPosition(0, yPosition, 0);

            this.depositContentNode.addChild(itemNode);
            this.updateDepositItemInfo(itemNode, record);
            onLoaded?.();
            return;
        }

       // LogService.warn('card', '没有可用的 deposit_item 预制体或模板节点');
        onLoaded?.();
    }

    /**
     * 使用已绑定的预制体创建充值记录项
     */
    private createDepositItemWithPrefab(record: any, index: number, onLoaded?: () => void) {
        const itemNode = instantiate(this.depositItemPrefab);
        itemNode.name = `depositItem_${index}`;

        const uiTransform = itemNode.getComponent(UITransform);
        const itemHeight = uiTransform ? uiTransform.contentSize.height : 120;
        const spacing = 10;
        const topOffset = 100;
        const yPosition = -topOffset - (index * (itemHeight + spacing));
        itemNode.setPosition(0, yPosition, 0);

        this.depositContentNode.addChild(itemNode);
        
        const depositItemComp = itemNode.getComponent(depositItem);
        if (depositItemComp) {
            depositItemComp.updateContent(record);
        } else {
            this.updateDepositItemInfo(itemNode, record);
        }
        onLoaded?.();
    }

    /**
     * ✅ 更新充值记录项的显示内容
     * 数据库表 t_chain_deposit 字段（关键字段）：
     *   blockNumber, status, amountDisplay, tokenSymbol, tokenAmountDisplay
     * 预制体中带有 Label 后缀的为标题，不需要赋值
     * 不带 Label 后缀的为需要赋值的字段
     */
    private updateDepositItemInfo(itemNode: Node, record: any) {
        const childNames = itemNode.children.map(child => child.name).join(', ');
       // LogService.debug('card', `deposit_item 子节点: ${childNames}`);
       // LogService.debug('card', `充值记录数据: ${JSON.stringify(record)}`);

        const findLabelInNode = (parent: Node, names: string[]): Label | null => {
            if (!parent) return null;
            const selfLabel = parent.getComponent(Label);
            if (selfLabel) return selfLabel;
            for (const name of names) {
                const child = parent.getChildByName(name);
                if (child) {
                    const label = child.getComponent(Label);
                    if (label) return label;
                    const deep = findLabelInNode(child, names);
                    if (deep) return deep;
                }
            }
            return null;
        };

        const blockNode = itemNode.getChildByName('block');
        const blockNumber = record.blockNumber !== undefined ? record.blockNumber : (record.block_number !== undefined ? record.block_number : 0);
        const blockNumberNode = findLabelInNode(blockNode, ['block_number', 'blockHash', 'block']);
        if (blockNumberNode) {
            blockNumberNode.string = `${blockNumber}`;
           // LogService.debug('card', `设置 blockNumber: ${blockNumber}`);
        } else {
            //LogService.warn('card', 'block_number 节点未找到');
        }

        const status = record.status !== undefined ? record.status : 0;
        const statusText = this.getDepositStatusText(Number(status));
        const statusParent = itemNode.getChildByName('status');
        const statusNode = findLabelInNode(statusParent, ['statusLabel', 'status']);
        if (statusNode) {
            statusNode.string = statusText;
            const statusNum = Number(status);
            if (statusNum === 0) {
                statusNode.color = new Color(255, 165, 0, 255);
            } else if (statusNum === 1) {
                statusNode.color = new Color(0, 128, 0, 255);
            } else if (statusNum === 2) {
                statusNode.color = new Color(0, 0, 255, 255);
            } else if (statusNum === 3) {
                statusNode.color = new Color(255, 0, 0, 255);
            }
           // LogService.debug('card', `设置 status: ${statusText} (${status})`);
        } else {
           // LogService.warn('card', 'status 节点未找到');
        }

        const txHash = record.txHash !== undefined ? record.txHash : (record.tx_hash !== undefined ? record.tx_hash : '');
        let txHashParent = itemNode.getChildByName('tx_hash') || itemNode.getChildByName('txHash');
        if (!txHashParent) {
            const tokenNode = itemNode.getChildByName('token');
            if (tokenNode) {
                txHashParent = tokenNode.getChildByName('tx_hash') || tokenNode.getChildByName('txHash');
            }
        }
        const txHashNode = findLabelInNode(txHashParent, ['tx_hash', 'txHash', 'hash']);
        if (txHashNode) {
            txHashNode.string = `${txHash}`;
           // LogService.debug('card', `设置 txHash: ${txHash}`);
        } else {
           // LogService.warn('card', 'txHash 节点未找到');
        }

        const cardCost = record.tokenAmountDisplay !== undefined ? record.tokenAmountDisplay : (record.token_amount_display !== undefined ? record.token_amount_display : (record.amountDisplay !== undefined ? record.amountDisplay : 0));
        const costNumParent = itemNode.getChildByName('costNum') || itemNode.getChildByName('roomNum');
        const cardCostNode = findLabelInNode(costNumParent, ['cardCost']);
        if (cardCostNode) {
            cardCostNode.string = `${cardCost}`;
            //LogService.debug('card', `设置 cardCost (房卡数量): ${cardCost}`);
        } else {
            //LogService.warn('card', 'cardCost 节点未找到');
        }

       // LogService.debug('card', `更新充值项 ${itemNode.name} 显示完成`);
    }

    /**
     * 状态文本映射
     */
    private getDepositStatusText(status: number): string {
        const statusMap: { [key: number]: string } = {
            0: '待确认',
            1: '已确认',
            2: '已处理',
            3: '失败'
        };
        return statusMap[status] || `状态${status}`;
    }

    /**
     * 格式化数字字符串，去除末尾多余的小数位
     * 例如: "10.000000000000000000" -> "10", "10.500000000000000000" -> "10.5", "1000.000000000000000000" -> "1000"
     */
    private formatNumber(value: string): string {
        if (!value) {
            return '0';
        }
        const num = parseFloat(value);
        if (isNaN(num)) {
            return value;
        }
        // 检查是否为整数（小数位全为0）
        if (Number.isInteger(num)) {
            return num.toString();
        }
        // 去除末尾多余的0
        return num.toString();
    }
}
