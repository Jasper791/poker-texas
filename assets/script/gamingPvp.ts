/**
 * 游戏主控制器
 * 负责游戏的初始化、流程控制、玩家操作处理等核心功能
 */
import { _decorator, Layers, Component, Node, Label, Sprite, SpriteFrame, Prefab, Vec3, tween, instantiate, math, setDisplayStats, Button, view, UITransform, Color, resources, EditBox, find, director } from 'cc';
import { GameManager } from './managers/GameManager';
import { PlayerManager } from './managers/PlayerManager';
import { CardManager } from './managers/CardManager';
import { UIManager } from './managers/UIManager';
import { SettingsManager } from './managers/SettingsManager';
import { GameStateManager } from './managers/GameStateManager';
import { ActionDebouncer } from './managers/ActionDebouncer';
import { UserInfoManager } from './managers/UserInfoManager';
import { SceneLoader } from './managers/SceneLoader';
import { SoundManager } from './managers/SoundManager';
import { pokerCard } from './pokerCard';
import { GameNetwork } from './net/GameNetwork';
import { CommandType } from './net/Protocol';
import { NetworkOptimizer } from './net/NetworkOptimizer';
import { ObjectPool } from './utils/ObjectPool';
import { SeatPositionCalculator } from './utils/SeatPositionCalculator';
import { PrefabRefreshHelper } from './utils/PrefabRefreshHelper';
import { getCardName } from './utils/pokers';
import { GameFlowPvpController, GamePhase } from './core/GameFlowPvpController';
import { SettlementPvpHandler, SettlementPvpData } from './core/SettlementPvpHandler';
import { GameUIHandler } from './ui/GameUIHandler';
import { NetworkMessageHandler } from './net/NetworkMessageHandler';
import { LogService } from './utils/LogService';
import { ResponseCode } from './types';
import { PvpActionExecutor } from './core/PvpActionExecutor';
import { GAME_MSG_LABELS } from './config/audioConfig';
import { ActionType } from './core/PlayerActionExecutor';
import { DialogManager } from './components/Dialog/dialogManager';
import { LoadingManager } from './components/Loading/LoadingManager';
import { ScreenAdapter } from './utils/ScreenAdapter';
import * as Types from './types';

// ====== 新增：Presenter 模块导入 ======
import {
    CardDisplayPresenter,
    PlayerInfoPresenter,
    ActionButtonPresenter,
    SettlementPresenter,
    GamePresenter,
    GamePresenterConfig
} from './presenters';

// ====== 新增：Service 模块导入 ======
import {
    GameInitService,
    PlayerActionService,
    AIDecisionService,
    CardService,
    SettlementService
} from './services';



const { ccclass, property } = _decorator;

@ccclass('gamingPvp')
export class gamingPvp extends Component {
    // 开始游戏界面
    @property({ type: Node })
    public startGameNode: Node = null

    // 桌面Node
    @property({ type: Node })
    public container: Node = null

    // 玩家显示界面节点（头像、下注金额显示）
    @property({ type: Node })
    public playersContainer: Node = null

    // 断线重连遮罩节点
    @property({ type: Node })
    public disconnectMask: Node = null

    // 迷你黑卡显示（显示当前轮次下注金额）
    @property({ type: Label })
    public miniBlackCardLabel: Label = null

    // 房间ID按钮节点（包含显示房间号的Label）
    @property({ type: Node })
    public roomBtn: Node = null

    // ✅ [新增] 退出按钮节点
    @property({ type: Node })
    public exitBtn: Node = null

    // ✅ [新增] 刷新按钮节点（用于同步房间所有玩家信息）
    @property({ type: Node })
    public refreshBtn: Node = null

    // ✅ [新增] 快捷消息按钮节点
    @property({ type: Node })
    public sayBtn: Node = null

    _roomId: number = 0;
    _room_code: string = null

    // 局数显示Label节点
    @property({ type: Label })
    public roundsValue: Label = null

    // 当前局数和最大局数
    private _currentRound: number = 1;
    private _maxRounds: number = 10;

    // 扑克牌
    @property({ type: Prefab })
    public pokerPrefab: Prefab = null

    // 胜利面板预制体
    @property({ type: Prefab })
    public winPanelPrefab: Prefab = null

    // 玩家头像预制体
    @property({ type: Prefab })
    public avatarPrefab: Prefab = null

    // 底池
    @property(Label)
    public potLabel: Label = null

    // 边池容器节点（用于显示多个边池）
    @property({ type: Node })
    public sidePotsContainer: Node = null

    // 大小盲注和庄家图标
    @property({ type: [SpriteFrame] })
    public seatIcons: SpriteFrame[] = []

    // 玩家操作按钮的节点
    @property({ type: Node })
    public playersActionNode: Node = null

    // ✅ [新增] 游戏流程控制器
    private _gameFlowPvpController: GameFlowPvpController | null = null;

    // ✅ [新增] 操作执行器
    private _actionExecutor: PvpActionExecutor | null = null;

    // ✅ [新增] PVP 结算处理器
    private _settlementPvpHandler: SettlementPvpHandler | null = null;

    // ✅ [新增] UI 处理器（聚合类）
    private _gameUIHandler: GameUIHandler | null = null;

    // ✅ [新增] 网络消息处理器
    private _networkMessageHandler: NetworkMessageHandler | null = null;

    // ====== 新增：Presenter 属性声明 ======
    private _gamePresenter: GamePresenter | null = null;  // 统一的 Presenter 管理器
    private _cardPresenter: CardDisplayPresenter | null = null;
    private _playerPresenter: PlayerInfoPresenter | null = null;
    private _actionPresenter: ActionButtonPresenter | null = null;
    private _settlementPresenter: SettlementPresenter | null = null;
    private _presentersInitialized: boolean = false;

    // ====== 新增：Service 属性声明 ======
    private _gameInitService: GameInitService | null = null;
    private _playerActionService: PlayerActionService | null = null;
    private _aiDecisionService: AIDecisionService | null = null;
    private _cardService: CardService | null = null;
    private _settlementService: SettlementService | null = null;
    private _servicesInitialized: boolean = false;

    // ====== PVP准备状态相关 ======
    private _isRoomOwner: boolean = false; // 是否是房主
    private _playerReadyStatus: Map<number, boolean> = new Map(); // 玩家准备状态
    private _isGameEnded: boolean = false; // 当前游戏是否已结束
    private _isNewRoundStarted: boolean = false; // 是否是新一轮开始
    private _isSceneUnloading: boolean = false; // 场景是否正在卸载（用于防止场景卸载后仍处理消息）
    private _lastGameStartNotifyTime: number = 0; // 上次处理 GAME_START_NOTIFY 的时间戳（防重复）
    private _lastGameStartRound: number = 0; // 上次处理 GAME_START_NOTIFY 的轮次（防重复）
    private _lastSequence: number = 0; // 最后处理的消息序列号，用于丢弃过期消息
    private _lastReconnectTime: number = 0; // 上次处理重连消息的时间戳（防重复）
    private _showReadyButton: boolean = false; // 是否显示准备完毕按钮
    private _blindActions: { [key: number]: string } = {}; // 盲注操作记录

    /** 记录所有活跃的 setTimeout ID，用于 onDestroy 时清理 */
    private _activeTimeouts: Set<number> = new Set();

    /** 断线重连本地超时定时器 ID，用于确保 disconnectMask 在30秒后必定隐藏 */
    private _disconnectLocalTimeout: number = null;
    
    /** 断线重连本地超时时间（秒），比服务端30秒多2秒，确保服务端超时后客户端立即隐藏 */
    private static readonly DISCONNECT_LOCAL_TIMEOUT_SECONDS: number = 32;

    /** ✅ [新增] 断线时暂停的操作倒计时剩余时间，用于断线恢复后继续倒计时 */
    private _pausedActionTimeRemaining: number = 0;

    // 房间规则类型: 0=计分方式(每局1000), 1=筹码扣减方式, 2=代币扣减
    private _scoreType: number = 0;

    // ✅ [新增] 快捷消息面板相关
    private _quickMsgPanel: Node = null;
    private _isSayBtnCooldown: boolean = false;

    // 游戏管理器
    private _gameManager: GameManager;
    // 玩家管理器
    private _playerManager: PlayerManager;
    // 卡牌管理器
    private _cardManager: CardManager;
    // UI 管理器
    private _uiManager: UIManager;
    // 设置管理器
    private _settingsManager: SettingsManager;
    // 游戏状态管理器（统一状态管理）
    private _gameStateManager: GameStateManager;
    // 防重复点击管理器
    private _actionDebouncer: ActionDebouncer;

    // 本轮第一个行动的玩家（用于判断下注轮次是否结束）
    private _firstPlayerInRound: number = 0;

    // 本轮已经行动的玩家集合（用于追踪谁已经响应了当前下注）
    private _playersActedInCurrentRound: Set<number> = new Set();

    // 合规规则
    private _stringBetPrevention: boolean = true; // 串注预防
    private _verbalDeclarationBinding: boolean = true; // 口头声明约束力
    private _deadBlindRule: boolean = true; // 死盲注规则
    private _showdownRule: boolean = true; // 亮牌规则

    // 保存每个玩家的牌节点
    private _playerCards: Node[][] = [];

    // 对象池
    private _avatarPool: ObjectPool = null;

    // ✅ [新增] 玩家准备重试计数器（用于防止服务端持续发送消息导致的无限循环）
    private _playerReadyRetryMap: Map<number | string, number> = new Map();
    private _pokerPool: ObjectPool = null;

    // 保存玩家头像节点引用，用于对象池管理
    private _playerAvatars: Map<number, Node> = new Map();
    // 保存公牌节点引用，用于对象池管理
    private _boardCards: Node[] = [];

    // 保存待显示的操作信息（用于立即更新后，服务端返回前的临时存储）
    private _pendingActions: Map<number, { action: string; amount: number; nickname: string }> = null;

    // 上一局胜利者信息（用于摊牌阶段显示胜利面板）
    private _lastWinner: number = -1;
    private _lastWinnerHandType: number = 9;
    private _lastWinnerHandStrength: number = 0;
    private _lastPot: number = 0;


    // 当前轮次操作计数器（用于判断是否所有活跃玩家都已操作）
    private _actionCountInCurrentRound: number = 0;

    // 真实玩家索引（从服务端获取）
    private _realPlayerIndex: number = -1;

    // 网络管理器
    private _gameNetwork: GameNetwork = null;

    private _hostUserId: number = null; // 房主ID
    private _isCurrentPlayerReady: boolean = false; // 当前玩家是否准备
    private _waitingForDealNotify: boolean = false; // 是否等待服务端发牌通知
    private _gameStateSyncReceived: boolean = false; // 是否已收到第一次GAME_STATE_SYNC
    private _dealCompleteSent: boolean = false; // 是否已发送过dealComplete通知，防止重复发送
    private _isDealingInProgress: boolean = false; // 是否正在发牌动画中（用于防止状态同步时误清理手牌）
    private _isInSettlementConfirmation: boolean = false; // 是否正在结算确认阶段（用于防止确认期间显示遮罩）
    private _lastPlayerJoinHash: string = ''; // 上次handlePlayerJoin的玩家列表哈希，用于去重
    private _lastPlayerJoinTime: number = 0; // 上次handlePlayerJoin的时间戳

    // PVP开发测试：指定要加入的房间ID，为null则创建新房间
    private _joinRoomId: number = null;

    start() {
        LoadingManager.hide();
        // ✅ [新增] 添加日志，确认 start() 方法被执行
        // ⚠️ 【重要】启动预制体刷新助手，确保每次都使用最新预制体
        const prefabHelper = PrefabRefreshHelper.getInstance();
        prefabHelper.init();
        prefabHelper.clearAllCaches();

        try {
            // 开发环境 关闭左下角FPS 显示
            setDisplayStats(false);
            // 只在浏览器环境中尝试关闭Vconsole
            if (typeof document !== 'undefined') {
                const vconsole = document.getElementById('__vconsole');
                if (vconsole) {
                    vconsole.style.display = 'none';
                }
            }
        } catch (error) { }

        // 隐藏旧的 startGameNode，我们完全使用场景中的按钮
        if (this.startGameNode) {
            this.startGameNode.active = false;
        }

        // ✅ [新增] 初始化管理器添加异常保护
        try {
            // 初始化管理器（必须在获取位置之前）
            this._gameManager = new GameManager();
            this._playerManager = this._gameManager.getPlayerManager();
            this._cardManager = this._gameManager.getCardManager();
            this._uiManager = new UIManager();
            this._settingsManager = SettingsManager.getInstance();
        } catch (error) {
            LogService.error('gamingPvp', `❌ _playerManager 初始化失败: ${error}`);
        }

        // ✅ [关键修复] 设置 UIManager 的 playerManager 和 gameManager
        if (this._uiManager && this._playerManager) {
            this._uiManager.setPlayerManager(this._playerManager);
        }
        if (this._uiManager && this._gameManager) {
            this._uiManager.setGameManager(this._gameManager);
        }

        // 初始化统一状态管理和防重复点击管理器
        this._gameStateManager = GameStateManager.getInstance();
        this._actionDebouncer = ActionDebouncer.getInstance();

        // 初始化对象池
        this.initializeObjectPools();

        // 设置玩家容器到 PlayerManager
        if (this._playerManager && this.playersContainer) {
            this._playerManager.setPlayersContainer(this.playersContainer);
        }

        // ✅ [新增] 初始化游戏流程控制器
        this._initializeGameFlowController();

        // ✅ [新增] 初始化 PVP 结算处理器
        this._initializeSettlementHandler();

        // ✅ [新增] 初始化 UI 处理器（聚合类）
        this._initializeUIHandler();

        // ✅ [新增] 初始化网络消息处理器
        this._initializeNetworkMessageHandler();

        // ✅ [新增] 初始化 Presenter 模块
        this._initializePresenters();

        // ✅ [新增] 初始化 Service 模块
        this._initializeServices();

        // ✅ [修复] 网络初始化放在最后，确保所有组件都已就绪
        // 这样服务端发送的消息能被正确处理
        this.initNetwork();



        // 设置背景图尺寸适配屏幕
        ScreenAdapter.getInstance().adaptToScreen(this.node);

        // ✅ [新增] 进入PVP场景后开始循环播放背景音乐
        // 由于浏览器自动播放限制，先尝试播放，如果失败则在用户交互后再播放
        this._startBackgroundMusic();

        // 初始化局数显示（默认值）
        this.updateRoundsDisplay(this._currentRound, this._maxRounds);

        // 查找并绑定场景中的按钮
        this.findSceneButtons();
        this.bindSceneButtons();

        // 添加按钮事件监听
        if (this.playersActionNode) {
            // 尝试获取action子节点，因为根据scene.scene文件，所有按钮都在action节点下
            const actionNode = this.playersActionNode.getChildByName('action');

            // 辅助函数：获取按钮，优先从action节点中查找
            const getButton = (name: string) => {
                if (actionNode) {
                    const btn = actionNode.getChildByName(name);
                    if (btn) {
                        return btn;
                    }
                }
                return this.playersActionNode.getChildByName(name);
            };

            const foldBtn = getButton('FOLD');
            const callBtn = getButton('CALL');
            const raiseBtn = getButton('RAISE');
            const checkBtn = getButton('CHECK');
            const betBtn = getButton('BET');
            const allInBtn = getButton('ALLIN');
            const confirmBtn = getButton('CONFIRM');

            if (foldBtn) foldBtn.on('click', this.fold, this);
            if (callBtn) callBtn.on('click', this.call, this);
            if (raiseBtn) raiseBtn.on('click', this.raise, this);
            if (checkBtn) checkBtn.on('click', this.check, this);
            if (betBtn) betBtn.on('click', this.bet, this);
            if (allInBtn) allInBtn.on('click', this.allIn, this);
            if (confirmBtn) confirmBtn.on('click', this.playerConfirm, this);
        }

        // ✅ [新增] 绑定刷新按钮点击事件（同步房间玩家信息）
        if (this.refreshBtn) {
            let buttonComp = this.refreshBtn.getComponent(Button);
            if (!buttonComp) {
                buttonComp = this.refreshBtn.addComponent(Button);
                LogService.info('gamingPvp', '刷新按钮动态添加 Button 组件');
            }
            buttonComp.node.on('click', this.onRefreshBtnClicked, this);
            LogService.info('gamingPvp', '刷新按钮已绑定点击事件');
        }

        LoadingManager.hide();
    }

    // 玩家头像及下注操作和显示坐标
    getPlayersPos() {
        const playersNum = this._playerManager.getPlayersNum();
        return SeatPositionCalculator.calculateSeatPositions(
            playersNum,
            () => this._playerManager.getPlayerSeat(),
            (index) => this._playerManager.isPlayerActive(index),
            true
        );
    }

    // ✅ [重构] 计算座位位置（委托给 UIManager）
    // 规则：
    // 1. 玩家入座是随机的（_playerSeat可以是0-8任意一个）
    // 2. 从真实玩家的第一视角看，自己始终在下方位置
    // 3. 玩家编号是实际座位号（1-9），不是相对编号
    calculateSeatPositions(playersNum: number, returnLocal: boolean = true) {
        if (!this._uiManager) {
            LogService.error('gamingPvp', 'calculateSeatPositions: _uiManager 为 null');
            return [];
        }

        const playerSeat = this._playerManager ? this._playerManager.getPlayerSeat() : 0;
        const isPlayerActive = (seatIndex: number) => {
            return this._playerManager ? this._playerManager.isPlayerActive(seatIndex) : false;
        };

        return this._uiManager.calculateSeatPositions(playersNum, playerSeat, isPlayerActive, returnLocal);
    }

    /**
     * ✅ [新增] 初始化游戏流程控制器
     */
    private _initializeGameFlowController() {
        // 创建游戏流程控制器
        this._gameFlowPvpController = new GameFlowPvpController(
            this._gameManager,
            this._playerManager,
            this._cardManager,
            this._uiManager,
            this._actionDebouncer,
            this.playersContainer,
            this.container,
            this.playersActionNode,
            this.potLabel
        );

        // 设置房间ID（优先从 GameNetwork 获取）
        const networkRoomId = GameNetwork.getInstance().getRoomId();
        const networkRoomCode = GameNetwork.getInstance().getRoomCode();
        LogService.info('gamingPvp', `从 GameNetwork 获取到 roomCode: ${networkRoomCode}`);

        // 尝试从 roomBtn 节点获取 Label
        //const roomCodeLabel = this.roomBtn.getComponentInChildren(Label);
        //this._roomId = parseInt(roomCodeLabel.string);
        //this._room_code = roomCodeLabel.string;
        //LogService.info('gamingPvp', `从 networkRoomId: ${networkRoomId}`);
        //LogService.info('gamingPvp', `从 roomcode lable 获取房间ID: ${this._room_code}`);
        this.updateRoomIdDisplay(networkRoomCode);
        this._gameFlowPvpController.setRoomId(networkRoomId);

        // ✅ [新增] 获取房间规则类型
        const roomConfig = GameNetwork.getInstance().getRoomConfig();
        if (roomConfig) {
            // ruleTypeOption 是数字 (0=计分, 1=筹码扣减, 2=代币)
            // ruleType 是字符串 (如 "SCORE_MODE")
            this._scoreType = roomConfig.ruleTypeOption !== undefined ? roomConfig.ruleTypeOption : 0;
            LogService.info('gamingPvp', `房间规则类型: ${this._scoreType} (0=计分, 1=筹码扣减, 2=代币), 原始ruleType: ${roomConfig.ruleType}`);
        } else {
            this._scoreType = 0;
            LogService.info('gamingPvp', `未获取到房间配置，使用默认规则类型: ${this._scoreType}`);
        }

        // ✅ [修复] 同步设置规则类型到PlayerManager
        if (this._playerManager) {
            this._playerManager.setScoreType(this._scoreType);
        }

        // 设置回调函数
        this._gameFlowPvpController.setCallbacks({
            onGameStart: () => {
                this.hideExitBtn();
            },
            onDealComplete: () => {
            },
            onPhaseChange: (phase: GamePhase) => {
            },
            onPlayerTurn: (playerIndex: number, isAI: boolean) => {
            },
            onRoundComplete: () => {
            },
            onShowdown: () => {
            },
            onSettlement: (result: any) => {
                this.showExitBtn();
            },
            onCountdownTick: (timeRemaining: number) => {
                // 更新UI显示倒计时
                if (this._gameFlowPvpController) {
                    const currentPlayerIndex = this._gameFlowPvpController.getCurrentTurnPlayerIndex();
                    if (currentPlayerIndex !== -1) {
                        this._playerManager.updatePlayerCountdown(this.playersContainer, currentPlayerIndex, timeRemaining);
                    }
                }
            },
            onCountdownExpired: () => {
                // 调用原有的超时处理逻辑
                this.handleCountdownTimeout();
            }
        });

        // 初始化操作执行器
        this._initializeActionExecutor();
    }

    /**
     * ✅ [新增] 初始化操作执行器
     */
    private _initializeActionExecutor() {
        this._actionExecutor = new PvpActionExecutor({
            playerManager: this._playerManager,
            uiManager: this._uiManager,
            gameManager: this._gameManager,
            gameFlowController: this._gameFlowPvpController,
            pendingActions: this._pendingActions
        });
    }

    /**
     * ✅ [新增] 初始化 PVP 结算处理器
     */
    private _initializeSettlementHandler() {
        // 创建结算处理器
        this._settlementPvpHandler = new SettlementPvpHandler(
            this._playerManager,
            this._cardManager,
            this._gameManager,
            this._uiManager
        );

        // 设置房间信息
        if (this._roomId) {
            this._settlementPvpHandler.setRoomInfo(this._roomId, this._hostUserId);
        }

        // 设置结算完成回调
        this._settlementPvpHandler.setOnSettlementComplete((result) => {
            LogService.info('gamingPvp', '结算完成:', result);
            // 可以在这里添加额外的处理逻辑
        });

        // 设置玩家确认回调
        this._settlementPvpHandler.setOnPlayerConfirmed((playerIndex) => {
            this.onPlayerConfirmed(playerIndex);
        });

        // ✅ [新增] 设置最后一局确认回调
        this._settlementPvpHandler.setOnLastRoundConfirmed(() => {
            this._exitRoom();
        });
    }

    /**
     * ✅ [新增] 初始化 UI 处理器（聚合类）
     */
    private _initializeUIHandler() {
        // 创建 UI 处理器
        this._gameUIHandler = new GameUIHandler(
            this.node,
            this._playerManager,
            this._uiManager,
            this._cardManager,
            this._gameManager,
            this._actionDebouncer,
            this.pokerPrefab,
            this.playersContainer,
            this.playersActionNode,
            this.container,
            this.potLabel
        );

        // 设置按钮回调
        this._gameUIHandler.setButtonCallbacks(
            () => this.fold(),
            () => this.call(),
            () => this.raise(),
            () => this.check(),
            () => this.allIn(),
            () => this.bet(),
            () => this.playerConfirm()
        );

    }

    /**
     * ✅ [新增] 初始化网络消息处理器
     */
    private _initializeNetworkMessageHandler() {

        // 创建网络消息处理器
        this._networkMessageHandler = new NetworkMessageHandler(
            this._gameFlowPvpController || null,
            this._gameUIHandler || null,
            this._playerManager
        );

        // 注册自定义消息处理器（覆盖默认行为）
        this._registerCustomMessageHandlers();
    }

    /**
     * ✅ [新增] 注册自定义消息处理器
     */
    private _registerCustomMessageHandlers() {
        if (!this._networkMessageHandler) {
            return;
        }

        // 注册游戏状态同步处理器
        this._networkMessageHandler.registerHandler(CommandType.GAME_STATE_SYNC, (data) => {
            this.handleGameStateSync(data);
        });

        // 注册玩家操作通知处理器
        this._networkMessageHandler.registerHandler(CommandType.PLAYER_ACTION_NOTIFY, (data) => {
            this.handlePlayerActionNotify(data);
        });

        // 注册游戏结算处理器
        this._networkMessageHandler.registerHandler(CommandType.GAME_SETTLEMENT, (data) => {
            this.handleGameSettlement(data);
        });

        // 注册发牌通知处理器
        this._networkMessageHandler.registerHandler(CommandType.DEAL_CARDS_NOTIFY, (data) => {
            this.handleDealCardsNotify(data);
        });

        // 注册玩家回合通知处理器
        this._networkMessageHandler.registerHandler(CommandType.NOTIFY_PLAYER_TURN, (data) => {
            this.handlePlayerTurnNotify(data);
        });

        // 注册玩家退出通知处理器
        this._networkMessageHandler.registerHandler(CommandType.PLAYER_EXIT, (data) => {
            this.handlePlayerExit(data);
        });

        // 注册玩家断开连接通知处理器
        this._networkMessageHandler.registerHandler(CommandType.PLAYER_DISCONNECTED, (data) => {
            this.handlePlayerDisconnected(data);
        });

        // ✅ [新增] 注册断线重连倒计时通知处理器
        this._networkMessageHandler.registerHandler(214, (data) => {
            this.handleReconnectCountdown(data);
        });

        // ✅ [新增] 注册seatIndex重新排序通知处理器
        this._networkMessageHandler.registerHandler(CommandType.SEAT_INDEX_REORDER, (data) => {
            this.handleSeatIndexReorder(data);
        });

    }

    /**
     * ✅ [新增] 初始化 Presenter 模块
     * 使用 GamePresenter 统一管理所有子 Presenter 的生命周期
     */
    private _initializePresenters() {

        try {
            // 创建 GamePresenter 实例
            this._gamePresenter = new GamePresenter();
            this._gamePresenter.init();

            // 配置所有子 Presenter
            const config: GamePresenterConfig = {
                pokerPrefab: this.pokerPrefab,
                avatarPrefab: this.avatarPrefab,
                winPanelPrefab: this.winPanelPrefab,
                cardParent: this.container,
                avatarParent: this.playersContainer,
                buttonContainer: this.playersActionNode,
                settlementParent: this.container,
                playersContainer: this.playersContainer,
                config: {} as any  // 实际的 GameConfig 可以根据需要传入
            };

            this._gamePresenter.configure(config);

            // 设置回调函数
            this._gamePresenter.setActionCallback((action, amount) => {
                this._onPlayerActionFromPresenter(action, amount);
            });
            this._gamePresenter.setSettlementCallback((continueToNextHand) => {
                this._onContinueToNextHand(continueToNextHand);
            });

            // 获取各子 Presenter 的引用（保持向后兼容）
            this._cardPresenter = this._gamePresenter.getCardPresenter();
            this._playerPresenter = this._gamePresenter.getPlayerPresenter();
            this._actionPresenter = this._gamePresenter.getActionPresenter();
            this._settlementPresenter = this._gamePresenter.getSettlementPresenter();

            this._presentersInitialized = true;

        } catch (error) {
            LogService.error('gamingPvp', 'Presenter 初始化失败', error);
        }
    }

    /**
     * 处理 Presenter 回调的玩家操作
     */
    private _onPlayerActionFromPresenter(action: any, amount?: number) {
        LogService.info('gamingPvp', '收到 Presenter 的玩家操作', { action, amount });
    }

    /**
     * 处理继续下一局/返回大厅回调
     */
    private _onContinueToNextHand(continueToNextHand: boolean) {
        if (continueToNextHand) {
            LogService.info('gamingPvp', '继续下一局：点击胜利面板确认按钮');

            // 隐藏胜利面板
            if (this._settlementPresenter) {
                this._settlementPresenter.hideSettlementPanel();
            }

            // 标记游戏已结束
            this._isGameEnded = true;

            // 重置准备状态
            this.resetReadyStatus();

            // 显示准备完毕按钮
            this.showReadyButton();
        } else {
            // 这里可以添加返回大厅的逻辑
        }
    }

    /**
     * ✅ [新增] 销毁所有 Presenter
     * 通过 GamePresenter 统一管理销毁流程
     */
    private _destroyPresenters() {
        try {
            // 使用 GamePresenter 统一销毁所有子 Presenter
            if (this._gamePresenter) {
                this._gamePresenter.destroyPresenters();
                this._gamePresenter = null;
            }

            // 清空本地引用
            this._cardPresenter = null;
            this._playerPresenter = null;
            this._actionPresenter = null;
            this._settlementPresenter = null;

            this._presentersInitialized = false;
        } catch (error) {
            LogService.error('gamingPvp', 'Presenter 销毁失败', error);
        }
    }

    /**
     * ✅ [新增] 隐藏AI弃牌玩家的手牌
     * 当AI玩家弃牌时调用此方法隐藏其手牌
     */
    hideAIFoldedPlayerCards(seatIndex: number): void {
        if (this._playerCards[seatIndex] && this._playerCards[seatIndex].length > 0) {
            for (const card of this._playerCards[seatIndex]) {
                if (card && card.isValid) {
                    card.removeFromParent();
                    card.destroy();
                }
            }
            this._playerCards[seatIndex] = [];
            LogService.info('gamingPvp', `[hideAIFoldedPlayerCards] 从 _playerCards 数组中隐藏玩家 ${seatIndex} 的手牌`);
            return;
        }

        if (this._cardPresenter) {
            this._cardPresenter.hidePlayerCards(seatIndex);
        } else {
            LogService.warn('gamingPvp', `hideAIFoldedPlayerCards: _cardPresenter 未初始化，无法隐藏手牌`);
        }
    }

    /**
     * ✅ [新增] 初始化 Service 模块
     */
    private _initializeServices() {

        try {
            if (this._cardManager && this._gameManager) {
                this._cardService = new CardService(this._cardManager, this._gameManager);
            }

            if (this._gameManager && this._playerManager) {
                this._settlementService = new SettlementService(this._gameManager, this._playerManager);
            }

            this._gameInitService = GameInitService.getInstance();

            this._playerActionService = PlayerActionService.getInstance();

            this._aiDecisionService = AIDecisionService.getInstance();

            this._servicesInitialized = true;

        } catch (error) {
            LogService.error('gamingPvp', 'Service 初始化失败', error);
        }
    }

    /**
     * ✅ [新增] 销毁所有 Service
     */
    private _destroyServices() {
        try {
            this._gameInitService = null;
            this._playerActionService = null;
            this._aiDecisionService = null;
            this._cardService = null;
            this._settlementService = null;

            this._servicesInitialized = false;
        } catch (error) {
            LogService.error('gamingPvp', 'Service 销毁失败', error);
        }
    }

    // ==================== 辅助方法：获取回合信息 ====================

    /**
     * 获取当前回合玩家索引
     */
    private _getCurrentTurnPlayerIndex(): number {
        return this._gameFlowPvpController?.getCurrentTurnPlayerIndex() ?? -1;
    }

    /**
     * 检查当前回合是否是 AI
     */
    private _isCurrentTurnAI(): boolean {
        return this._gameFlowPvpController?.isCurrentTurnAI() ?? false;
    }

    /**
     * 检查是否正在等待确认
     */
    private _isConfirmationPending(): boolean {
        return this._settlementPvpHandler?.isConfirmationPending() ?? false;
    }

    /**
     * 检查玩家是否已确认
     */
    private _isPlayerConfirmed(playerIndex: number): boolean {
        return this._settlementPvpHandler?.isPlayerConfirmed(playerIndex) ?? false;
    }

    /**
     * 获取已确认的玩家数量
     */
    private _getConfirmedCount(): number {
        return this._settlementPvpHandler?.getConfirmedCount() ?? 0;
    }

    // ==================== 辅助方法结束 ====================

    /**
     * 查找 deal 节点
     */
    findDealNode(): Node | null {
        // ✅ [增强] 尝试更多可能的路径查找 deal 节点
        const possiblePaths = [
            'start/deal',
            '/start/deal',
            'Canvas/start/deal',
            'Canvas_pvp/start/deal',
            '/Canvas/start/deal',
            '/Canvas_pvp/start/deal',
            'ui/start/deal',
            'Canvas/ui/start/deal',
            'Canvas_pvp/ui/start/deal',
            'center/start/deal',
            'Canvas/center/start/deal',
            'Canvas_pvp/center/start/deal',
            'deal',
            '/deal',
            'start/deal_btn',
            'start/btn_start',
            'start/btn_deal',
            'Canvas/start/deal_btn',
            'Canvas/start/btn_start'
        ];

        let dealNode: Node | null = null;

        for (const path of possiblePaths) {
            dealNode = find(path);
            if (dealNode) {
                LogService.info('gamingPvp', `findDealNode: 通过路径 ${path} 找到 deal 节点`);
                break;
            }
        }

        // 如果上面都没找到，尝试从当前节点向上遍历
        if (!dealNode) {
            let current = this.node;
            while (current && !dealNode) {
                const startNode = current.getChildByName('start');
                if (startNode) {
                    dealNode = startNode.getChildByName('deal');
                    if (dealNode) {
                        LogService.info('gamingPvp', 'findDealNode: 通过向上遍历找到 deal 节点');
                    }
                }
                current = current.parent;
            }
        }

        // 尝试从 playersContainer 向下查找
        if (!dealNode && this.playersContainer) {
            const startNode = this.playersContainer.getChildByName('start');
            if (startNode) {
                dealNode = startNode.getChildByName('deal');
                if (dealNode) {
                    LogService.info('gamingPvp', 'findDealNode: 通过 playersContainer 找到 deal 节点');
                }
            }
        }

        // 尝试从 container 向下查找
        if (!dealNode && this.container) {
            const startNode = this.container.getChildByName('start');
            if (startNode) {
                dealNode = startNode.getChildByName('deal');
                if (dealNode) {
                    LogService.info('gamingPvp', 'findDealNode: 通过 container 找到 deal 节点');
                }
            }
        }

        // 最后尝试全局查找
        if (!dealNode) {
            dealNode = find('deal');
            if (dealNode) {
                LogService.info('gamingPvp', 'findDealNode: 通过全局查找找到 deal 节点');
            }
        }

        if (!dealNode) {
            LogService.error('gamingPvp', 'findDealNode: 所有方式均未找到 deal 节点！');
        }

        return dealNode;
    }

    /**
     * 隐藏 deal 节点（游戏开始时调用）
     */
    hideDealNode() {
        const dealNode = this.findDealNode();
        if (dealNode) {
            dealNode.active = false;
        } else {
            LogService.warn('gamingPvp', '未找到 deal 节点');
        }
    }

    /**
     * 显示 deal 节点（房主开始游戏按钮）
     */
    showDealNode() {
        const dealNode = this.findDealNode();
        if (dealNode) {
            // 确保父节点 start 也显示
            const parent = dealNode.parent;
            if (parent && parent.name === 'start') {
                parent.active = true;
            }
            dealNode.active = true;
        } else {
            LogService.warn('gamingPvp', '未找到 deal 节点');
        }
    }

    /**
     * deal 按钮点击处理（房主点击开始游戏）
     */
    onDealButtonClick() {
        this.startGameAsHost();
    }

    /**
     * 点击"开始游戏"按钮
     */
    private onStartGameClicked() {
        this.startGameAsHost();
    }

    /**
     * 房主开始游戏（发送开始游戏请求）
     */
    private startGameAsHost() {
        if (this._gameNetwork && this._roomId > 0 && this._hostUserId) {
            const userId = this._gameNetwork.getUserId();
            if (userId && userId.toString() === this._hostUserId.toString()) {
                if (this._isStartingGame) {
                    LogService.info('gamingPvp', 'startGameAsHost: 正在开始游戏中，忽略重复点击');
                    return;
                }
                this._isStartingGame = true;

                if (this._startGameBtn) {
                    this._startGameBtn.active = false;
                    const btnComp = this._startGameBtn.getComponent(Button);
                    if (btnComp) {
                        btnComp.interactable = false;
                    }
                }
                this.hideDealNode();

                SoundManager.getInstance().play('start');

                setTimeout(() => {
                    this._isStartingGame = false;
                    if (this._startGameBtn) {
                        const btnComp = this._startGameBtn.getComponent(Button);
                        if (btnComp) {
                            btnComp.interactable = true;
                        }
                    }
                }, 5000);

                this._gameNetwork.sendStartGame(this._roomId, userId);
            } else {
                LogService.warn('gamingPvp', '非房主无法开始游戏');
            }
        }
    }

    /**
     * 创建 PVP UI 面板（使用场景中已有的按钮）
     * 3. 准备按钮 - readyBtn
     * 4. 取消准备按钮 - cancelBtn
     * 5. 开始游戏按钮 - deal（仅房主可见）
     * 6. 遮罩层 - mask
     */

    // 准备按钮和取消准备按钮现在在玩家头像预制体中
    private _startGameBtn: Node = null;
    private _maskNode: Node = null;
    private _isSceneEditBox: boolean = false;
    private _isStartingGame: boolean = false; // 防重复点击开始游戏标志

    createPvpUIPanel(startBtn: Node) {
        const parent = this.node;
        if (!parent) {
            LogService.error('gamingPvp', '无法获取组件所在节点');
            return;
        }

        parent.layer = 33554432;

        // 绑定按钮点击事件
        this.bindSceneButtons();


    }

    /**
     * 查找场景中已有的按钮节点
     */
    private findSceneButtons() {
        const canvas = this.node.parent;
        if (!canvas) {
            LogService.error('gamingPvp', '无法找到 Canvas 节点');
            return;
        }
        // 查找 start 节点下的按钮
        const startNode = canvas.getChildByName('start');
        if (startNode) {
            // 确保 start 节点本身是显示的
            startNode.active = true;
            // 准备按钮和取消准备按钮现在在玩家头像预制体中（avatar_player/readyBtn）
            this._startGameBtn = startNode.getChildByName('deal');
            this._maskNode = startNode.getChildByName('mask');
        } else {
            LogService.warn('gamingPvp', '未找到 start 节点，尝试全局查找');
        }

        // ✅ [修复] 如果通过 canvas.getChildByName 未找到 deal 按钮，使用 findDealNode 兜底
        if (!this._startGameBtn) {
            const dealNode = this.findDealNode();
            if (dealNode) {
                this._startGameBtn = dealNode;
                // 同时尝试找到 mask 节点
                if (!this._maskNode && dealNode.parent) {
                    this._maskNode = dealNode.parent.getChildByName('mask');
                }
                LogService.info('gamingPvp', 'findSceneButtons: 通过 findDealNode 成功找到 deal 节点');
            } else {
                LogService.error('gamingPvp', 'findSceneButtons: 所有方式均未找到 deal 节点！');
            }
        }
    }

    /**
     * 绑定场景按钮的点击事件
     */
    private bindSceneButtons() {

        // 准备按钮和取消准备按钮现在在玩家头像预制体中，在createPlayerAvatars中绑定

        // 1. 开始游戏按钮（deal节点）
        if (this._startGameBtn) {
            const buttonComp = this._startGameBtn.getComponent(Button);
            if (buttonComp) {
                this._startGameBtn.on('click', this.onStartGameClicked, this);
            } else {
                LogService.error('gamingPvp', '❌ deal 没有 Button 组件');
            }
        }

        // 2. 退出按钮（exitBtn节点）
        if (this.exitBtn) {
            const buttonComp = this.exitBtn.getComponent(Button);
            if (buttonComp) {
                this.exitBtn.on('click', this.onExitBtnClicked, this);
                // ✅ [新增] 初始状态：游戏未开始时显示退出按钮，游戏开始后由回调控制
                this.exitBtn.active = true;
            } else {
                LogService.error('gamingPvp', '❌ exitBtn 没有 Button 组件');
            }
        }

        // 3. 快捷消息按钮（sayBtn节点）
        if (this.sayBtn) {
            const buttonComp = this.sayBtn.getComponent(Button);
            if (buttonComp) {
                this.sayBtn.on('click', this.onSayBtnClicked, this);
                LogService.info('gamingPvp', '快捷消息按钮已绑定点击事件');
            } else {
                LogService.error('gamingPvp', '❌ sayBtn 没有 Button 组件');
            }
        }
    }

    /**
     * 退出按钮点击处理
     * 点击后通知服务端玩家离开，然后返回到index场景
     * 
     * ✅ [修复] 不再断开WebSocket连接，保持钱包和长连接状态
     * 只发送退出房间请求，让服务端清理房间状态
     */
    private onExitBtnClicked() {
        LogService.info('gamingPvp', '退出按钮被点击，准备离开房间');

        // 标记场景正在卸载
        this._isSceneUnloading = true;

        // 清理游戏状态
        this._cleanupGameState();

        // ✅ [修复] 不再断开WebSocket连接，保持钱包连接和长连接
        // 只发送退出房间请求
        if (this._gameNetwork && this._roomId > 0) {
            this._gameNetwork.exitRoom(this._roomId);
            LogService.info('gamingPvp', `发送退出房间请求 roomId=${this._roomId}`);
        }

        this._transitionToScene('index');
    }

    private _transitionToScene(sceneName: string) {
        this._isSceneUnloading = true;
        
        director.getScheduler().unscheduleAllForTarget(this.node);
        this.unscheduleAllCallbacks();

        SoundManager.getInstance().stopBgm();

        if (this._gameNetwork) {
            try {
                this._gameNetwork.setOnPlayerJoin(null);
                this._gameNetwork.setOnPlayerExit(null);
                this._gameNetwork.setOnLoginSuccess(null);
                this._gameNetwork.setOnLoginFailed(null);
                this._gameNetwork.setOnRoomCreated(null);
                this._gameNetwork.setOnJoinRoom(null);
                this._gameNetwork.setOnMessage(null);
                this._gameNetwork.setOnError(null);
                this._gameNetwork.setOnPlayerReady(null);
                this._gameNetwork.setOnReconnectFailed(null);
                this._gameNetwork.setOnReconnectSuccess(null);
                this._gameNetwork.setOnHeartbeatTimeout(null);
            } catch (e) {
                LogService.warn('gamingPvp', '_transitionToScene 清理 GameNetwork 回调失败', e);
            }
        }

        if (this._activeTimeouts) {
            this._activeTimeouts.forEach(id => clearTimeout(id));
            this._activeTimeouts.clear();
        }

        SceneLoader.getInstance().loadScene(sceneName);
    }

    private _isRefreshing: boolean = false; // 是否正在刷新（防止重复点击）
    private _refreshCooldownTimer: any = null; // 刷新冷却定时器

    /**
     * 刷新按钮点击事件处理
     * 点击后旋转360度动画（1秒完成），并向服务端请求同步房间内所有玩家信息
     * 动画播放中不允许点击，播放完隐藏按钮，5秒后恢复显示
     * 用于解决各玩家信息不一致的情况
     */
    private onRefreshBtnClicked(event?: any) {
        //LogService.info('gamingPvp', '刷新按钮被点击');

        if (!this.refreshBtn) {
            //LogService.warn('gamingPvp', '刷新按钮节点未设置');
            return;
        }

        if (this._isRefreshing) {
            //LogService.warn('gamingPvp', '刷新操作进行中，忽略重复点击');
            return;
        }

        if (!this.refreshBtn.active) {
            //LogService.warn('gamingPvp', '刷新按钮已隐藏，处于冷却期');
            return;
        }

        // ✅ [新增] 隐藏快捷消息面板
        if (this._quickMsgPanel && this._quickMsgPanel.active) {
            this._quickMsgPanel.active = false;
        }

        this._isRefreshing = true;

        //LogService.info('gamingPvp', `开始同步房间玩家信息，_roomId=${this._roomId}, _gameNetwork=${!!this._gameNetwork}`);

        const rotateAction = tween(this.refreshBtn)
            .by(1.0, { angle: 360 })
            .call(() => {
                this._onRefreshAnimationComplete();
            })
            .start();

        if (this._gameNetwork && this._roomId > 0) {
            const token = this._gameNetwork.getAuthToken();
            const userId = this._gameNetwork.getUserId();
            
            //LogService.info('gamingPvp', `刷新按钮请求 - token存在=${!!token}, userId=${userId}`);
            
            if (!token) {
                //LogService.warn('gamingPvp', '刷新按钮请求失败：token为空，尝试重新连接服务器');
                this._gameNetwork.connectToServer('PVP');
                this._isRefreshing = false;
                return;
            }
            
            const request = {
                roomId: this._roomId,
                userId: userId,
                token: token,
                timestamp: Date.now()
            };
            this._gameNetwork.sendMessage(CommandType.ROOM_INFO, request);
            //LogService.info('gamingPvp', `发送房间信息同步请求 roomId=${this._roomId}, userId=${userId}, token=${token ? '***' : 'null'}`);
        } else {
            //LogService.warn('gamingPvp', `无法发送房间信息同步请求: _gameNetwork=${!!this._gameNetwork}, _roomId=${this._roomId}`);
            this._isRefreshing = false;
        }
    }

    /**
     * ✅ [方案2] 重连后自动请求 ROOM_INFO（兜底机制）
     * 场景：服务端推送 GAME_STATE_SYNC/PLAYER_TURN_NOTIFY 可能因 WebSocket session 未同步而丢失
     * 通过 HTTP 请求-响应模式主动获取，确保一定能拿到当前操作状态（含 availableActions）
     * 不含动画和防重复点击限制，专用于重连场景
     */
    private _requestRoomInfoForReconnect(): void {
        if (!this._gameNetwork || this._roomId <= 0) {
            LogService.warn('gamingPvp', '_requestRoomInfoForReconnect: 无法发送请求，_gameNetwork 或 _roomId 无效');
            return;
        }

        const token = this._gameNetwork.getAuthToken();
        const userId = this._gameNetwork.getUserId();

        if (!token) {
            LogService.warn('gamingPvp', '_requestRoomInfoForReconnect: token 为空，跳过请求');
            return;
        }

        const request = {
            roomId: this._roomId,
            userId: userId,
            token: token,
            timestamp: Date.now()
        };

        this._gameNetwork.sendMessage(CommandType.ROOM_INFO, request);
        LogService.info('gamingPvp', `_requestRoomInfoForReconnect: 重连后自动请求 ROOM_INFO, roomId=${this._roomId}, userId=${userId}`);
    }

    /**
     * 刷新动画播放完成回调
     * 隐藏按钮，5秒后恢复显示
     */
    private _onRefreshAnimationComplete(): void {
        //LogService.info('gamingPvp', '刷新动画播放完成，隐藏按钮并启动5秒冷却');

        this._isRefreshing = false;

        if (this.refreshBtn) {
            this.refreshBtn.active = false;
        }

        if (this._refreshCooldownTimer) {
            clearTimeout(this._refreshCooldownTimer);
            this._refreshCooldownTimer = null;
        }

        this._refreshCooldownTimer = setTimeout(() => {
            this._onRefreshCooldownEnd();
        }, 5000);
    }

    /**
     * 刷新冷却期结束，恢复按钮显示
     */
    private _onRefreshCooldownEnd(): void {
        //LogService.info('gamingPvp', '刷新冷却期结束，恢复按钮显示');
        this._refreshCooldownTimer = null;

        if (this.refreshBtn) {
            this.refreshBtn.active = true;
            this.refreshBtn.angle = 0;
        }
    }

    /**
     * 更新按钮显示状态（根据房间状态）
     */
    updateButtonVisibility() {
        const hasRoom = this._roomId > 0;
        const isHost = this._hostUserId && this._gameNetwork?.getUserId()?.toString() === this._hostUserId.toString();
        const totalPlayers = this._playerManager?.getPlayersNum() || 0;
        const isCurrentPlayerReady = this._isCurrentPlayerReady;


        // 准备按钮和取消准备按钮现在在玩家头像预制体中
        const isInGame = this._gameFlowPvpController?.isInGamePhase() ?? false;
        this.updatePlayerAvatarReadyButtons(hasRoom && !isInGame, isCurrentPlayerReady);

        // Deal 按钮：房主 + 房主已准备 + 所有玩家都已准备 + 房间至少2人 + 不在游戏中
        const allPlayersReady = this._checkAllPlayersReady();
        const hasEnoughPlayers = totalPlayers >= 2;
        const canShowDealBtn = hasRoom && isHost && isCurrentPlayerReady && allPlayersReady && hasEnoughPlayers && !isInGame;

        // 使用 _startGameBtn（deal按钮）
        if (this._startGameBtn) {
            this._startGameBtn.active = canShowDealBtn;
        } else {
            // ✅ [修复] _startGameBtn 未找到时，尝试通过 findDealNode 重新查找
            const dealNode = this.findDealNode();
            if (dealNode) {
                this._startGameBtn = dealNode;
                this._startGameBtn.active = canShowDealBtn;
                //LogService.info('gamingPvp', 'updateButtonVisibility: 通过 findDealNode 重新找到 deal 节点');
            } else {
                //LogService.warn('gamingPvp', `_startGameBtn 未找到，findDealNode 也失败！`);
            }
        }

        // 同时也控制 deal 节点的显示/隐藏
        if (canShowDealBtn) {
            this.showDealNode();
        } else {
            this.hideDealNode();
        }
        if (isHost) {
            this.startGameNode.active = true
        }

    }

    /**
     * 更新所有玩家头像中的房主标识显示
     */
    updateHomeownerIndicator() {
        if (!this._playerManager) {
            return;
        }

        //LogService.info('gamingPvp', `[updateHomeownerIndicator] 开始更新房主标识，玩家头像数量: ${this._playerAvatars.size}`);

        // ✅ [关键修复] 房主唯一性保障：先统计当前有多少个房主，如果超过1个则只保留第一个
        const hostSeats: number[] = [];
        for (const [seatIndex] of this._playerAvatars) {
            if (this._playerManager.getIsHostBySeatIndex(seatIndex)) {
                hostSeats.push(seatIndex);
            }
        }

        // 如果出现多个房主（异常情况），只保留第一个，其余清除
        if (hostSeats.length > 1) {
            LogService.warn('gamingPvp', `[updateHomeownerIndicator] 检测到多个房主(${hostSeats.length}个): seats=${hostSeats.join(',')}, 只保留第一个 seat=${hostSeats[0]}`);
            // 保留第一个，其余的清除房主标识
            for (let i = 1; i < hostSeats.length; i++) {
                this._playerManager.setSeatToIsHost(hostSeats[i], false);
            }
        }

        for (const [seatIndex, avatarNode] of this._playerAvatars) {
            const homeownerNode = avatarNode.getChildByName('homeowner');
            if (homeownerNode) {
                const isHost = this._playerManager.getIsHostBySeatIndex(seatIndex);
                homeownerNode.active = isHost;
                //LogService.info('gamingPvp', `[updateHomeownerIndicator] 更新房主标识: seatIndex=${seatIndex}, isHost=${isHost}, homeownerNode.active=${homeownerNode.active}`);
            } else {
                //LogService.warn('gamingPvp', `[updateHomeownerIndicator] 找不到homeowner节点: seatIndex=${seatIndex}`);
            }
        }
    }

    /**
     * 更新所有玩家头像中的准备标识显示
     */
    updateReadyIndicator() {
        if (!this._playerManager) {
            return;
        }

        for (const [seatIndex, avatarNode] of this._playerAvatars) {
            const okNode = avatarNode.getChildByName('ok');
            if (okNode) {
                const isReady = this._playerManager.getIsReadyBySeatIndex(seatIndex);
                okNode.active = isReady;
            }
        }
    }

    /**
     * 隐藏所有玩家头像中的准备标识（游戏开始时调用）
     */
    hideAllReadyIndicators() {
        for (const [, avatarNode] of this._playerAvatars) {
            const okNode = avatarNode.getChildByName('ok');
            if (okNode) {
                okNode.active = false;
            }
        }
    }

    /**
     * 检查是否所有玩家都已准备
     */
    private _checkAllPlayersReady(): boolean {
        if (!this._playerManager) return false;
        const totalPlayers = this._playerManager.getPlayersNum();
        if (totalPlayers < 2) {
            return false;
        }
        return this._playerManager.areAllPlayersReady();
    }

    /**
     * 绑定玩家头像中的准备按钮和取消准备按钮
     */
    private bindReadyButtonsInAvatar(avatarNode: Node) {
        // 查找 readyBtn 节点（在 avatar_player/readyBtn 下）
        const readyBtn = avatarNode.getChildByName('readyBtn');
        if (readyBtn) {
            const buttonComp = readyBtn.getComponent(Button);
            if (buttonComp) {
                readyBtn.off('click', this.onReadyClicked, this);
                readyBtn.on('click', this.onReadyClicked, this);
            }
            // 设置初始状态：默认隐藏，等待房间状态确定后再显示
            readyBtn.active = false;
        } else {
            LogService.warn('gamingPvp', '❌ 头像中未找到 readyBtn 节点');
        }

        // 查找 cancelBtn 节点（优先从 readyBtn 子节点查找，根据截图结构：avatar_player/readyBtn/cancelBtn）
        let cancelBtn: Node = null;
        if (readyBtn) {
            cancelBtn = readyBtn.getChildByName('cancelBtn');
        }
        // 如果在 readyBtn 下没找到，尝试直接从 avatarNode 查找
        if (!cancelBtn) {
            cancelBtn = avatarNode.getChildByName('cancelBtn');
        }

        if (cancelBtn) {
            const buttonComp = cancelBtn.getComponent(Button);
            if (buttonComp) {
                cancelBtn.off('click', this.onCancelReadyClicked, this);
                cancelBtn.on('click', this.onCancelReadyClicked, this);
            }
            // 设置初始状态：默认隐藏，等待房间状态确定后再显示
            cancelBtn.active = false;
        } else {
            LogService.warn('gamingPvp', '❌ 头像中未找到 cancelBtn 节点');
        }
    }

    /**
     * 隐藏对手玩家头像中的准备按钮和取消准备按钮
     * 这些按钮只属于真实玩家，对手玩家不应该看到或操作
     */
    private hideReadyButtonsForOpponent(avatarNode: Node) {
        // 查找并隐藏 readyBtn
        const readyBtn = avatarNode.getChildByName('readyBtn');
        if (readyBtn) {
            readyBtn.active = false;
        }

        // 查找并隐藏 cancelBtn（优先从 readyBtn 子节点查找）
        let cancelBtn: Node = null;
        if (readyBtn) {
            cancelBtn = readyBtn.getChildByName('cancelBtn');
        }
        if (!cancelBtn) {
            cancelBtn = avatarNode.getChildByName('cancelBtn');
        }
        if (cancelBtn) {
            cancelBtn.active = false;
        }
    }

    /**
     * 更新玩家头像中的准备按钮显示状态
     */
    private updatePlayerAvatarReadyButtons(canShow: boolean, isReady: boolean) {
        // 获取真实玩家的头像节点
        const playerSeat = this._playerManager?.getPlayerSeat();
        if (playerSeat === undefined || playerSeat === null) return;

        const avatarNode = this._playerAvatars.get(playerSeat);
        if (!avatarNode) return;

        // 查找 readyBtn（在 avatar_player/readyBtn 下）
        const readyBtn = avatarNode.getChildByName('readyBtn');
        if (readyBtn) {
            readyBtn.active = canShow && !isReady;
        } else {
            LogService.warn('gamingPvp', '未找到 readyBtn 节点');
        }

        // 查找 cancelBtn（优先从 readyBtn 子节点查找，根据截图结构：avatar_player/readyBtn/cancelBtn）
        let cancelBtn: Node = null;
        if (readyBtn) {
            cancelBtn = readyBtn.getChildByName('cancelBtn');
        }
        // 如果在 readyBtn 下没找到，尝试直接从 avatarNode 查找
        if (!cancelBtn) {
            cancelBtn = avatarNode.getChildByName('cancelBtn');
        }

        if (cancelBtn) {
            cancelBtn.active = canShow && isReady;
        } else {
            LogService.warn('gamingPvp', '未找到 cancelBtn 节点');
        }

        // 设置准备标识显示/隐藏
        const okNode = avatarNode.getChildByName('ok');
        if (okNode) {
            okNode.active = canShow && isReady;
        }
    }

    /**
     * 点击"准备"按钮
     */
    private onReadyClicked() {

        // ✅ [修复] 游戏进行中禁止准备操作
        /*
        if (this._gameFlowPvpController?.isInGamePhase()) {
            LogService.warn('gamingPvp', '游戏进行中，忽略准备请求');
            return;
        }*/

        // ✅ [新增] 点击准备按钮后立即更新按钮状态（显示 cancelBtn，隐藏 readyBtn）
        // 这样可以给玩家即时反馈，不需要等待服务端响应
        this.updatePlayerAvatarReadyButtons(true, true);

        // ✅ [新增] 点击准备完毕后隐藏退出按钮
        this.hideExitBtn();

        if (this._gameNetwork && this._roomId > 0) {
            const userId = this._gameNetwork.getUserId();
            if (userId) {
                this._gameNetwork.sendPlayerReadyRequest();
            }
        }
    }

    /**
     * 点击"取消准备"按钮
     */
    private onCancelReadyClicked() {

        // ✅ [新增] 点击取消准备按钮后立即更新按钮状态（显示 readyBtn，隐藏 cancelBtn）
        // 这样可以给玩家即时反馈，不需要等待服务端响应
        this.updatePlayerAvatarReadyButtons(true, false);

        // ✅ [新增] 取消准备后显示退出按钮
        this.showExitBtn();

        if (this._gameNetwork && this._roomId > 0) {
            const userId = this._gameNetwork.getUserId();
            if (userId) {
                this._gameNetwork.sendPlayerCancelReadyRequest();
            }
        }
    }

    /**
     * 隐藏开始游戏按钮（游戏开始时调用）
     */
    hideStartGameBtn() {
        if (this._startGameBtn) {
            this._startGameBtn.active = false;
        }
    }

    /**
     * 显示准备按钮（现在在玩家头像中）
     */
    showReadyBtn() {
        this.updatePlayerAvatarReadyButtons(true, false);
    }

    /**
     * 隐藏准备按钮（现在在玩家头像中）
     */
    hideReadyBtn() {
        this.updatePlayerAvatarReadyButtons(false, false);
    }

    findButtonInNode(parent: Node): Node | null {
        if (!parent) return null;

        // 检查这个节点本身是否是按钮（有 Button 组件）
        const buttonComp = parent.getComponent(Button);
        if (buttonComp) {
            return parent;
        }

        // 递归检查子节点
        for (let i = 0; i < parent.children.length; i++) {
            const child = parent.children[i];
            const found = this.findButtonInNode(child);
            if (found) {
                return found;
            }
        }

        return null;
    }

    private updateRoomIdDisplay(roomCode: string) {
        if (!this.roomBtn) {
            LogService.warn('gamingPvp', 'updateRoomIdDisplay: roomBtn 节点未绑定');
            return;
        }

        const roomLabel = this.roomBtn.getChildByName('Label')?.getComponent(Label)
            || this.roomBtn.getComponentInChildren(Label);

        if (!roomLabel) {
            LogService.error('gamingPvp', 'updateRoomIdDisplay: roomBtn 下没有找到 Label 组件');
            return;
        }

        if (roomCode?.trim()) {
            roomLabel.string = roomCode;
        }
    }

    /**
     * 更新局数显示
     * @param currentRound 当前局数
     * @param maxRounds 最大局数
     */
    updateRoundsDisplay(currentRound: number, maxRounds: number) {
        this._currentRound = currentRound;
        this._maxRounds = maxRounds;

        this.scheduleOnce(() => {
            if (this.roundsValue) {
                this.roundsValue.string = `${currentRound}/${maxRounds}`;
            } else {
                LogService.error('gamingPvp', 'updateRoundsDisplay: roundsValue 节点未绑定');
            }
        }, 0);
    }

    /**
     * 快捷消息按钮点击处理
     */
    private onSayBtnClicked() {
        if (this._isSayBtnCooldown) {
            LogService.info('gamingPvp', '快捷消息按钮冷却中，忽略点击');
            return;
        }

        const isPlayerAvatarsMissing = !this.playersContainer || this.playersContainer.children.length === 0;
        if (isPlayerAvatarsMissing) {
            LogService.warn('gamingPvp', 'onSayBtnClicked: 检测到玩家头像为空，开始场景补救');
            
            if (this._playerManager && this._playerManager.getPlayersNum() > 0) {
                LogService.info('gamingPvp', 'onSayBtnClicked: 尝试本地重建玩家头像');
                this.createPlayerAvatars();
            }
            
            if (this._gameNetwork && this._roomId > 0) {
                const token = this._gameNetwork.getAuthToken();
                const userId = this._gameNetwork.getUserId();
                
                if (token && userId) {
                    LogService.info('gamingPvp', 'onSayBtnClicked: 向服务端请求房间信息同步');
                    const request = {
                        roomId: this._roomId,
                        userId: userId,
                        token: token,
                        timestamp: Date.now()
                    };
                    this._gameNetwork.sendMessage(CommandType.ROOM_INFO, request);
                } else {
                    LogService.warn('gamingPvp', 'onSayBtnClicked: token 或 userId 为空，无法同步');
                }
            }
            
            this.safeSetTimeout(() => {
                if (!this._isSceneUnloading) {
                    if (!this.playersContainer || this.playersContainer.children.length === 0) {
                        LogService.warn('gamingPvp', 'onSayBtnClicked: 延迟检查后玩家头像仍为空，再次重建');
                        this.createPlayerAvatars();
                    }
                }
            }, 500);
        }

        // ✅ [修改] 切换显示/隐藏：如果已显示则隐藏，否则显示
        if (this._quickMsgPanel && this._quickMsgPanel.isValid && this._quickMsgPanel.parent) {
            // 已存在且有效，切换显示状态
            if (this._quickMsgPanel.active) {
                this._quickMsgPanel.active = false;
                LogService.info('gamingPvp', '快捷消息面板已隐藏');
            } else {
                this._quickMsgPanel.active = true;
                LogService.info('gamingPvp', '快捷消息面板已显示');
            }
        } else {
            // 不存在或已失效，需要加载新的
            this._quickMsgPanel = null;
            
            const canvas = find('Canvas');
            if (canvas) {
                const existingPanels = canvas.children.filter(child => child.name === 'QuickMsgSelectWnd');
                if (existingPanels.length > 0) {
                    LogService.warn('gamingPvp', `检测到 Canvas 下有 ${existingPanels.length} 个残留的 QuickMsgSelectWnd，清理它们`);
                    existingPanels.forEach(panel => {
                        panel.destroy();
                    });
                }
            }

            resources.load('Components/QuickMsg/QuickMsgSelectWnd', Prefab, (err, prefab) => {
                if (err) {
                    LogService.error('gamingPvp', `加载快捷消息面板失败: ${err}`);
                    return;
                }

                if (this._quickMsgPanel && this._quickMsgPanel.isValid) {
                    LogService.warn('gamingPvp', '加载完成后发现已存在 QuickMsgSelectWnd，销毁新创建的实例');
                    return;
                }

                this._quickMsgPanel = instantiate(prefab);
                const canvasNode = find('Canvas');
                if (canvasNode) {
                    this._quickMsgPanel.setParent(canvasNode, false);
                    this._quickMsgPanel.setSiblingIndex(9999);
                    this._quickMsgPanel.active = true;

                    LogService.info('gamingPvp', '快捷消息面板已加载并显示');
                } else {
                    LogService.error('gamingPvp', '未找到 Canvas 节点');
                }
            });
        }
    }

    /**
     * 发送快捷消息
     * @param msgKey 消息键
     */
    public sendQuickMsg(msgKey: string) {
        if (!this._gameNetwork) {
            LogService.error('gamingPvp', 'sendQuickMsg: GameNetwork 未初始化');
            return;
        }

        const msgLabel = this._getQuickMsgLabel(msgKey);

        SoundManager.getInstance().playQuickMsg(msgKey);

        this._gameNetwork.sendQuickMsg(msgKey, msgLabel);
        LogService.info('gamingPvp', `📤 发送快捷消息: msgKey=${msgKey}, label=${msgLabel}, roomId=${this._roomId}`);

        if (this._quickMsgPanel) {
            this._quickMsgPanel.active = false;
        }

        this._startSayBtnCooldown();
    }

    /**
     * 获取快捷消息标签
     * @param msgKey 消息键
     */
    private _getQuickMsgLabel(msgKey: string): string {
        return GAME_MSG_LABELS[msgKey] || '';
    }

    /**
     * 开始 sayBtn 冷却
     */
    private _startSayBtnCooldown() {
        this._isSayBtnCooldown = true;
        if (this.sayBtn) {
            this.sayBtn.active = false;
        }

        const timeoutId = setTimeout(() => {
            this._isSayBtnCooldown = false;
            if (this.sayBtn) {
                this.sayBtn.active = true;
            }
            LogService.info('gamingPvp', '快捷消息按钮冷却结束，恢复显示');
        }, 5000);

        this._activeTimeouts.add(timeoutId);
    }

    /**
     * 收到其他玩家快捷消息广播
     * @param msgKey 消息键
     */
    public onQuickMsgReceived(msgKey: string) {
        LogService.info('gamingPvp', `收到快捷消息广播: ${msgKey}`);
        SoundManager.getInstance().playQuickMsg(msgKey);
    }

    /**
     * 处理服务端广播的快捷消息
     * @param data 消息数据
     */
    private handleQuickMsgBroadcast(data: any) {
        LogService.info('gamingPvp', `handleQuickMsgBroadcast: raw data = ${JSON.stringify(data)}`);
        
        if (!data) {
            LogService.error('gamingPvp', 'handleQuickMsgBroadcast: 消息数据为空');
            return;
        }

        if (Array.isArray(data) && data.length > 0) {
            data = data[0];
        }

        if (data.success === true && !data.msgKey) {
            LogService.info('gamingPvp', 'handleQuickMsgBroadcast: 跳过服务端确认响应（无msgKey）');
            return;
        }

        if (data.success === false || (data.code !== undefined && data.code >= 400)) {
            LogService.info('gamingPvp', `handleQuickMsgBroadcast: 跳过错误响应, code=${data.code}, message=${data.message}`);
            return;
        }

        let msgKey = '';

        if (data.msgKey !== undefined) {
            msgKey = String(data.msgKey);
        } else if (data.key !== undefined) {
            msgKey = String(data.key);
        } else if (data.messageKey !== undefined) {
            msgKey = String(data.messageKey);
        }

        if (!msgKey) {
            LogService.error('gamingPvp', `handleQuickMsgBroadcast: 消息数据无效，未找到 msgKey/key/messageKey 字段，数据: ${JSON.stringify(data)}`);
            return;
        }

        const senderUserId = data.userId;
        const currentUserId = this._gameNetwork?.getUserId();

        if (senderUserId !== undefined && currentUserId !== undefined && senderUserId === currentUserId) {
            LogService.info('gamingPvp', `handleQuickMsgBroadcast: 跳过自己发送的消息, msgKey=${msgKey}`);
            return;
        }

        LogService.info('gamingPvp', `handleQuickMsgBroadcast: msgKey=${msgKey}, msgLabel=${data.msgLabel || data.label}, senderUserId=${senderUserId}`);
        this.onQuickMsgReceived(msgKey);
    }

    onDestroy() {
        // 标记场景正在卸载，阻止后续消息处理
        this._isSceneUnloading = true;

        // ✅ [新增] 停止背景音乐
        SoundManager.getInstance().stopBgm();

        // ✅ [新增] 清理 GameNetwork 的所有回调引用，防止旧组件实例被继续调用
        // 这是防止场景切换后旧组件 safeSetTimeout 报错的关键修复
        if (this._gameNetwork) {
            try {
                this._gameNetwork.setOnPlayerJoin(null);
                this._gameNetwork.setOnPlayerExit(null);
                this._gameNetwork.setOnLoginSuccess(null);
                this._gameNetwork.setOnLoginFailed(null);
                this._gameNetwork.setOnRoomCreated(null);
                this._gameNetwork.setOnJoinRoom(null);
                this._gameNetwork.setOnMessage(null);
                this._gameNetwork.setOnError(null);
                this._gameNetwork.setOnPlayerReady(null);
                this._gameNetwork.setOnReconnectFailed(null);
                this._gameNetwork.setOnReconnectSuccess(null);
                this._gameNetwork.setOnHeartbeatTimeout(null);
            } catch (e) {
                LogService.warn('gamingPvp', 'onDestroy 清理 GameNetwork 回调失败', e);
            }
        }

        // ✅ [新增] 清理所有活跃的 setTimeout，防止回调在场景销毁后执行
        if (this._activeTimeouts) {
            this._activeTimeouts.forEach(id => clearTimeout(id));
            this._activeTimeouts.clear();
        }

        // ✅ [新增] 清理断线重连本地超时定时器
        this._cancelDisconnectLocalTimeout();

        // ✅ [新增] 清理断线遮罩触摸阻挡器
        this._removeDisconnectMaskTouchBlocker();

        // ✅ [新增] 清理所有 Cocos 定时器
        this.unscheduleAllCallbacks();

        // ✅ [新增] 销毁 Presenter 模块
        this._destroyPresenters();

        // ✅ [新增] 销毁 Service 模块
        this._destroyServices();

        // 清理 UI 管理器的计时器（增强防御性检查）
        if (this._uiManager && this.container && this.container.isValid) {
            try {
                this._uiManager.stopActionTimer(this.container);
            } catch (error) {
                LogService.error('gamingPvp', 'onDestroy - 停止计时器失败', error);
            }
        }

        // 清理玩家管理器的闪烁 tween
        if (this._playerManager && this.playersContainer && this.playersContainer.isValid) {
            try {
                this._playerManager.stopAllPlayersBlink(this.playersContainer);
            } catch (error) {
                LogService.error('gamingPvp', 'onDestroy - 停止闪烁动画失败', error);
            }
        }

        // ✅ [新增] 清理所有玩家头像和内存 Map
        try {
            this.clearPlayerAvatars();
        } catch (error) {
            LogService.error('gamingPvp', 'onDestroy - 清理头像失败', error);
        }

        if (this._playerReadyStatus) {
            this._playerReadyStatus.clear();
        }

        if (this._playerReadyRetryMap) {
            this._playerReadyRetryMap.clear();
        }

        if (this._refreshCooldownTimer) {
            clearTimeout(this._refreshCooldownTimer);
            this._refreshCooldownTimer = null;
        }

        this._isRefreshing = false;

        // 停止所有牌节点的 tween（通过移除所有子节点）
        if (this.container && this.container.isValid) {
            try {
                this.container.removeAllChildren();
            } catch (error) {
                LogService.error('gamingPvp', 'onDestroy - 清理容器子节点失败', error);
            }
        }

        // ✅ [新增] 清理 NetworkOptimizer 资源，防止场景切换后消息重试
        try {
            NetworkOptimizer.getInstance().cleanup();
        } catch (e) {
            LogService.warn('gamingPvp', 'onDestroy 清理 NetworkOptimizer 失败', e);
        }

        // ✅ [新增] 清理所有按钮事件监听
        try {
            if (this._startGameBtn) {
                this._startGameBtn.off('click', this.onStartGameClicked, this);
            }
            if (this.exitBtn) {
                this.exitBtn.off('click', this.onExitBtnClicked, this);
            }
            if (this.sayBtn) {
                this.sayBtn.off('click', this.onSayBtnClicked, this);
            }
            if (this.refreshBtn) {
                const btnComp = this.refreshBtn.getComponent(Button);
                if (btnComp) {
                    btnComp.node.off('click', this.onRefreshBtnClicked, this);
                }
            }
        } catch (e) {
            LogService.warn('gamingPvp', 'onDestroy 清理按钮事件失败', e);
        }
    }

    /**
     * 安全的 setTimeout 包装，记录 ID 以便 onDestroy 时清理
     */
    private safeSetTimeout(callback: () => void, delay: number): number {
        if (!this._activeTimeouts) {
            this._activeTimeouts = new Set();
        }
        const id = setTimeout(() => {
            if (this._activeTimeouts) {
                this._activeTimeouts.delete(id);
            }
            if (!this._isSceneUnloading) {
                callback();
            }
        }, delay);
        this._activeTimeouts.add(id);
        return id;
    }

    /**
     * 启动背景音乐
     * 处理浏览器自动播放限制，在用户交互后再播放
     */
    private _startBackgroundMusic() {
        const soundManager = SoundManager.getInstance();
        soundManager.playClubBgm();
    }

    /**
     * 初始化网络
     */
    initNetwork() {
        this._gameNetwork = GameNetwork.getInstance();

        // ✅ [关键修复1] 设置玩家加入回调（处理缓存消息）
        // 确保 _playerManager 已初始化后再处理消息
        this._gameNetwork.setOnPlayerJoin((data) => {
            if (!this._playerManager) {
                this.scheduleOnce(() => {
                    if (this._playerManager) {
                        this.handlePlayerJoin(data);
                    } else {
                        this.safeSetTimeout(() => {
                            if (this._playerManager) {
                                this.handlePlayerJoin(data);
                            }
                        }, 200);
                    }
                }, 0);
                return;
            }
            this.handlePlayerJoin(data);
        });

        this._gameNetwork.setOnLoginSuccess((data) => {
            LogService.info('gamingPvp', '登录成功，尝试恢复房间状态...');
            if (this._roomId > 0) {
                LogService.info('gamingPvp', `已有房间ID ${this._roomId}，尝试重新加入...`);
                this._gameNetwork.createRoom(this._roomId);
            } else {
                const pendingJoinRoomId = this._gameNetwork.getPendingJoinRoomId();
                const roomCode = this._gameNetwork.getRoomCode();
                if (pendingJoinRoomId && roomCode) {
                    LogService.info('gamingPvp', `登录成功，有待加入的房间: roomCode=${roomCode}`);
                    this._gameNetwork.joinRoom(roomCode, 'PVP', 'Player', '');
                } else {
                    LogService.info('gamingPvp', '登录成功，无房间，切换到房间场景');
                    this._transitionToScene('room');
                }
            }
        });

        this._gameNetwork.setOnLoginCallback((reason: string) => {
            LogService.info('gamingPvp', `登录回调触发，原因: ${reason}`);
            if (this._roomId > 0) {
                LogService.info('gamingPvp', '自动重新登录后尝试重新加入房间...');
                this._gameNetwork.connectToServer('PVP');
            }
        });

        this._gameNetwork.setOnLoginFailed((error) => {
            LogService.error('gamingPvp', '========== 登录失败 ==========');
            LogService.error('gamingPvp', '错误信息:', error);
            //LogService.error('gamingPvp', '登录失败，无法进入游戏');
        });

        this._gameNetwork.setOnRoomCreated((data) => {
            if (data.code === ResponseCode.SUCCESS) {
                this._roomId = data.roomId;
                this.startGameWithServerConfig(data);
            } else {
                LogService.error('gamingPvp', '失败原因:', data.msg || data.message);
            }
        });

        this._gameNetwork.setOnJoinRoom((data) => {
            if (data.code === ResponseCode.SUCCESS) {
                this._roomId = data.roomId;
                this.startGameWithServerConfig(data);
            } else {
                LogService.error('gamingPvp', '失败原因:', data.msg || data.message);
            }
        });

        this._gameNetwork.setOnPlayerExit((data) => {
            this.handlePlayerExit(data);
        });

        this._gameNetwork.setOnMessage((cmd, data) => {
            this.handleServerMessage(cmd, data);
        });

        this._gameNetwork.setOnError((error) => {
            this.handleServerError(error);
        });

        this._gameNetwork.setOnHeartbeatTimeout(() => {
            LogService.warn('gamingPvp', '心跳超时，网络连接已断开');
            this._showNetworkDisconnectTip();
        });

        this._gameNetwork.setOnReconnectFailed(() => {
            LogService.error('gamingPvp', '❌ WebSocket 重连失败，已达到最大重连次数，退出房间返回大厅');
            
            this._handleReconnectFailed();
        });

        // ✅ [修复] 重连成功后隐藏断线重连遮罩和网络断联提示，并重设消息回调
        this._gameNetwork.setOnReconnectSuccess((gameState) => {
            LogService.info('gamingPvp', '重连成功，隐藏断线重连遮罩');
            if (this.disconnectMask && this.disconnectMask.active) {
                this.hideDisconnectMask();
            }
            
            // ✅ [关键修复] 重连成功后重新设置消息回调，确保后续消息能被正确处理
            // 这是解决 DEAL_BUTTON_SHOW_NOTIFY 消息丢失的关键步骤
            this._gameNetwork.setOnMessage((cmd, data) => {
                this.handleServerMessage(cmd, data);
            });
            LogService.info('gamingPvp', '重连成功后已重新设置消息回调');
        });

        if (this._gameNetwork.hasSavedRoomData()) {
            const savedData = this._gameNetwork.getSavedRoomData();
            this.startGameWithServerConfig(savedData);
        }
        
        /** JP 注释掉的代码
         
        // ✅ [关键修复] 场景加载完成后，检查是否有待加入的房间或房间配置
        // 如果有待加入的房间，自动加入房间（由 room.ts 设置的 pendingJoinRoomId）
        // const pendingJoinRoomId = this._gameNetwork.getPendingJoinRoomId();
        // const roomCode = this._gameNetwork.getRoomCode();
        // if (pendingJoinRoomId && roomCode) {
        //     LogService.info('gamingPvp', `场景加载完成，自动加入房间: roomCode=${roomCode}, pendingJoinRoomId=${pendingJoinRoomId}`);
        //     this._gameNetwork.joinRoom(roomCode, 'PVP', 'Player', '');
        // }

        // ✅ [关键修复] 如果有待创建的房间配置，自动创建房间（由 room.ts 设置的 roomConfig）
        // const roomConfig = this._gameNetwork.getRoomConfig();
        // const roomType = this._gameNetwork.getRoomType();
        // if (roomConfig && roomType === 'PVP') {
        //     LogService.info('gamingPvp', `场景加载完成，自动创建房间: roomType=${roomType}, maxPlayers=${roomConfig.maxPlayers}`);
        //     this._gameNetwork.createRoom();
        // }
        * 
         */

        if (this._gameNetwork.isConnected() && this._gameNetwork.getWalletAddress()) {
        } else {
            this.scheduleOnce(() => {
                this._transitionToScene('index');
            }, 0.5);
        }
    }

    /**
     * 显示网络断联提示
     */
    private _showNetworkDisconnectTip(): void {
        DialogManager.show({
            title: '网络断联',
            content: '网络连接已断开，正在尝试重新连接...',
            confirmText: '确定',
        });
    }

    /**
     * 处理继续游戏响应
     */
    handleContinueGameResponse(data: any) {
        LogService.info('gamingPvp', `handleContinueGameResponse: 收到继续游戏响应, data=${JSON.stringify(data).substring(0, 200)}`);
        
        // ✅ [关键修复] 玩家确认后，不需要显示遮罩，确保遮罩保持隐藏状态
        if (this._maskNode) {
            this._maskNode.active = false;
        }
        
        // ✅ [修复] 更新玩家准备状态（服务端在确认结算时将玩家设为未准备）
        if (data.players && data.players.length > 0 && data.hostUserId !== undefined) {
            this._hostUserId = data.hostUserId;
            const currentUserId = (this._gameNetwork as any)?._userId;
            const maxPlayers = data.maxPlayers || (this._settingsManager ? this._settingsManager.getPlayerCount() : 9);

            // ✅ [修复] 结算阶段使用 isInSettlement=true 重建头像，避免重置游戏状态
            const isInSettlement = this._isGameEnded && !this._isNewRoundStarted;
            this.updateRoomPlayers(data.players, currentUserId, maxPlayers, isInSettlement);
            this.updateHomeownerIndicator();

            // 同步当前玩家准备状态
            for (const playerData of data.players) {
                if (playerData.userId === currentUserId) {
                    this._isCurrentPlayerReady = playerData.isReady !== undefined ? playerData.isReady : false;
                    break;
                }
            }

            this.updateReadyIndicator();
            this.updateButtonVisibility();
            
            // ✅ [新增] 确保玩家头像存在，如果为空则重建
            if (this.playersContainer && this.playersContainer.children.length === 0) {
                LogService.warn('gamingPvp', 'handleContinueGameResponse: 玩家头像为空，重新创建');
                this.createPlayerAvatars();
            }
        } else {
            // ✅ [新增] 如果服务端响应中没有 players 数据，主动重建玩家头像
            LogService.warn('gamingPvp', 'handleContinueGameResponse: 响应中没有 players 数据，主动重建玩家头像');
            if (this.playersContainer && this.playersContainer.children.length === 0) {
                this.createPlayerAvatars();
            }
        }

        // ✅ [修复] 不直接调用 handleAllPlayersConfirmed，该方法是所有玩家都确认后的清理逻辑
        // 单个玩家确认后仅更新准备状态，由服务端统一判断何时所有玩家确认完成
    }

    /**
     * 处理玩家加入通知
     * @param data 玩家加入数据
     */
    handlePlayerJoin(data: any) {
        if (!data) {
            LogService.warn('gamingPvp', 'handlePlayerJoin: data is null or undefined');
            return;
        }

        if (this._isSceneUnloading) {
            LogService.warn('gamingPvp', 'handlePlayerJoin: 场景正在卸载，忽略消息');
            return;
        }

        // ✅ [修复] 有玩家加入房间时，隐藏断线重连遮罩
        // 兜底方案：确保新玩家加入或断线玩家重连后，遮罩能正确隐藏
        let isReconnecting = false;
        if (this.disconnectMask && this.disconnectMask.active) {
            this.hideDisconnectMask();
            isReconnecting = true;
            LogService.info('gamingPvp', 'handlePlayerJoin: 有玩家加入，隐藏断线重连遮罩');
        }

        if (data.players && data.players.length > 0) {
            const isInSettlement = this._isGameEnded && !this._isNewRoundStarted;
            if (!isInSettlement) {
                const playersHash = JSON.stringify(data.players.map((p:any) => ({userId:p.userId, seatIndex:p.seatIndex})));
                const now = Date.now();
                if (this._lastPlayerJoinHash === playersHash && now - this._lastPlayerJoinTime < 1000) {
                    return;
                }
                this._lastPlayerJoinHash = playersHash;
                this._lastPlayerJoinTime = now;
            }
        }

        if (data.roomId && !this._roomId) {
            this._roomId = data.roomId;
            LogService.info('gamingPvp', `handlePlayerJoin: 设置房间ID: ${this._roomId}`);
        }

        const totalPlayers = data.totalPlayers || (data.players ? data.players.length : 1);
        const maxPlayers = data.maxPlayers || 5;

        if (data.hostUserId) {
            this._hostUserId = data.hostUserId;
            const currentUserId = this._gameNetwork?.getUserId();
            // ✅ [关键修复] 必须同时处理房主和房主身份的设置，避免非房主玩家被错误标记为房主
            if (currentUserId && currentUserId.toString() === data.hostUserId.toString()) {
                this._isRoomOwner = true;
            } else {
                // ✅ [修复] 当前玩家不是房主时，必须重置_isRoomOwner为false
                // 防止之前的状态残留导致UI显示错误
                this._isRoomOwner = false;
            }
        }

        if (data.currentRound !== undefined && data.maxRounds !== undefined) {
            LogService.info('gamingPvp', `handlePlayerJoin: 同步局数信息 - currentRound=${data.currentRound}, maxRounds=${data.maxRounds}`);
            this.updateRoundsDisplay(data.currentRound, data.maxRounds);
        }

        if (data.players && data.players.length > 0) {
            if (!this._gameNetwork) {
                LogService.warn('gamingPvp', 'handlePlayerJoin: _gameNetwork is null, cannot get current user ID');
                return;
            }
            const currentUserId = this._gameNetwork.getUserId();
            const isInSettlement = this._isGameEnded && !this._isNewRoundStarted;
            const isGameInProgress = data.isGameInProgress !== undefined ? data.isGameInProgress : false;
            
            //LogService.info('gamingPvp', `handlePlayerJoin: totalPlayers=${totalPlayers}, isInSettlement=${isInSettlement}, isGameInProgress=${isGameInProgress}`);
            //LogService.info('gamingPvp', `handlePlayerJoin: players list: ${JSON.stringify(data.players.map((p:any) => ({userId:p.userId, seatIndex:p.seatIndex, nickname:p.nickname})))}`);
            
            this.updateRoomPlayers(data.players, currentUserId, maxPlayers, isInSettlement || isGameInProgress);
            
            this.updateHomeownerIndicator();
        } else {
            //LogService.warn('gamingPvp', 'handlePlayerJoin: players array is empty or undefined');
        }

        if (this._playerManager && data.allReadyStates) {
            this._playerManager.setAllReadyStates(data.allReadyStates);
            this.updateReadyIndicator();
        }

        // ✅ [修复] 重连场景下不更新mask可见性，确保重连成功后mask保持隐藏状态
        if (!isReconnecting) {
            this._updateMaskVisibility(totalPlayers);
        }
        this.updateButtonVisibility();
        
        // ✅ [关键修复] 玩家加入后更新手牌位置
        // 新玩家加入可能导致活跃玩家数量变化，玩家位置重新计算
        // 需要更新已有手牌的位置以匹配新的头像位置
        if (this._gameFlowPvpController?.isInGamePhase()) {
            this.updatePlayerCardsPosition();
        }
        
        // ✅ [关键修复] 调整 _playerCards 数组大小以匹配新的玩家数量
        // 当玩家数量增加时，确保数组足够大
        if (this._playerCards && this._playerCards.length < this._playerManager.getPlayersNum()) {
            const currentLength = this._playerCards.length;
            const newLength = this._playerManager.getPlayersNum();
            for (let i = currentLength; i < newLength; i++) {
                this._playerCards[i] = [];
            }
            LogService.info('gamingPvp', `[handlePlayerJoin] 调整 _playerCards 数组大小: ${currentLength} -> ${newLength}`);
        }
    }

    /**
     * 处理玩家退出房间通知
     * @param data 玩家退出数据
     */
    handlePlayerExit(data: any) {
        // ✅ [修复] 检查场景是否正在卸载
        if (this._isSceneUnloading) {
            //LogService.warn('gamingPvp', 'handlePlayerExit: 场景正在卸载，忽略消息');
            return;
        }

        // ✅ [新增] 检查 _playerManager 是否为 null
        if (!this._playerManager) {
            //LogService.warn('gamingPvp', 'handlePlayerExit: _playerManager is null，延迟处理');
            // 延迟处理
            this.scheduleOnce(() => {
                if (this._playerManager) {
                    this.handlePlayerExit(data);
                }
            }, 0.1);
            return;
        }

        const exitingUserId = data.userId;
        const currentUserId = this._gameNetwork.getUserId();
        // ✅ [修复] 优先使用 totalPlayers，保持与服务端一致
        const remainingPlayers = data.totalPlayers !== undefined ? data.totalPlayers :
            (data.remainingPlayers !== undefined ? data.remainingPlayers : 0);
        // ✅ [修复] 使用服务端返回的 maxPlayers，不要使用默认值
        const maxPlayers = data.maxPlayers !== undefined ? data.maxPlayers :
            (this._settingsManager ? this._settingsManager.getPlayerCount() : 5);

        // ✅ [关键修复] 检查是否是当前玩家被踢出
        if (currentUserId && exitingUserId && currentUserId.toString() === exitingUserId.toString()) {
            // ✅ [规则0修改] 在规则0（计分模式）下，即使玩家筹码为0也不踢出房间
            if (this._scoreType === 0) {
                LogService.info('gamingPvp', '[规则0] 计分模式下，当前玩家筹码为0不退出房间，只更新状态');
                const newChips = data.gameCoin !== undefined ? data.gameCoin : 0;
                const seatIndex = this._playerManager.getPlayerIndexByUserId(exitingUserId);
                if (seatIndex !== -1) {
                    this._gameManager.setPlayerChips(seatIndex, newChips);
                    this._uiManager.updateAvatarAmount(this.playersContainer, seatIndex, newChips);
                }
                // 更新玩家列表（即使不退出也要同步状态）
                if (data.players && data.players.length >= 0) {
                    const isInSettlement = this._isGameEnded && !this._isNewRoundStarted;
                    this.updateRoomPlayers(data.players, currentUserId, maxPlayers, isInSettlement);
                }
                return;
            }

            //LogService.info('gamingPvp', '当前玩家被踢出房间，准备退出并跳转到index场景');

            // 显示提示信息
            const reason = data.reason || 'CHIPS_ZERO';
            const message = data.message || '筹码已用尽，被移出房间';
            //LogService.info('gamingPvp', `踢出原因: ${reason}, 消息: ${message}`);

            // ✅ [修复] 不再断开WebSocket连接，保持钱包连接和长连接
            // 只发送退出房间请求
            if (this._gameNetwork && this._roomId > 0) {
                this._gameNetwork.exitRoom(this._roomId);
                LogService.info('gamingPvp', `发送退出房间请求 roomId=${this._roomId}`);
            }

            // 清理游戏状态
            this._cleanupGameState();

            // 跳转到index场景
            //LogService.info('gamingPvp', '跳转到index场景');
            this._transitionToScene('index');
            return;
        }

        // ✅ [修复] 房主标识更新与玩家列表更新解耦
        // 之前：房主未变时直接 return，导致跳过 updateRoomPlayers，非房主离开时其他玩家看不到 UI 更新
        // 现在：房主变化时更新房主 UI，无论房主是否变化都继续执行后续的玩家列表更新
        // ✅ [新增] 如果游戏已结束（达到最大局数），不需要更新房主标识，因为游戏结束后不再需要房主功能
        // ✅ [关键修复] 同时检查 _isGameEnded 和 _currentRound >= _maxRounds
        // 防止其他玩家在收到房主退出通知时，_isGameEnded 还未被设置为 true 的情况
        const isLastRound = this._currentRound >= this._maxRounds;
        const shouldUpdateHost = !this._isGameEnded && !isLastRound;
        
        LogService.info('gamingPvp', `[handlePlayerExit] 房主变更检查: _isGameEnded=${this._isGameEnded}, isLastRound=${isLastRound}, shouldUpdateHost=${shouldUpdateHost}, currentRound=${this._currentRound}, maxRounds=${this._maxRounds}`);

        if (shouldUpdateHost) {
            if (data.hostUserId !== undefined) {
                const oldHostUserId = this._hostUserId;
                const newHostUserId = data.hostUserId;

                if (oldHostUserId !== newHostUserId) {
                    this._hostUserId = newHostUserId;
                    const currentUserId = this._gameNetwork?.getUserId();
                    const isNewHost = currentUserId && currentUserId.toString() === newHostUserId.toString();

                    LogService.info('gamingPvp', `房主已变更: 旧房主=${oldHostUserId}, 新房主=${newHostUserId}, 当前玩家是否新房主=${isNewHost}`);

                    if (isNewHost) {
                        this._isRoomOwner = true;
                        LogService.info('gamingPvp', '当前玩家成为新房主，更新按钮显示状态');
                        this.updateButtonVisibility();
                    } else if (oldHostUserId && data.players && !data.players.find((p:any) => Number(p.userId) === Number(oldHostUserId))) {
                        LogService.info('gamingPvp', '原房主已离开，更新按钮显示状态');
                        this.updateButtonVisibility();
                    }
                }
            } else if (data.newHostUserId) {
                this._hostUserId = data.newHostUserId;
                LogService.info('gamingPvp', `房主已变更: ${data.newHostUserId}`);
            }

            this.updateHomeownerIndicator();
        } else {
            LogService.info('gamingPvp', '[游戏已结束或最后一局] 跳过房主变更 UI 更新，因为游戏已达到最大局数');
        }

        // ✅ [新增] 检查是否可以开始游戏
        const canStartGame = data.canStartGame !== undefined ? data.canStartGame : (remainingPlayers > 1);
        if (!canStartGame) {
            //LogService.info('gamingPvp', `玩家数量不足，无法开始游戏: ${remainingPlayers} 人`);
            // 可以在这里显示提示给玩家
        }

        // ✅ [修复] 玩家退出时，根据服务端数据更新玩家列表
        // updateRoomPlayers 内部会根据情况调用 createPlayerAvatars，不需要手动清理
        if (data.players && data.players.length >= 0) {
            const isInSettlement = this._isGameEnded && !this._isNewRoundStarted;
            const isGameInProgress = data.isGameInProgress !== undefined ? data.isGameInProgress : false;

            // ✅ [关键修复] 结算阶段不重建玩家头像
            // 原因：结算后服务端会自动退出离线玩家（房间玩家），但牌局玩家仍应显示完整牌局数据
            // 如果此时重建头像，会使用房间玩家列表（人数变少），导致结算界面只显示部分玩家
            if (isInSettlement) {
                LogService.info('gamingPvp', `[结算阶段] 玩家退出，不重建头像: exitingUserId=${exitingUserId}, 保持牌局玩家显示`);
                // 仅更新房主指示器，不重建玩家头像
                this.updateHomeownerIndicator();
            } else {
                // 非结算阶段，正常更新玩家列表
                // LogService.info('gamingPvp', `玩家退出，更新房间玩家: 当前玩家数=${remainingPlayers}, 最大玩家数=${maxPlayers}, isGameInProgress=${isGameInProgress}`);

                // 调用更新房间玩家方法（内部会处理头像清理和重建）
                this.updateRoomPlayers(data.players, currentUserId, maxPlayers, isInSettlement || isGameInProgress);
            }
        }

        // ✅ [新增] 根据房间人数显示/隐藏遮罩层
        this._updateMaskVisibility(remainingPlayers);

        // ✅ [新增] 如果是当前用户退出，显示提示
        if (exitingUserId === currentUserId) {
           // LogService.info('gamingPvp', '当前用户已退出房间');
        } else {
            //LogService.info('gamingPvp', `玩家 ${exitingUserId} 已退出房间，剩余 ${remainingPlayers} 人`);
        }

        // 更新按钮显示状态
        this.updateButtonVisibility();
    }

    /**
     * ✅ [新增] 处理seatIndex重新排序通知
     * 当服务端round列表中玩家seatIndex发生变化时，同步更新客户端状态
     * @param data 服务端发送的seatIndex重排序数据
     */
    private handleSeatIndexReorder(data: any) {
        if (!data || !data.roomId || !data.players) {
            LogService.warn('gamingPvp', 'handleSeatIndexReorder: 数据不完整');
            return;
        }

        LogService.info('gamingPvp', `handleSeatIndexReorder: seatIndex重新排序，roomId=${data.roomId}`);

        if (!this._playerManager) {
            LogService.warn('gamingPvp', 'handleSeatIndexReorder: _playerManager is null');
            return;
        }

        const currentUserId = this._gameNetwork?.getUserId();

        // 重新更新房间玩家列表，使用服务端最新的seatIndex
        const maxPlayers = data.maxPlayers !== undefined ? data.maxPlayers :
            (this._settingsManager ? this._settingsManager.getPlayerCount() : 5);

        this.updateRoomPlayers(data.players, currentUserId, maxPlayers, true);

        LogService.info('gamingPvp', 'handleSeatIndexReorder: 客户端seatIndex已同步完成');
    }

    /**
     * 处理房间信息同步响应（刷新按钮点击后服务端返回的响应）
     * 根据当前游戏阶段进行差异化同步处理：
     * 1. 游戏开始前：同步房间信息、玩家列表、准备状态、房主标识
     * 2. 游戏进行中：同步完整游戏状态（底池、公共牌、玩家操作状态等）
     * 3. 结算阶段：同步玩家信息和筹码，不清空结算面板
     * @param data 服务端返回的房间信息
     */
    private handleRoomInfoResponse(data: any) {
        if (!data || !data.success) {
            LogService.warn('gamingPvp', '房间信息同步响应失败:', data);
            return;
        }

        LogService.info('gamingPvp', '收到房间信息同步响应，开始同步游戏状态');

        const currentUserId = this._gameNetwork?.getUserId();
        const maxPlayers = this._settingsManager ? this._settingsManager.getPlayerCount() : 9;

        if (data.roomId) {
            this._roomId = data.roomId;
        }
        if (data.roomCode) {
            this._room_code = data.roomCode;
        }
        if (data.ownerId !== undefined || data.hostUserId !== undefined) {
            this._hostUserId = data.ownerId !== undefined ? data.ownerId : data.hostUserId;
        }

        if (data.currentRoundIndex !== undefined) {
            this._currentRound = data.currentRoundIndex;
        }

        const serverStatus = data.status || data.gameStatus;
        const serverPhase = data.phase || data.gamePhase;
        const isGameInProgress = data.isGameInProgress !== undefined ? data.isGameInProgress : false;

        const isSettlementPhase = serverPhase === 'SETTLEMENT' || 
                                  serverStatus === 'WAITING_FOR_CONFIRMATION' ||
                                  serverStatus === 'SETTLEMENT';
        const isWaitingPhase = serverStatus === 'WAITING' || 
                               serverStatus === 'READY' ||
                               serverPhase === 'WAITING' ||
                               serverPhase === 'READY';
        const clientInSettlement = this._isGameEnded && !this._isNewRoundStarted;

        // ✅ [修复] 阶段判定优先级：WAITING > IN_GAME > SETTLEMENT
        // 原因：当 serverStatus=WAITING 但 serverPhase=SETTLEMENT 时（上一局已结束，等待下一局），
        // 应该优先判定为 WAITING 阶段，否则会走 SETTLEMENT 逻辑导致按钮显示异常
        let syncPhase = 'UNKNOWN';
        if (isWaitingPhase && !isGameInProgress) {
            syncPhase = 'WAITING';
        } else if (isGameInProgress) {
            syncPhase = 'IN_GAME';
        } else if (isSettlementPhase || clientInSettlement) {
            syncPhase = 'SETTLEMENT';
        }

        LogService.info('gamingPvp', `房间信息同步阶段判定: serverStatus=${serverStatus}, serverPhase=${serverPhase}, ` +
            `isGameInProgress=${isGameInProgress}, clientInSettlement=${clientInSettlement}, syncPhase=${syncPhase}`);

        if (!data.players || data.players.length === 0) {
            LogService.warn('gamingPvp', '房间信息同步响应中没有玩家数据');
            return;
        }

        switch (syncPhase) {
            case 'WAITING':
                this._syncRoomInfoWaitingPhase(data, currentUserId, maxPlayers);
                break;
            case 'IN_GAME':
                this._syncRoomInfoInGamePhase(data, currentUserId, maxPlayers);
                break;
            case 'SETTLEMENT':
                this._syncRoomInfoSettlementPhase(data, currentUserId, maxPlayers);
                break;
            default:
                this._syncRoomInfoWaitingPhase(data, currentUserId, maxPlayers);
                break;
        }

        if (data.maxRounds !== undefined && data.currentRoundIndex !== undefined) {
            this.updateRoundsDisplay(data.currentRoundIndex, data.maxRounds);
        }

        LogService.info('gamingPvp', `房间信息同步完成，阶段=${syncPhase}，玩家数=${data.players.length}`);
    }

    /**
     * 游戏开始前（WAITING 阶段）同步房间信息
     * 同步内容：房间信息、玩家列表、准备状态、房主标识、筹码
     */
    private _syncRoomInfoWaitingPhase(data: any, currentUserId: number, maxPlayers: number): void {
        LogService.info('gamingPvp', '[WAITING阶段] 同步房间信息');

        this.updateRoomPlayers(data.players, currentUserId, maxPlayers, false);
        this.updateHomeownerIndicator();

        // 同步房主标识
        if (this._hostUserId !== undefined && currentUserId !== undefined) {
            const isHost = this._hostUserId.toString() === currentUserId.toString();
            this._isRoomOwner = isHost;
            LogService.info('gamingPvp', `[WAITING阶段] 同步房主标识: isHost=${isHost}, hostUserId=${this._hostUserId}, currentUserId=${currentUserId}`);
        }

        // 同步当前玩家准备状态
        if (data.players) {
            for (const playerData of data.players) {
                if (playerData.userId === currentUserId) {
                    this._isCurrentPlayerReady = playerData.isReady !== undefined ? playerData.isReady : false;
                    break;
                }
            }
        }

        this.updateReadyIndicator();

        // ✅ [修复] 如果服务端返回了 showDealButton 字段，优先使用服务端的判断
        // 否则调用 updateButtonVisibility 本地计算
        if (data.showDealButton !== undefined && data.showDealButton && this._isRoomOwner) {
            LogService.info('gamingPvp', '[WAITING阶段] 服务端指示显示开始按钮');
            this.showDealButton();
        } else {
            this.updateButtonVisibility();
        }

        const potValue = data.totalPot !== undefined ? data.totalPot : (data.pot !== undefined ? data.pot : 0);
        if (this._uiManager && this.potLabel) {
            this._uiManager.updatePotDisplay(this.potLabel, potValue);
        }
        if (this._gameManager) {
            this._gameManager.setMainPot(potValue);
        }
    }

    /**
     * 游戏进行中同步房间信息
     * 同步内容：完整游戏状态，包括底池、公共牌、位置信息、玩家实时状态、自己的底牌、操作按钮
     */
    private _syncRoomInfoInGamePhase(data: any, currentUserId: number, maxPlayers: number): void {
        LogService.info('gamingPvp', '[游戏进行中] 同步完整游戏状态');

        this._isGameEnded = false;
        this._isNewRoundStarted = false;

        this.updateRoomPlayers(data.players, currentUserId, maxPlayers, true);
        this.updateHomeownerIndicator();
        this._syncGameStateFromRoomInfo(data);
        this._syncPlayerGameState(data.players, currentUserId);
        this._syncCurrentActPlayerFromRoomInfo(data, currentUserId);
        this._syncGamePhaseFromRoomInfo(data);
        this._restoreActionButtonsIfNeeded(data, currentUserId);
    }

    /**
     * 从房间信息同步当前操作玩家
     */
    private _syncCurrentActPlayerFromRoomInfo(data: any, currentUserId: number): void {
        const actSeatIndex = data.actSeatIndex !== undefined ? data.actSeatIndex : data.currentActSeat;
        if (actSeatIndex === undefined || actSeatIndex === null || actSeatIndex < 0) {
            LogService.info('gamingPvp', '[游戏同步] 无当前操作玩家，跳过设置');
            return;
        }

        if (this._playerManager) {
            this._playerManager.setCurrentPlayer(actSeatIndex);
            LogService.info('gamingPvp', `[游戏同步] 设置当前操作玩家: seatIndex=${actSeatIndex}`);
        }

        if (this._gameFlowPvpController) {
            this._gameFlowPvpController.setCurrentTurnPlayer(actSeatIndex, false);
        }
    }

    /**
     * 从房间信息同步游戏阶段
     */
    private _syncGamePhaseFromRoomInfo(data: any): void {
        const phase = data.phase || data.gamePhase;
        if (!phase) return;

        if (this._gameFlowPvpController) {
            this._gameFlowPvpController.setGamePhase(phase);
            LogService.info('gamingPvp', `[游戏同步] 设置游戏阶段: phase=${phase}`);
        }
    }

    /**
     * 如果需要，恢复操作按钮显示
     */
    private _restoreActionButtonsIfNeeded(data: any, currentUserId: number): void {
        const actSeatIndex = data.actSeatIndex !== undefined ? data.actSeatIndex : data.currentActSeat;
        if (actSeatIndex === undefined || actSeatIndex === null || actSeatIndex < 0) {
            return;
        }

        const currentPlayerSeat = this._playerManager?.getPlayerSeat();
        if (currentPlayerSeat === undefined || currentPlayerSeat === null) {
            return;
        }

        const isMyTurn = actSeatIndex === currentPlayerSeat;
        LogService.info('gamingPvp', `[游戏同步] 检查是否轮到当前玩家: actSeat=${actSeatIndex}, mySeat=${currentPlayerSeat}, isMyTurn=${isMyTurn}`);

        if (!isMyTurn) {
            if (this.playersActionNode) {
                this.playersActionNode.active = false;
            }
            return;
        }

        const currentPlayerData = data.players?.find((p: any) => p.seatIndex === actSeatIndex);
        if (currentPlayerData) {
            if (currentPlayerData.isFold || currentPlayerData.isFolded || currentPlayerData.folded) {
                LogService.info('gamingPvp', '[游戏同步] 当前操作玩家已弃牌，不显示操作按钮');
                return;
            }
            if (currentPlayerData.isAllIn || currentPlayerData.allIn) {
                LogService.info('gamingPvp', '[游戏同步] 当前操作玩家已全下，不显示操作按钮');
                return;
            }
        }

        const availableActions = data.availableActions;
        if (availableActions && Array.isArray(availableActions) && availableActions.length > 0) {
            LogService.info('gamingPvp', `[游戏同步] 使用服务端 availableActions 显示操作按钮: ${JSON.stringify(availableActions)}`);
            this._showActionButtonsWithAvailableActions(data, availableActions);
        } else {
            LogService.info('gamingPvp', '[游戏同步] 服务端未提供 availableActions，使用默认逻辑显示操作按钮');
            this._showDefaultActionButtons(data);
        }
    }

    /**
     * 使用 availableActions 显示操作按钮
     */
    private _showActionButtonsWithAvailableActions(data: any, availableActions: any[]): void {
        if (this._actionPresenter && this._gameFlowPvpController) {
            this._gameFlowPvpController.setServerAvailableActions(availableActions);
            this._actionPresenter.showPlayerActions(availableActions, data, {
                isMyTurn: true,
                needToCall: data.needToCall ?? data.currentBet ?? 0,
                playerChips: this._gameManager?.getPlayerChips(this._playerManager?.getPlayerSeat() ?? 0) ?? 0,
                currentBet: data.currentBet || 0,
                totalPot: data.totalPot || data.pot || 0
            });
            this.startActionTimer();
            this.enableActionButtons();
        } else if (this.playersActionNode) {
            this.playersActionNode.active = true;
            this.enableActionButtons();
            this.startActionTimer();
        }
    }

    /**
     * 使用默认逻辑显示操作按钮
     */
    private _showDefaultActionButtons(data: any): void {
        if (this.playersActionNode) {
            this.playersActionNode.active = true;
            this.enableActionButtons();
            this.startActionTimer();
            LogService.info('gamingPvp', '[游戏同步] 已显示默认操作按钮');
        }
    }

    /**
     * 结算阶段同步房间信息
     * 同步内容：玩家信息、筹码、准备状态，不清空结算面板
     * 注意：结算阶段重建头像后必须调用 updateButtonVisibility 恢复准备按钮显示
     */
    private _syncRoomInfoSettlementPhase(data: any, currentUserId: number, maxPlayers: number): void {
        LogService.info('gamingPvp', '[结算阶段] 同步玩家信息');

        this.updateRoomPlayers(data.players, currentUserId, maxPlayers, true);
        this.updateHomeownerIndicator();

        for (const playerData of data.players) {
            const userId = playerData.userId;
            const isReady = playerData.isReady !== undefined ? playerData.isReady : false;
            if (userId !== undefined) {
                this._playerManager.setPlayerReady(userId, isReady);
            }

            // 同步当前玩家的准备状态
            if (userId === currentUserId) {
                this._isCurrentPlayerReady = isReady;
            }

            const seatIndex = playerData.seatIndex;
            if (seatIndex !== undefined && seatIndex !== null && playerData.gameCoin !== undefined) {
                this._gameManager.setPlayerChips(seatIndex, playerData.gameCoin);
                if (this._uiManager && this.playersContainer) {
                    this._uiManager.updateAvatarAmount(this.playersContainer, seatIndex, playerData.gameCoin);
                }
            }
        }

        const potValue = data.totalPot !== undefined ? data.totalPot : (data.pot !== undefined ? data.pot : 0);
        if (this._uiManager && this.potLabel) {
            this._uiManager.updatePotDisplay(this.potLabel, potValue);
        }
        if (this._gameManager) {
            this._gameManager.setMainPot(potValue);
        }

        // ✅ [修复] 重建头像后准备按钮被隐藏，需要调用 updateButtonVisibility 恢复显示
        this.updateReadyIndicator();

        // ✅ [修复] 如果服务端返回了 showDealButton 字段，优先使用服务端的判断
        // 否则调用 updateButtonVisibility 本地计算
        if (data.showDealButton !== undefined && data.showDealButton && this._isRoomOwner) {
            LogService.info('gamingPvp', '[SETTLEMENT阶段] 服务端指示显示开始按钮');
            this.showDealButton();
        } else {
            this.updateButtonVisibility();
        }
    }

    /**
     * 从房间信息同步游戏状态（底池、公共牌、按钮位等）
     * @param data 服务端返回的房间信息
     */
    private _syncGameStateFromRoomInfo(data: any): void {
        if (!data) return;

        const potValue = data.totalPot !== undefined ? data.totalPot : data.pot;
        if (potValue !== undefined) {
            this._gameManager.setMainPot(potValue);
            this._uiManager.updatePotDisplay(this.potLabel, potValue);
        }

        if (data.sidePots && Array.isArray(data.sidePots)) {
            this._gameManager.setSidePots(data.sidePots);
            this._uiManager.updateSidePotsDisplay(this.sidePotsContainer, data.sidePots);
        }

        if (data.currentBet !== undefined) {
            this._gameManager.setCurrentBet(data.currentBet);
        }

        if (data.buttonIndex !== undefined) {
            this._gameManager.setButtonSeat(data.buttonIndex);
        }

        const communityCards = data.communityCards || data.publicCards || data.boardCards;
        if (communityCards && Array.isArray(communityCards) && communityCards.length > 0) {
            this.updateCommunityCardsFromState(communityCards);
        }

        const playerCount = data.players ? data.players.length : 0;
        if (data.buttonIndex !== undefined && playerCount > 0) {
            let smallBlindIndex = data.smallBlindPosition;
            let bigBlindIndex = data.bigBlindPosition;

            if (smallBlindIndex === undefined || smallBlindIndex < 0) {
                smallBlindIndex = (data.buttonIndex + 1) % playerCount;
            }
            if (bigBlindIndex === undefined || bigBlindIndex < 0) {
                bigBlindIndex = (data.buttonIndex + 2) % playerCount;
            }

            this.showPositionIcons(data.buttonIndex, smallBlindIndex, bigBlindIndex);
        }

        if (data.smallBlind !== undefined && data.bigBlind !== undefined) {
            this._gameManager.setBlinds(data.smallBlind, data.bigBlind);
        }
    }

    /**
     * 同步玩家游戏状态（筹码、下注、弃牌、全下等）
     * @param playersData 玩家数据列表
     * @param currentUserId 当前用户ID
     */
    private _syncPlayerGameState(playersData: any[], currentUserId: number): void {
        if (!playersData || !Array.isArray(playersData)) return;

        for (const playerData of playersData) {
            const seatIndex = playerData.seatIndex;
            if (seatIndex === undefined || seatIndex === null) continue;

            if (playerData.gameCoin !== undefined) {
                this._gameManager.setPlayerChips(seatIndex, playerData.gameCoin);
            }

            if (playerData.roundBet !== undefined || playerData.betAmount !== undefined) {
                const roundBet = playerData.roundBet !== undefined ? playerData.roundBet : playerData.betAmount;
                this._gameManager.setPlayerRoundBet(seatIndex, roundBet);
            }

            const isFolded = playerData.isFolded !== undefined ? playerData.isFolded :
                            (playerData.isFold !== undefined ? playerData.isFold :
                            (playerData.folded !== undefined ? playerData.folded : false));
            if (isFolded) {
                this._playerManager.setPlayerFolded(seatIndex);
                // ✅ [新增] 同步时隐藏已弃牌玩家的手牌
                this.hideAIFoldedPlayerCards(seatIndex);
            } else {
                // ✅ [新增] 处理 isFolded=false 的情况，确保玩家能从弃牌状态恢复
                this._playerManager.unsetPlayerFolded(seatIndex);
            }

            const isAllIn = playerData.isAllIn !== undefined ? playerData.isAllIn :
                           (playerData.allIn !== undefined ? playerData.allIn : false);
            if (isAllIn) {
                this._playerManager.setPlayerAllIn(seatIndex);
            }

            const holeCards = playerData.holeCards || playerData.cards || playerData.handCards;
            if (holeCards && Array.isArray(holeCards) && holeCards.length > 0) {
                if (playerData.userId === currentUserId) {
                    this._gameManager.setPlayerHoleCardsFromServer(seatIndex, holeCards);
                }
            }

            if (this._uiManager && this.playersContainer) {
                if (playerData.gameCoin !== undefined) {
                    this._uiManager.updateAvatarAmount(this.playersContainer, seatIndex, playerData.gameCoin);
                }
            }
        }
    }

    /**
     * 更新房间内玩家座位显示
     * @param playersData 所有玩家数据
     * @param selfUserId 当前用户ID
     * @param maxPlayers 最大玩家数（从服务端获取）
     * @param isInSettlement 是否处于结算阶段
     */
    updateRoomPlayers(playersData: any[], selfUserId: number, maxPlayers: number = 5, isInSettlement: boolean = false) {

        // ✅ [修复] 检查 _settingsManager 是否为 null
        if (!this._settingsManager) {
            //LogService.warn('gamingPvp', 'updateRoomPlayers: _settingsManager is null');
            return;
        }

        // ✅ [修复] 检查 _playerManager 是否为 null
        if (!this._playerManager) {
            //LogService.warn('gamingPvp', 'updateRoomPlayers: _playerManager is null，延迟处理玩家数据');
            return;
        }

        const actualPlayerCount = playersData ? playersData.length : 0;
        //LogService.info('gamingPvp', `[updateRoomPlayers] 开始更新: 实际玩家数=${actualPlayerCount}, maxPlayers=${maxPlayers}, isSettlement=${isInSettlement}, selfUserId=${selfUserId}`);
        if (playersData) {
            playersData.forEach((p: any, idx: number) => {
                //LogService.info('gamingPvp', `  [updateRoomPlayers] 玩家${idx}: seatIndex=${p.seatIndex}, userId=${p.userId}, nickname=${p.nickname}, chips=${p.gameCoin}, isSelf=${p.userId === selfUserId}`);
            });
        }

        // ✅ [关键修复] 使用实际玩家数（actualPlayerCount）设置 playerCount，而不是 maxPlayers
        // 之前使用 maxPlayers（房间最大容量5）会导致 _playersNum=5，但实际只有2-3个玩家
        // 多余的座位被标记为 SKIP，影响玩家列表显示和位置计算
        const playerCount = Math.max(actualPlayerCount, 1); // 至少为1，避免空数组问题
        this._settingsManager.setPlayerCount(playerCount);
        //LogService.info('gamingPvp', `[updateRoomPlayers] 设置玩家数量: playerCount=${playerCount} (使用实际玩家数=${actualPlayerCount}, 而非maxPlayers=${maxPlayers})`);

        this._playerManager.clearSeatToUserId();
        //LogService.info('gamingPvp', `[updateRoomPlayers] 已清空旧的seatToUserId映射`);

        const processedPlayersData = playersData.map((playerData, idx) => {
            if (!playerData) return playerData;
            return {
                ...playerData,
                isSelf: playerData.userId === selfUserId
            };
        });

        if (!isInSettlement && !this._gameFlowPvpController?.isInGamePhase() && this._gameManager) {
            this._gameManager.reset(false);
            //LogService.info('gamingPvp', `[updateRoomPlayers] 重置游戏管理器完成`);
        }

        if (!isInSettlement && !this._gameFlowPvpController?.isInGamePhase() && this._gameManager) {
            this._gameManager.initializePlayersChipsFromServer(processedPlayersData);
            //LogService.info('gamingPvp', `[updateRoomPlayers] 初始化玩家筹码完成`);
        }

        processedPlayersData.forEach((playerData, idx) => {
            if (!playerData) return;

            const seatIndex = parseInt(playerData.seatIndex !== undefined ? playerData.seatIndex : idx, 10);
            const userId = playerData.userId;

            if (userId !== undefined) {
                this._playerManager.setSeatToUserId(seatIndex, userId);
            }

            const isAIPlayer = playerData.isAI !== undefined ? playerData.isAI : !!playerData.is_ai;
            if (isAIPlayer) {
                this._playerManager.markAI(seatIndex);
            }

            // ✅ [关键修复] 房主判断逻辑：服务端明确设置isHost时，必须以服务端为准
            // 之前的bug：服务端设置isHost=false时，后备判断会基于旧的_hostUserId重新设为true，
            // 导致房主变更后出现2个房主的UI显示错误
            let isHost: boolean;
            if (playerData.isHost !== undefined) {
                // 服务端明确设置了isHost字段，直接使用，不做后备判断
                isHost = playerData.isHost;
            } else if (this._hostUserId !== undefined && userId !== undefined) {
                // 服务端没有设置isHost字段，使用hostUserId后备判断
                isHost = userId.toString() === this._hostUserId.toString();
            } else {
                isHost = false;
            }
            this._playerManager.setSeatToIsHost(seatIndex, isHost);

            // 保存玩家在线状态（用于 updateActivePlayers 判断）
            const isOnline = playerData.isOnline !== undefined ? playerData.isOnline : true;
            this._playerManager.setSeatToIsOnline(seatIndex, isOnline);

            // 保存玩家是否在当前回合列表中（用于判断是否显示手牌）
            const isInRound = playerData.isInRound !== undefined ? playerData.isInRound : false;
            this._playerManager.setSeatToIsInRound(seatIndex, isInRound);

            const isReady = playerData.isReady !== undefined ? playerData.isReady : false;
            if (userId !== undefined) {
                this._playerManager.setPlayerReady(userId, isReady);
            }

            const isSelf = playerData.isSelf !== undefined ? playerData.isSelf : false;
            if (isSelf) {
                this._playerManager.setPlayerSeat(seatIndex);
                //LogService.info('gamingPvp', `[updateRoomPlayers] 设置当前玩家座位: seatIndex=${seatIndex}`);
            }
        });

        // 更新活跃玩家列表
        if (this._gameManager) {
            this._playerManager.updateActivePlayers(this._gameManager);
        }

        if (isInSettlement) {
            try {
                //LogService.info('gamingPvp', `[updateRoomPlayers] 结算阶段: 重建玩家头像`);
                
                this.createPlayerAvatars();
                
                processedPlayersData.forEach((playerData, idx) => {
                    if (!playerData) return;

                    const seatIndex = playerData.seatIndex !== undefined ? playerData.seatIndex : idx;

                    if (playerData.gameCoin !== undefined && this._uiManager && this.playersContainer) {
                        this._uiManager.updateAvatarAmount(this.playersContainer, seatIndex, playerData.gameCoin);
                    }
                    if (playerData.nickname) {
                        this.updateAvatarNickname(seatIndex, playerData.nickname);
                    }
                    
                    if (this._gameManager) {
                        this._gameManager.setPlayerChips(seatIndex, playerData.gameCoin !== undefined ? playerData.gameCoin : 0);
                    }
                });
                
                //LogService.info('gamingPvp', `[updateRoomPlayers] 结算阶段: 玩家头像重建完成`);
            } catch (error) {
                LogService.error('gamingPvp', `[updateRoomPlayers] 结算阶段处理玩家数据异常:`, error);
            }
            return;
        }

        //LogService.info('gamingPvp', `[updateRoomPlayers] 开始重建玩家头像`);
        this.createPlayerAvatars();

        processedPlayersData.forEach((playerData, idx) => {
            if (!playerData) return;

            const seatIndex = playerData.seatIndex !== undefined ? playerData.seatIndex : idx;

            if (playerData.gameCoin !== undefined) {
                this._uiManager.updateAvatarAmount(this.playersContainer, seatIndex, playerData.gameCoin);
            }

            if (playerData.nickname) {
                this.updateAvatarNickname(seatIndex, playerData.nickname);
            }
        });

        //LogService.info('gamingPvp', `[updateRoomPlayers] 更新完成`);
    }

    /**
     * 处理玩家准备通知
     * @param data 准备数据
     */
    handlePlayerReady(data: any) {

        LogService.info('gamingPvp', `handlePlayerReady: 收到准备状态更新, readyUserId=${data.readyUserId || data.userId}, isReady=${data.isReady}, hostUserId=${data.hostUserId}`);

        // ✅ [修复] 检查场景是否正在卸载
        if (this._isSceneUnloading) {
            //LogService.warn('gamingPvp', 'handlePlayerReady: 场景正在卸载，忽略消息');
            return;
        }

        // ✅ [修复] 跳过纯HTTP响应消息（只包含code和success，没有业务数据）
        if (data.code !== undefined && data.success !== undefined && data.userId === undefined && data.readyUserId === undefined) {
            return;
        }

        // ✅ [修复] 服务端发送的是 readyUserId，客户端期望 userId，做字段兼容
        const userId = data.userId || data.readyUserId;

        // 如果 userId 为空，无法处理
        if (userId === undefined || userId === null) {
            //LogService.warn('gamingPvp', 'handlePlayerReady: userId 为空，无法处理');
            return;
        }

        // 如果游戏已经开始（收到过 GAME_START_NOTIFY），忽略准备状态更新
        const isInGame = this._gameFlowPvpController?.isInGamePhase() ?? false;
        if (isInGame) {
            LogService.info('gamingPvp', `handlePlayerReady: 游戏进行中，忽略准备状态更新`);
            return;
        }

        // 记录房主ID
        if (data.hostUserId) {
            this._hostUserId = data.hostUserId;

            // 检查当前用户是否是房主
            const currentUserId = this._gameNetwork?.getUserId();
            if (currentUserId && currentUserId.toString() === data.hostUserId.toString()) {
                this._isRoomOwner = true;
            }
        }

        // 获取当前用户ID
        const currentUserId = this._gameNetwork?.getUserId();

        // 更新当前用户的准备状态
        if (currentUserId && userId !== undefined) {
            if (currentUserId.toString() === userId.toString()) {
                this._isCurrentPlayerReady = !!data.isReady;
            }
        }

        // ✅ [修复] 更新PlayerManager中的准备状态（使用统一的 userId 变量）
        if (this._playerManager && userId !== undefined) {
            this._playerManager.setPlayerReady(userId, !!data.isReady);
            this.updateReadyIndicator();
            // ✅ [修复] 成功处理后清除重试计数
            if (this._playerReadyRetryMap) {
                this._playerReadyRetryMap.delete(userId);
            }
        } else {
            // ✅ [修复] 只有在 _playerManager 为 null 时才重试，userId 为空时直接返回
            if (!this._playerManager) {
                const currentRetry = this._playerReadyRetryMap.get(userId) || 0;

                if (currentRetry < 30) {  // 最多重试30次（约3秒）
                    this._playerReadyRetryMap.set(userId, currentRetry + 1);
                    //LogService.warn('gamingPvp', `handlePlayerReady: _playerManager is null，延迟处理 (userId=${userId}, retry=${currentRetry})`);
                    // 延迟处理，等待 _playerManager 初始化完成
                    this.scheduleOnce(() => {
                        this.handlePlayerReady(data);
                    }, 0.1);
                    return;
                } else {
                    LogService.error('gamingPvp', `handlePlayerReady: 重试次数已达上限(${currentRetry})，放弃处理 userId=${userId}`);
                    // ✅ [修复] 移除重试计数，避免内存泄漏
                    this._playerReadyRetryMap.delete(userId);
                    return;
                }
            }
        }

        // ✅ [新增] 显示玩家准备状态到 action_label
        // 优先使用 data.seatIndex（服务端下发），如果没有则通过 userId 查找
        if (this._playerManager && userId !== undefined && data.isReady !== undefined) {
            let playerIndex = -1;
            if (data.seatIndex !== undefined) {
                playerIndex = data.seatIndex;
            } else {
                playerIndex = this._playerManager.getPlayerIndexByUserId(userId);
            }

            if (playerIndex !== -1) {
                // 显示"已准备"或"取消准备"状态
                const actionText = data.isReady ? '已准备' : '取消准备';

                // 显示准备状态到玩家头像附近的 action_label
                this._playerManager.showPlayerActionNearAvatar(
                    this.playersContainer,
                    playerIndex,
                    actionText,
                    0 // 金额为0，只显示文本
                );

                // ✅ [新增] 更新本地的准备状态 Map
                this._playerReadyStatus.set(playerIndex, !!data.isReady);
            } else {
                LogService.warn('gamingPvp', `[PVP模式] 无法找到玩家 userId=${userId} 的座位索引，可能玩家还未初始化或已离开`);
            }
        } else if (!this._playerManager) {
            LogService.warn('gamingPvp', 'handlePlayerReady: _playerManager is null，等待初始化');
        }

        // 检查是否所有玩家都已准备
        const allReadyStates = data.allReadyStates || {};
        if (this._playerManager && allReadyStates) {
            this._playerManager.setAllReadyStates(allReadyStates);
            this.updateReadyIndicator();
        }
        
        // ✅ [关键修复] 处理服务端返回的玩家列表，确保点击准备后界面同步最新玩家信息
        if (data.players && data.players.length > 0 && currentUserId) {
            const maxPlayers = data.maxPlayers || (this._settingsManager ? this._settingsManager.getPlayerCount() : 5);
            this.updateRoomPlayers(data.players, currentUserId, maxPlayers, false);
            this.updateHomeownerIndicator();
        }

        let allPlayersReady = true;
        let totalReady = 0;
        let totalPlayers = 0;

        for (const userId in allReadyStates) {
            totalPlayers++;
            if (allReadyStates[userId]) {
                totalReady++;
            } else {
                allPlayersReady = false;
            }
        }

        // ✅ [修复] 如果 allReadyStates 为空（没有玩家数据），不能认为所有玩家都准备了
        if (totalPlayers === 0) {
            allPlayersReady = false;
        }

        LogService.info('gamingPvp', `handlePlayerReady: allReadyStates=${JSON.stringify(allReadyStates)}, totalPlayers=${totalPlayers}, totalReady=${totalReady}, allPlayersReady=${allPlayersReady}`);

        const isInGamePhase = this._gameFlowPvpController?.isInGamePhase() ?? false;
        const hasEnoughPlayers = totalPlayers >= 2;
        
        if (!isInGamePhase && allPlayersReady && hasEnoughPlayers) {
            if (this._isRoomOwner) {
                LogService.info('gamingPvp', `handlePlayerReady: 所有玩家已准备(allReadyStates)，玩家数量=${totalPlayers}，房主显示开始按钮`);
                this.showDealButton();
            }
        } else if (!isInGamePhase && allPlayersReady && !hasEnoughPlayers) {
            LogService.warn('gamingPvp', `handlePlayerReady: 所有玩家已准备但玩家数量不足(${totalPlayers}/2)，不显示开始按钮`);
            if (this._isRoomOwner) {
                this.hideReadyButton();
            }
        }

        // ✅ [关键修复] 不再无条件调用 updateButtonVisibility()
        // 原因：updateButtonVisibility 依赖本地 _playerManager.areAllPlayersReady()，
        // 该方法可能因 _seatToUserId 或 _readyStates 类型不匹配等原因返回 false，
        // 导致已通过 showDealButton() 显示的按钮被隐藏。
        // 只有在不是所有玩家都准备时才调用 updateButtonVisibility（用于隐藏按钮）
        if (!allPlayersReady) {
            this.updateButtonVisibility();
        }

    }

    /**
     * 处理服务端错误
     */
    handleServerError(error: any) {
        LogService.error('gamingPvp', '========== 服务端错误 ==========');
        LogService.error('gamingPvp', '错误信息:', error);
        LogService.error('gamingPvp', '================================');

        // 如果是游戏开始失败的错误，重新显示开始按钮
        const gameStarted = this._gameFlowPvpController?.isGameStarted() ?? false;
        if (!gameStarted && this._playerManager.getPlayersNum() >= 2) {
            this.showDealNode();
        }
    }

    /**
     * 连接到服务器
     * 委托给 GameNetwork 统一管理网络连接逻辑
     */
    connectToServer(url?: string) {
        const serverUrl = url || this._settingsManager.getServerUrl();
        this._gameNetwork.connectToServer('PVP', serverUrl);
    }

    /**
     * 处理服务器消息
     */
    handleServerMessage(cmd: number, data: any) {
        // 如果场景正在卸载，忽略所有消息
        if (this._isSceneUnloading) {
            return;
        }

        // ✅ [修复] 添加 try-catch 保护，防止消息处理异常导致程序停止
        try {
            this._handleServerMessageInternal(cmd, data);
        } catch (error) {
            LogService.error('gamingPvp', `handleServerMessage 处理消息异常: cmd=${cmd}`, error);
        }

        // ✅ [新增] 每次收到服务端广播后，自动将公牌层级调到最上层
        // 确保公牌不被玩家手牌和头像遮挡
        try {
            this.bringBoardCardsToFront();
        } catch (error) {
            LogService.error('gamingPvp', `bringBoardCardsToFront 异常: cmd=${cmd}`, error);
        }
    }

    /**
     * 内部处理服务端消息的实际逻辑
     */
    private _handleServerMessageInternal(cmd: number, data: any): void {
        // ⚠️ [重要修复] 移除消息序列号检查
        // 原因：服务端使用单个全局序列号计数器，但客户端在游戏开始前已处理了大量房间级消息，
        // 导致序列号超前，关键游戏消息被丢弃。WebSocket本身保证消息顺序，
        // 服务端也按顺序处理操作，序列号检查提供的价值有限且造成严重问题。

        // 检查是否是倒计时更新消息（服务端可能通过任何消息类型发送倒计时更新）
        if (data && data.timeRemaining !== undefined && data.type === 'COUNTDOWN_UPDATE') {
            this.handleCountdownUpdate(data);
            return;
        }

        switch (cmd) {
            case CommandType.GAME_STATE_SYNC:
                this.handleGameStateSync(data);
                break;
            case CommandType.PLAYER_ACTION_NOTIFY:
                this.handlePlayerActionNotify(data);
                break;
            case CommandType.GAME_START_NOTIFY:
                this.handleGameStartNotify(data);
                break;
            case CommandType.GAME_START:
                this.handleGameStartNotify(data);
                break;
            case CommandType.DEAL_BUTTON_SHOW_NOTIFY:
                this.handleDealButtonShowNotify(data);
                break;
            case CommandType.DEAL_CARDS_NOTIFY:
                this.handleDealCardsNotify(data);
                break;
            case CommandType.NOTIFY_PLAYER_TURN:
                this.handlePlayerTurnNotify(data);
                break;
            case CommandType.PLAYER_ACTION_RESPONSE:
                this.handlePlayerActionResponse(data);
                break;
            case CommandType.CONTINUE_GAME:
                this.handleContinueGameResponse(data);
                break;
            case CommandType.ACT_OPERATION:
                this.handleActOperationResponse(data);
                break;
            case CommandType.DEAL_COMPLETE:
                this.handleDealComplete(data);
                break;
            case CommandType.PLAYER_JOIN:
                this.handlePlayerJoin(data);
                break;
            case CommandType.PLAYER_EXIT:
                this.handlePlayerExit(data);
                break;
            case CommandType.PLAYER_DISCONNECTED:
                this.handlePlayerDisconnected(data);
                break;
            case 230:
                this.handleRoundPlayerListUpdate(data);
                break;
            case 231:
                this.handleRoundPlayerListUpdate(data);
                break;
            case 214:
                this.handleReconnectCountdown(data);
                break;
            case CommandType.ROOM_INFO:
                this.handleRoomInfoResponse(data);
                break;
            case CommandType.PLAYER_READY:
                this.handlePlayerReady(data);
                break;
            case CommandType.GAME_SETTLEMENT:
                this.handleGameSettlement(data);
                break;
            case CommandType.ACTION_COMPLETE:
                this.handleActionComplete(data);
                break;
            case CommandType.ROOM_END:
                this.handleRoomEnd(data);
                break;
            case CommandType.QUICK_MSG:
                this.handleQuickMsgBroadcast(data);
                break;
            default:
                // 检查其他消息是否包含倒计时更新
                if (data && data.timeRemaining !== undefined) {
                    this.handleCountdownUpdate(data);
                }
                break;
        }
    }

    /**
     * 处理庄家开始按钮显示通知
     * 服务端发送 DEAL_BUTTON_SHOW_NOTIFY(208) 后调用此方法
     */
    handleDealButtonShowNotify(data: any) {

        if (!data) {
            LogService.warn('gamingPvp', 'handleDealButtonShowNotify: data 为空，忽略');
            return;
        }

        const canShowDealButton = data.showButton ?? data.canShowDealButton ?? true;
        const hostUserId = data.hostUserId || data.bankerUserId;
        const currentUserId = this._gameNetwork?.getUserId();

        // ✅ [修复] 更新 _roomId，确保后续判断 hasRoom 时不会因为默认值 0 而失败
        if (data.roomId !== undefined && data.roomId > 0) {
            this._roomId = data.roomId;
        }

        LogService.info('gamingPvp', `handleDealButtonShowNotify: 收到 cmd=208, data=${JSON.stringify(data)}`);
        LogService.info('gamingPvp', `handleDealButtonShowNotify: canShowDealButton=${canShowDealButton}, hostUserId=${hostUserId}, currentUserId=${currentUserId}, roomId=${data.roomId}`);

        if (hostUserId !== undefined) {
            this._hostUserId = hostUserId;
        }

        if (hostUserId !== undefined && currentUserId !== undefined) {
            const isHost = hostUserId.toString() === currentUserId.toString();
            LogService.info('gamingPvp', `handleDealButtonShowNotify: isHost=${isHost}, _isRoomOwner=${this._isRoomOwner}, _roomId=${this._roomId}`);

            if (isHost) {
                this._isRoomOwner = true;
                if (canShowDealButton) {
                    const hasRoom = this._roomId > 0;
                    const isInGame = this._gameFlowPvpController?.isInGamePhase() ?? false;
                    LogService.info('gamingPvp', `handleDealButtonShowNotify: hasRoom=${hasRoom}, isInGame=${isInGame}, canShowDealButton=${canShowDealButton}`);

                    if (hasRoom && !isInGame) {
                        this._settlementPresenter?.hideSettlementPanel();
                        LogService.info('gamingPvp', 'handleDealButtonShowNotify: 房主显示deal按钮，强制隐藏胜利面板');
                        
                        this.showDealButton();
                    } else {
                        LogService.warn('gamingPvp', `handleDealButtonShowNotify: 无法显示开始按钮 - hasRoom=${hasRoom}, isInGame=${isInGame}`);
                        this.hideDealNode();
                    }
                } else {
                    LogService.info('gamingPvp', 'handleDealButtonShowNotify: canShowDealButton=false，隐藏按钮');
                    this.hideDealNode();
                }
            } else {
                this._isRoomOwner = false;
                this.hideDealNode();
            }
        } else {
            LogService.warn('gamingPvp', `handleDealButtonShowNotify: hostUserId=${hostUserId} 或 currentUserId=${currentUserId} 为空，无法处理`);
        }
    }

    /**
     * 处理操作完成通知
     */
    handleActionComplete(data: any) {
        // 更新游戏状态
        if (data.currentBet !== undefined) {
            this._gameManager.setCurrentBet(data.currentBet);
        }
        const potValue = data.totalPot !== undefined ? data.totalPot : data.mainPot;
        if (potValue !== undefined) {
            this._gameManager.setMainPot(potValue);
            this._uiManager.updatePotDisplay(this.potLabel, potValue);
        }
        if (data.status !== undefined) {
            //this._gameStatus = data.status;
        }
        if (data.communityCards !== undefined) {
            this._cardManager.setCommunityCards(data.communityCards);
        }
    }

    /**
     * 处理房间结束通知
     * 当房间达到最大局数时，服务端会发送此通知
     */
    handleRoomEnd(data: any) {
        const roomId = data.roomId || data.room_id;
        const roomCode = data.roomCode || data.room_code || '未知';
        const reason = data.reason || 'MAX_ROUNDS_REACHED';
        const message = data.msg || data.message || '房间已结束';

        LogService.info('gamingPvp', `房间结束：roomId=${roomId}, roomCode=${roomCode}, reason=${reason}, message=${message}`);

        // ✅ [修复] 房间结束后清理房间数据，防止下次创建房间时进入旧房间
        this.scheduleOnce(() => {
            this._gameNetwork.resetRoomId();
            this._gameNetwork.resetRoomCode();
            this._gameNetwork.setPendingJoinRoomId(null);
            this._gameNetwork.setRoomConfig(null);
            this._roomId = 0;
            this._room_code = null;

            // 跳转到record场景，查看游戏记录
            this._transitionToScene('record');
        }, 2.0);
    }

    /**
     * 玩家操作完成时间戳，用于控制回合切换间隔
     */
    private _lastActionCompleteTime: number = 0;

    /**
     * 回合切换的最小间隔时间（毫秒）- 模拟服务端控制的2-3秒间隔
     */
    private readonly _minTurnSwitchInterval: number = 2000; // 2秒最小间隔

    /**
     * [SERVER_MODE_ONLY] 处理玩家轮到操作通知 - 服务端模式专用
     * 服务端发送 PLAYER_TURN_NOTIFY 后调用此方法
     */
    handlePlayerTurnNotify(data: any) {
        LogService.info('gamingPvp', `收到 NOTIFY_PLAYER_TURN: ${JSON.stringify(data?.actionNotify || {})}`);

        // ✅ [关键修复] 添加空值检查
        if (!this._playerManager) {
            LogService.error('gamingPvp', 'handlePlayerTurnNotify - _playerManager is null, ignoring notification');
            return;
        }

        if (!data || !data.actionNotify) {
            LogService.error('gamingPvp', '无效的玩家轮到操作通知数据');
            return;
        }

        const notify = data.actionNotify;

        // ✅ [修复] 客户端自行判断 isMyTurn
        // 服务端改用 broadcastToRoom 广播，isMyTurn 统一为 true
        // 客户端通过比较 actionPlayer.userId 与自身 userId 来判断是否轮到自己
        if (data.actionPlayer && data.actionPlayer.userId) {
            const myUserId = this._gameNetwork?.getUserId() || 0;
            const targetUserId = data.actionPlayer.userId;
            notify.isMyTurn = (Number(targetUserId) === Number(myUserId));
            LogService.info('gamingPvp', `[isMyTurn判断] targetUserId=${targetUserId}(${typeof targetUserId}), myUserId=${myUserId}(${typeof myUserId}), isMyTurn=${notify.isMyTurn}`);
        }

        // ✅ [新增] 检查游戏状态，如果已经处于结算状态，忽略回合通知
        if (data.status === 'SETTLEMENT' || data.status === 'GAME_OVER') {
            return;
        }

        // ✅ [新增] 防御性检查：如果收到通知指向ALL-IN玩家，跳过处理
        if (data.actionPlayer && data.actionPlayer.isAllIn) {
            LogService.warn('gamingPvp', `[WARN] handlePlayerTurnNotify: 收到ALL-IN玩家的操作通知，跳过处理: seatIndex=${data.actionPlayer.seatIndex}, nickname=${data.actionPlayer.nickname}`);
            return;
        }

        // ✅ [新增] 防御性检查：如果收到通知指向已弃牌玩家，跳过处理
        if (data.actionPlayer && data.actionPlayer.isFold) {
            LogService.warn('gamingPvp', `[WARN] handlePlayerTurnNotify: 收到已弃牌玩家的操作通知，跳过处理: seatIndex=${data.actionPlayer.seatIndex}, nickname=${data.actionPlayer.nickname}`);
            return;
        }

        // ✅ [新增] 防御性检查：如果真实玩家已ALL-IN，不显示操作按钮
        if (notify.isMyTurn && data.actionPlayer && data.actionPlayer.isAllIn) {
            LogService.warn('gamingPvp', `[WARN] handlePlayerTurnNotify: 轮到真实玩家但他已ALL-IN，跳过操作: seatIndex=${data.actionPlayer.seatIndex}`);
            return;
        }

        // ✅ [修复] 如果不是当前玩家的回合，确保隐藏操作按钮
        // 这可以防止弃牌玩家在下一轮仍然看到操作按钮
        if (!notify.isMyTurn) {
            this.disableActionButtons();
            if (this.playersActionNode) {
                this.playersActionNode.active = false;
            }
        }

        // ✅ [新增] 控制回合切换间隔 - 确保玩家操作完成后至少等待2-3秒再切换到下一个玩家
        const now = Date.now();
        const timeSinceLastAction = now - this._lastActionCompleteTime;

        if (this._lastActionCompleteTime > 0 && timeSinceLastAction < this._minTurnSwitchInterval) {
            // 需要等待剩余时间
            const waitTime = this._minTurnSwitchInterval - timeSinceLastAction;

            this.safeSetTimeout(() => {
                if (this.node && this.node.isValid) {
                    this._processPlayerTurnNotify(data);
                }
            }, waitTime);
            return;
        }

        // 立即处理
        this._processPlayerTurnNotify(data);
    }

    /**
     * 实际处理玩家回合通知的逻辑
     */
    private _processPlayerTurnNotify(data: any) {
        const notify = data.actionNotify;


        // 更新游戏状态
        // 新格式：服务端只返回操作玩家的信息（actionPlayer），而不是所有玩家列表
        if (data.actionPlayer) {
            const actionPlayer = data.actionPlayer;
            const seatIndex = actionPlayer.seatIndex;
            const isAI = actionPlayer.isAI;

            // 隐藏所有玩家的倒计时
            for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
                this._playerManager.hidePlayerCountdown(this.playersContainer, i);
            }

            // ✅ [优化] 使用游戏流程控制器更新状态
            if (this._gameFlowPvpController) {
                // 控制器会处理状态更新和倒计时
                this._gameFlowPvpController.handlePlayerTurn(data);
            }

            // 对于AI玩家：此时还未执行操作，lastAction 是上一轮的，所以更新UI时要避免显示旧的lastAction
            if (!isAI) {
                // 真实玩家：正常更新UI
                this.updateSinglePlayerUI(seatIndex, actionPlayer);
            }

            // 处理盲注玩家信息（只在盲注操作发生变化时更新，避免UI闪烁）
            if (data.blindPlayers && data.blindPlayers.length > 0) {
                for (const blindPlayer of data.blindPlayers) {
                    const blindSeatIndex = blindPlayer.seatIndex;
                    const actionKey = `${blindSeatIndex}_${blindPlayer.lastAction}_${blindPlayer.lastActionBet}`;

                    // 只在盲注操作发生变化时才更新UI
                    if (!this._blindActions || this._blindActions[blindSeatIndex] !== actionKey) {
                        this._playerManager.showPlayerActionNearAvatar(this.playersContainer, blindSeatIndex, blindPlayer.lastAction, blindPlayer.lastActionBet || 0, blindPlayer.nickname);

                        // 更新状态跟踪
                        if (!this._blindActions) {
                            this._blindActions = {};
                        }
                        this._blindActions[blindSeatIndex] = actionKey;
                    }
                }
            }
        } else if (data.players) {
            // 兼容旧格式：如果服务端仍然返回所有玩家列表
            this._gameManager.updatePlayersFromServer(data.players);

            // 找到刚刚执行操作的玩家（优先通过 actionNotify.targetUserSeatIndex 确定）
            if (notify && notify.targetUserSeatIndex !== undefined) {
                const actionPlayerIndex = notify.targetUserSeatIndex;
                const playerState = data.players.find((p: any) => p.seatIndex === actionPlayerIndex);
                if (playerState) {
                    // 验证找到的玩家是否是真实玩家（isSelf: true）
                    if (playerState.isSelf === true) {
                        this.updateSinglePlayerUI(actionPlayerIndex, playerState);
                        return;
                    } else {
                        // targetUserSeatIndex 指向的不是真实玩家，寻找真实玩家
                        const selfPlayer = data.players.find((p: any) => p.isSelf === true);
                        if (selfPlayer) {
                            this.updateSinglePlayerUI(selfPlayer.seatIndex, selfPlayer);
                            return;
                        }
                    }
                }
            }

            // 备用方案：找到真实玩家（isSelf: true）
            for (const playerState of data.players) {
                const seatIndex = playerState.seatIndex;
                if (seatIndex === undefined || seatIndex === null) {
                    continue;
                }
                if (playerState.isSelf === true) {
                    this.updateSinglePlayerUI(seatIndex, playerState);
                    break;
                }
            }
        }
        if (data.currentBet !== undefined) {
            this._gameManager.setCurrentBet(data.currentBet);
        }
        const potValue = data.totalPot !== undefined ? data.totalPot : data.mainPot;
        if (potValue !== undefined) {
            this._gameManager.setMainPot(potValue);
            this._uiManager.updatePotDisplay(this.potLabel, potValue);
        }

        // ✅ [新增] 当轮到真实玩家操作时，启用操作按钮
        if (notify && notify.isMyTurn) {
            this.enableActionButtons();
        }

        if (data.sidePots && Array.isArray(data.sidePots)) {
            this._gameManager.setSidePots(data.sidePots);
            this._uiManager.updateSidePotsDisplay(this.sidePotsContainer, data.sidePots);
        }
        if (data.communityCards) {
            this._gameManager.setCommunityCards(data.communityCards);
        }

        // 检查目标玩家是否已经弃牌，如果是则跳过处理
        if (data.players && notify.targetUserSeatIndex !== undefined) {
            const targetPlayer = data.players.find((p: any) => p.seatIndex === notify.targetUserSeatIndex);
            if (targetPlayer && targetPlayer.isFold) {
                return;
            }
        }

        // 检查是否轮到当前玩家操作
        if (notify.isMyTurn) {

            // 如果是轮到真实玩家操作，确保AI锁被释放
            if (this._gameFlowPvpController?.isAIActionInProgress()) {
                this._gameFlowPvpController.setAIActionInProgress(false);
            }

            // 把整个data传进去，因为availableActions可能在data根级别
            this.showPlayerActions(data, notify);

        } else if (notify.isAI) {
            // AI玩家操作


            // 如果有预计算的AI操作，直接执行
            if (notify.predictedAction && notify.predictedAmount !== undefined) {
                this.executeAIAction(notify);
            }

        } else {
            // 其他真实玩家操作，等待
        }

        // ✅ [新增] 调用游戏流程控制器
        if (this._gameFlowPvpController) {
            this._gameFlowPvpController.handlePlayerTurn(data);
        }
    }

    /**
     * 显示玩家操作按钮
     * 优先使用 ActionButtonPresenter，确保显示正确的按钮
     */
    showPlayerActions(data: any, notify: any) {

        // ✅ [优化] 优先使用 ActionButtonPresenter 显示操作按钮
        if (this._actionPresenter) {

            // 使用控制器进行防重复调用检查
            const messageTimestamp = notify?.timestamp || data?.timestamp;
            if (!this._gameFlowPvpController?.canShowActions(messageTimestamp)) {
                return;
            }

            const needToCall = notify.needToCall || 0;
            const playerChips = notify.playerChips || 0;
            const currentBet = notify.currentBet || data.currentBet || 0;

            // 更新UI显示
            if (this._uiManager) {
                this._uiManager.updateCurrentBet(currentBet);
                const potValue = data.totalPot !== undefined ? data.totalPot : (data.mainPot !== undefined ? data.mainPot : (notify.totalPot !== undefined ? notify.totalPot : (notify.mainPot !== undefined ? notify.mainPot : 0)));
                this._uiManager.updatePotAmount(this.potLabel, potValue);
                this._uiManager.updatePlayerChips(this._playerManager.getPlayerSeat(), playerChips);
                this._uiManager.updateNeedToCall(needToCall);
            }

            // ✅ [修复] 从多个位置获取 availableActions，确保重连场景能正确获取
            let availableActions = null;
            
            // 优先级1：data根级别（重连状态同步时使用）
            if (data.availableActions && Array.isArray(data.availableActions)) {
                availableActions = data.availableActions;
                LogService.info('gamingPvp', '[showPlayerActions] 从 data.availableActions 获取操作按钮组');
            } 
            // 优先级2：notify（actionNotify）中（NOTIFY_PLAYER_TURN 广播时使用）
            else if (notify && notify.availableActions && Array.isArray(notify.availableActions)) {
                availableActions = notify.availableActions;
                LogService.info('gamingPvp', '[showPlayerActions] 从 notify.availableActions 获取操作按钮组');
            } 
            // 优先级3：data.actionNotify 中（兼容旧格式）
            else if (data.actionNotify && data.actionNotify.availableActions && Array.isArray(data.actionNotify.availableActions)) {
                availableActions = data.actionNotify.availableActions;
                LogService.info('gamingPvp', '[showPlayerActions] 从 data.actionNotify.availableActions 获取操作按钮组');
            } 
            // 优先级4：validationResult 中
            else if (data.validationResult && data.validationResult.availableActions && Array.isArray(data.validationResult.availableActions)) {
                availableActions = data.validationResult.availableActions;
                LogService.info('gamingPvp', '[showPlayerActions] 从 data.validationResult.availableActions 获取操作按钮组');
            }

            // 保存到控制器供后续操作使用
            if (availableActions) {
                this._gameFlowPvpController?.setServerAvailableActions(availableActions);
                LogService.info('gamingPvp', `[showPlayerActions] 操作按钮组已保存，共 ${availableActions.length} 个动作`);
            } else {
                LogService.warn('gamingPvp', '[showPlayerActions] 未找到有效的 availableActions！');
            }

            // 使用 ActionButtonPresenter 显示操作按钮
            if (this._actionPresenter) {
                this._actionPresenter.showPlayerActions(availableActions, data, notify);
            }

            // ✅ [关键修复] 设置超时计时器时，优先使用断线暂停时保存的剩余时间
            // 如果存在剩余时间，则使用该时间继续倒计时，否则使用默认的30秒
            const actionDuration = this._pausedActionTimeRemaining > 0 ? this._pausedActionTimeRemaining : 30;
            if (this._pausedActionTimeRemaining > 0) {
                LogService.info('gamingPvp', `[断线恢复] 使用暂停时的剩余时间继续倒计时: ${actionDuration}秒`);
                this._pausedActionTimeRemaining = 0; // 重置，避免下次重复使用
            }
            // 设置超时计时器
            this.startActionTimer(actionDuration);
            return;
        }

        // ActionButtonPresenter 未初始化，无法显示操作按钮
        LogService.error('gamingPvp', '[ERROR] showPlayerActions: ActionButtonPresenter 未初始化，无法显示操作按钮');
    }

    /**
     * 隐藏所有操作按钮
     */
    hideAllActionButtons() {
        // ✅ [优化] 使用 ActionButtonPresenter 隐藏操作按钮
        if (!this._actionPresenter) {
            LogService.error('gamingPvp', 'hideAllActionButtons: ActionButtonPresenter 不可用');
            return;
        }

        this._actionPresenter.hideAllActionButtons();
    }

    /**
     * 显示指定操作按钮
     */
    showActionButton(name: string) {
        const btn = this.playersActionNode?.getChildByName(name);
        if (btn) {
            btn.active = true;
        }
    }

    /**
     * [SERVER_MODE_ONLY] 执行AI操作 - 服务端模式专用
     * 服务端发送 predictedAction 后，客户端播放AI操作动画
     */
    executeAIAction(notify: any) {
        // 如果AI操作正在进行中，直接返回，防止重复执行
        if (this._gameFlowPvpController?.isAIActionInProgress()) {
            return;
        }


        // 标记AI操作正在进行中
        this._gameFlowPvpController?.setAIActionInProgress(true);

        // 播放AI操作动画
        this._playerManager.playPlayerAction(
            notify.targetUserSeatIndex,
            notify.predictedAction,
            notify.predictedAmount,
            notify.targetUserNickname
        );

        // 更新AI玩家筹码余额
        const seatIndex = notify.targetUserSeatIndex;
        const action = notify.predictedAction?.toLowerCase() || '';
        const amount = notify.predictedAmount || 0;

        if (action !== 'fold' && action !== 'check' && amount > 0) {
            const currentChips = this._gameManager.getPlayerChips(seatIndex);
            const newChips = Math.max(0, currentChips - amount);
            this._gameManager.setPlayerChips(seatIndex, newChips);
            this._uiManager.updateAvatarAmount(this.playersContainer, seatIndex, newChips);
        }

        // 如果AI玩家弃牌，隐藏其手牌
        if (action === 'fold') {
            this.hideAIFoldedPlayerCards(seatIndex);
        }

        // 动画完成后发送操作完成通知
        this.safeSetTimeout(() => {
            this.sendActionComplete();
            // 操作完成后，在sendActionComplete中解锁
        }, 1500);
    }

    /**
     * [SERVER_MODE_ONLY] 发送操作完成通知 - 服务端模式专用
     * AI动画播放完成后调用此方法通知服务端
     */
    sendActionComplete() {
        if (this._gameNetwork && this._roomId) {
            this._gameNetwork.sendActionComplete(this._roomId);

            // 解锁AI操作，允许下一次AI操作
            this._gameFlowPvpController?.setAIActionInProgress(false);
        }
    }

    /**
     * 处理玩家操作响应
     */
    handlePlayerActionResponse(data: any) {

        // ✅ [新增] 检查游戏状态，如果已经处于结算状态，忽略操作响应
        if (data.status === 'SETTLEMENT' || data.status === 'GAME_OVER') {
            return;
        }

        // 更新游戏状态
        if (data.players) {
            this._gameManager.updatePlayersFromServer(data.players);

            // 找到刚刚执行操作的玩家（优先通过 actionNotify.targetUserSeatIndex 确定）
            if (data.actionNotify && data.actionNotify.targetUserSeatIndex !== undefined) {
                const actionPlayerIndex = data.actionNotify.targetUserSeatIndex;
                const playerState = data.players.find((p: any) => p.seatIndex === actionPlayerIndex);
                if (playerState) {
                    const actionType = data.actionNotify.actionType;
                    const amount = data.actionNotify.amount || 0;
                    const nickname = data.actionNotify.targetUserNickname || this._gameManager.getPlayerNickname(actionPlayerIndex);
                    const actionName = this._getActionName(actionType);


                    if (playerState.isSelf === true) {
                        // 真实玩家：只更新筹码余额，不更新操作显示（已在点击时立即更新）
                        if (playerState.gameCoin !== undefined) {
                            this._uiManager.updateAvatarAmount(this.playersContainer, actionPlayerIndex, playerState.gameCoin);
                        }
                    } else {
                        // 对方玩家：更新操作显示和筹码余额
                        this._playerManager.showPlayerActionNearAvatar(this.playersContainer, actionPlayerIndex, actionName, amount, nickname);

                        if (playerState.gameCoin !== undefined) {
                            this._uiManager.updateAvatarAmount(this.playersContainer, actionPlayerIndex, playerState.gameCoin);
                        }
                    }

                    // 更新真实玩家的UI（筹码等）
                    if (playerState.isSelf === true) {
                        this.updateSinglePlayerUI(actionPlayerIndex, playerState);
                    } else {
                        // targetUserSeatIndex 指向的不是真实玩家，寻找真实玩家并更新
                        const selfPlayer = data.players.find((p: any) => p.isSelf === true);
                        if (selfPlayer) {
                            this.updateSinglePlayerUI(selfPlayer.seatIndex, selfPlayer);
                        }
                    }
                } else {
                    // 缺少 actionNotify 或 targetUserSeatIndex，无法确定操作玩家
                    LogService.error('gamingPvp', '[ERROR] handlePlayerActionResponse: 缺少 actionNotify 或 targetUserSeatIndex，无法更新玩家UI');
                }
            }
        }

        if (data.currentBet !== undefined) {
            this._gameManager.setCurrentBet(data.currentBet);
        }
        const potValue = data.totalPot !== undefined ? data.totalPot : data.mainPot;
        if (potValue !== undefined) {
            this._gameManager.setMainPot(potValue);
            this._uiManager.updatePotDisplay(this.potLabel, potValue);
        }
        if (data.sidePots && Array.isArray(data.sidePots)) {
            this._gameManager.setSidePots(data.sidePots);
            this._uiManager.updateSidePotsDisplay(this.sidePotsContainer, data.sidePots);
        }

        // ✅ [新增] 记录玩家操作完成时间，用于控制回合切换间隔
        this._lastActionCompleteTime = Date.now();

        // 隐藏操作按钮
        this.hideAllActionButtons();
        if (this.playersActionNode) {
            this.playersActionNode.active = false;
        }
    }

    /**
     * 处理玩家操作响应（ACT_OPERATION - cmd=203）
     * 服务端返回的操作执行结果
     */
    handleActOperationResponse(data: any) {

        // ✅ [新增] 记录玩家操作完成时间，用于控制回合切换间隔
        this._lastActionCompleteTime = Date.now();

        // 如果有玩家数据，更新玩家状态
        if (data.players) {
            this._gameManager.updatePlayersFromServer(data.players);

            // 更新UI
            for (const playerState of data.players) {
                const seatIndex = playerState.seatIndex;
                if (seatIndex !== undefined) {
                    this.updateSinglePlayerUI(seatIndex, playerState);
                }
            }
        }

        // 更新当前下注
        if (data.currentBet !== undefined) {
            this._gameManager.setCurrentBet(data.currentBet);
        }

        // 更新奖池
        const potValue = data.totalPot !== undefined ? data.totalPot : data.mainPot;
        if (potValue !== undefined) {
            this._gameManager.setMainPot(potValue);
            this._uiManager.updatePotDisplay(this.potLabel, potValue);
        }

        // 如果操作成功，解锁操作状态
        if (data.success === true) {
            this._gameFlowPvpController?.setActionProcessing(false);

            // ✅ [新增] 重新启用操作按钮（之前被禁用防止重复点击）
            this.enableActionButtons();
        }
    }

    /**
     * 处理发牌完成响应（DEAL_COMPLETE - cmd=212）
     * 服务端返回的发牌完成确认
     */
    handleDealComplete(data: any) {

        // 更新游戏状态
        if (data.status) {
            LogService.info('gamingPvp', `[DEAL_COMPLETE] 状态更新: ${data.status}`);
        }

        if (data.currentRound !== undefined) {
            this._currentRound = data.currentRound;
        }

        // 如果状态是 RIVER，可能需要显示公共牌
        if (data.communityCards && Array.isArray(data.communityCards)) {
        }
    }

    /**
     * ✅ [新增] 处理开始游戏失败通知
     * 当开始游戏失败时（如玩家数量不足），重置准备状态并重新显示准备按钮
     */
    private _handleGameStartFailed(data: any): void {
        LogService.warn('gamingPvp', `[处理开始游戏失败] 玩家需要重新准备: ${data.message}`);

        // 重置所有玩家的准备状态
        this._playerManager.resetAllReadyStates();

        // 更新自己的准备按钮为"准备"状态
        this.hideReadyButton();

        // 隐藏开始游戏按钮
        if (this.startGameNode && this.startGameNode.active) {
            this.startGameNode.active = false;
        }

        // 显示错误提示
        if (data.message) {
            DialogManager.show({
                title: '提示',
                content: data.message,
                confirmText: '确定',
            });
        }
    }

    /**
     * ✅ [新增] 处理重连失败
     * 当WebSocket重连达到最大次数仍未成功时，退出房间并返回大厅
     */
    private _handleReconnectFailed(): void {
        if (this._isSceneUnloading) {
            return;
        }

        LogService.error('gamingPvp', '[处理重连失败] 退出房间，返回大厅');

        // 标记场景正在卸载
        this._isSceneUnloading = true;

        // 显示重连失败提示
        DialogManager.show({
            title: '网络连接失败',
            content: '网络连接已断开，重连失败，请检查网络后重新进入游戏',
            confirmText: '确定',
        });

        // 尝试发送退出房间请求（即使连接已断开也尝试）
        if (this._roomId > 0 && this._gameNetwork) {
            try {
                this._gameNetwork.exitRoom(this._roomId);
                LogService.info('gamingPvp', `发送退出房间请求 roomId=${this._roomId}`);
            } catch (e) {
                LogService.warn('gamingPvp', '发送退出房间请求失败（连接已断开）:', e);
            }
        }

        // 清理游戏状态
        this._cleanupGameState();

        // 重置网络状态
        if (this._gameNetwork) {
            try {
                this._gameNetwork.resetRoomId();
                this._gameNetwork.disconnect();
            } catch (e) {
                LogService.warn('gamingPvp', '重置网络状态失败:', e);
            }
        }

        // 跳转到 index 场景
        this._transitionToScene('index');
    }

    // ============================================================
    // [SERVER_MODE_ONLY] 服务端模式专用方法
    // 这些方法只在网络模式下被调用
    // ============================================================

    /**
     * [SERVER_MODE_ONLY] 处理游戏状态同步 - 服务端模式专用
     * 服务端广播游戏状态时调用此方法
     */
    handleGameStateSync(data: any) {
        // ✅ [新增] 处理开始游戏失败通知（如玩家数量不足）
        if (data.type === 'GAME_START_FAILED' && data.resetReadyState) {
            LogService.warn('gamingPvp', `[GAME_START_FAILED] ${data.message}`);
            this._handleGameStartFailed(data);
            return;
        }

        // ✅ [新增] 详细日志：打印收到的玩家数据，辅助定位问题
        const playerCount = data.players ? data.players.length : 0;
        const gameStatus = data.status?.toUpperCase() || 'UNKNOWN';
        const gameRules = data.gameRules !== undefined ? data.gameRules : 'NOT_SET';
        const playerInfoList: string[] = [];
        if (data.players && data.players.length > 0) {
            data.players.forEach((p: any, idx: number) => {
                playerInfoList.push(`seat${p.seatIndex}=${p.nickname}(userId=${p.userId},chips=${p.gameCoin},ready=${p.isReady})`);
            });
        }
        LogService.info('gamingPvp', `[GAME_STATE_SYNC] status=${gameStatus}, rules=${gameRules} (0=计分), players=${playerCount}: ${playerInfoList.join(' | ')}`);

        // ✅ [修复] 从服务端状态同步中获取游戏规则类型，确保客户端规则与服务端一致
        // 这样可以避免只依赖初始化时的 roomConfig.ruleTypeOption
        if (data.gameRules !== undefined) {
            const oldScoreType = this._scoreType;
            this._scoreType = data.gameRules;
            this._playerManager.setScoreType(this._scoreType);
            if (oldScoreType !== this._scoreType) {
                LogService.info('gamingPvp', `[规则类型同步] 更新规则类型: ${oldScoreType} -> ${this._scoreType} (0=计分, 1=筹码扣减, 2=代币)`);
            }
        }

        // ✅ [修复] 如果游戏已结束（等待新局准备），检查状态类型再决定是否忽略
        // 只有在 SETTLEMENT 状态时才忽略（等待玩家确认中）
        // 如果收到新一局开始的状态（WAITING_FOR_DEAL_COMPLETE、PREFLOP等），需要处理
        const isSettlementStatus = gameStatus === 'SETTLEMENT';

        if (this._isGameEnded && isSettlementStatus) {
            if (data.players && data.players.length > 0) {
                this.initializePlayersFromServer(data.players);
                this._playerManager.updateActivePlayers(this._gameManager);
                this.createPlayerAvatars();
            }
            return;
        }

        // 如果游戏已结束但收到新一局开始的状态，说明服务端已开始新一局，需要更新
        if (this._isGameEnded && !isSettlementStatus) {
            this._isGameEnded = false;
        }

        // 收到GAME_STATE_SYNC，更新状态同步标记
        this._gameStateSyncReceived = true;

        // ✅ [优化] 判断是否需要完整重置
        // 游戏进行中（非WAITING/SETTLEMENT状态）收到同步消息时，避免过度重置
        const isGameActive = gameStatus !== 'WAITING' && gameStatus !== 'SETTLEMENT' && gameStatus !== 'WAITING_FOR_CONFIRMATION';
        
        // ✅ [关键修复] 新游戏开始时重置结算确认标志
        if (isGameActive) {
            this._isInSettlementConfirmation = false;
        }
        
        // ✅ [关键修复] 判断是否是新回合的逻辑
        // 在游戏进行中（isGameActive=true）且正在发牌动画中（_isDealingInProgress=true）时，
        // 收到状态同步不应该清理手牌，避免发牌动画未完成时手牌被清空
        // 只有在非游戏状态或不在发牌动画中时才清理
        const isNewRound = !isGameActive && !this._isDealingInProgress;

        if (isNewRound) {
            // 新局开始：清理上一局的牌节点
            this.clearPreviousRoundCards();
        }

        // ✅ [优化] 游戏进行中且已有公牌时，避免重置游戏管理器（防止公牌丢失）
        if (!isGameActive || isNewRound) {
            // 先重置游戏管理器
            this._gameManager.reset(false);

            // 双重保险：清除服务端手牌数据
            this._gameManager.clearServerHoleCards();
        }

        // 清除所有玩家的操作显示
        this._playerManager.clearAllActionsNearAvatar(this.playersContainer, this._playerManager.getPlayersNum());

        // ✅ [优化] 游戏进行中且当前有操作玩家时，避免停止倒计时（防止操作超时重置）
        const actSeatIndex = data.actSeatIndex !== undefined ? data.actSeatIndex : data.currentActSeat;
        const isCurrentPlayerTurn = this._playerManager?.getPlayerSeat() === actSeatIndex;
        if (!isGameActive || isNewRound || !isCurrentPlayerTurn) {
            // 停止倒计时（使用 manualStopCountdown 同时停止 UIManager 和 GameFlowPvpController 的计时器）
            this.manualStopCountdown();
        }

        // 停止所有玩家的闪烁动画
        this._playerManager.stopAllPlayersBlink(this.playersContainer);

        // 重置确认状态
        this._settlementPvpHandler?.clearConfirmations();

        // ✅ [修复] 只有在非游戏状态时才清空手牌引用
        // 游戏进行中（包括新回合PREFLOP阶段）收到状态同步时保留手牌
        // 防止发牌动画未完成时手牌被清空，也避免与 updatePlayerHoleCardsFromState 冲突
        if (!isGameActive) {
            this._playerCards = [];
        }
        // 完整重新初始化玩家
        if (data.players && data.players.length > 0) {
            this.initializePlayersFromServer(data.players);
        }

        // 更新活跃玩家列表
        this._playerManager.updateActivePlayers(this._gameManager);

        // 重新创建玩家头像（这样avatar就能对应正确的seatIndex了）
        this.createPlayerAvatars();
        
        // ✅ [关键修复] 游戏进行中时更新手牌位置
        // 玩家头像重新创建后位置可能变化，需要同步更新手牌位置
        if (isGameActive) {
            // 📝 [调试] 打印 container 中所有以 player_card_ 开头的子节点
            const existingCards = this.container.children.filter(child => child.name && child.name.startsWith('player_card_'));
            LogService.info('gamingPvp', `[handleGameStateSync] 容器中存在的手牌节点: ${existingCards.map(c => c.name).join(', ')}`);
            
            this.updatePlayerCardsPosition();
        }

        // 基于服务端状态更新本地UI
        this.updateUIFromState(data);

        // ✅ [修复] 重连后恢复游戏状态，确保操作按钮可以正常显示
        this._restoreGameStateAfterSync(data);
    }

    /**
     * 游戏状态同步后恢复游戏状态
     * 确保 _gameStarted、_isInGamePhase、当前操作玩家等状态正确设置
     */
    private _restoreGameStateAfterSync(data: any): void {
        const gameStatus = data.status?.toUpperCase() || '';
        const isGameInProgress = gameStatus !== 'WAITING' && gameStatus !== 'SETTLEMENT' && gameStatus !== 'WAITING_FOR_CONFIRMATION';

        LogService.info('gamingPvp', `[状态同步] _restoreGameStateAfterSync 开始: status=${gameStatus}, isGameInProgress=${isGameInProgress}`);

        if (!isGameInProgress) {
            LogService.info('gamingPvp', `[状态同步] 游戏未进行中: status=${gameStatus}`);
            
            if (gameStatus === 'WAITING' && data.showDealButton !== undefined) {
                this._handleWaitingPhaseDealButton(data);
            }
            
            return;
        }

        if (this._gameFlowPvpController) {
            this._gameFlowPvpController.setGamePhase(gameStatus);
            LogService.info('gamingPvp', `[状态同步] 已恢复游戏阶段: ${gameStatus}, _gameStarted=${this._gameFlowPvpController.isGameStarted()}, _isInGamePhase=${this._gameFlowPvpController.isInGamePhase()}`);
        }

        const actSeatIndex = data.actSeatIndex !== undefined ? data.actSeatIndex : data.currentActSeat;
        const currentPlayerSeat = this._playerManager?.getPlayerSeat();
        LogService.info('gamingPvp', `[状态同步] 操作玩家检查: actSeatIndex=${actSeatIndex}, currentPlayerSeat=${currentPlayerSeat}, playersCount=${data.players?.length || 0}`);

        if (data.players && data.players.length > 0) {
            const currentPlayerInData = data.players.find((p: any) => p.isSelf);
            if (currentPlayerInData) {
                LogService.info('gamingPvp', `[状态同步] 当前玩家服务端数据: seatIndex=${currentPlayerInData.seatIndex}, userId=${currentPlayerInData.userId}, isFold=${currentPlayerInData.isFold}, isAllIn=${currentPlayerInData.isAllIn}`);
                if (currentPlayerSeat !== currentPlayerInData.seatIndex) {
                    LogService.warn('gamingPvp', `[状态同步] ⚠️ 座位不匹配! _playerSeat=${currentPlayerSeat}, 服务端seatIndex=${currentPlayerInData.seatIndex}, 正在修正...`);
                    this._playerManager?.setPlayerSeat(currentPlayerInData.seatIndex);
                }
            }
        }

        if (actSeatIndex !== undefined && actSeatIndex !== null && actSeatIndex >= 0) {
            if (this._gameFlowPvpController) {
                this._gameFlowPvpController.setCurrentTurnPlayer(actSeatIndex, false);
            }
            if (this._playerManager) {
                this._playerManager.setCurrentPlayer(actSeatIndex);
            }
            LogService.info('gamingPvp', `[状态同步] 已恢复当前操作玩家: seatIndex=${actSeatIndex}`);

            const actualPlayerSeat = this._playerManager?.getPlayerSeat();
            if (actualPlayerSeat !== undefined && actualPlayerSeat !== null && actSeatIndex === actualPlayerSeat) {
                const currentPlayerData = data.players?.find((p: any) => p.seatIndex === actSeatIndex);
                if (currentPlayerData) {
                    const isFolded = currentPlayerData.isFold || currentPlayerData.isFolded || currentPlayerData.folded;
                    const isAllIn = currentPlayerData.isAllIn || currentPlayerData.allIn;
                    if (!isFolded && !isAllIn) {
                        LogService.info('gamingPvp', '[状态同步] 轮到当前玩家操作，显示操作按钮');
                        this._showActionButtonsAfterSync(data, currentPlayerData);
                    } else {
                        LogService.info('gamingPvp', `[状态同步] 当前玩家已弃牌或全下，不显示操作按钮: isFold=${isFolded}, isAllIn=${isAllIn}`);
                    }
                } else {
                    LogService.warn('gamingPvp', `[状态同步] ⚠️ 未找到 seatIndex=${actSeatIndex} 的玩家数据`);
                }
            } else {
                LogService.info('gamingPvp', `[状态同步] 不是当前玩家的回合: actSeatIndex=${actSeatIndex}, currentPlayerSeat=${actualPlayerSeat}`);
            }
        } else {
            LogService.info('gamingPvp', `[状态同步] actSeatIndex无效: ${actSeatIndex}, 尝试从玩家数据判断是否需要显示操作按钮`);
            
            // ✅ [修复] actSeatIndex无效时，检查玩家数据中是否包含availableActions
            // 服务端可能在状态同步消息中包含了availableActions但未包含actSeatIndex
            if (data.players && data.players.length > 0) {
                const currentPlayerInData = data.players.find((p: any) => p.isSelf);
                if (currentPlayerInData) {
                    const isFolded = currentPlayerInData.isFold || currentPlayerInData.isFolded || currentPlayerInData.folded;
                    const isAllIn = currentPlayerInData.isAllIn || currentPlayerInData.allIn;
                    if (!isFolded && !isAllIn && data.availableActions && Array.isArray(data.availableActions) && data.availableActions.length > 0) {
                        LogService.info('gamingPvp', '[状态同步] actSeatIndex无效但玩家数据包含availableActions，显示操作按钮');
                        this._showActionButtonsAfterSync(data, currentPlayerInData);
                    }
                }
            }
        }
    }

    /**
     * 处理等待阶段的开始游戏按钮显示
     */
    private _handleWaitingPhaseDealButton(data: any): void {
        const canShowDealButton = data.showDealButton;
        const hostUserId = data.hostUserId || data.ownerId;

        if (hostUserId !== undefined) {
            this._hostUserId = hostUserId;
        }

        const currentUserId = this._gameNetwork?.getUserId();
        if (hostUserId !== undefined && currentUserId !== undefined) {
            const isHost = hostUserId.toString() === currentUserId.toString();
            this._isRoomOwner = isHost;

            if (isHost && canShowDealButton) {
                LogService.info('gamingPvp', '[状态同步-等待阶段] 服务端指示显示开始游戏按钮');
                this.showDealButton();
            } else if (isHost) {
                LogService.info('gamingPvp', '[状态同步-等待阶段] 服务端指示隐藏开始游戏按钮');
                this.hideDealNode();
            }
        }

        // ✅ [关键修复] 不再调用 updateButtonVisibility()
        // 原因：服务端已通过 showDealButton/hideDealNode 明确指示按钮状态，
        // updateButtonVisibility 会根据本地状态重新计算并可能覆盖服务端的指示。
        // this.updateButtonVisibility();
    }

    /**
     * 状态同步后显示操作按钮
     */
    private _showActionButtonsAfterSync(data: any, currentPlayerData: any): void {
        const availableActions = data.availableActions;
        
        if (availableActions && Array.isArray(availableActions) && availableActions.length > 0) {
            LogService.info('gamingPvp', '[状态同步] 使用服务端 availableActions 显示操作按钮');
            
            const notify: any = {
                isMyTurn: true,
                needToCall: Math.max(0, data.currentBet - (currentPlayerData.roundBet || currentPlayerData.betAmount || 0)),
                playerChips: currentPlayerData.gameCoin || 0,
                currentBet: data.currentBet || 0,
                totalPot: data.totalPot || data.mainPot || 0,
                availableActions: availableActions
            };
            
            if (this._gameFlowPvpController) {
                this._gameFlowPvpController.setServerAvailableActions(availableActions);
            }
            
            if (this.playersActionNode) {
                this.playersActionNode.active = true;
            }
            
            this.showPlayerActions(data, notify);
        } else {
            LogService.info('gamingPvp', '[状态同步] 服务端未提供 availableActions，尝试从玩家数据计算');
            
            const needToCall = Math.max(0, data.currentBet - (currentPlayerData.roundBet || currentPlayerData.betAmount || 0));
            const playerChips = currentPlayerData.gameCoin || 0;
            
            const calculatedActions: any[] = [];
            
            calculatedActions.push({ actionType: 'FOLD', betAmount: 0 });
            
            if (needToCall <= 0) {
                calculatedActions.push({ actionType: 'CHECK', betAmount: 0 });
                
                const bigBlind = data.bigBlind || 10;
                if (playerChips >= bigBlind) {
                    calculatedActions.push({
                        actionType: 'RAISE',
                        betAmount: bigBlind,
                        minBetAmount: bigBlind,
                        maxBetAmount: playerChips
                    });
                }
            } else {
                if (playerChips > 0) {
                    const callAmount = playerChips >= needToCall ? needToCall : playerChips;
                    calculatedActions.push({
                        actionType: 'CALL',
                        betAmount: callAmount,
                        minBetAmount: callAmount,
                        maxBetAmount: callAmount
                    });
                }
                
                const bigBlind = data.bigBlind || 10;
                const minRaiseAmount = data.lastRaiseAmount > 0 ? data.lastRaiseAmount : bigBlind;
                if (playerChips >= needToCall + minRaiseAmount) {
                    const minRaiseTotal = needToCall + minRaiseAmount;
                    calculatedActions.push({
                        actionType: 'RAISE',
                        betAmount: minRaiseTotal,
                        minBetAmount: minRaiseTotal,
                        maxBetAmount: playerChips
                    });
                }
            }
            
            if (playerChips > 0) {
                calculatedActions.push({ actionType: 'ALL_IN', betAmount: playerChips });
            }
            
            const notify: any = {
                isMyTurn: true,
                needToCall: needToCall,
                playerChips: playerChips,
                currentBet: data.currentBet || 0,
                totalPot: data.totalPot || data.mainPot || 0,
                availableActions: calculatedActions
            };
            
            if (this._gameFlowPvpController) {
                this._gameFlowPvpController.setServerAvailableActions(calculatedActions);
            }
            
            if (this.playersActionNode) {
                this.playersActionNode.active = true;
            }
            
            this.showPlayerActions(data, notify);
            
            LogService.info('gamingPvp', `[状态同步] 已计算操作按钮: ${JSON.stringify(calculatedActions)}`);
        }
    }

    /**
     * 基于服务端状态更新UI
     */
    updateUIFromState(state: any) {

        // ✅ [修复] 更新房主标识（重连时需要重新确认）
        if (state.hostUserId !== undefined || state.ownerId !== undefined) {
            const hostId = state.hostUserId !== undefined ? state.hostUserId : state.ownerId;
            this._hostUserId = hostId;
            
            const currentUserId = this._gameNetwork?.getUserId();
            if (currentUserId !== undefined) {
                const isHost = hostId.toString() === currentUserId.toString();
                this._isRoomOwner = isHost;
                LogService.info('gamingPvp', `[状态同步] 更新房主标识: hostUserId=${hostId}, currentUserId=${currentUserId}, isRoomOwner=${isHost}`);
            }
        }

        // 更新玩家信息
        if (state.players) {
            this.updatePlayersFromState(state.players);
            // 更新玩家手牌（传入结算玩家数据，用于获取所有玩家的手牌）
            // 传入 state.status 确保使用服务端最新状态，避免使用可能过时的本地状态
            const settlementPlayers = state.settlement?.playerSettlements || state.settlements;
            this.updatePlayerHoleCardsFromState(state.players, settlementPlayers, state.status);
        }

        // 更新底池
        const potValue = state.totalPot !== undefined ? state.totalPot : state.mainPot;
        if (potValue !== undefined) {
            this._gameManager.setMainPot(potValue);
            this._uiManager.updatePotDisplay(this.potLabel, potValue);
        }

        // 更新边池列表
        if (state.sidePots && Array.isArray(state.sidePots)) {
            this._gameManager.setSidePots(state.sidePots);
            this._uiManager.updateSidePotsDisplay(this.sidePotsContainer, state.sidePots);
        } else {
            this._gameManager.setSidePots([]);
            this._uiManager.updateSidePotsDisplay(this.sidePotsContainer, []);
        }

        // 更新当前下注
        if (state.currentBet !== undefined) {
            this._gameManager.setCurrentBet(state.currentBet);
        }

        // 更新按钮位
        if (state.buttonIndex !== undefined) {
            this._gameManager.setButtonSeat(state.buttonIndex);
        }

        // 更新局数显示
        if (state.currentRound !== undefined && state.maxRounds !== undefined) {
            this.updateRoundsDisplay(state.currentRound, state.maxRounds);
        }

        // 更新公共牌
        if (state.communityCards && Array.isArray(state.communityCards)) {
            this.updateCommunityCardsFromState(state.communityCards);
        }

        // 更新游戏状态
        if (state.status) {
        }

        // ✅ [修复] 始终显示位置标识图标（按钮位、小盲位、大盲位），不受游戏阶段影响
        // 位置图标应该在整局游戏中保持显示，直到新一局开始
        if (state.players && state.buttonIndex !== undefined) {
            const playerCount = state.players.length;
            const smallBlindIndex = (state.buttonIndex + 1) % playerCount;
            const bigBlindIndex = (state.buttonIndex + 2) % playerCount;

            // 显示位置标识图标
            this.showPositionIcons(state.buttonIndex, smallBlindIndex, bigBlindIndex);

            // 只有在PREFLOP阶段显示盲注操作
            const stateStatusWithoutPrefix = (state.status || '').replace(/^BETTING_/, '');
            if (stateStatusWithoutPrefix === 'PREFLOP') {
                this.showBlindActionsImmediately(smallBlindIndex, bigBlindIndex, state.players, state);
            }
        }

        // [新增] 检查是否有 availableActions 和 actionNotify，如果有，显示操作按钮（仅在非PREFLOP阶段或需要时）
        // 但是需要注意：避免与 NOTIFY_PLAYER_TURN 消息重复触发！
        if (state.availableActions && state.actionNotify && state.actionNotify.isMyTurn) {
        }
    }

    /**
     * 从服务端状态更新玩家信息
     */
    updatePlayersFromState(players: any[]) {
        if (!players || !Array.isArray(players)) {
            return;
        }

        for (const playerState of players) {
            const seatIndex = playerState.seatIndex;
            if (seatIndex === undefined || seatIndex === null) {
                continue;
            }


            // 更新玩家筹码
            if (playerState.gameCoin !== undefined) {
                this._gameManager.setPlayerChips(seatIndex, playerState.gameCoin);
            }

            // 更新玩家昵称
            if (playerState.nickname !== undefined) {
                this._gameManager.setPlayerNickname(seatIndex, playerState.nickname);
            }

            // 更新玩家本轮下注
            if (playerState.roundBet !== undefined) {
                this._gameManager.setPlayerRoundBet(seatIndex, playerState.roundBet);
            }

            // 更新玩家状态
            if (playerState.isFold !== undefined) {
                if (playerState.isFold) {
                    this._playerManager.setPlayerFolded(seatIndex);
                }
            }

            if (playerState.isAllIn !== undefined) {
                if (playerState.isAllIn) {
                    this._playerManager.setPlayerAllIn(seatIndex);
                }
            }

            // 更新玩家最后操作
            if (playerState.lastAction) {
                this._playerManager.setPlayerLastAction(seatIndex, playerState.lastAction);
            }

            // 更新真实玩家座位！
            if (playerState.isSelf === true) {
                this._playerManager.setPlayerSeat(seatIndex);
            }

            // 更新UI显示
            this._uiManager.updateAvatarAmount(this.playersContainer, seatIndex, playerState.gameCoin);
            // 更新昵称显示
            this.updateAvatarNickname(seatIndex, playerState.nickname);
            if (playerState.roundBet > 0) {
                this._uiManager.showPlayerActionChip(this.playersContainer, seatIndex, playerState.roundBet);
            }

            // 注意：不再在此处显示操作记录
            // 操作记录只在以下情况下显示：
            // 1. 发牌阶段的盲注：在showBlindActionsImmediately中处理
            // 2. 玩家的实际操作：在玩家操作后单独处理
        }
    }

    /**
     * 从服务端状态更新公共牌
     * 只更新新增的公牌，避免重复动画
     */
    updateCommunityCardsFromState(cards: number[]) {
        if (!cards || !Array.isArray(cards)) {
            return;
        }


        // 根据公牌数量决定显示哪个阶段的公牌
        // 只更新不存在的公牌，避免重复动画
        if (cards.length >= 3) {
            // 翻牌阶段：显示3张公牌
            for (let i = 0; i < 3 && i < cards.length; i++) {
                // 检查该公牌是否已存在
                const existingCard = this.container.getChildByName(`board_card_${i}`);
                if (!existingCard) {
                    this.dealBoardCardImmediate(cards[i], i);
                }
            }
        }
        if (cards.length >= 4) {
            // 转牌阶段：显示第4张公牌
            const existingCard3 = this.container.getChildByName('board_card_3');
            if (!existingCard3) {
                this.dealBoardCardImmediate(cards[3], 3);
            }
        }
        if (cards.length >= 5) {
            // 河牌阶段：显示第5张公牌
            const existingCard4 = this.container.getChildByName('board_card_4');
            if (!existingCard4) {
                this.dealBoardCardImmediate(cards[4], 4);
            }
        }
    }

    /**
     * 立即显示公牌（不带动画）
     */
    dealBoardCardImmediate(cardId: number, index: number) {
        // 使用 CardDisplayPresenter 显示公牌
        if (this._cardPresenter) {
            const poker = this._cardManager.getPokerById(cardId);
            const boardPos = this._gameManager.getBoardPositions()[index];
            this._cardPresenter.dealBoardCardImmediate(poker, index, new Vec3(boardPos.x, boardPos.y, 0));
            return;
        }

        // CardDisplayPresenter 未初始化，无法显示公牌
        LogService.error('gamingPvp', '[ERROR] dealBoardCardImmediate: CardDisplayPresenter 未初始化，无法显示公牌');
    }

    /**
     * 清除所有公牌
     */
    clearBoardCards() {
        // ✅ [优化] 优先使用 CardDisplayPresenter 清除公牌
        if (this._cardPresenter) {
            this._cardPresenter.clearBoardCards();
            return;
        }

        // 移除所有公牌节点（通过节点名称识别）
        const boardCards = this.container.children.filter(child => {
            return child.name && child.name.startsWith('board_card_');
        });

        for (const card of boardCards) {
            card.removeFromParent();
        }

        // 重置CardManager中的公牌数据
        this._cardManager.setCommunityCards([]);

    }

    /**
     * 确保正确的层级关系：公牌 > 头像 > 手牌
     * 每次收到服务端广播时调用
     */
    bringBoardCardsToFront() {
        if (!this.container || !this.container.isValid) return;

        // ✅ [关键] 确保 playersContainer 在 container 之上
        // 这样头像（在 playersContainer 内）才能显示在手牌（在 container 内）上面
        if (this.playersContainer && this.playersContainer.isValid &&
            this.container.parent === this.playersContainer.parent) {
            const parent = this.container.parent;
            const containerIdx = parent.children.indexOf(this.container);
            const playersIdx = parent.children.indexOf(this.playersContainer);
            // 确保 playersContainer 在 container 之上（头像在手牌上方）
            if (containerIdx >= 0 && playersIdx >= 0 && playersIdx < containerIdx) {
                this.playersContainer.setSiblingIndex(parent.children.length - 1);
            }
        }

        // ✅ [关键] 确保公牌节点在 container 内位于最上层
        const boardCards = this.container.children.filter(child => {
            return child.name && child.name.startsWith('board_card_') && child.isValid;
        });

        for (const card of boardCards) {
            card.setSiblingIndex(this.container.children.length - 1);
        }
    }

    /**
     * 清除上一局的所有牌节点（包括手牌和公牌）
     */
    clearPreviousRoundCards() {

        // 先清除公牌
        this.clearBoardCards();

        // 清除所有玩家手牌节点（通过节点名称识别，player_card_前缀）
        const playerCards = this.container.children.filter(child => {
            return child.name && child.name.startsWith('player_card_');
        });

        for (const card of playerCards) {
            card.removeFromParent();
        }

        // 也可以直接清空容器（但要小心不要删除其他重要节点）
        // 更安全的方式是只删除牌相关的节点

        // 重置CardManager中的公牌数据
        this._cardManager.setCommunityCards([]);
    }

    /**
     * 清除所有玩家手牌
     */
    clearPlayerCards() {
        // 移除所有玩家手牌节点（通过节点名称识别）
        const playerCards = this.container.children.filter(child => {
            return child.name && child.name.startsWith('player_card_');
        });

        for (const card of playerCards) {
            card.removeFromParent();
        }

    }

    /**
     * 更新玩家手牌位置（当玩家位置变化时调用）
     * 当新玩家加入导致玩家位置重新计算时，需要更新已有手牌的位置
     */
    updatePlayerCardsPosition() {
        const playerPos = this.getPlayersPosition();
        
        for (let seatIndex = 0; seatIndex < this._playerManager.getPlayersNum(); seatIndex++) {
            if (!this._playerManager.isPlayerActive(seatIndex)) {
                continue;
            }
            
            const playerVisualPos = playerPos.find(pos => pos.actualSeat === seatIndex);
            if (!playerVisualPos) {
                continue;
            }
            
            const isPlayer = seatIndex === this._playerManager.getPlayerSeat();
            const aiCardOffset = 15;
            
            // ✅ [关键重构] 使用 this._playerCards[seatIndex] 数组中的直接节点引用
            // deal() 方法中已经保存了节点引用，使用它们更可靠，不受命名不一致影响
            const playerCards = this._playerCards && this._playerCards[seatIndex];
            if (playerCards && Array.isArray(playerCards)) {
                for (let i = 0; i < playerCards.length; i++) {
                    const cardNode = playerCards[i];
                    if (cardNode && cardNode.isValid) {
                        const offset = isPlayer ? (i === 0 ? -30 : 30) : (i === 0 ? -aiCardOffset : aiCardOffset);
                        const posVec = new Vec3(playerVisualPos.x + offset, playerVisualPos.y, 0);
                        cardNode.setPosition(posVec);
                        LogService.info('gamingPvp', `[updatePlayerCardsPosition] 更新玩家 ${seatIndex} 的第 ${i+1} 张手牌位置: (${posVec.x}, ${posVec.y})`);
                    } else {
                        LogService.warn('gamingPvp', `[updatePlayerCardsPosition] 玩家 ${seatIndex} 的第 ${i+1} 张手牌节点无效或已销毁`);
                    }
                }
            } else {
                LogService.warn('gamingPvp', `[updatePlayerCardsPosition] 玩家 ${seatIndex} 的手牌引用数组为空或无效`);
                // 📝 [备用方案] 如果 _playerCards 中没有引用，尝试通过节点名称查找
                // 使用从1开始的索引（与 deal() 方法一致）
                for (let i = 1; i <= 2; i++) {
                    const cardName = `player_card_${seatIndex}_${i}`;
                    const cardNode = this.container.getChildByName(cardName);
                    if (cardNode && cardNode.isValid) {
                        const offset = isPlayer ? (i === 1 ? -30 : 30) : (i === 1 ? -aiCardOffset : aiCardOffset);
                        const posVec = new Vec3(playerVisualPos.x + offset, playerVisualPos.y, 0);
                        cardNode.setPosition(posVec);
                        LogService.info('gamingPvp', `[updatePlayerCardsPosition] [备用方案] 更新玩家 ${seatIndex} 的第 ${i} 张手牌位置: (${posVec.x}, ${posVec.y})`);
                    }
                }
            }
        }
    }

    /**
     * 从服务端状态更新玩家手牌
     * @param players 玩家列表
     * @param settlementPlayers 结算玩家数据（包含所有玩家手牌）
     * @param gameStatus 当前游戏状态（从服务端消息获取，避免使用可能过时的本地状态）
     * @param forceRecreate 是否强制重新创建手牌节点（结算时需要）
     */
    updatePlayerHoleCardsFromState(players: any[], settlementPlayers?: any[], gameStatus?: string, forceRecreate: boolean = false) {
        if (!players || !Array.isArray(players)) {
            return;
        }

        const status = gameStatus || '';
        const isGameActive = status !== 'WAITING' && status !== 'SETTLEMENT' && status !== 'WAITING_FOR_CONFIRMATION';

        if (!isGameActive || forceRecreate || !this._playerCards || this._playerCards.length === 0) {
            this.clearPlayerCards();
            this._playerCards = new Array(this._playerManager.getPlayersNum()).fill(0).map(() => []);
            LogService.info('gamingPvp', `[updatePlayerHoleCardsFromState] 清除并重新初始化手牌: status=${status}, isGameActive=${isGameActive}, forceRecreate=${forceRecreate}, _playerCardsLength=${this._playerCards?.length || 0}`);
        } else {
            LogService.info('gamingPvp', `[updatePlayerHoleCardsFromState] 游戏进行中且已有手牌，跳过清除操作`);
            return;
        }

        // 获取玩家位置
        const playerPos = this.getPlayersPosition();

        // 创建结算玩家数据映射（用于获取所有玩家的手牌）
        const settlementPlayerMap = new Map<number, any>();
        if (settlementPlayers && Array.isArray(settlementPlayers)) {
            for (const p of settlementPlayers) {
                if (p.seatIndex !== undefined) {
                    settlementPlayerMap.set(p.seatIndex, p);
                }
            }
            LogService.debug('gamingPvp', `[updatePlayerHoleCardsFromState] 结算玩家数据: ${settlementPlayers.length} 个`);
        }

        // 遍历每个玩家并显示手牌
        for (const playerState of players) {
            const seatIndex = playerState.seatIndex;
            if (seatIndex === undefined || seatIndex === null) {
                continue;
            }

            // 检查玩家是否活跃且在回合中（只有回合内的活跃玩家才显示手牌）
            if (!this._playerManager.isPlayerActive(seatIndex)) {
                continue;
            }
            if (!this._playerManager.isPlayerInRound(seatIndex)) {
                continue;
            }

            // 获取手牌（优先从结算数据获取，因为结算时包含所有玩家的手牌）
            const settlementPlayer = settlementPlayerMap.get(seatIndex);
            let holeCards = settlementPlayer?.holeCards;
            
            // 如果结算数据中没有，再从普通玩家数据获取
            if (!holeCards || !Array.isArray(holeCards) || holeCards.length !== 2) {
                holeCards = playerState.holeCards || playerState.handCards;
            }

            // 查找该玩家的视觉位置
            const playerVisualPos = playerPos.find(pos => pos.actualSeat === seatIndex);
            if (!playerVisualPos) {
                LogService.warn('gamingPvp', `[DEBUG] 找不到玩家 seatIndex=${seatIndex} 的视觉位置`);
                continue;
            }

            // 是否是真实玩家
            const isPlayer = seatIndex === this._playerManager.getPlayerSeat();

            // 是否有有效的手牌数据（服务端可能不推送对手手牌以保证安全公平）
            const hasValidCards = holeCards && Array.isArray(holeCards) && holeCards.length === 2;

            // 保存手牌数据到CardManager和GameManager（如果有）
            if (hasValidCards) {
                const pokerInfos = holeCards.map(cardId => this._cardManager.getPokerById(cardId));
                this._cardManager.dealHoleCards(seatIndex, pokerInfos);
                this._gameManager.setPlayerHoleCardsFromServer(seatIndex, holeCards);
                LogService.debug('gamingPvp', `[updatePlayerHoleCardsFromState] 保存玩家 ${seatIndex} 的手牌: ${holeCards}`);
            } else {
                const isSelfPlayer = seatIndex === this._playerManager.getPlayerSeat();
                if (isSelfPlayer) {
                    LogService.warn('gamingPvp', `[updatePlayerHoleCardsFromState] ⚠️ 重连玩家 ${seatIndex} 没有有效的手牌数据! holeCards=${JSON.stringify(holeCards)}, playerState=${JSON.stringify(playerState)}`);
                } else {
                    LogService.debug('gamingPvp', `[updatePlayerHoleCardsFromState] 玩家 ${seatIndex} 没有有效的手牌数据（对手手牌隐藏，正常）`);
                }
            }

            // 显示两张手牌（无论是否有数据，都显示两张牌以保证场景完整性）
            for (let i = 0; i < 2; i++) {
                const pokerCardPrefab = instantiate(this.pokerPrefab);
                const pokerComponent = pokerCardPrefab.getComponent(pokerCard);

                // 设置牌节点名称（使用从1开始的索引，与 deal() 方法保持一致）
                pokerCardPrefab.name = `player_card_${seatIndex}_${i + 1}`;

                // 计算位置：两张牌水平错开
                const aiCardOffset = 15;
                const offset = isPlayer ? (i === 0 ? -30 : 30) : (i === 0 ? -aiCardOffset : aiCardOffset);
                const posVec = new Vec3(playerVisualPos.x + offset, playerVisualPos.y, 0);

                // 设置牌的位置
                pokerCardPrefab.setPosition(posVec);

                // 设置牌的缩放和层级（所有玩家手牌尺寸统一为0.7）
                if (isPlayer) {
                    pokerCardPrefab.setScale(0.7, 0.7, 1);
                    pokerCardPrefab.setSiblingIndex(1000);

                    // 真实玩家显示正面（如果有数据）
                    if (hasValidCards) {
                        const pokerInfos = holeCards.map(cardId => this._cardManager.getPokerById(cardId));
                        pokerComponent.showPoker(pokerInfos[i].suit, pokerInfos[i].point);
                    } else {
                        // 安全起见，如果没有数据也显示背面
                        pokerComponent.backPoker();
                    }
                } else {
                    // 对手玩家始终显示背面（服务端安全策略）
                    pokerCardPrefab.setScale(0.7, 0.7, 1);
                    pokerCardPrefab.setSiblingIndex(0);
                    pokerComponent.backPoker();
                }

                // 保存牌的引用（重要！这样rubCards才能找到牌）
                this._playerCards[seatIndex].push(pokerCardPrefab);

                this.container.addChild(pokerCardPrefab);
            }
        }

    }

    /**
     * 更新单个玩家的UI显示
     * @param seatIndex 玩家座位索引
     * @param playerState 玩家状态数据
     */
    updateSinglePlayerUI(seatIndex: number, playerState: any) {

        // ✅ [优化] 优先使用 PlayerInfoPresenter 更新玩家 UI
        if (this._playerPresenter) {
            this._playerPresenter.updatePlayerAvatar(seatIndex, playerState);
            return;
        }

        // PlayerInfoPresenter 未初始化，无法更新玩家UI
        LogService.error('gamingPvp', '[ERROR] updateSinglePlayerUI: PlayerInfoPresenter 未初始化，无法更新玩家UI');
    }

    /**
     * [SERVER_MODE_ONLY] 处理玩家操作通知 - 服务端模式专用
     * 服务端发送 PLAYER_ACTION_NOTIFY 后调用此方法
     */
    handlePlayerActionNotify(data: any) {
        LogService.info('gamingPvp', `收到 PLAYER_ACTION_NOTIFY: ${JSON.stringify(data?.actionNotify || {})}`);

        // ✅ [新增] 检查游戏状态，如果已经处于结算状态，忽略操作通知
        if (data.status === 'SETTLEMENT' || data.status === 'GAME_OVER') {
            return;
        }

        // 支持两种数据格式：直接在 data 中 或 在 data.actionNotify 中
        const actionNotify = data.actionNotify || data;
        if (!actionNotify) {
            LogService.error('gamingPvp', '无效的玩家操作通知数据');
            return;
        }

        // ✅ [增强] 优先使用 seatIndex，其次通过 userId 查找
        let playerIndex = -1;

        // 1. 优先使用直接提供的座位索引
        if (actionNotify.targetUserSeatIndex !== undefined) {
            playerIndex = actionNotify.targetUserSeatIndex;
        } else if (actionNotify.playerIndex !== undefined) {
            playerIndex = actionNotify.playerIndex;
        } else if (actionNotify.seatIndex !== undefined) {
            playerIndex = actionNotify.seatIndex;
        }
        // 2. 如果没有座位索引，尝试通过 userId 查找
        else if (actionNotify.userId !== undefined || actionNotify.targetUserId !== undefined) {
            const userId = actionNotify.userId || actionNotify.targetUserId;
            playerIndex = this._playerManager.getPlayerIndexByUserId(userId);
        }

        // 检查玩家索引是否有效
        if (playerIndex < 0) {
            LogService.error('gamingPvp', `无法找到玩家，通知数据: ${JSON.stringify(actionNotify)}`);
            return;
        }

        const actionType = actionNotify.actionType || actionNotify.action;
        const amount = actionNotify.amount || 0;
        // 获取玩家昵称（优先从通知中获取，否则从GameManager获取）
        const nickname = actionNotify.targetUserNickname || actionNotify.nickname || this._gameManager.getPlayerNickname(playerIndex);


        // 检查是否为真实玩家，真实玩家的操作已经在点击按钮时立即更新
        const realPlayerSeat = this._playerManager.getPlayerSeat();
        const isRealPlayer = (playerIndex === realPlayerSeat);

        if (!isRealPlayer) {
            // 隐藏该玩家的倒计时（玩家已经操作了）
            this._playerManager.hidePlayerCountdown(this.playersContainer, playerIndex);
        }

        // ✅ [新增] 玩家弃牌时隐藏其手牌（无论是否是自己）
        const actionNameLower = typeof actionType === 'string' ? actionType.toLowerCase() : this._getActionName(actionType);
        if (actionNameLower === 'fold') {
            this.hideAIFoldedPlayerCards(playerIndex);
        }

        // 更新 action_label（无论是否是自己）
        const actionName = typeof actionType === 'string' ? actionType.toLowerCase() : this._getActionName(actionType);
        this._playerManager.showPlayerActionNearAvatar(this.playersContainer, playerIndex, actionName, amount, nickname);

        // ✅ [新增] 根据玩家操作播放对应音效
        SoundManager.getInstance().playActionSound(actionName);

        // 更新玩家下注筹码显示
        if (amount > 0) {
            this._uiManager.showPlayerActionChip(this.playersContainer, playerIndex, amount);
        }

        // ✅ [修复 FE-1.4] 统一更新所有玩家筹码、底池、边池、当前下注（只更新一次）
        // 之前真实玩家会在 isRealPlayer 分支和下面各更新一次，导致双重更新和 UI 闪烁
        if (actionNotify.gameCoin !== undefined) {
            this._gameManager.setPlayerChips(playerIndex, actionNotify.gameCoin);
            this._uiManager.updateAvatarAmount(this.playersContainer, playerIndex, actionNotify.gameCoin);
        }

        const potValue = data.totalPot !== undefined ? data.totalPot : data.mainPot;
        if (potValue !== undefined) {
            this._gameManager.setMainPot(potValue);
            this._uiManager.updatePotDisplay(this.potLabel, potValue);
        }

        // 更新边池（如果有的话）
        if (data.sidePots && Array.isArray(data.sidePots)) {
            this._gameManager.setSidePots(data.sidePots);
            this._uiManager.updateSidePotsDisplay(this.sidePotsContainer, data.sidePots);
        }

        // 更新当前下注金额
        if (data.currentBet !== undefined) {
            this._gameManager.setCurrentBet(data.currentBet);
        }

        // ✅ [新增] 调用游戏流程控制器
        if (this._gameFlowPvpController) {
            this._gameFlowPvpController.handlePlayerAction(data);
        }
    }

    /**
     * 将操作类型数字转换为名称
     * @param actionType 操作类型
     * @returns 操作名称
     */
    private _getActionName(actionType: string): string {
        switch (actionType) {
            case ActionType.FOLD:
                return 'fold';
            case ActionType.CHECK:
                return 'check';
            case ActionType.CALL:
                return 'call';
            case ActionType.RAISE:
                return 'raise';
            case ActionType.ALLIN:
                return 'all-in';
            case ActionType.ALL_IN:
                return 'all-in';
            case ActionType.BET:
                return 'bet';
            default:
                return 'unknown';
        }
    }

    /**
     * 处理游戏开始通知
     */
    handleGameStartNotify(data: any) {

        // ✅ [关键修复] 场景正在卸载时忽略 GAME_START_NOTIFY
        // 避免结算确认后场景切换过程中收到游戏开始通知导致界面变空
        if (this._isSceneUnloading) {
            LogService.warn('gamingPvp', 'handleGameStartNotify: 场景正在卸载，忽略游戏开始通知');
            return;
        }

        // ✅ [关键修复] 防重复处理 GAME_START_NOTIFY
        // 短时间内多次收到游戏开始通知会导致状态混乱
        // 需要同时检查时间戳和轮次号，避免不同轮次的游戏开始通知被误判为重复
        // 服务端发送的轮次字段可能是 roundIndex / currentRound / round，需要兼容所有情况
        const now = Date.now();
        const currentRound = data.roundIndex || data.currentRound || data.round || 0;
        const isSameRound = this._lastGameStartRound === currentRound && currentRound > 0;
        const isRecent = this._lastGameStartNotifyTime && now - this._lastGameStartNotifyTime < 3000;
        
        if (isRecent && isSameRound) {
            LogService.warn('gamingPvp', `handleGameStartNotify: 短时间内收到相同轮次(${currentRound})的游戏开始通知，忽略重复消息`);
            return;
        }
        this._lastGameStartNotifyTime = now;
        this._lastGameStartRound = currentRound;

        // ✅ [关键修复] 游戏开始时重置消息序列号
        // 服务端在 startGame 流程中从序列号 1 开始重新计数
        // 如果不重置，之前收到的消息会导致序列号超前，关键游戏消息被丢弃
        this._lastSequence = 0;
        LogService.info('gamingPvp', `handleGameStartNotify: 重置消息序列号为 0`);

        // 标记游戏正在进行中
        this._isGameEnded = false;

        // 游戏开始，重置开始按钮防重复点击标志
        this._isStartingGame = false;

        // 隐藏开始游戏按钮（deal 节点）
        this.hideDealNode();

        // 隐藏 mask 遮罩层
        if (this._maskNode) {
            this._maskNode.active = false;
        }

        // ✅ [关键修复] 游戏开始时强制清理胜利面板
        // 防止上一局结算的胜利面板在新局开始时仍然显示
        this._settlementPresenter?.hideSettlementPanel();
        this._uiManager.cleanupWinnerUI(this.node, this.playersContainer, false);

        // ✅ [关键修复] 新局开始时清理上一局的公牌和玩家手牌
        // 确保发牌动画开始前场景是干净的，没有旧牌显示
        this.clearPreviousRoundCards();

        SoundManager.getInstance().play('start');

        // 强制隐藏准备按钮和取消准备按钮（确保游戏开始后不会显示）
        // 准备按钮和取消准备按钮现在在玩家头像中
        this.updatePlayerAvatarReadyButtons(false, false);

        // 隐藏所有玩家头像中的准备标识（ok节点）
        this.hideAllReadyIndicators();

        // 更新按钮可见性（这会隐藏取消准备按钮等）
        this.updateButtonVisibility();

        // 更新游戏配置
        if (data.ante !== undefined && data.ante > 0) {
            this._settingsManager.setAnte(data.ante);
            this._gameManager.setBlinds(data.ante, data.ante * 2);
        } else if (data.smallBlind !== undefined && data.bigBlind !== undefined) {
            this._gameManager.setBlinds(data.smallBlind, data.bigBlind);
        }
        if (data.buttonIndex !== undefined) {
            this._gameManager.setButtonSeat(data.buttonIndex);
        }

        // ✅ [修复 FE-1.7] 处理 phase/currentPhase/status 字段
        // 当 GAME_START_NOTIFY 携带 BETTING 阶段信息时，直接设置游戏阶段
        const phase = data.phase || data.currentPhase || data.status;
        if (phase && this._gameFlowPvpController) {
            const phaseUpper = phase.toString().toUpperCase();
            const isGameActive = phaseUpper !== 'WAITING' && phaseUpper !== 'SETTLEMENT' && phaseUpper !== 'WAITING_FOR_CONFIRMATION';
            if (isGameActive) {
                this._gameFlowPvpController.setGamePhase(phaseUpper);
                LogService.info('gamingPvp', `handleGameStartNotify: set game phase from notification: ${phaseUpper}`);
            }
        }

        // 更新 UI 显示
        this._uiManager.updatePotDisplay(this.potLabel, 0);

        // ✅ [新增] 调用游戏流程控制器
        if (this._gameFlowPvpController) {
            this._gameFlowPvpController.handleGameStart(data);
        }

    }

    /**
     * [SERVER_MODE_ONLY] 处理发牌通知 - 服务端模式专用
     * 服务端发送 DEAL_CARDS_NOTIFY 后，客户端开始发牌
     */
    handleDealCardsNotify(data: any) {

        // ✅ [修复] 如果游戏已结束，检查状态类型再决定是否忽略
        // 只有在 SETTLEMENT 状态时才忽略（等待玩家确认中）
        // 如果收到新一局开始的状态，需要处理
        const gameStatus = data.status?.toUpperCase();
        const isSettlementStatus = gameStatus === 'SETTLEMENT';

        if (this._isGameEnded && isSettlementStatus) {
            return;
        }

        // 如果游戏已结束但收到新一局开始的状态，取消等待状态
        if (this._isGameEnded && !isSettlementStatus) {
            this._isGameEnded = false;
        }

        // ✅ 重置dealComplete发送状态，准备接收新的发牌通知
        this._resetDealCompleteSent();
        
        // ✅ 直接执行发牌逻辑（deal按钮只有在所有玩家准备好后才显示，
        // 房主点击后服务端才发送发牌通知，此时所有玩家肯定已准备好）
        this._handleDealCardsNotifyInternal(data);
    }

    /**
     * 显示位置标识图标（按钮位、小盲位、大盲位）
     */
    private showPositionIcons(buttonSeat: number, smallBlindSeat: number, bigBlindSeat: number): void {

        // 获取活跃玩家位置列表
        const playerPositions = this.getPlayersPos();

        // 获取avatar容器
        const avatarContainerNode = this.playersContainer.getChildByName('avatar');
        if (!avatarContainerNode) {
            LogService.warn('gamingPvp', 'avatar容器不存在，无法显示位置图标');
            return;
        }

        // 清理旧的位置图标（避免重复显示）
        const oldSeatIcons = this.playersContainer.children.filter(child => child.name === 'seat');
        for (const icon of oldSeatIcons) {
            icon.removeFromParent();
        }

        // 显示按钮位图标（只处理活跃玩家）
        if (this._playerManager.isPlayerActive(buttonSeat)) {
            const btnPos = playerPositions.find(pos => pos.actualSeat === buttonSeat);
            if (btnPos) {
                let btnSeatNode = new Node("seat");
                let btnSp = btnSeatNode.addComponent(Sprite);
                btnSp.spriteFrame = this.seatIcons[0]; // 按钮图标
                btnSeatNode.layer = Layers.Enum.UI_2D;
                this.playersContainer.addChild(btnSeatNode);
                btnSeatNode.setPosition(new Vec3(btnPos.x, btnPos.y, 0));
                btnSeatNode.setSiblingIndex(1000); // 设置较高的层级，避免被遮挡
            }
        }

        // 显示小盲位图标（只处理活跃玩家）
        if (this._playerManager.isPlayerActive(smallBlindSeat)) {
            const sbPos = playerPositions.find(pos => pos.actualSeat === smallBlindSeat);
            if (sbPos) {
                let sbSeatNode = new Node("seat");
                let sbSp = sbSeatNode.addComponent(Sprite);
                sbSp.spriteFrame = this.seatIcons[1]; // SB 图标
                sbSeatNode.layer = Layers.Enum.UI_2D;
                this.playersContainer.addChild(sbSeatNode);
                sbSeatNode.setPosition(new Vec3(sbPos.x, sbPos.y, 0));
                sbSeatNode.setSiblingIndex(1000); // 设置较高的层级，避免被遮挡
            }
        }

        // 显示大盲位图标（只处理活跃玩家）
        if (this._playerManager.isPlayerActive(bigBlindSeat)) {
            const bbPos = playerPositions.find(pos => pos.actualSeat === bigBlindSeat);
            if (bbPos) {
                let bbSeatNode = new Node("seat");
                let bbSp = bbSeatNode.addComponent(Sprite);
                bbSp.spriteFrame = this.seatIcons[2]; // BB 图标
                bbSeatNode.layer = Layers.Enum.UI_2D;
                this.playersContainer.addChild(bbSeatNode);
                bbSeatNode.setPosition(new Vec3(bbPos.x, bbPos.y, 0));
                bbSeatNode.setSiblingIndex(1000); // 设置较高的层级，避免被遮挡
            }
        }
    }

    /**
     * 内部方法：处理发牌通知的实际逻辑
     */
    private _handleDealCardsNotifyInternal(data: any) {
        // ✅ [关键修复] 设置发牌进行中标志，防止状态同步时误清理手牌
        this._isDealingInProgress = true;
        
        // ✅ [关键修复] 开始发牌动画前，强制隐藏胜利面板
        // 非房主玩家不会收到 DEAL_BUTTON_SHOW_NOTIFY，所以必须在此处强制隐藏
        // 防止上一局结算的胜利面板还没隐藏就开始发牌动画
        // 注意：胜利面板可能由 SettlementPresenter 或 UIManager 创建，需要同时清理
        this._settlementPresenter?.hideSettlementPanel();
        this._uiManager.cleanupWinnerUI(this.node, this.playersContainer, false);
        LogService.info('gamingPvp', '_handleDealCardsNotifyInternal: 开始发牌动画前，强制隐藏胜利面板');

        // 游戏开始时隐藏准备按钮和取消准备按钮

        // 方式1：使用 hide 方法
        this.hideReadyButton();
        this.hideCancelReadyButton();

        // 方式2：直接设置按钮状态（双重保险，确保隐藏）
        // 准备按钮和取消准备按钮现在在玩家头像中
        this.updatePlayerAvatarReadyButtons(false, false);

        // 发牌期间隐藏所有玩家的倒计时，因为发牌期间不可以操作
        for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
            this._playerManager.hidePlayerCountdown(this.playersContainer, i);
        }
        // 同时停止正在运行的倒计时
        this._gameFlowPvpController?.stopCountdown();

        // 支持两种格式：
        // 1. 有 dealNotify 字段（发底牌 PREFLOP 时）
        // 2. 没有 dealNotify 但有 communityCards（翻牌/转牌/河牌时）
        if (!data || (!data.dealNotify && !data.communityCards)) {
            LogService.error('gamingPvp', '无效的发牌通知数据');
            return;
        }

        const dealNotify = data.dealNotify;

        // 更新游戏状态
        if (data.buttonIndex !== undefined) {
            this._gameManager.setButtonSeat(data.buttonIndex);
        }
        if (dealNotify && dealNotify.phase) {
        }
        if (data.communityCards) {
            this._gameManager.setCommunityCards(data.communityCards);
        }

        // 更新局数显示（从 DEAL_CARDS_NOTIFY 消息中获取）
        if (data.currentRound !== undefined && data.maxRounds !== undefined) {
            this.updateRoundsDisplay(data.currentRound, data.maxRounds);
        }

        // 根据不同阶段处理发牌
        if (dealNotify && dealNotify.phase === 'PREFLOP') {
            // 隐藏 start/deal 节点（游戏开始时隐藏）
            this.hideDealNode();

            // 强制：在发牌前必须确保头像已创建
            // 无论是否收到 GAME_STATE_SYNC，都从发牌通知中获取玩家数据创建头像

            // PREFLOP发牌前先清空手牌和公牌！
            this._uiManager.cleanupCards();
            this._playerCards = [];

            // 重置游戏管理器
            this._gameManager.reset(false);

            // 使用发牌通知中的玩家数据初始化
            if (data.players && data.players.length > 0) {

                this.initializePlayersFromServer(data.players);
                this._playerManager.updateActivePlayers(this._gameManager);

                // ✅ [修复] 从 dealNotify.holeCards 获取并保存当前玩家的手牌
                // 因为服务端在 getPublicStateForPlayer 中不返回 handCards（非摊牌阶段）
                if (dealNotify && dealNotify.holeCards && dealNotify.holeCards.length === 2) {
                    const selfPlayer = data.players.find((p: any) => p.isSelf);
                    if (selfPlayer && selfPlayer.seatIndex !== undefined) {
                        this._gameManager.setPlayerHoleCardsFromServer(selfPlayer.seatIndex, dealNotify.holeCards);
                    }
                }

                // 强制创建头像
                this.createPlayerAvatars();

                this._gameStateSyncReceived = true;
            } else {
                LogService.error('gamingPvp', '[ERROR] 发牌通知中没有玩家数据，无法创建头像！');
                return;
            }

            // 更新按钮位信息
            if (dealNotify.buttonIndex !== undefined) {
                this._gameManager.setButtonSeat(dealNotify.buttonIndex);
            }
            if (dealNotify.smallBlindIndex !== undefined) {
                this._gameManager.setSmallBlindSeat(dealNotify.smallBlindIndex);
            }
            if (dealNotify.bigBlindIndex !== undefined) {
                this._gameManager.setBigBlindSeat(dealNotify.bigBlindIndex);
            }

            // 更新底池显示
            if (data.totalPot !== undefined) {
                this._gameManager.setMainPot(data.totalPot);
                this._uiManager.updatePotDisplay(this.potLabel, data.totalPot);
            }

            // 延迟发底牌（给界面更新一些时间）
            this.safeSetTimeout(() => {
                if (!this.node || !this.node.isValid) return;

                // ✅ [修复] 使用 deal() 方法发牌（dealCardsToPlayers 不存在）
                this.deal();

                // 显示位置标识（按钮、小盲、大盲）
                this.showPositionIcons(
                    dealNotify.buttonIndex,
                    dealNotify.smallBlindIndex,
                    dealNotify.bigBlindIndex
                );

                // 发牌后立即显示盲注玩家的操作
                this.showBlindActionsImmediately(
                    dealNotify.smallBlindIndex,
                    dealNotify.bigBlindIndex,
                    data.players,
                    data
                );
            }, 500);
        } else if (data.communityCards) {
            // 翻牌/转牌/河牌阶段
            const communityCards = data.communityCards;
            const phase = data.phase || 'FLOP';


            // ✅ [修复] 不再清空公牌显示，保留之前的公牌
            // 发牌方法内部会检查牌是否已存在，避免重复动画

            // 延迟发公牌
            this.safeSetTimeout(() => {
                if (!this.node || !this.node.isValid) return;

                if (phase === 'FLOP') {
                    // 翻牌：发3张公牌
                    this.dealFlop(communityCards);
                } else if (phase === 'TURN') {
                    // 转牌：发第4张公牌（保留前3张）
                    this.dealTurn(communityCards);
                } else if (phase === 'RIVER') {
                    // 河牌：发第5张公牌（保留前4张）
                    this.dealRiver(communityCards);
                }
            }, 300);
        }

    }

    /**
     * 发牌后立即显示盲注玩家的操作（BLIND 50, BLIND 100）
     * 确保盲注操作在其他玩家开始下注之前显示
     */
    private showBlindActionsImmediately(smallBlindIndex: number, bigBlindIndex: number, players: any[], data: any): void {
        // 先清除所有玩家的操作标签，防止重复和错误显示
        players.forEach((player: any) => {
            this._playerManager.clearActionNearAvatar(this.playersContainer, player.seatIndex);
        });

        // 检查是否所有活跃玩家都是 all-in（这种情况下会直接跳过盲注阶段进入摊牌）
        const activePlayers = players.filter((p: any) => !p.isFold);
        const allActivePlayersAllIn = activePlayers.length > 0 && activePlayers.every((p: any) => p.isAllIn);

        if (allActivePlayersAllIn) {
            // 所有玩家都是 all-in 时，直接跳过盲注显示
        } else if (smallBlindIndex !== undefined && bigBlindIndex !== undefined && smallBlindIndex >= 0 && bigBlindIndex >= 0) {
            const smallBlindPlayer = players.find((p: any) => p.seatIndex === smallBlindIndex);
            const bigBlindPlayer = players.find((p: any) => p.seatIndex === bigBlindIndex);

            if (smallBlindPlayer && bigBlindPlayer) {
                // 显示小盲注操作
                const sbBet = smallBlindPlayer.lastActionBet || data.smallBlind || 10;
                this._playerManager.showPlayerActionNearAvatar(this.playersContainer, smallBlindPlayer.seatIndex, 'small_blind', sbBet, smallBlindPlayer.nickname);
                this._uiManager.showActionLog(this.node, smallBlindPlayer.seatIndex, 'small_blind', sbBet);

                // 显示大盲注操作
                const bbBet = bigBlindPlayer.lastActionBet || data.bigBlind || 20;
                this._playerManager.showPlayerActionNearAvatar(this.playersContainer, bigBlindPlayer.seatIndex, 'big_blind', bbBet, bigBlindPlayer.nickname);
                this._uiManager.showActionLog(this.node, bigBlindPlayer.seatIndex, 'big_blind', bbBet);
            } else {
                LogService.warn('gamingPvp', `[WARN] 无法找到盲注玩家: smallBlindIndex=${smallBlindIndex}, bigBlindIndex=${bigBlindIndex}, players=${JSON.stringify(players.map((p: any) => p.seatIndex))}`);
            }
        } else {
            LogService.warn('gamingPvp', '[WARN] 服务端未提供有效的盲注索引');
        }

        // 调用游戏流程控制器
        if (this._gameFlowPvpController) {
            this._gameFlowPvpController.handleDealCards(data);
        }
    }

    /**
     * [SERVER_MODE_ONLY] 处理游戏结算 - 服务端模式专用
     * 服务端发送 GAME_SETTLEMENT_NOTIFY 后调用此方法
     */
    handleGameSettlement(data: any) {
        LogService.info('gamingPvp', '收到 GAME_SETTLEMENT 游戏结算消息');

        // ✅ [关键修复] 结算阶段必须立即停止所有倒计时并隐藏 clock
        // 这是防止结算阶段玩家仍显示倒计时的关键修复
        this.manualStopCountdown();

        // ✅ [关键修复] 结算阶段隐藏所有玩家的准备标识（ok图标）
        // 服务端已重置所有玩家的准备状态，客户端需要同步更新UI
        this.hideAllReadyIndicators();

        // ✅ [关键修复] 更新 _playerManager 中的准备状态为未准备
        // 服务端在结算时已将所有房间玩家设为 isReady=false
        if (data.players && this._playerManager) {
            for (const playerData of data.players) {
                const userId = playerData.userId;
                if (userId !== undefined) {
                    this._playerManager.setPlayerReady(userId, false);
                }
            }
        }

        // ✅ [关键修复] 结算阶段立即清空底池显示
        // 服务端结算后底池已分配给赢家，场景中的 potLabel 需要设置为0
        this._gameManager.setPot(0);
        this._uiManager.updatePotDisplay(this.potLabel, 0);

        // ✅ [关键修复] 更新服务端发送的玩家数据（包含手牌）到GameManager
        // 这是确保结算时能正确获取所有玩家手牌数据的关键步骤
        if (data.players) {
            this._gameManager.updatePlayersFromServer(data.players);
        }

        // ✅ [新增] 结算时更新当前用户的最新信息（房卡和游戏币）
        const userInfoManager = UserInfoManager.getInstance();
        const currentUserId = userInfoManager.getUserId();
        if (currentUserId > 0 && data.settlement && data.settlement.playerSettlements) {
            const playerSettlements = data.settlement.playerSettlements;
            const currentPlayerSettlement = playerSettlements.find((p: any) => p.userId === currentUserId);
            if (currentPlayerSettlement) {
                // 更新房卡余额
                if (currentPlayerSettlement.roomCard !== undefined && currentPlayerSettlement.roomCard !== null) {
                    userInfoManager.updateRoomCard(currentPlayerSettlement.roomCard);
                    LogService.info('gamingPvp', `结算后更新房卡余额: ${currentPlayerSettlement.roomCard}`);
                }
                // 更新游戏币余额
                if (currentPlayerSettlement.gameCoin !== undefined && currentPlayerSettlement.gameCoin !== null) {
                    const userInfo = userInfoManager.getUserInfo();
                    if (userInfo) {
                        userInfo.gameCoin = currentPlayerSettlement.gameCoin;
                        userInfoManager.setUserInfo(userInfo);
                        LogService.info('gamingPvp', `结算后更新游戏币余额: ${currentPlayerSettlement.gameCoin}`);
                    }
                }
            }
        }

        // ✅ [新增修复] 标记进入结算阶段，确保即使筹码为0的玩家也能显示
        this._playerManager.setInSettlement(true);
        //LogService.info('gamingPvp', '已设置结算阶段标志');

        // ✅ [新增修复] 立即更新活跃玩家列表，确保所有玩家都标记为活跃
        this._playerManager.updateActivePlayers(this._gameManager);
        //LogService.info('gamingPvp', '已更新活跃玩家列表（结算阶段）');

        // ✅ [优化] 使用 SettlementService 处理结算逻辑
        if (this._settlementService) {
            LogService.info('gamingPvp', 'handleGameSettlement: 使用 SettlementService');
            const potValue = data.totalPot !== undefined ? data.totalPot : data.mainPot;
            this._settlementService.handleSettlement(data.winners, potValue);
        }

        // ✅ [优化] 使用 SettlementPvpHandler 处理结算逻辑
        if (this._settlementPvpHandler) {

            // ✅ [修复] 在结算前先更新玩家手牌，创建牌节点（翻牌动画依赖这些节点）
            // forceRecreate=true 确保结算时重新创建手牌节点用于翻牌动画
            const settlementPlayers = data.settlement?.playerSettlements || data.settlements;
            if (data.players) {
                this.updatePlayerHoleCardsFromState(data.players, settlementPlayers, data.status, true);
                //LogService.info('gamingPvp', '结算前已更新玩家手牌和牌节点');
            }

            this._settlementPvpHandler.handleGameSettlement(
                data as SettlementPvpData,
                this.playersContainer,
                this.potLabel,
                this.sidePotsContainer,
                this.winPanelPrefab,
                this.node,
                () => {
                    return this.showActivePlayersCards();
                },
                () => this.getOnlyActivePlayer(),
                this._playerCards
            ).then((result) => {
                if (result) {

                    // ✅ [新增] 调用游戏流程控制器
                    if (this._gameFlowPvpController) {
                        this._gameFlowPvpController.handleSettlement(data);
                    }
                }

                // ✅ [修复] 结算完成后，安全兜底：确保准备按钮显示
                // 防止 winner panel 流程异常导致准备按钮不显示，玩家无法准备
                this._ensureReadyButtonAfterSettlement();
            }).catch((err) => {
                LogService.error('gamingPvp', `handleGameSettlement: 结算处理异常: ${err}`);

                // ✅ [修复] 即使结算处理异常，也要显示准备按钮，防止游戏卡住
                this._ensureReadyButtonAfterSettlement();
            });

            return;
        }

        // SettlementPvpHandler 未初始化，无法处理结算
        LogService.error('gamingPvp', '[ERROR] handleGameSettlement: SettlementPvpHandler 未初始化，无法处理结算');

        // AI玩家自动确认
        const playersNum = this._playerManager.getPlayersNum();
        for (let i = 0; i < playersNum; i++) {
            if (this._playerManager.isAIPlayer(i) && this._gameManager.getPlayerChips(i) > 0) {
                this.safeSetTimeout(() => {
                    if (this._isConfirmationPending()) {
                        this.onPlayerConfirmed(i);
                    }
                }, 1000 + Math.random() * 1000);
            }
        }

        // 调用游戏流程控制器
        if (this._gameFlowPvpController) {
            this._gameFlowPvpController.handleSettlement(data);
        }
    }

    /**
     * ✅ [修复] 结算后安全兜底：确保准备按钮显示
     * 防止 winner panel 流程异常或未触发导致准备按钮不显示，玩家无法准备，游戏卡住
     * 延迟3秒执行，让 winner panel 的继续按钮流程先自然完成
     */
    private _ensureReadyButtonAfterSettlement() {
        this.safeSetTimeout(() => {
            // 如果场景正在卸载，不处理
            if (this._isSceneUnloading) {
                return;
            }
            // 如果已经开始新一局游戏，不需要显示准备按钮
            const isInGame = this._gameFlowPvpController?.isInGamePhase() ?? false;
            if (isInGame) {
                return;
            }
            // 如果准备按钮已经显示，不需要重复显示
            if (this._showReadyButton) {
                return;
            }
            // 安全兜底：重置准备状态并显示准备按钮
            //LogService.info('gamingPvp', '结算后安全兜底：准备按钮未显示，自动显示准备按钮');
            this._isGameEnded = true;
            this.resetReadyStatus();
            this.showReadyButton();
        }, 3000);
    }



    /**
     * 处理玩家断开连接通知
     */
    handlePlayerDisconnected(data: any) {
        if (!data) {
            LogService.error('gamingPvp', 'handlePlayerDisconnected: data is null or undefined');
            return;
        }

        if (this._isSceneUnloading) {
            LogService.warn('gamingPvp', 'handlePlayerDisconnected: 场景正在卸载，忽略消息');
            return;
        }

        const currentUserId = this._gameNetwork?.getUserId();
        const disconnectUserId = data.userId;
        const disconnectType = data.type || 'disconnect';

        LogService.info('gamingPvp', `当前用户ID: ${currentUserId}, 断开连接用户ID: ${disconnectUserId}, 类型: ${disconnectType}`);

        if (!disconnectUserId) {
            LogService.error('gamingPvp', 'handlePlayerDisconnected: userId is missing in data:', data);
            return;
        }

        // 检查是否是当前玩家断开连接
        if (currentUserId && disconnectUserId && currentUserId.toString() === disconnectUserId.toString()) {
            LogService.info('gamingPvp', '当前玩家断开连接，准备退出并跳转到index场景');

            // 显示提示信息
            const message = data.message || '网络连接断开';
            LogService.info('gamingPvp', `断开连接原因: ${message}`);

            // ✅ [修复] 不再主动断开连接，让 WebSocketManager 自动重连
            // 服务端已经检测到断开，客户端不需要再断开
            LogService.info('gamingPvp', '等待 WebSocket 自动重连...');

            // 清理游戏状态
            this._cleanupGameState();

            // 跳转到index场景
            //LogService.info('gamingPvp', '跳转到index场景');
            this._transitionToScene('index');
        } else {
            // 其他玩家断开连接
            
            // ✅ [新增] 处理断线通知（服务端广播的 disconnect 类型）
            if (disconnectType === 'disconnect') {
                // ✅ [修复] 防止重复的 disconnect 通知导致倒计时重置
                // 如果已经在显示断线遮罩，说明正在倒计时中，忽略重复通知
                // 倒计时更新由 cmd=214 (countdown) 消息负责
                if (this.disconnectMask && this.disconnectMask.active) {
                    LogService.info('gamingPvp', `收到重复断线通知，忽略（已在倒计时中）: userId=${disconnectUserId}`);
                } else {
                    // 显示断线重连遮罩
                    this.showDisconnectMask();
                    
                    // 暂停当前玩家的操作（隐藏操作按钮）
                    this.updatePlayerAvatarReadyButtons(false, false);
                    
                    LogService.info('gamingPvp', `玩家 ${disconnectUserId} 断开连接，显示断线重连遮罩，暂停游戏`);
                }
            }

            // 根据服务端数据更新玩家列表
            if (data.players && data.players.length > 0) {
                LogService.info('gamingPvp', '根据服务端数据重新同步座位索引');

                // ✅ [关键修复] 过滤掉离线玩家，只保留在线玩家
                // 服务端发送的 players 列表包含所有玩家（包括离线的），但客户端应该只显示在线玩家
                const onlinePlayers = data.players.filter((p: any) => p.isOnline !== false);
                LogService.info('gamingPvp', `过滤离线玩家: 原始=${data.players.length}, 过滤后=${onlinePlayers.length}`);

                // 先移除所有现有的玩家头像
                if (this.playersContainer) {
                    const childrenToRemove = [];
                    for (const child of this.playersContainer.children) {
                        if (child.name && child.name.startsWith('avatar_')) {
                            childrenToRemove.push(child);
                        }
                    }
                    childrenToRemove.forEach(child => child.destroy());
                    LogService.info('gamingPvp', `已移除 ${childrenToRemove.length} 个玩家头像`);
                }

                // 清空 PlayerManager 中的座位映射
                if (this._playerManager) {
                    this._playerManager.clearSeatMappings();
                }

                // 重新根据服务端数据初始化玩家（使用过滤后的在线玩家列表）
                const currentUserId = this._gameNetwork?.getUserId();
                const maxPlayers = data.maxPlayers !== undefined ? data.maxPlayers : 5;
                const isInSettlement = this._isGameEnded && !this._isNewRoundStarted;
                // updateRoomPlayers 内部会处理头像的清理和创建，不需要额外调用
                this.updateRoomPlayers(onlinePlayers, currentUserId, maxPlayers, isInSettlement);

                LogService.info('gamingPvp', '断开连接 - 座位索引同步完成');
            } else {
                // 没有服务端数据，使用旧的移除逻辑
                if (this._playerManager && disconnectUserId !== undefined) {
                    const seatIndex = this._playerManager.getPlayerIndexByUserId(disconnectUserId);
                    this._playerManager.removePlayerByUserId(disconnectUserId);

                    if (seatIndex !== -1 && this.playersContainer) {
                        let avatarNode = this.playersContainer.getChildByName(`avatar_${seatIndex + 1}`);
                        if (!avatarNode) {
                            const avatarContainer = this.playersContainer.getChildByName('avatar');
                            if (avatarContainer) {
                                avatarNode = avatarContainer.getChildByName(`avatar_${seatIndex + 1}`);
                            }
                        }

                        if (avatarNode) {
                            avatarNode.destroy();
                            this._playerAvatars.delete(seatIndex);
                            LogService.info('gamingPvp', `已移除玩家头像: seatIndex=${seatIndex}`);
                        } else {
                            LogService.warn('gamingPvp', `未找到要移除的头像节点: avatar_${seatIndex + 1}`);
                        }
                    }
                }
            }

            // 根据房间人数显示/隐藏遮罩层
            const totalPlayers = data.totalPlayers || this._playerManager.getPlayersNum();
            this._updateMaskVisibility(totalPlayers);

            // 更新按钮显示状态
            this.updateButtonVisibility();
        }
    }

    /**
     * ✅ [新增] 处理服务端广播的 round 玩家列表更新消息 (cmd=215)
     * 当玩家断线超时被踢出轮局时，服务端会广播此消息
     * @param data 玩家列表数据
     */
    handleRoundPlayerListUpdate(data: any) {
        if (!data) {
            LogService.error('gamingPvp', 'handleRoundPlayerListUpdate: data is null or undefined');
            return;
        }

        if (this._isSceneUnloading) {
            LogService.warn('gamingPvp', 'handleRoundPlayerListUpdate: 场景正在卸载，忽略消息');
            return;
        }

        LogService.info('gamingPvp', `handleRoundPlayerListUpdate: 收到 round 玩家列表更新，玩家数量=${data.players?.length || 0}`);

        // 更新玩家在线状态和轮局列表
        if (data.players && data.players.length > 0) {
            const currentUserId = this._gameNetwork?.getUserId();
            const maxPlayers = data.maxPlayers !== undefined ? data.maxPlayers : 5;

            // ✅ [防御性修复] 过滤掉离线玩家，确保只处理在线玩家
            const onlinePlayers = data.players.filter((p: any) => p.isOnline !== false);
            LogService.info('gamingPvp', `handleRoundPlayerListUpdate: 过滤离线玩家: 原始=${data.players.length}, 过滤后=${onlinePlayers.length}`);

            // ✅ [修复] 更新 _hostUserId 和 _isRoomOwner 状态
            // 服务端发送的玩家数据中包含 isHost 字段，需要更新本地状态
            const hostPlayer = data.players.find((p: any) => p.isHost);
            if (hostPlayer && hostPlayer.userId !== undefined) {
                this._hostUserId = hostPlayer.userId;
                if (currentUserId && currentUserId.toString() === hostPlayer.userId.toString()) {
                    this._isRoomOwner = true;
                } else {
                    this._isRoomOwner = false;
                }
                LogService.info('gamingPvp', `handleRoundPlayerListUpdate: 更新房主信息 - hostUserId=${this._hostUserId}, isRoomOwner=${this._isRoomOwner}`);
            }

            // ✅ [修复] 更新 UI 显示，isInSettlement=false（游戏进行中，不是结算阶段）
            // 之前传入 true 导致玩家头像重建逻辑走结算分支，可能影响玩家显示
            const isInSettlement = this._isGameEnded && !this._isNewRoundStarted;
            this.updateRoomPlayers(onlinePlayers, currentUserId, maxPlayers, isInSettlement);

            // ✅ [关键修复] 同步玩家游戏状态（筹码、下注、弃牌、全下等）
            // 服务端发送的玩家数据中包含 isFolded、isAllIn、betAmount 等字段，需要正确同步
            // 之前遗漏了这一步，导致玩家弃牌状态没有被正确更新
            this._syncPlayerGameState(onlinePlayers, currentUserId);

            // 更新房主指示器
            this.updateHomeownerIndicator();

            // 隐藏断线重连遮罩（如果所有断线玩家都已处理）
            this.hideDisconnectMask();

            LogService.info('gamingPvp', 'handleRoundPlayerListUpdate: round 玩家列表更新完成');
        } else {
            LogService.warn('gamingPvp', 'handleRoundPlayerListUpdate: players array is empty or undefined');
        }
    }

    /**
     * 显示断线重连遮罩
     */
    private showDisconnectMask(): void {
        if (this.disconnectMask) {
            this.disconnectMask.active = true;

            this._updateDisconnectMaskTime('30');

            // ✅ [关键修复] 在停止倒计时之前，记录当前操作倒计时的剩余时间
            // 这样在断线超时后恢复游戏时，可以继续使用剩余时间而不是重新开始30秒
            this._pausedActionTimeRemaining = this._uiManager?.getActionTimeRemaining() || 0;
            LogService.info('gamingPvp', `[断线暂停] 记录操作倒计时剩余时间: ${this._pausedActionTimeRemaining}秒`);

            // ✅ [修复] 必须同时停止 UIManager 和 GameFlowPvpController 两个倒计时
            // 之前只调用 stopActionTimer() 仅停止了 UIManager 的定时器，
            // 导致 GameFlowPvpController._countdownInterval 继续运行，
            // 30秒后触发 onCountdownExpired -> handleCountdownTimeout -> 自动弃牌
            this.manualStopCountdown();

            this._startDisconnectLocalTimeout();

            this._addDisconnectMaskTouchBlocker();

            LogService.info('gamingPvp', '显示断线重连遮罩，暂停操作倒计时');
        }
    }

    /**
     * 添加断线遮罩触摸阻挡器
     * 阻止触摸事件穿透到下层UI元素
     */
    private _addDisconnectMaskTouchBlocker(): void {
        this._removeDisconnectMaskTouchBlocker();
        
        const blockTouch = (event: any) => {
            event.propagationStopped = true;
            return true;
        };
        
        this.disconnectMask.on(Node.EventType.TOUCH_START, blockTouch, this);
        this.disconnectMask.on(Node.EventType.TOUCH_MOVE, blockTouch, this);
        this.disconnectMask.on(Node.EventType.TOUCH_END, blockTouch, this);
        this.disconnectMask.on(Node.EventType.TOUCH_CANCEL, blockTouch, this);
        
        LogService.info('gamingPvp', '已添加断线遮罩触摸阻挡器');
    }

    /**
     * 移除断线遮罩触摸阻挡器
     */
    private _removeDisconnectMaskTouchBlocker(): void {
        if (this.disconnectMask) {
            this.disconnectMask.off(Node.EventType.TOUCH_START, null, this);
            this.disconnectMask.off(Node.EventType.TOUCH_MOVE, null, this);
            this.disconnectMask.off(Node.EventType.TOUCH_END, null, this);
            this.disconnectMask.off(Node.EventType.TOUCH_CANCEL, null, this);
            
            LogService.info('gamingPvp', '已移除断线遮罩触摸阻挡器');
        }
    }

    /**
     * 启动本地断线重连超时定时器
     * 确保即使服务端消息丢失，disconnectMask也能在超时后自动隐藏
     */
    private _startDisconnectLocalTimeout(): void {
        this._cancelDisconnectLocalTimeout();
        
        this._disconnectLocalTimeout = setTimeout(() => {
            if (this.disconnectMask && this.disconnectMask.active) {
                LogService.warn('gamingPvp', '本地断线重连超时触发，强制隐藏disconnectMask');
                this.hideDisconnectMask();
            }
            this._disconnectLocalTimeout = null;
        }, gamingPvp.DISCONNECT_LOCAL_TIMEOUT_SECONDS * 1000);
    }

    /**
     * 取消本地断线重连超时定时器
     */
    private _cancelDisconnectLocalTimeout(): void {
        if (this._disconnectLocalTimeout !== null) {
            clearTimeout(this._disconnectLocalTimeout);
            this._disconnectLocalTimeout = null;
        }
    }

    /**
     * 更新断线重连遮罩的时间显示
     */
    private _updateDisconnectMaskTime(timeStr: string): void {
        if (!this.disconnectMask) {
            return;
        }
        
        const timeNode = this.disconnectMask.getChildByName('time');
        if (!timeNode) {
            //LogService.warn('gamingPvp', '_updateDisconnectMaskTime: time node not found');
            return;
        }
        
        let label = timeNode.getComponent(Label);
        
        if (!label) {
            const labelNode = timeNode.getChildByName('Label');
            if (labelNode) {
                label = labelNode.getComponent(Label);
            }
        }
        
        if (label) {
            label.string = timeStr;
            //LogService.info('gamingPvp', `更新断线重连遮罩时间: ${timeStr}`);
        } else {
           // LogService.warn('gamingPvp', '_updateDisconnectMaskTime: Label component not found');
        }
    }

    /**
     * 隐藏断线重连遮罩
     * ✅ [修复] 同时隐藏 _maskNode（start/mask），确保两个遮罩都被隐藏
     */
    private hideDisconnectMask(): void {
        this._cancelDisconnectLocalTimeout();
        
        this._removeDisconnectMaskTouchBlocker();
        
        if (this.disconnectMask) {
            this.disconnectMask.active = false;
            LogService.info('gamingPvp', '隐藏断线重连遮罩');
        }

        // ✅ [修复] 同时隐藏 _maskNode（start/mask）
        if (this._maskNode) {
            this._maskNode.active = false;
            LogService.info('gamingPvp', '隐藏 _maskNode（start/mask）');
        }
    }

    /**
     * 请退离线玩家
     * @param targetUserId 目标玩家ID
     */
    public kickPlayer(targetUserId: number): void {
        if (!this._gameNetwork || !this._roomId) {
            LogService.warn('gamingPvp', 'kickPlayer: 网络未连接或房间ID无效');
            return;
        }

        const currentUserId = this._gameNetwork.getUserId();
        if (!currentUserId) {
            LogService.warn('gamingPvp', 'kickPlayer: 当前用户未登录');
            return;
        }

        if (currentUserId === targetUserId) {
            LogService.warn('gamingPvp', 'kickPlayer: 不能请退自己');
            return;
        }

        const request = {
            roomId: this._roomId,
            userId: currentUserId,
            targetUserId: targetUserId,
            timestamp: Date.now()
        };

        LogService.info('gamingPvp', `发送请退请求: roomId=${this._roomId}, kicker=${currentUserId}, target=${targetUserId}`);
        this._gameNetwork.sendMessage(CommandType.KICK_PLAYER, request);
    }

    /**
     * 处理断线重连倒计时更新
     */
    handleReconnectCountdown(data: any): void {
        if (!data || this._isSceneUnloading) {
            return;
        }

        const disconnectType = data.type;
        const remainingSeconds = data.remainingSeconds;
        const userId = data.userId;

        //LogService.info('gamingPvp', `handleReconnectCountdown: 收到 cmd=214, type=${disconnectType}, userId=${userId}, remainingSeconds=${remainingSeconds}`);

        if (disconnectType === 'reconnect') {
            const now = Date.now();
            if (now - this._lastReconnectTime < 3000) {
                //LogService.warn('gamingPvp', 'handleReconnectCountdown: 短时间内收到重复的重连消息，忽略');
                return;
            }
            this._lastReconnectTime = now;
        }

        if (disconnectType === 'countdown') {
            if (this.disconnectMask) {
                this.disconnectMask.active = true;
                this._updateDisconnectMaskTime(remainingSeconds.toString());
            }
            
            this._startDisconnectLocalTimeout();
        } else if (disconnectType === 'reconnect') {
            this._cancelDisconnectLocalTimeout();
            this.hideDisconnectMask();
            LogService.info('gamingPvp', '玩家重连成功，恢复游戏');

            // ✅ [新增] 重连成功后恢复操作倒计时
            // 如果存在暂停时保存的剩余时间，则使用该时间继续倒计时
            if (this._pausedActionTimeRemaining > 0) {
                LogService.info('gamingPvp', `[重连恢复] 使用暂停时的剩余时间继续倒计时: ${this._pausedActionTimeRemaining}秒`);
                this.startActionTimer(this._pausedActionTimeRemaining);
                this._pausedActionTimeRemaining = 0; // 重置，避免下次重复使用
            }
        } else if (disconnectType === 'timeout') {
            this._cancelDisconnectLocalTimeout();
            this.hideDisconnectMask();
            // ✅ [修复] 使用正确的玩家数量更新 _maskNode 显示状态
            const playerCount = this._playerManager?.getPlayersNum() || 0;
            this._updateMaskVisibility(playerCount);
            LogService.info('gamingPvp', '断线超时，玩家已被移除，游戏继续');

            this._resumeBusinessAfterDisconnectTimeout(data);
        }
    }

    /**
     * 断线超时后恢复被暂停的业务
     * 服务端在 handleReconnectTimeout 中会：
     * 1. 移除断线玩家并广播 cmd=231 (round player list update)
     * 2. 恢复游戏并广播 cmd=215 (player turn)
     * 客户端不应在此处主动处理玩家移除，应等待 cmd=231 消息由 handleRoundPlayerListUpdate 统一处理
     * 这样能确保玩家列表、房主状态、seatIndex 等信息与服务端完全同步
     */
    private _resumeBusinessAfterDisconnectTimeout(data: any): void {
        const offlineUserId = data.userId;
        LogService.info('gamingPvp', `[断线超时恢复] 开始恢复被暂停的业务, offlineUserId=${offlineUserId}`);

        // ✅ [关键修复] 不再本地处理玩家移除，改为等待服务端的 cmd=231 消息
        // 原因：本地处理无法正确更新房主状态、seatIndex 等信息，导致与服务端不一致
        // handleRoundPlayerListUpdate 会统一处理这些更新
        LogService.info('gamingPvp', '[断线超时恢复] 等待服务端发送 cmd=231 更新玩家列表和房主状态');

        // 仅做必要的本地清理
        if (this._actionPresenter) {
            this._actionPresenter.hideAllActionButtons();
        }

        LogService.info('gamingPvp', '[断线超时恢复] 业务恢复完成，等待服务端后续消息(cmd=231, cmd=215, cmd=204)');
    }

    /**
     * 根据房间人数更新遮罩层显示状态
     * @param totalPlayers 当前房间玩家数量
     */
    private _updateMaskVisibility(totalPlayers: number): void {
        if (!this._maskNode) {
            return;
        }
        
        // ✅ [关键修复] 结算确认期间不显示遮罩，防止玩家确认后遮罩闪烁
        if (this._isInSettlementConfirmation) {
            LogService.info('gamingPvp', `_updateMaskVisibility: 结算确认期间，跳过显示遮罩，totalPlayers=${totalPlayers}`);
            return;
        }

        // 如果只有1个玩家，显示遮罩层；否则隐藏遮罩层
        const shouldShowMask = totalPlayers <= 1;

        if (shouldShowMask) {
            this._maskNode.active = true;
            LogService.info('gamingPvp', `_updateMaskVisibility: 显示遮罩，totalPlayers=${totalPlayers}`);
        } else {
            this._maskNode.active = false;
            LogService.info('gamingPvp', `_updateMaskVisibility: 隐藏遮罩，totalPlayers=${totalPlayers}`);
        }
    }

    /**
     * ✅ [新增] 退出房间方法
     * 当最后一局结算确认后，自动退出房间
     * 跳转到record场景并传递用户信息
     * 
     * ⚠️ 注意：不再断开WebSocket连接，保持钱包和长连接
     * 只发送退出房间请求，让服务端清理房间状态
     */
    private _exitRoom(): void {

        // ✅ [关键修复] 设置游戏结束标志，确保 handlePlayerExit 收到退出通知时跳过房主变更 UI 更新
        // 因为最后一局已结束，不需要重新选举房主
        this._isGameEnded = true;
        LogService.info('gamingPvp', `_exitRoom: 设置游戏结束标志 _isGameEnded=true, currentRound=${this._currentRound}, maxRounds=${this._maxRounds}`);

        // ✅ [修复] 不再断开WebSocket连接，只发送退出房间请求
        // 保持钱包连接和WebSocket连接不断开
        if (this._gameNetwork && this._roomId > 0) {
            this._gameNetwork.exitRoom(this._roomId);
            LogService.info('gamingPvp', `_exitRoom: 发送退出房间请求 roomId=${this._roomId}`);
        }

        // 清理游戏状态
        this._cleanupGameState();

        // ✅ [新增] 获取用户信息
        const walletAddress = this._gameNetwork?.getWalletAddress() || '';
        const userId = this._gameNetwork?.getUserId()?.toString() || '';
        LogService.info('gamingPvp', `_exitRoom: 用户信息 - walletAddress: ${walletAddress}, userId: ${userId}`);

        // ✅ [修复] 不再使用错误的 director.getScene().set() 方法
        // 保存到全局对象，让 record 场景可以读取
        (window as any).recordParams = {
            walletAddress: walletAddress,
            userId: userId,
            roomId: this._roomId,
            roomCode: this._room_code
        };
        //LogService.info('gamingPvp', '_exitRoom: 跳转到record场景');
        this._isSceneUnloading = true;
        this._transitionToScene('record');
    }

    /**
     * 清理游戏状态
     */
    private _cleanupGameState() {
        // ✅ [统一] 使用 manualStopCountdown 清理所有倒计时
        this.manualStopCountdown();

        // 清理玩家卡片
        this._playerCards = [];

        // 清理游戏管理器状态
        if (this._gameManager) {
            this._gameManager.reset();
        }

        // 清理玩家管理器状态
        if (this._playerManager) {
            this._playerManager.clear();
        }

        // 清理卡片管理器状态
        if (this._cardManager) {
            this._cardManager.reset();
        }

        // ✅ [修复] 重置 GAME_STATE_SYNC 接收标志
        // 防止离开房间后再次加入新房间时，_gameStateSyncReceived 仍为 true 导致误判为重连场景
        this._gameStateSyncReceived = false;

        // 重置开始按钮防重复点击标志
        this._isStartingGame = false;

       // LogService.info('gamingPvp', '游戏状态已清理');
    }

    /**
     * 开始操作倒计时（统一使用UIManager管理）
     * @param duration 倒计时时长（默认30秒）
     */
    startActionTimer(duration: number = 30) {

        // ✅ [统一] 使用 UIManager 的倒计时，同时处理UI显示和超时逻辑
        this._uiManager.startActionTimer(
            this.node,
            this.playersContainer,
            this._playerManager.getPlayerSeat(),  // 当前玩家座位索引
            () => {
                if (!this._gameFlowPvpController || !this._actionPresenter || this._isSceneUnloading) {
                    LogService.warn('gamingPvp', '操作超时回调跳过：游戏状态已失效');
                    return;
                }
                LogService.warn('gamingPvp', '操作超时，自动弃牌');
                this.fold();
            },
            duration  // 倒计时时长
        );
    }

    /**
     * 手动停止所有倒计时（统一管理）
     * 结算时必须调用此方法，确保所有倒计时都被清理
     */
    manualStopCountdown() {

        // ✅ [统一] 只需要调用 UIManager 的 stopActionTimer
        // UIManager 会同时清理计时器和UI显示
        if (this._uiManager) {
            this._uiManager.stopActionTimer(this.node);
        }

        this._gameFlowPvpController?.stopCountdown();

        // 隐藏倒计时显示
        const currentTurnPlayer = this._getCurrentTurnPlayerIndex();
        if (currentTurnPlayer !== -1) {
            this._playerManager.hidePlayerCountdown(this.playersContainer, currentTurnPlayer);
        }
    }

    // 每个玩家发牌的坐标位置
    getPlayersPosition() {
        const playersNum = this._playerManager.getPlayersNum();

        // 使用动态计算的位置
        return this.calculateSeatPositions(playersNum, true);
    }

    /**
     * 使用服务端配置开始游戏
     */
    async startGameWithServerConfig(data: any) {
        // ✅ [优化] 使用 GameInitService 进行异步资源加载
        if (this._gameInitService) {
            if (!this._gameInitService.isInitialized()) {
                //LogService.info('gamingPvp', '开始异步加载游戏资源...');
                await this._gameInitService.init({
                    smallBlind: data.smallBlind || 10,
                    bigBlind: data.bigBlind || 20,
                    maxPlayers: data.maxPlayers || 9,
                    buyIn: data.buyIn || 1000,
                    timeLimit: data.timeLimit || 30,
                    roomType: data.roomType || 'NORMAL'
                });
            }
        }

        // ✅ [修复] 检查场景是否正在卸载，避免在已销毁的实例上继续执行
        if (this._isSceneUnloading) {
           // LogService.warn('gamingPvp', 'startGameWithServerConfig: 场景正在卸载，取消执行');
            return;
        }

        // ✅ [修复] 玩家断网重连加入房间后，隐藏断线重连遮罩
        // 重连玩家走 startGameWithServerConfig 路径，不会收到 cmd=214 type='reconnect'，需要在此主动隐藏遮罩
        if (this.disconnectMask && this.disconnectMask.active) {
            this.hideDisconnectMask();
            LogService.info('gamingPvp', 'startGameWithServerConfig: 玩家重连加入房间，隐藏断线重连遮罩');
        }

        // 保存房间ID
        this._roomId = data.roomId || 0;

        // 保存房间显示码
        const roomCode = data.roomCode || data.room_code || '';
        if (this._gameNetwork) {
            this._gameNetwork.setRoomCode(roomCode);
            this._gameNetwork.setRoomId(this._roomId);
        } else {
           // LogService.warn('gamingPvp', 'startGameWithServerConfig: _gameNetwork is null, cannot set roomCode/roomId');
        }

        // 保存房主ID
        this._hostUserId = data.hostUserId || null;

        // 重置当前玩家准备状态
        this._isCurrentPlayerReady = false;

        this.updateRoomIdDisplay(roomCode);

        // 更新按钮显示状态
        this.updateButtonVisibility();

        // ✅ [关键修复] 处理服务端响应中的玩家列表，确保重新加入房间时能立即更新玩家界面
        if (data.players && data.players.length > 0) {
            LogService.info('gamingPvp', `startGameWithServerConfig: 处理服务端响应中的玩家列表，共 ${data.players.length} 个玩家`);
            const currentUserId = this._gameNetwork?.getUserId();
            const maxPlayers = data.maxPlayers || 5;
            const totalPlayers = data.totalPlayers || data.players.length;
            
            // 延迟一帧执行，确保 _playerManager 已初始化
            this.scheduleOnce(() => {
                if (this._playerManager && !this._isSceneUnloading) {
                    // ✅ [重要修复] 如果已经收到过 GAME_STATE_SYNC，说明服务端已经发送了最新的玩家列表，
                    // 此时不应该用旧数据覆盖，否则会导致玩家数量显示错误
                    if (this._gameStateSyncReceived) {
                        LogService.info('gamingPvp', `startGameWithServerConfig: 已收到 GAME_STATE_SYNC，跳过玩家列表更新（避免用旧数据覆盖）`);
                    } else {
                        this.updateRoomPlayers(data.players, currentUserId, maxPlayers, false);
                        
                        if (data.allReadyStates) {
                            this._playerManager.setAllReadyStates(data.allReadyStates);
                            this.updateReadyIndicator();
                        }
                        
                        this._updateMaskVisibility(totalPlayers);
                        this.updateButtonVisibility();
                        
                        LogService.info('gamingPvp', 'startGameWithServerConfig: 玩家列表已更新');
                    }
                }
            }, 0);
        }

        // 检查是否已经有房间ID输入，如果有说明是加入房间，显示提示
        if (this._joinRoomId) {
        } else {
            // 创建房间成功后，房间号会显示在界面上，第二个玩家可以使用该房间号加入
        }

        // 更新SettingsManager的配置
        if (this._settingsManager) {
            if (data.ante !== undefined && data.ante > 0) {
                this._settingsManager.setAnte(data.ante);
            } else if (data.smallBlind !== undefined && data.bigBlind !== undefined) {
                this._settingsManager.setBlinds(data.smallBlind, data.bigBlind);
            }
            if (data.playerCount !== undefined) this._settingsManager.setPlayerCount(data.playerCount);
            if (data.initialChips !== undefined) this._settingsManager.setInitialChips(data.initialChips);
            if (data.gameType !== undefined) this._settingsManager.setGameType(data.gameType);
            if (data.actionTimeout !== undefined) this._settingsManager.setActionTimeout(data.actionTimeout);
            if (data.soundEnabled !== undefined) this._settingsManager.setSoundEnabled(data.soundEnabled);
            if (data.maxRounds !== undefined) this._maxRounds = data.maxRounds;
        } else {
            LogService.warn('gamingPvp', 'startGameWithServerConfig: _settingsManager is null, cannot update settings');
        }

        // ✅ [修复] 重连场景下，若游戏正在进行中，跳过 UI 重置，避免覆盖 handleGameStateSync 已显示的操作按钮
        // 原因：重连时客户端会先处理消息队列中的 GAME_STATE_SYNC（显示操作按钮），
        // 随后 setOnJoinRoom 回调触发本函数，若继续执行会把操作按钮隐藏并改为显示准备按钮，
        // 导致玩家看不到操作按钮，30秒后服务端 AutoPlay 自动 FOLD。
        const isGameInProgressOnReconnect = this._gameStateSyncReceived
            && this._gameFlowPvpController
            && this._gameFlowPvpController.isInGamePhase();

        if (isGameInProgressOnReconnect) {
            LogService.info('gamingPvp', 'startGameWithServerConfig: 游戏进行中（重连），跳过准备阶段 UI 重置，保留 handleGameStateSync 已显示的操作按钮');
            
            // ✅ [修复] 重连进入游戏时，隐藏断线重连遮罩和 _maskNode
            if (this.disconnectMask && this.disconnectMask.active) {
                this.hideDisconnectMask();
            }
            
            // ✅ [方案2] 重连后自动请求 ROOM_INFO，作为兜底确保能拿到操作按钮组
            // 场景：服务端推送 GAME_STATE_SYNC/PLAYER_TURN_NOTIFY 可能因 session 未同步而丢失
            this._requestRoomInfoForReconnect();
            return;
        }

        // 确保操作按钮被隐藏
        if (this.playersActionNode) {
            this.playersActionNode.active = false;
        } else {
            LogService.warn('gamingPvp', 'startGameWithServerConfig: playersActionNode is null');
        }

        // 先重置游戏管理器
        if (this._gameManager) {
            this._gameManager.reset();
        } else {
            LogService.warn('gamingPvp', 'startGameWithServerConfig: _gameManager is null');
        }

        // 如果有玩家数据，使用服务端的数据来设置玩家
        if (data.players && data.players.length > 0) {
            this.initializePlayersFromServer(data.players);
        } else {
            // 如果没有玩家数据，使用本地默认
            if (this._gameManager) {
                this._gameManager.resetPlayersChips();
            } else {
                LogService.warn('gamingPvp', 'startGameWithServerConfig: _gameManager is null, cannot reset players chips');
            }
        }

        // 更新活跃玩家列表
        if (this._playerManager && this._gameManager) {
            this._playerManager.updateActivePlayers(this._gameManager);
        } else {
            LogService.warn('gamingPvp', 'startGameWithServerConfig: _playerManager or _gameManager is null, cannot update active players');
        }

        // ✅ [新增] 根据房间人数更新遮罩层显示状态
        // ⚠️ [修复] 确保玩家数量计算正确，包括当前玩家自己
        let playerCount = data.players?.length || 0;

        // 检查服务端返回的玩家列表是否包含当前玩家
        let currentUserId = null;
        if (this._gameNetwork) {
            currentUserId = this._gameNetwork.getUserId();
        } else {
            LogService.warn('gamingPvp', 'startGameWithServerConfig: _gameNetwork is null, cannot get current user ID');
        }
        const hasCurrentPlayer = data.players?.some(player => player.userId === currentUserId || player.user_id === currentUserId);

        // 如果玩家列表不包含当前玩家，说明服务端返回的是其他玩家列表，需要加1
        if (!hasCurrentPlayer) {
            playerCount++;
        }

        // 至少有1个玩家（当前玩家自己）
        if (playerCount <= 0) {
            playerCount = 1;
        }

        this._updateMaskVisibility(playerCount);

        // ⚠️ [新增] 延迟检查，确保后加入的玩家能正确获取房间人数
        // 因为服务端可能在玩家加入后才广播房间人数
        this.safeSetTimeout(() => {
            // ✅ [修复] 检查 _playerManager 是否为 null（防止退出房间后报错）
            if (!this._playerManager) {
                return;
            }
            const updatedPlayerCount = this._playerManager.getPlayersNum();
            this._updateMaskVisibility(updatedPlayerCount);
        }, 500);

        // 在网络模式下，不直接调用 smallOrBig()，而是等待服务端的 DEAL_CARDS_NOTIFY
        // 只有本地模式才直接调用
        if (!this._roomId || this._roomId.toString().startsWith('LOCAL_')) {
            // 本地模式：直接创建玩家头像并开始游戏
            this.createPlayerAvatars();
            this.smallOrBig();
        } else {
            // 网络模式：等待服务端的 GAME_STATE_SYNC 和 DEAL_CARDS_NOTIFY 消息
            // 玩家头像将在 handleGameStateSync 中创建（确保使用正确的seatIndex）
            this._waitingForDealNotify = true;

            // 创建玩家头像
            this.createPlayerAvatars();

            // 显示准备按钮（玩家需要手动点击才能准备）
            this._isGameEnded = false;
            this.resetReadyStatus();
            this.showReadyButton();

            LogService.info('gamingPvp', '玩家进入房间，等待所有玩家准备...');
        }
    }



    /**
     * 从服务端数据初始化玩家
     */
    initializePlayersFromServer(playersData: any[]) {

        if (!playersData || playersData.length === 0) {
            LogService.warn('gamingPvp', '[initializePlayersFromServer] 没有玩家数据');
            return;
        }

        // ✅ [新增] 过滤可疑的玩家数据
        // 获取当前玩家ID
        const currentUserId = this._gameNetwork?.getUserId();

        // 过滤掉无效的玩家数据（userId为空、座位索引无效）
        const validPlayers = playersData.filter((player, idx) => {
            if (!player || (player.userId === undefined && player.user_id === undefined)) {
                LogService.warn('gamingPvp', `[过滤] 玩家${idx} userId无效，已过滤`);
                return false;
            }
            if (player.seatIndex === undefined || player.seatIndex < 0) {
                LogService.warn('gamingPvp', `[过滤] 玩家${idx} 座位索引无效，已过滤`);
                return false;
            }
            return true;
        });

        // ✅ [新增] 检测并处理座位索引重复的问题
        // 如果有重复的座位索引，说明服务端返回了过期数据
        const seatIndexMap = new Map<number, any>();
        const duplicateSeatIndices: number[] = [];
        for (const player of validPlayers) {
            const seatIndex = player.seatIndex;
            if (seatIndexMap.has(seatIndex)) {
                // 发现重复座位索引
                if (duplicateSeatIndices.indexOf(seatIndex) === -1) {
                    duplicateSeatIndices.push(seatIndex);
                }
                LogService.warn('gamingPvp', `⚠️ 发现重复座位索引: ${seatIndex}, userId: ${player.userId || player.user_id}`);
            } else {
                seatIndexMap.set(seatIndex, player);
            }
        }

        if (duplicateSeatIndices.length > 0) {
            LogService.warn('gamingPvp', `⚠️ 服务端返回了过期数据！发现重复座位索引: ${JSON.stringify(duplicateSeatIndices)}`);
            LogService.warn('gamingPvp', `⚠️ 原始玩家数: ${validPlayers.length}`);

            // 保留每个座位索引的第一个玩家（优先保留当前玩家）
            const dedupedPlayers: any[] = [];
            for (let i = 0; i < validPlayers.length; i++) {
                const player = validPlayers[i];
                const seatIndex = player.seatIndex;
                const userId = player.userId || player.user_id;

                // 如果这个座位已经被处理过，跳过
                if (seatIndexMap.get(seatIndex) !== player) {
                    continue;
                }

                // 如果是重复座位，且不是当前玩家，跳过
                if (duplicateSeatIndices.indexOf(seatIndex) !== -1 && userId !== currentUserId) {
                    LogService.warn('gamingPvp', `⚠️ 过滤掉重复座位玩家: seatIndex=${seatIndex}, userId=${userId}`);
                    continue;
                }

                dedupedPlayers.push(player);
            }

            LogService.warn('gamingPvp', `⚠️ 去重后玩家数: ${dedupedPlayers.length}`);
            playersData = dedupedPlayers;
        }

        // ✅ [新增] 如果过滤后没有玩家数据，发出警告
        if (playersData.length === 0) {
            LogService.warn('gamingPvp', '没有有效的玩家数据');
            return;
        }

        // 打印每个玩家的详细信息
        playersData.forEach((playerData, idx) => {
        });

        // ✅ [修复] 检查 _settingsManager 是否为 null
        if (!this._settingsManager) {
            LogService.warn('gamingPvp', 'initPlayersFromServer: _settingsManager is null');
            return;
        }

        // ✅ [关键修复] 先清空旧的座位-用户映射，确保旧数据不残留
        this._playerManager.clearSeatToUserId();

        // ✅ [关键修复] 使用实际玩家数作为 playerCount，而不是 maxSeatIndex+1
        // 之前使用 maxSeatIndex+1 会导致座位不连续时出现空座位（如 seat0, seat2 会生成 playerCount=3）
        // 这样会导致 _playersNum 大于实际玩家数，多余的座位被标记为 SKIP
        const playerCount = playersData.length;
        this._settingsManager.setPlayerCount(playerCount);

        // 2. 重置游戏管理器（不随机分配玩家座位）
        this._gameManager.reset(false);

        // 服务端已确保座位索引连续，直接使用服务端返回的座位索引
        const processedPlayersData = playersData.map((playerData, idx) => {
            if (!playerData) return playerData;
            return { ...playerData };
        });

        this._gameManager.initializePlayersChipsFromServer(processedPlayersData);

        processedPlayersData.forEach((playerData, idx) => {
            if (!playerData) return;

            const seatIndex = playerData.seatIndex !== undefined ? playerData.seatIndex : idx;

            // ✅ [修复] 设置座位到用户ID的映射（必须在标记AI和真实玩家之前）
            const userId = playerData.userId;
            if (userId !== undefined) {
                this._playerManager.setSeatToUserId(seatIndex, userId);
            }

            // 判断是否为AI（支持两种字段名）
            const isAIPlayer = playerData.isAI !== undefined ? playerData.isAI : !!playerData.is_ai;

            // 标记AI
            if (isAIPlayer) {
                this._playerManager.markAI(seatIndex);
            }

            // ✅ [修复] 设置房主标识（优先使用 isHost 字段，后备使用 _hostUserId）
            let isHost = playerData.isHost !== undefined ? playerData.isHost : false;
            if (!isHost && this._hostUserId !== undefined && userId !== undefined) {
                isHost = userId.toString() === this._hostUserId.toString();
            }
            this._playerManager.setSeatToIsHost(seatIndex, isHost);

            // ✅ [新增] 设置玩家在线状态（用于 updateActivePlayers 判断）
            const isOnline = playerData.isOnline !== undefined ? playerData.isOnline : true;
            this._playerManager.setSeatToIsOnline(seatIndex, isOnline);

            // 标记真实玩家 - 使用isSelf字段来判断，而不是!isAI
            const isSelf = playerData.isSelf !== undefined ? playerData.isSelf : false;
            if (isSelf) {
                this._playerManager.setPlayerSeat(seatIndex);
                // 记录真实玩家索引，用于后续设置头像
                this._realPlayerIndex = seatIndex;
            }
        });

        // ✅ [新增] 打印初始化完成日志
        const pmPlayersNum = this._playerManager.getPlayersNum();
    }

    // 动态创建玩家头像节点
    createPlayerAvatars(positionMap?: Map<number, string>) {

        // ✅ [修复] 检查 _playerManager 是否为 null
        if (!this._playerManager) {
            LogService.warn('gamingPvp', 'createPlayerAvatars: _playerManager is null');
            return;
        }


        // 检查avatarPrefab是否设置
        if (!this.avatarPrefab) {
            LogService.warn('gamingPvp', 'avatarPrefab未设置，无法动态创建玩家头像节点');
            return;
        }

        // ✅ [修复] 在创建新头像之前，先清空所有旧头像
        this.clearPlayerAvatars();

        // 获取活跃玩家数量
        const activePlayersCount = this._playerManager.getActivePlayersCount();
        const totalPlayersNum = this._playerManager.getPlayersNum();

        // 清理playersContainer中的所有子节点，只保留我们动态创建的avatar容器
        const childrenToRemove = [];
        for (const child of this.playersContainer.children) {
            if (child.name !== 'avatar') {
                childrenToRemove.push(child);
            }
        }
        for (const child of childrenToRemove) {
            child.removeFromParent();
        }

        // 确保playersContainer的Layer设置正确
        this.playersContainer.layer = Layers.Enum.UI_2D;
        // 确保playersContainer的位置在中心，这样玩家头像才能显示在屏幕内
        this.playersContainer.setPosition(0, 0, 0);

        // 获取或创建avatar容器
        let avatarContainer = this.playersContainer.getChildByName('avatar');
        if (!avatarContainer) {
            avatarContainer = new Node('avatar');
            // 设置avatar容器的大小，确保能容纳所有玩家
            const uiTransform = avatarContainer.addComponent(UITransform);
            uiTransform.setContentSize(720, 1280);
            this.playersContainer.addChild(avatarContainer);
        }
        // ✅ [修复] clearPlayerAvatars 已在方法开头调用，不需要重复清理

        // 先确保avatar容器的Layer设置正确
        avatarContainer.layer = Layers.Enum.UI_2D;

        const isInSettlementPhase = this._playerManager.isInSettlement();
        const isScoreMode = this._scoreType === 0;

        // ✅ [新增] 详细日志：打印创建头像前的状态

        let createdCount = 0;
        for (let seatIndex = 0; seatIndex < this._playerManager.getPlayersNum(); seatIndex++) {
            const isActive = this._playerManager.isPlayerActive(seatIndex);
            // ✅ [关键修复] 所有模式下都只显示活跃玩家
            // updateActivePlayers 已确保：
            // - 计分模式：只有有实际玩家（_seatToUserId中存在）的座位才是活跃的
            // - 非计分模式：有实际玩家且筹码>0的座位才是活跃的
            if (!isActive) {
                continue;
            }

            const pos = this.calculateSeatPositionsForPlayer(seatIndex, activePlayersCount);
            // 使用对象池获取头像节点
            let avatarNode: Node;
            if (this._avatarPool) {
                avatarNode = this._avatarPool.acquire();
            } else {
                // 回退到直接实例化
                avatarNode = instantiate(this.avatarPrefab);
            }

            // 保存头像节点引用
            this._playerAvatars.set(seatIndex, avatarNode);
            // 使用seatIndex命名（1-9）
            avatarNode.name = `avatar_${seatIndex + 1}`;
            createdCount++;

            // 初始化时隐藏clock节点，默认不显示倒计时
            const clockNode = avatarNode.getChildByName('clock');
            if (clockNode) {
                clockNode.active = false;
            } else {
                LogService.warn('gamingPvp', `[DEBUG] avatar节点${avatarNode.name}没有找到clock子节点`);
            }

            // 设置房主标识显示/隐藏（使用服务端广播的 isHost 状态）
            const homeownerNode = avatarNode.getChildByName('homeowner');
            if (homeownerNode) {
                const isHost = this._playerManager.getIsHostBySeatIndex(seatIndex);
                homeownerNode.active = isHost;
                //LogService.info('gamingPvp', `[createPlayerAvatars] 设置房主标识: seatIndex=${seatIndex}, isHost=${isHost}, homeownerNode.active=${homeownerNode.active}`);
            } else {
                LogService.warn('gamingPvp', `[createPlayerAvatars] 找不到homeowner节点: seatIndex=${seatIndex}`);
            }

            // 设置准备标识显示/隐藏（游戏进行中或已发牌时强制隐藏）
            const okNode = avatarNode.getChildByName('ok');
            if (okNode) {
                // 游戏开始后（_isGameEnded被设为false且收到过发牌消息），强制隐藏ok
                // _readyStates 已在 clearSeatToUserId 中清除，所以 getIsReadyBySeatIndex 会返回 false
                const isReady = this._playerManager.getIsReadyBySeatIndex(seatIndex);
                okNode.active = isReady;
            }

            // 检查是否为真实玩家
            const isPlayer = (seatIndex === this._playerManager.getPlayerSeat());

            // 打印所有子节点以调试
            avatarNode.children.forEach((child, idx) => {
            });

            // 设置Layer为UI_2D，确保能正确显示
            avatarNode.layer = Layers.Enum.UI_2D;
            // 不旋转头像，保持原始方向，避免倒立
            avatarContainer.addChild(avatarNode);
            // 设置位置，Z轴为1确保头像显示在卡牌上方
            avatarNode.setPosition(pos.x, pos.y, 1);
            // ✅ [修改] 预制体加载时采用0.7尺寸
            avatarNode.setScale(0.7, 0.7, 1);

            // 如果是真实玩家，设置特定的头像图片
            if (isPlayer) {
                this.setRealPlayerAvatar(avatarNode);

                // 为真实玩家头像添加点击事件监听
                let buttonComponent = avatarNode.getComponent(Button);

                let buttonNode: Node = avatarNode;
                // 如果当前节点没有Button组件，尝试查找子节点
                if (!buttonComponent) {
                    const avatarPlayerChild = avatarNode.getChildByName('avatar_player');
                    if (avatarPlayerChild) {
                        buttonComponent = avatarPlayerChild.getComponent(Button);
                        buttonNode = avatarPlayerChild; // 使用包含Button组件的节点
                    }
                }

                if (buttonComponent) {
                    // 使用Node.on绑定（更可靠，不依赖编辑器配置）
                    buttonNode.off(Button.EventType.CLICK, this.onAvatarClicked, this);
                    buttonNode.on(Button.EventType.CLICK, this.onAvatarClicked, this);
                } else {
                    LogService.warn('gamingPvp', `[DEBUG] 真实玩家 seatIndex=${seatIndex} 头像没有Button组件，无法绑定点击事件`);
                }

                // 绑定准备按钮和取消准备按钮（现在在avatar_player预制体中）
                this.bindReadyButtonsInAvatar(avatarNode);
            } else {
                // ✅ [新增] 对于对手玩家，强制隐藏准备按钮和取消准备按钮
                // 这些按钮只属于真实玩家，对手玩家不应该看到或操作
                this.hideReadyButtonsForOpponent(avatarNode);
            }

            // 确保所有子节点的Layer也正确
            for (const child of avatarNode.children) {
                child.layer = Layers.Enum.UI_2D;
            }

            // 更新number组件的文本（玩家编号1-9 + 位置信息）
            const numberNode = avatarNode.getChildByName('number');
            if (numberNode) {
                const label = numberNode.getComponent(Label);
                if (label) {
                    if (positionMap) {
                        const positionName = positionMap.get(seatIndex);
                        if (positionName) {
                            label.string = `${seatIndex + 1}:${positionName}`;
                        } else {
                            label.string = `${seatIndex + 1}`;
                        }
                    } else {
                        label.string = `${seatIndex + 1}`;
                    }
                }
            }

            // 更新amount组件的文本，显示玩家当前筹码余额
            const amountNode = avatarNode.getChildByName('amount');
            if (amountNode) {
                const label = amountNode.getComponent(Label);
                if (label) {
                    const playerChips = this._gameManager ? this._gameManager.getPlayerChips(seatIndex) : 0;
                    label.string = playerChips.toString();
                }
            }

            // 更新nick_name组件的文本，显示玩家昵称
            let nickNameNode = avatarNode.getChildByName('nick_name');

            // 备用方法：遍历所有子节点查找
            if (!nickNameNode) {
                for (const child of avatarNode.children) {
                    if (child.name === 'nick_name') {
                        nickNameNode = child;
                        break;
                    }
                }
            }

            if (nickNameNode) {
                const label = nickNameNode.getComponent(Label);
                if (label) {
                    const playerNickname = this._gameManager ? this._gameManager.getPlayerNickname(seatIndex) : '';
                    label.string = playerNickname;
                }
            }

            // 更新seat_index组件的文本，显示玩家座位索引
            const seatIndexNode = avatarNode.getChildByName('seat_index');
            if (seatIndexNode) {
                const label = seatIndexNode.getComponent(Label);
                if (label) {
                    label.string = seatIndex.toString();
                }
            }
        }

        // ✅ [新增] 头像创建完成总结日志
    }

    /**
     * 检查头像是否已创建
     * @returns true表示头像已创建，false表示未创建
     */
    areAvatarsCreated(): boolean {
        const avatarContainer = this.playersContainer.getChildByName('avatar');
        if (!avatarContainer) {
            return false;
        }

        const activePlayerCount = this._playerManager.getActivePlayersCount();
        const avatarCount = avatarContainer.children.length;


        // 如果没有创建任何头像，返回false
        if (avatarCount === 0) {
            return false;
        }

        // 检查是否所有活跃玩家都有头像
        if (avatarCount < activePlayerCount) {
            return false;
        }

        return true;
    }

    // 为单个玩家计算座位位置
    calculateSeatPositionsForPlayer(playerIndex: number, totalActivePlayers: number): { x: number, y: number } {
        // 椭圆参数
        const ellipseWidth = 600;
        const ellipseHeight = 1000;
        const margin = 50;

        // 真实玩家在视觉上的位置（总是被视为"下方"位置）
        const realPlayerSeat = this._playerManager.getPlayerSeat();

        // 计算这个玩家的视觉索引（相对于真实玩家的位置）
        let visualIndex: number;
        if (playerIndex === realPlayerSeat) {
            visualIndex = 0; // 真实玩家在视觉索引0
        } else {
            // 计算从真实玩家到当前位置在活跃玩家中的顺时针距离
            let distanceFromReal = 0;
            let currentSeat = realPlayerSeat;
            const playersNum = this._playerManager.getPlayersNum();
            while (true) {
                currentSeat = (currentSeat + 1) % playersNum;
                // 只计算活跃玩家
                if (this._playerManager.isPlayerActive(currentSeat)) {
                    distanceFromReal++;
                }
                if (currentSeat === playerIndex) {
                    break;
                }
            }
            visualIndex = distanceFromReal;
        }

        // 计算角度（弧度）
        const angleOffset = -Math.PI / 2;
        const angleInterval = (Math.PI * 2) / totalActivePlayers;
        const angle = angleOffset - (angleInterval * visualIndex);

        // 椭圆方程：x = a * cos(θ), y = b * sin(θ)
        const a = (ellipseWidth - margin * 2) / 2;
        const b = (ellipseHeight - margin * 2) / 2;

        const x = a * Math.cos(angle);
        const y = b * Math.sin(angle);

        return { x, y };
    }

    // 更新指定玩家头像的nick_name显示
    updateAvatarNickname(playerIndex: number, nickname: string) {
        const avatarContainer = this.playersContainer.getChildByName('avatar');
        if (!avatarContainer) {
            return;
        }

        const avatarNodeName = `avatar_${playerIndex + 1}`;
        const avatarNode = avatarContainer.getChildByName(avatarNodeName);
        if (avatarNode && avatarNode.isValid) {
            const nickNameNode = avatarNode.getChildByName('nick_name');
            if (nickNameNode && nickNameNode.isValid) {
                const label = nickNameNode.getComponent(Label);
                if (label && label.isValid) {
                    label.string = nickname;
                }
            }
        }
    }

    // 开始发牌
    deal() {
        const playerPos = this.getPlayersPosition();
        // 真实玩家的实际座位是随机的（在PlayerManager中设置）
        // 发牌顺序按座位顺序进行
        this._gameManager.setRoundGame(this._gameManager.getRoundGame() + 1);

        const playersNum = this._playerManager.getPlayersNum();
        const activePlayersCount = this._playerManager.getActivePlayersCount();
        const smallBlindSeat = this._gameManager.getSmallBlindSeat();

        if (activePlayersCount <= 0 || playersNum <= 0) {
            LogService.error('gamingPvp', 'deal: 无效的玩家数量或座位数量');
            return;
        }

        // 生成发牌顺序：从小盲开始，顺时针发给每个活跃玩家两张牌
        const activeSeats: number[] = [];
        let scanSeat = smallBlindSeat;
        while (activeSeats.length < activePlayersCount) {
            if (this._playerManager.isPlayerActive(scanSeat) && activeSeats.indexOf(scanSeat) === -1) {
                activeSeats.push(scanSeat);
            }
            scanSeat = (scanSeat + 1) % playersNum;
        }
        const dealOrder = [...activeSeats, ...activeSeats];
        const total = dealOrder.length;

        // 初始化玩家牌引用数组
        this._playerCards = new Array(playersNum).fill(0).map(() => []);

        const playerSeat = this._playerManager.getPlayerSeat();
        let cardsScheduled = 0;
        let cardsCompleted = 0;

        this.schedule(() => {
            const positionIndex = dealOrder[cardsScheduled];
            const currentScheduleIndex = cardsScheduled;
            cardsScheduled++;

            // 计算当前是第几轮发牌（第一轮还是第二轮）
            const round = Math.floor(currentScheduleIndex / activePlayersCount);
            const isSecond = round === 1;
            const cardIndex = isSecond ? 1 : 0;

            // 使用对象池获取扑克牌节点
            let pokerCardPrefab: Node;
            if (this._pokerPool) {
                pokerCardPrefab = this._pokerPool.acquire();
            } else {
                pokerCardPrefab = instantiate(this.pokerPrefab);
            }
            let pokerComponent = pokerCardPrefab.getComponent(pokerCard);

            // 设置牌节点名称，用于后续清除
            const cardNumber = this._playerCards[positionIndex].length + 1;
            pokerCardPrefab.name = `player_card_${positionIndex}_${cardNumber}`;

            // 保存牌的引用
            this._playerCards[positionIndex].push(pokerCardPrefab);

            // 初始时所有牌都显示背面
            pokerComponent.backPoker();
            this.container.addChild(pokerCardPrefab);
            pokerCardPrefab.setPosition(new Vec3(2, 217, 0));

            const playerVisualPos = playerPos.find(pos => pos.actualSeat === positionIndex);
            if (!playerVisualPos) {
                LogService.error('gamingPvp', `findPlayerPosition failed: seatIndex=${positionIndex}`);
                return;
            }

            const aiCardOffset = 15;
            const posVec = isSecond
                ? new Vec3(playerVisualPos.x + (playerVisualPos.isPlayer ? 30 : aiCardOffset), playerVisualPos.y, 0)
                : new Vec3(playerVisualPos.x - (playerVisualPos.isPlayer ? 30 : aiCardOffset), playerVisualPos.y, 0);

            if (positionIndex === playerSeat) {
                pokerCardPrefab.setScale(0.7, 0.7, 1);
                pokerCardPrefab.setSiblingIndex(1000);
            } else {
                pokerCardPrefab.setScale(0.7, 0.7, 1);
                pokerCardPrefab.setSiblingIndex(0);
            }

            let poker = null;
            if (positionIndex === playerSeat) {
                const serverHoleCards = this._gameManager.getPlayerHoleCardsFromServer(positionIndex);
                if (serverHoleCards && serverHoleCards[cardIndex] !== undefined) {
                    const cardId = serverHoleCards[cardIndex];
                    poker = this._cardManager.getPokerById(cardId);
                    this._cardManager.dealHoleCards(positionIndex, [...(this._cardManager.getPlayerHoleCards(positionIndex)), poker]);
                } else {
                    LogService.warn('gamingPvp', `[DEBUG] ⚠️ 服务端未发送玩家 ${positionIndex} 的手牌数据，显示背面`);
                }
            }

            const finalIsPlayer = positionIndex === playerSeat;
            const finalPoker = poker;

            tween(pokerCardPrefab).to(0.4, { position: posVec }).call(() => {
                if (finalIsPlayer && finalPoker) {
                    pokerComponent.showPoker(finalPoker.suit, finalPoker.point);
                    pokerCardPrefab.setSiblingIndex(1000);
                } else {
                    pokerComponent.backPoker();
                }

                cardsCompleted++;
                if (cardsCompleted === total) {
                    this._sendDealComplete();
                }
            }).start();
        }, 0.3, total - 1, 0);
    }



    // 发翻牌（服务端模式）
    dealFlop(communityCards: number[]) {
        let cardsDealt = 0;
        let totalCards = 3;

        // 统计需要发的牌数量（排除已存在的牌）
        for (let i = 0; i < 3; i++) {
            const existingCard = this.container.getChildByName('board_card_' + i);
            if (existingCard) {
                totalCards--;
            }
        }

        if (totalCards === 0) {
            this.onCommunityCardsDealt();
            return;
        }

        for (let i = 0; i < 3; i++) {
            // 检查当前牌是否已存在
            const existingCard = this.container.getChildByName('board_card_' + i);
            if (existingCard) {
                cardsDealt++; // 已存在的牌也算已处理
                if (cardsDealt === 3) {
                    this.onCommunityCardsDealt();
                }
                continue;
            }

            const poker = this._cardManager.getPokerById(communityCards[i]);
            this._cardManager.dealBoardCard(poker, i);

            // 使用对象池获取扑克牌节点
            let pokerCardPrefab: Node;
            if (this._pokerPool) {
                pokerCardPrefab = this._pokerPool.acquire();
            } else {
                // 回退到直接实例化
                pokerCardPrefab = instantiate(this.pokerPrefab);
            }
            let pokerComponent = pokerCardPrefab.getComponent(pokerCard);
            pokerComponent.backPoker();
            pokerCardPrefab.name = 'board_card_' + i; // 设置节点名称，用于后续清除
            this.container.addChild(pokerCardPrefab);
            pokerCardPrefab.setPosition(new Vec3(2, 217, 0));
            pokerCardPrefab.setSiblingIndex(2000); // 公牌始终在最上层
            const boardPos = this._gameManager.getBoardPositions()[i];

            tween(pokerCardPrefab)
                .delay(i * 0.3)
                .to(0.3, { position: new Vec3(boardPos.x, boardPos.y, 0) })
                .to(0.2, { eulerAngles: new Vec3(0, -90, 0) })
                .call(() => {
                    pokerComponent.showPoker(poker.suit, poker.point);
                    pokerCardPrefab.setSiblingIndex(2000);
                })
                .by(0.2, { eulerAngles: new Vec3(0, 90, 0) })
                .call(() => {
                    cardsDealt++;
                    if (cardsDealt === 3) {
                        this.onCommunityCardsDealt();
                    }
                })
                .start();
        }
    }

    // 发转牌（服务端模式）
    dealTurn(communityCards: number[]) {

        // 检查第4张公牌是否已存在
        const existingCard3 = this.container.getChildByName('board_card_3');
        if (existingCard3) {
            this.onCommunityCardsDealt();
            return;
        }

        const poker = this._cardManager.getPokerById(communityCards[3]);
        this._cardManager.dealBoardCard(poker, 3);

        // 使用对象池获取扑克牌节点
        let pokerCardPrefab: Node;
        if (this._pokerPool) {
            pokerCardPrefab = this._pokerPool.acquire();
        } else {
            pokerCardPrefab = instantiate(this.pokerPrefab);
        }
        let pokerComponent = pokerCardPrefab.getComponent(pokerCard);
        pokerComponent.backPoker();
        pokerCardPrefab.name = 'board_card_3'; // 设置节点名称，用于后续清除
        this.container.addChild(pokerCardPrefab);
        pokerCardPrefab.setPosition(new Vec3(2, 217, 0));
        pokerCardPrefab.setSiblingIndex(2000);
        const boardPos = this._gameManager.getBoardPositions()[3];

        tween(pokerCardPrefab)
            .to(0.3, { position: new Vec3(boardPos.x, boardPos.y, 0) })
            .to(0.2, { eulerAngles: new Vec3(0, -90, 0) })
            .call(() => {
                pokerComponent.showPoker(poker.suit, poker.point);
                pokerCardPrefab.setSiblingIndex(2000);
            })
            .by(0.2, { eulerAngles: new Vec3(0, 90, 0) })
            .call(() => {
                this.onCommunityCardsDealt();
            })
            .start();
    }

    // 发河牌（服务端模式）
    dealRiver(communityCards: number[]) {

        // 检查第5张公牌是否已存在
        const existingCard4 = this.container.getChildByName('board_card_4');
        if (existingCard4) {
            this.onCommunityCardsDealt();
            return;
        }

        const poker = this._cardManager.getPokerById(communityCards[4]);
        this._cardManager.dealBoardCard(poker, 4);

        // 使用对象池获取扑克牌节点
        let pokerCardPrefab: Node;
        if (this._pokerPool) {
            pokerCardPrefab = this._pokerPool.acquire();
        } else {
            pokerCardPrefab = instantiate(this.pokerPrefab);
        }
        let pokerComponent = pokerCardPrefab.getComponent(pokerCard);
        pokerComponent.backPoker();
        pokerCardPrefab.name = 'board_card_4'; // 设置节点名称，用于后续清除
        this.container.addChild(pokerCardPrefab);
        pokerCardPrefab.setPosition(new Vec3(2, 217, 0));
        pokerCardPrefab.setSiblingIndex(2000);
        const boardPos = this._gameManager.getBoardPositions()[4];

        tween(pokerCardPrefab)
            .to(0.3, { position: new Vec3(boardPos.x, boardPos.y, 0) })
            .to(0.2, { eulerAngles: new Vec3(0, -90, 0) })
            .call(() => {
                pokerComponent.showPoker(poker.suit, poker.point);
                pokerCardPrefab.setSiblingIndex(2000);
            })
            .by(0.2, { eulerAngles: new Vec3(0, 90, 0) })
            .call(() => {
                this.onCommunityCardsDealt();
            })
            .start();
    }

    // 公共牌发完后的回调
    onCommunityCardsDealt() {
        // 通知服务端发牌完成
        this._sendDealComplete();
    }

    // 发送发牌完成通知（防重复）
    private _sendDealComplete() {
        // ✅ [关键修复] 重置发牌进行中标志
        this._isDealingInProgress = false;
        
        if (this._dealCompleteSent) {            
            return;
        }
        
        // ✅ [修复] 检查当前玩家是否是活跃玩家（不在round玩家列表中的旁观者不应该发送dealComplete）
        const currentPlayerSeat = this._playerManager?.getPlayerSeat();
        if (currentPlayerSeat !== undefined && currentPlayerSeat !== null) {
            const playerState = this._playerManager.getPlayerState(currentPlayerSeat);
            if (playerState && playerState.isFold) {
                LogService.warn('gamingPvp', `[dealComplete] 当前玩家已弃牌(旁观者)，跳过发送: seatIndex=${currentPlayerSeat}`);
                return;
            }
        }
        
        this._dealCompleteSent = true;       
        this._gameNetwork.sendDealComplete(this._roomId);
    }

    // 重置dealComplete发送状态（在收到新的发牌通知时调用）
    private _resetDealCompleteSent() {
        this._dealCompleteSent = false;
    }


    // 确定大小盲注
    smallOrBig() {
        // 清除所有玩家的操作显示
        this._playerManager.clearAllActionsNearAvatar(this.playersContainer, this._playerManager.getPlayersNum());

        // 清理上一局的牌节点（只清理container中的牌，不清理玩家头像）
        this.container.removeAllChildren();

        // 清理playersContainer中的seat图标（保留avatar容器）
        const avatarContainer = this.playersContainer.getChildByName('avatar');

        // 移除所有不是avatar的子节点
        for (let i = this.playersContainer.children.length - 1; i >= 0; i--) {
            const child = this.playersContainer.children[i];
            if (avatarContainer && child === avatarContainer) {
                continue; // 保留avatar容器
            }
            child.removeFromParent();
        }

        // 清理玩家牌引用
        this._playerCards = [];

        // 重置游戏状态
        this._gameManager.reset();

        // 更新活跃玩家列表（根据筹码，筹码为0的玩家不再参与）
        this._playerManager.updateActivePlayers(this._gameManager);

        // 检查活跃玩家数量
        const activePlayersCount = this._gameManager.getActivePlayerCount();

        // 如果活跃玩家数量少于2人，无法开始游戏
        if (activePlayersCount < 2) {
            this.showGameOver();
            return;
        }

        // 推进按钮位
        const oldButton = this._gameManager.getButtonSeat();
        this._gameManager.advanceButtonSeat();
        const newButton = this._gameManager.getButtonSeat();

        // 计算小盲位和大盲位
        const smallBlindSeat = this._gameManager.getSmallBlindSeat();
        const bigBlindSeat = this._gameManager.getBigBlindSeat();
        const utgSeat = this._gameManager.getUTGSeat();

        // 打印详细的位置信息

        // 重置底池
        this._gameManager.setPot(0);

        // 从设置管理器获取盲注金额
        const smallBlind = this._settingsManager.getSmallBlind();
        const bigBlind = this._settingsManager.getBigBlind();
        this._gameManager.setBlinds(smallBlind, bigBlind);

        // 处理小盲注
        const sbChips = this._gameManager.getPlayerChips(smallBlindSeat);
        if (sbChips > 0) {
            const sbBet = Math.min(smallBlind, sbChips);
            this._gameManager.reducePlayerChips(smallBlindSeat, sbBet);
            this._gameManager.addToPot(sbBet);
            this._gameManager.recordPlayerBet(smallBlindSeat, sbBet); // 记录小盲注

            // 检查真实玩家是否筹码为0
            if (smallBlindSeat === this._playerManager.getPlayerSeat() && this._gameManager.getPlayerChips(smallBlindSeat) === 0) {
                this.showGameOver();
                return;
            }
        } else {

            // 检查真实玩家是否筹码为0
            if (smallBlindSeat === this._playerManager.getPlayerSeat()) {
                this.showGameOver();
                return;
            }
        }

        // 处理大盲注
        const bbChips = this._gameManager.getPlayerChips(bigBlindSeat);
        if (bbChips > 0) {
            const bbBet = Math.min(bigBlind, bbChips);
            this._gameManager.reducePlayerChips(bigBlindSeat, bbBet);
            this._gameManager.addToPot(bbBet);
            this._gameManager.recordPlayerBet(bigBlindSeat, bbBet); // 记录大盲注

            // 检查真实玩家是否筹码为0
            if (bigBlindSeat === this._playerManager.getPlayerSeat() && this._gameManager.getPlayerChips(bigBlindSeat) === 0) {
                this.showGameOver();
                return;
            }
        } else {

            // 检查真实玩家是否筹码为0
            if (bigBlindSeat === this._playerManager.getPlayerSeat()) {
                this.showGameOver();
                return;
            }
        }

        // 更新活跃玩家列表（根据筹码，筹码为0的玩家不再参与）
        this._playerManager.updateActivePlayers(this._gameManager);

        // 检查真实玩家是否筹码为0
        const playerSeat = this._playerManager.getPlayerSeat();
        const playerChips = this._gameManager.getPlayerChips(playerSeat);
        if (playerChips <= 0) {
            this.showGameOver();
            return;
        }

        // 定义位置映射（前面已经计算过了，直接使用
        const buttonSeat = newButton;
        const positionMap = new Map<number, string>();
        positionMap.set(buttonSeat, '按钮位');
        positionMap.set(smallBlindSeat, '小盲位');
        positionMap.set(bigBlindSeat, '大盲位');
        positionMap.set(utgSeat, '枪口位');

        // 根据活跃玩家数量创建头像（包含位置信息）
        this.createPlayerAvatars(positionMap);

        // 获取活跃玩家位置列表
        const playerPositions = this.getPlayersPos();

        // 打印调试信息
        for (const pos of playerPositions) {
        }

        // 获取avatar容器
        const avatarContainerNode = this.playersContainer.getChildByName('avatar');
        if (!avatarContainerNode) {
            LogService.warn('gamingPvp', 'avatar容器不存在，无法显示位置图标');
            return;
        }

        // 清理旧的位置图标（避免重复显示）
        const oldSeatIcons = this.playersContainer.children.filter(child => child.name === 'seat');
        for (const icon of oldSeatIcons) {
            icon.removeFromParent();
        }

        // 显示按钮位图标（只处理活跃玩家）
        if (this._playerManager.isPlayerActive(buttonSeat)) {
            const btnPos = playerPositions.find(pos => pos.actualSeat === buttonSeat);
            if (btnPos) {
                let btnSeatNode = new Node("seat");
                let btnSp = btnSeatNode.addComponent(Sprite);
                btnSp.spriteFrame = this.seatIcons[0]; // 按钮图标
                btnSeatNode.layer = Layers.Enum.UI_2D;
                this.playersContainer.addChild(btnSeatNode);
                btnSeatNode.setPosition(new Vec3(btnPos.x, btnPos.y, 0));
                btnSeatNode.setSiblingIndex(1000); // 设置较高的层级，避免被遮挡
            }
        }

        // 显示小盲位图标（只处理活跃玩家）
        if (this._playerManager.isPlayerActive(smallBlindSeat)) {
            const sbPos = playerPositions.find(pos => pos.actualSeat === smallBlindSeat);
            if (sbPos) {
                let sbSeatNode = new Node("seat");
                let sbSp = sbSeatNode.addComponent(Sprite);
                sbSp.spriteFrame = this.seatIcons[1]; // SB 图标
                sbSeatNode.layer = Layers.Enum.UI_2D;
                this.playersContainer.addChild(sbSeatNode);
                sbSeatNode.setPosition(new Vec3(sbPos.x, sbPos.y, 0));
                sbSeatNode.setSiblingIndex(1000); // 设置较高的层级，避免被遮挡
            }
        }

        // 显示大盲位图标（只处理活跃玩家）
        if (this._playerManager.isPlayerActive(bigBlindSeat)) {
            const bbPos = playerPositions.find(pos => pos.actualSeat === bigBlindSeat);
            if (bbPos) {
                let bbSeatNode = new Node("seat");
                let bbSp = bbSeatNode.addComponent(Sprite);
                bbSp.spriteFrame = this.seatIcons[2]; // BB 图标
                bbSeatNode.layer = Layers.Enum.UI_2D;
                this.playersContainer.addChild(bbSeatNode);
                bbSeatNode.setPosition(new Vec3(bbPos.x, bbPos.y, 0));
                bbSeatNode.setSiblingIndex(1000); // 设置较高的层级，避免被遮挡
            }
        }

        // 打印所有玩家筹码信息（调试用）
        for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
            const chips = this._gameManager.getPlayerChips(i);
            const isActive = this._playerManager.isPlayerActive(i);
        }

        // 显示枪口位图标（只处理活跃玩家）
        if (this._playerManager.isPlayerActive(utgSeat)) {
            const utgPos = playerPositions.find(pos => pos.actualSeat === utgSeat);
            if (utgPos) {
                let utgSeatNode = new Node("seat");
                let utgSp = utgSeatNode.addComponent(Sprite);
                // 使用按钮图标作为枪口位图标（如果没有专门的枪口位图标）
                utgSp.spriteFrame = this.seatIcons[0]; // 暂时使用按钮图标
                utgSeatNode.layer = Layers.Enum.UI_2D;
                this.playersContainer.addChild(utgSeatNode);
                utgSeatNode.setPosition(new Vec3(utgPos.x, utgPos.y, 0));
                utgSeatNode.setSiblingIndex(1000); // 设置较高的层级，避免被遮挡
            }
        }
        // 强制显示枪口位名称，即使它与其他位置重叠

        // 更新底池显示
        this._uiManager.updatePotDisplay(this.potLabel, this._gameManager.getPot());

        // 根据游戏类型更新下注限制
        this._settingsManager.updateBetLimits();

        // 只有本地模式才自动发牌，网络模式下由 handleDealCardsNotify 调用 deal()
        if (!this._roomId || this._roomId.toString().startsWith('LOCAL_')) {
            this.deal();
        }
    }

    // 显示玩家可操作按钮（根据国际德州扑克规则）
    showPlayerActive() {
        const currentPlayer = this._playerManager.getCurrentPlayer();

        // 检查当前玩家是否是真实玩家，并且筹码为0
        if (currentPlayer === this._playerManager.getPlayerSeat() && this._gameManager.getPlayerChips(currentPlayer) === 0) {
            // 隐藏操作按钮
            if (this.playersActionNode) {
                this.playersActionNode.active = false;
            }
            // 直接进入下一个玩家
            this.nextPlayer();
            return;
        }


        // 显示操作按钮（根据游戏状态自动决定显示哪些按钮）
        this._uiManager.showPlayerActive(this.playersActionNode, this._gameManager, this._playerManager, () => {
            this.startActionTimer();
        });

        // 更新迷你黑卡显示
        const currentHighestBet = this._gameManager.getCurrentHighestBet();
        const callAmount = this._gameManager.getCallAmount(currentPlayer);
        const minBet = this._gameManager.getMinBet();

        let currentBet = 0;
        if (currentHighestBet === 0) {
            currentBet = minBet;
        } else if (callAmount > 0) {
            currentBet = callAmount;
        }
        this._uiManager.updateMiniBlackCard(this.miniBlackCardLabel, currentBet);
    }


    // 停止倒计时
    stopActionTimer() {
        if (this._uiManager && this.node && this.node.isValid) {
            this._uiManager.stopActionTimer(this.node);
        }
    }

    // 获取下一个活跃玩家（未弃牌且还有筹码的）
    getNextActivePlayer(startFrom: number): number {
        const playersNum = this._playerManager.getPlayersNum();
        let nextPlayer = startFrom;


        for (let i = 0; i < playersNum; i++) {
            const isFolded = this._playerManager.isPlayerFolded(nextPlayer);
            const hasChips = this._gameManager.getPlayerChips(nextPlayer) > 0;
            const isActive = this._playerManager.isPlayerActive(nextPlayer);

            if (!isFolded && hasChips && isActive) {
                return nextPlayer;
            }

            nextPlayer = (nextPlayer + 1) % playersNum;
        }

        return startFrom; // 如果找不到活跃玩家，返回原始位置
    }

    /**
     * 发送玩家操作到服务端
     * @param actionType 操作类型
     * @param amount 下注金额
     */
    private async _sendPlayerActionToServer(actionType: ActionType | string, amount: number) {

        // ✅ [优化] 使用 PlayerActionService 统一处理玩家操作
        if (this._playerActionService) {
            const playerSeat = this._playerManager.getPlayerSeat();
            const playerChips = this._gameManager.getPlayerChips(playerSeat);
            const currentBet = this._gameManager.getCurrentBet();

            // ✅ [新增] 获取服务端推送的最小加注金额
            let minBetAmount = 0;
            if (this._gameFlowPvpController) {
                const availableActions = this._gameFlowPvpController.getServerAvailableActions();
                if (availableActions && availableActions.length > 0) {
                    const raiseAction = availableActions.find((action: any) =>
                        action.actionType === 'RAISE' || action.actionType === 'BET');
                    if (raiseAction && raiseAction.minBetAmount !== undefined) {
                        minBetAmount = raiseAction.minBetAmount;
                    }
                }
            }

            const result = await this._playerActionService.executeAction(actionType, amount, playerChips, currentBet, minBetAmount);
            if (!result.success) {
                LogService.warn('gamingPvp', `[WARN] PlayerActionService 验证失败: ${String(result.error)}`);
                return;
            }
            //LogService.info('gamingPvp', 'PlayerActionService 执行操作成功');
        }

        // 使用游戏流程控制器的状态查询
        if (this._gameFlowPvpController) {
            const serverAvailableActions = this._gameFlowPvpController.getServerAvailableActions();
            if (serverAvailableActions && serverAvailableActions.length > 0) {
                const actionTypeLower = actionType.toLowerCase();
                const hasAction = serverAvailableActions.some(action => {
                    const actionName = action.actionType ? action.actionType.toLowerCase() : 
                                      action.name ? action.name.toLowerCase() : '';
                    return actionName === actionTypeLower;
                });
                
                if (hasAction) {
                    LogService.debug('gamingPvp', `sendPlayerAction: 服务端允许操作 ${actionType}，跳过canPerformAction检查`);
                } else if (!this._gameFlowPvpController.canPerformAction()) {
                    LogService.warn('gamingPvp', `[WARN] canPerformAction返回false，操作未发送: actionType=${actionType}, amount=${amount}`);
                    this.stopActionTimer();
                    if (this.playersActionNode) {
                        this.playersActionNode.active = false;
                    }
                    return;
                }
            } else if (!this._gameFlowPvpController.canPerformAction()) {
                LogService.warn('gamingPvp', `[WARN] canPerformAction返回false，操作未发送: actionType=${actionType}, amount=${amount}`);
                this.stopActionTimer();
                if (this.playersActionNode) {
                    this.playersActionNode.active = false;
                }
                return;
            }
        } else {
            LogService.error('gamingPvp', '[ERROR] sendPlayerAction: GameFlowPvpController 未初始化，无法检查操作权限');
            return;
        }

        // 停止倒计时
        this.stopActionTimer();

        // 隐藏操作按钮
        if (this.playersActionNode) {
            this.playersActionNode.active = false;
        }

        // 通过GameNetwork发送消息
        if (this._gameNetwork) {
            this._gameNetwork.sendPlayerAction(this._roomId, actionType, amount);

            // ✅ [修复] 发送操作完成通知，通知服务端玩家操作已完成
            // 这是关键步骤，缺少此调用会导致服务端认为玩家还在操作中
            this.safeSetTimeout(() => {
                this.sendActionComplete();
            }, 500);
        } else {
           // LogService.error('gamingPvp', '_gameNetwork 未初始化！');
        }
    }

    /**
     * 从服务端推送的可用操作中获取对应操作类型的金额
     */
    private _getAmountFromServerActions(actionType: string): number {
        const serverAvailableActions = this._gameFlowPvpController?.getServerAvailableActions() || [];
        if (!serverAvailableActions || serverAvailableActions.length === 0) {
            LogService.warn('gamingPvp', 'serverAvailableActions 为空，返回默认金额 0');
            return 0;
        }

        for (const action of serverAvailableActions) {
            let serverActionType = action.actionType;
            // 兼容ALL_IN和ALLIN
            if (serverActionType === 'ALL_IN') {
                serverActionType = 'ALLIN';
            }
            if (serverActionType === actionType) {
                return action.betAmount || 0;
            }
        }

        LogService.warn('gamingPvp', `未找到操作 ${actionType} 的金额，返回默认金额 0`);
        return 0;
    }

    // 玩家弃牌
    fold() {
        // 使用防重复点击管理器
        this._actionDebouncer.executeFold(
            () => {
                this._executeFoldAction();
            },
            () => {
            },
            (error) => {
                LogService.error('gamingPvp', '[DEBUG] [PVP] ❌ 弃牌操作失败:', error);
            }
        );
    }

    /**
     * 执行弃牌操作（内部方法）
     */
    private _executeFoldAction() {
        // ✅ [修复] 断线重连遮罩显示中时，禁止执行弃牌操作
        // 防止倒计时未被正确停止而误触发自动弃牌
        if (this.disconnectMask && this.disconnectMask.active) {
            LogService.warn('gamingPvp', '[WARN] _executeFoldAction: 断线重连遮罩显示中，跳过弃牌操作');
            return;
        }

        // 检查是否正在处理其他操作（防止重复点击）
        if (this._gameFlowPvpController?.isActionProcessing()) {
            return;
        }

        // 设置操作处理中标志
        this._gameFlowPvpController?.setActionProcessing(true);


        // 停止倒计时（玩家已操作）
        this.manualStopCountdown();

        const currentPlayer = this._playerManager.getCurrentPlayer();
        const playerSeat = this._playerManager.getPlayerSeat();


        // 发送请求到服务端
        const amount = this._getAmountFromServerActions('FOLD');
        this._sendPlayerActionToServer(ActionType.FOLD, amount);

        // ✅ [新增] 弃牌后隐藏自己的手牌
        this.hideAIFoldedPlayerCards(playerSeat);

        // 真实玩家点击按钮后立即更新 action_label，不需要等待服务端返回
        // 使用 playerSeat 直接更新，不再依赖 currentPlayer === playerSeat 的条件
        const nickname = this._gameManager.getPlayerNickname(playerSeat);
        this._playerManager.showPlayerActionNearAvatar(this.playersContainer, playerSeat, 'fold', amount, nickname);

        // 保存待显示的操作信息，防止服务端返回时被覆盖
        if (!this._pendingActions) {
            this._pendingActions = new Map<number, { action: string; amount: number; nickname: string }>();
        }
        this._pendingActions.set(playerSeat, { action: 'fold', amount: amount, nickname: nickname });

        // 重置操作处理中标志（发送成功后允许下次操作）
        this._gameFlowPvpController?.setActionProcessing(false);
    }

    /**
     * 启用所有操作按钮
     */
    private enableActionButtons() {
        if (this.playersActionNode) {
            this.playersActionNode.children.forEach(node => {
                const button = node.getComponent(Button);
                if (button) {
                    button.interactable = true;
                }
            });
        }
    }

    /**
     * 禁用操作按钮
     * 当不是当前玩家的回合时调用，确保操作按钮不可点击
     */
    private disableActionButtons() {
        if (this.playersActionNode) {
            this.playersActionNode.children.forEach(node => {
                const button = node.getComponent(Button);
                if (button) {
                    button.interactable = false;
                }
            });
        }
        this.stopActionTimer();
    }

    // 合规规则：死盲注规则
    checkDeadBlind(playerIndex: number): boolean {

        if (!this._deadBlindRule) {
            return true; // 规则未启用，默认可行动
        }

        // 检查玩家是否在盲注位
        const buttonSeat = this._gameManager.getButtonSeat();
        const playersNum = this._playerManager.getPlayersNum();

        // 计算小盲位和大盲位
        const smallBlindSeat = (buttonSeat + 1) % playersNum;
        const bigBlindSeat = (buttonSeat + 2) % playersNum;

        // 如果玩家在盲注位且未入座（筹码为0），则为死盲注
        if (playerIndex === smallBlindSeat || playerIndex === bigBlindSeat) {
            const playerChips = this._gameManager.getPlayerChips(playerIndex);
            if (playerChips === 0) {
                return false; // 不能行动
            }
        }

        return true; // 可以正常行动
    }

    // 合规规则：亮牌规则
    enforceShowdownRules() {

        if (!this._showdownRule) {
            return; // 规则未启用
        }

        // 确保摊牌时所有活跃玩家的底牌都被正确展示
        // 玩家必须亮出全部2张底牌才能参与底池争夺
        const playersNum = this._playerManager.getPlayersNum();
        for (let i = 0; i < playersNum; i++) {
            // 只检查活跃玩家（有筹码的玩家）
            if (this._gameManager.getPlayerChips(i) > 0) {
                const holeCards = this._cardManager.getPlayerHoleCards(i);
                if (holeCards.length !== 2) {
                }
            }
        }
    }

    // 玩家跟注
    call() {
        // 使用防重复点击管理器
        this._actionDebouncer.executeCall(
            () => {
                this._executeCallAction();
            },
            () => {
            },
            (error) => {
                LogService.error('gamingPvp', '[DEBUG] [PVP] ❌ 跟注操作失败:', error);
            }
        );
    }

    /**
     * 执行跟注操作（内部方法）
     */
    private _executeCallAction() {
        // 检查是否正在处理其他操作（防止重复点击）
        if (this._gameFlowPvpController?.isActionProcessing()) {
            return;
        }

        // 设置操作处理中标志
        this._gameFlowPvpController?.setActionProcessing(true);

        // 停止倒计时（玩家已操作）
        this.manualStopCountdown();

        const currentPlayer = this._playerManager.getCurrentPlayer();
        const playerSeat = this._playerManager.getPlayerSeat();


        // 发送请求到服务端
        const amount = this._getAmountFromServerActions('CALL');
        this._sendPlayerActionToServer(ActionType.CALL, amount);

        // 真实玩家点击按钮后立即更新 action_label，提供即时视觉反馈
        // 使用 playerSeat 直接更新，不再依赖 currentPlayer === playerSeat 的条件
        const nickname = this._gameManager.getPlayerNickname(playerSeat);

        // 立即更新 action_label
        this._playerManager.showPlayerActionNearAvatar(this.playersContainer, playerSeat, 'call', amount, nickname);

        // 保存待显示的操作信息，防止服务端返回时被覆盖
        if (!this._pendingActions) {
            this._pendingActions = new Map<number, { action: string; amount: number; nickname: string }>();
        }
        this._pendingActions.set(playerSeat, { action: 'call', amount: amount, nickname: nickname });

        // 立即更新筹码余额显示（减去跟注金额）
        const currentChips = this._gameManager.getPlayerChips(playerSeat);
        const newChips = currentChips - amount;
        if (newChips >= 0) {
            this._gameManager.setPlayerChips(playerSeat, newChips);
            this._uiManager.updateAvatarAmount(this.playersContainer, playerSeat, newChips);
        } else {
        }

        // 重置操作处理中标志（发送成功后允许下次操作）
        this._gameFlowPvpController?.setActionProcessing(false);
    }

    // 玩家加注
    raise() {
        // 使用防重复点击管理器
        this._actionDebouncer.executeRaise(
            () => {
                this._executeRaiseAction();
            },
            () => {
            },
            (error) => {
                LogService.error('gamingPvp', '[DEBUG] [PVP] ❌ 加注操作失败:', error);
            }
        );
    }

    /**
     * 执行加注操作（内部方法）
     */
    private _executeRaiseAction() {
        // 检查是否正在处理其他操作（防止重复点击）
        if (this._gameFlowPvpController?.isActionProcessing()) {
            return;
        }

        // 设置操作处理中标志
        this._gameFlowPvpController?.setActionProcessing(true);

        // 停止倒计时（玩家已操作）
        this.manualStopCountdown();

        const currentPlayer = this._playerManager.getCurrentPlayer();
        const playerSeat = this._playerManager.getPlayerSeat();


        // 发送请求到服务端
        const amount = this._getAmountFromServerActions('RAISE');
        this._sendPlayerActionToServer(ActionType.RAISE, amount);

        // 真实玩家点击按钮后立即更新 action_label，提供即时视觉反馈
        // 使用 playerSeat 直接更新，不再依赖 currentPlayer === playerSeat 的条件
        const nickname = this._gameManager.getPlayerNickname(playerSeat);

        // 立即更新 action_label
        this._playerManager.showPlayerActionNearAvatar(this.playersContainer, playerSeat, 'raise', amount, nickname);

        // 保存待显示的操作信息，防止服务端返回时被覆盖
        if (!this._pendingActions) {
            this._pendingActions = new Map<number, { action: string; amount: number; nickname: string }>();
        }
        this._pendingActions.set(playerSeat, { action: 'raise', amount: amount, nickname: nickname });

        // 立即更新筹码余额显示（减去加注金额）
        const currentChips = this._gameManager.getPlayerChips(playerSeat);
        const newChips = currentChips - amount;
        if (newChips >= 0) {
            this._gameManager.setPlayerChips(playerSeat, newChips);
            this._uiManager.updateAvatarAmount(this.playersContainer, playerSeat, newChips);
        } else {
        }

        // 重置操作处理中标志（发送成功后允许下次操作）
        this._gameFlowPvpController?.setActionProcessing(false);
    }

    // 玩家看牌
    check() {
        // 使用防重复点击管理器
        this._actionDebouncer.executeCheck(
            () => {
                this._executeCheckAction();
            },
            () => {
            },
            (error) => {
                LogService.error('gamingPvp', '[DEBUG] [PVP] ❌ 看牌操作失败:', error);
            }
        );
    }

    /**
     * 执行看牌操作（内部方法）
     */
    private _executeCheckAction() {
        // 检查是否正在处理其他操作（防止重复点击）
        if (this._gameFlowPvpController?.isActionProcessing()) {
            return;
        }

        // 设置操作处理中标志
        this._gameFlowPvpController?.setActionProcessing(true);

        // 停止倒计时（玩家已操作）
        this.manualStopCountdown();

        const currentPlayer = this._playerManager.getCurrentPlayer();
        const playerSeat = this._playerManager.getPlayerSeat();


        // 发送请求到服务端
        const amount = this._getAmountFromServerActions('CHECK');
        this._sendPlayerActionToServer(ActionType.CHECK, amount);

        // 真实玩家点击按钮后立即更新 action_label，提供即时视觉反馈
        // 使用 playerSeat 直接更新，不再依赖 currentPlayer === playerSeat 的条件
        const nickname = this._gameManager.getPlayerNickname(playerSeat);

        // 立即更新 action_label
        this._playerManager.showPlayerActionNearAvatar(this.playersContainer, playerSeat, 'check', amount, nickname);

        // 保存待显示的操作信息，防止服务端返回时被覆盖
        if (!this._pendingActions) {
            this._pendingActions = new Map<number, { action: string; amount: number; nickname: string }>();
        }
        this._pendingActions.set(playerSeat, { action: 'check', amount: amount, nickname: nickname });

        // 重置操作处理中标志（发送成功后允许下次操作）
        this._gameFlowPvpController?.setActionProcessing(false);
    }

    // 玩家下注
    bet() {
        this._actionDebouncer.executeBet(
            () => {
                this._executeBetAction();
            },
            () => {
            },
            (error) => {
                LogService.error('gamingPvp', '[DEBUG] [PVP] ❌ 下注操作失败:', error);
            }
        );
    }

    /**
     * 执行下注操作（内部方法）
     */
    private _executeBetAction() {
        if (this._gameFlowPvpController?.isActionProcessing()) {
            return;
        }

        this._gameFlowPvpController?.setActionProcessing(true);

        this.manualStopCountdown();

        const playerSeat = this._playerManager.getPlayerSeat();

        const amount = this._getAmountFromServerActions('BET');
        this._sendPlayerActionToServer(ActionType.BET, amount);

        const nickname = this._gameManager.getPlayerNickname(playerSeat);

        this._playerManager.showPlayerActionNearAvatar(this.playersContainer, playerSeat, 'bet', amount, nickname);

        if (!this._pendingActions) {
            this._pendingActions = new Map<number, { action: string; amount: number; nickname: string }>();
        }
        this._pendingActions.set(playerSeat, { action: 'bet', amount: amount, nickname: nickname });

        const currentChips = this._gameManager.getPlayerChips(playerSeat);
        const newChips = currentChips - amount;
        if (newChips >= 0) {
            this._gameManager.setPlayerChips(playerSeat, newChips);
            this._uiManager.updateAvatarAmount(this.playersContainer, playerSeat, newChips);
        }

        this._gameFlowPvpController?.setActionProcessing(false);
    }

    // 玩家全下
    allIn() {
        // 使用防重复点击管理器
        this._actionDebouncer.executeAllIn(
            () => {
                this._executeAllInAction();
            },
            () => {
            },
            (error) => {
                LogService.error('gamingPvp', '[DEBUG] [PVP] ❌ 全下操作失败:', error);
            }
        );
    }

    /**
     * 执行全下操作（内部方法）
     */
    private _executeAllInAction() {
        // 检查是否正在处理其他操作（防止重复点击）
        if (this._gameFlowPvpController?.isActionProcessing()) {
            return;
        }

        // 设置操作处理中标志
        this._gameFlowPvpController?.setActionProcessing(true);

        // 停止倒计时（玩家已操作）
        this.manualStopCountdown();

        const currentPlayer = this._playerManager.getCurrentPlayer();
        const playerSeat = this._playerManager.getPlayerSeat();


        // 发送请求到服务端
        const amount = this._getAmountFromServerActions('ALLIN');
        this._sendPlayerActionToServer(ActionType.ALL_IN, amount);

        // 真实玩家点击按钮后立即更新 action_label，提供即时视觉反馈
        // 使用 playerSeat 直接更新，不再依赖 currentPlayer === playerSeat 的条件
        const nickname = this._gameManager.getPlayerNickname(playerSeat);

        // 立即更新 action_label
        this._playerManager.showPlayerActionNearAvatar(this.playersContainer, playerSeat, 'all-in', amount, nickname);

        // 保存待显示的操作信息，防止服务端返回时被覆盖
        if (!this._pendingActions) {
            this._pendingActions = new Map<number, { action: string; amount: number; nickname: string }>();
        }
        this._pendingActions.set(playerSeat, { action: 'all-in', amount: amount, nickname: nickname });

        // 立即更新筹码余额显示（全下后筹码为0）
        const currentChips = this._gameManager.getPlayerChips(playerSeat);
        this._gameManager.setPlayerChips(playerSeat, 0);
        this._uiManager.updateAvatarAmount(this.playersContainer, playerSeat, 0);

        // 重置操作处理中标志（发送成功后允许下次操作）
        this._gameFlowPvpController?.setActionProcessing(false);
    }

    // 切换到下一个玩家
    nextPlayer() {
        // 检查是否只剩下一个活跃玩家
        if (this._gameManager.getActivePlayerCount() <= 1) {
            this._playerManager.stopAllPlayersBlink(this.playersContainer);
            this.nextStage();
            return;
        }

        // 检查是否所有活跃玩家都已操作（本轮所有活跃玩家都已轮到）
        if (this._playerManager.getActionHistory().length > 0 && this.allActivePlayersActed()) {
            // 所有活跃玩家都已操作，停止所有闪烁，进入下一阶段
            this._playerManager.stopAllPlayersBlink(this.playersContainer);
            this.nextStage();
            return;
        }

        // 移动到下一个玩家
        this._playerManager.nextPlayer();
        const nextPlayer = this._playerManager.getCurrentPlayer();

        // 检查下一个玩家是否已弃牌或不再活跃（没有筹码）
        if (this._playerManager.isPlayerFolded(nextPlayer)) {
            // 先停止闪烁动画
            this._playerManager.stopAllPlayersBlink(this.playersContainer);
            // 检查是否只剩下一个活跃玩家
            if (this._gameManager.getActivePlayerCount() <= 1) {
                this._playerManager.stopAllPlayersBlink(this.playersContainer);
                this.nextStage();
                return;
            }
            // 递归调用nextPlayer，继续找下一个玩家
            this.nextPlayer();
            return;
        }

        // 检查玩家是否活跃（还有筹码）
        if (!this._gameManager.isActivePlayer(nextPlayer)) {
            // 先停止闪烁动画
            this._playerManager.stopAllPlayersBlink(this.playersContainer);
            // 检查是否只剩下一个活跃玩家
            if (this._gameManager.getActivePlayerCount() <= 1) {
                this._playerManager.stopAllPlayersBlink(this.playersContainer);
                this.nextStage();
                return;
            }
            // 递归调用nextPlayer，继续找下一个玩家
            this.nextPlayer();
            return;
        }

        // 检查是否是死盲注（盲注位且筹码为0）
        if (this._gameManager.isDeadBlind(nextPlayer)) {
            this._playerManager.recordAction('dead_blind', 0);
            // 先停止闪烁动画
            this._playerManager.stopAllPlayersBlink(this.playersContainer);
            // 检查是否只剩下一个活跃玩家
            if (this._gameManager.getActivePlayerCount() <= 1) {
                this._playerManager.stopAllPlayersBlink(this.playersContainer);
                this.nextStage();
                return;
            }
            // 继续找下一个玩家
            this.nextPlayer();
            return;
        }

        // 检查玩家筹码是否不足以跟注（需要跟注但筹码不足）
        // 注意：这种情况下，人类玩家应该有机会选择弃牌或全下，而不是直接强制全下
        const callAmount = this._gameManager.getCallAmount(nextPlayer);
        const playerChips = this._gameManager.getPlayerChips(nextPlayer);
        const cannotCall = callAmount > 0 && playerChips < callAmount && playerChips > 0;

        // 先停止所有玩家的闪烁动画
        this._playerManager.stopAllPlayersBlink(this.playersContainer);
        // 为当前玩家开始闪烁动画
        this._playerManager.startPlayerBlink(this.playersContainer, nextPlayer);

        // 检查是否是AI玩家 - 添加详细日志
        const isAI = this._playerManager.isAIPlayer(nextPlayer);

        if (isAI) {
            // AI玩家：由服务端驱动操作
        } else {
            // 人类玩家：筹码不足时仍然显示操作按钮（可以选弃牌或全下）
            if (cannotCall) {
            }
            this.safeSetTimeout(() => {
                this.showPlayerActive();
            }, 1000);
        }
    }

    // 增加当前轮次操作计数器
    private increaseActionCount() {
        // 只有当活跃玩家数量大于1时，才增加操作计数
        if (this._gameManager.getActivePlayerCount() > 1) {
            this._actionCountInCurrentRound++;
        }
    }

    // 检查是否所有活跃玩家都已操作
    allActivePlayersActed(): boolean {
        const activePlayers: number[] = [];
        const allInPlayers: number[] = [];

        // 收集所有活跃玩家和全下玩家
        for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
            if (this._gameManager.isActivePlayer(i) && !this._gameManager.isDeadBlind(i)) {
                if (this._gameManager.getPlayerAllIn(i) > 0) {
                    allInPlayers.push(i);
                } else {
                    activePlayers.push(i);
                }
            }
        }

        // 获取当前最高下注
        const currentHighestBet = this._gameManager.getCurrentHighestBet();

        // 检查非全下玩家是否都已下注到同一水平
        for (const player of activePlayers) {
            const playerBet = this._gameManager.getPlayerBet(player);
            const playerChips = this._gameManager.getPlayerChips(player);

            // 如果玩家没有全下，且下注小于当前最高下注，说明还没有操作
            if (playerBet < currentHighestBet) {
                return false;
            }
        }

        // 全下的玩家都已经完成操作（他们无法再操作）
        // 如果所有非全下玩家都已操作，则所有人都已完成操作
        const expectedActions = activePlayers.length + allInPlayers.length;

        // 如果没有非全下的活跃玩家（即所有人都已全下或弃牌），结束下注轮
        if (activePlayers.length === 0) {
            return true;
        }

        return this._actionCountInCurrentRound >= expectedActions;
    }

    /**
     * 处理倒计时超时
     */
    private handleCountdownTimeout() {

        // ✅ [修复] 防御性检查：断线重连遮罩显示中时，禁止触发自动弃牌
        // 避免因 GameFlowPvpController 倒计时未被正确停止而误触发弃牌
        if (this.disconnectMask && this.disconnectMask.active) {
            LogService.warn('gamingPvp', '[WARN] handleCountdownTimeout: 断线重连遮罩显示中，跳过自动弃牌');
            this._gameFlowPvpController?.stopCountdown();
            return;
        }

        // ✅ [新增] 防御性检查：如果当前玩家已ALL-IN，跳过操作
        // 添加方法存在性检查，避免方法不存在导致崩溃
        let currentPlayerState = null;
        if (typeof this._playerManager.getPlayerState === 'function') {
            try {
                currentPlayerState = this._playerManager.getPlayerState(this._getCurrentTurnPlayerIndex());
            } catch (error) {
                LogService.error('gamingPvp', `[ERROR] getPlayerState 调用失败:`, error);
            }
        }

        if (currentPlayerState) {
            if (currentPlayerState.isAllIn) {
                LogService.warn('gamingPvp', `[WARN] handleCountdownTimeout: 当前玩家已ALL-IN，跳过操作: seatIndex=${this._getCurrentTurnPlayerIndex()}`);
                this._gameFlowPvpController?.stopCountdown();
                return;
            }

            if (currentPlayerState.isFold) {
                LogService.warn('gamingPvp', `[WARN] handleCountdownTimeout: 当前玩家已弃牌，跳过操作: seatIndex=${this._getCurrentTurnPlayerIndex()}`);
                this._gameFlowPvpController?.stopCountdown();
                return;
            }
        }

        // ✅ [优化] 使用辅助方法获取当前回合信息
        const isCurrentTurnAI = this._isCurrentTurnAI();

        // 如果是真实玩家
        if (!isCurrentTurnAI) {
            // ✅ [修复] 玩家30秒内未操作，应该自动弃牌，而不是看牌或跟注
            // 根据用户需求：超时未操作 = 弃牌
            const amount = this._getAmountFromServerActions('FOLD');
            this._sendPlayerActionToServer(ActionType.FOLD, amount);

            // 超时自动弃牌后隐藏自己的手牌
            const playerSeat = this._playerManager.getPlayerSeat();
            if (playerSeat >= 0) {
                this.hideAIFoldedPlayerCards(playerSeat);
            }
        }

        // 隐藏胜利面板
        if (this._settlementPresenter) {
            this._settlementPresenter.hideSettlementPanel();
        }
    }

    /**
     * 处理服务端推送的倒计时更新
     * @param data 包含剩余时间的数据
     */
    public handleCountdownUpdate(data: any) {
        if (data && data.timeRemaining !== undefined) {
            const timeRemaining = data.timeRemaining;

            // 更新UI显示
            const currentTurnPlayer = this._getCurrentTurnPlayerIndex();
            if (currentTurnPlayer !== -1) {
                this._playerManager.updatePlayerCountdown(this.playersContainer, currentTurnPlayer, timeRemaining);
            }
        }
    }


    // 进入下一游戏阶段
    nextStage() {
        // 检查是否只剩下一个活跃玩家
        if (this._gameManager.getActivePlayerCount() === 1) {
            // 只剩下一个活跃玩家，将底池分配给该玩家
            const winner = this.getOnlyActivePlayer();
            if (winner !== -1) {
                // 将底池分配给唯一的玩家
                const pot = this._gameManager.getPot();
                if (pot > 0) {
                    const winnerChips = this._gameManager.getPlayerChips(winner);
                    this._gameManager.setPlayerChips(winner, winnerChips + pot);
                }

                // ✅ [修改] 只使用服务端的牌型信息，不进行本地计算
                let handType = 9; // 高牌
                let handStrength = 0;
                const playersData = this._gameManager.getPlayersDataFromServer();
                const playerData = playersData ? playersData.find(p => p.seatIndex === winner) : null;
                if (playerData && playerData.handTypeName) {
                    handType = CardManager.getHandTypeFromName(playerData.handTypeName);
                    handStrength = playerData.handValue !== undefined ? Number(playerData.handValue) : 0;
                }

                // 保存胜利者信息到showDown中使用
                this._lastWinner = winner;
                this._lastWinnerHandType = handType;
                this._lastWinnerHandStrength = handStrength;
                this._lastPot = pot;
            }

            // 直接进入摊牌阶段，不再继续后续的下注轮次
            this.showDown();
            return;
        }

        // 检查是否所有活跃玩家都已全下
        let allAllIn = true;
        let activePlayersWithChips = 0;
        for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
            if (this._gameManager.isActivePlayer(i) && !this._playerManager.isPlayerFolded(i)) {
                if (this._gameManager.getPlayerChips(i) > 0) {
                    activePlayersWithChips++;
                    allAllIn = false;
                }
            }
        }

        if (allAllIn || activePlayersWithChips <= 1) {
            this.showDown();
            return;
        }

        // 重置当前轮下注金额，为下一轮下注做准备
        this._gameManager.resetPlayersBetInRound();

        const round = this._gameManager.nextStage();
        if (round == 5) {
            // 河牌后，进入摊牌阶段
            this.showDown();
        }
        // 翻牌、转牌、河牌阶段由服务端驱动发牌
    }

    // 获取唯一的活跃玩家
    getOnlyActivePlayer(): number {
        let activePlayer = -1;
        let activeCount = 0;

        for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
            if (this._gameManager.isActivePlayer(i)) {
                activePlayer = i;
                activeCount++;
            }
        }

        return activeCount === 1 ? activePlayer : -1;
    }
    // 摊牌
    showDown() {
        // 防止重复进入摊牌阶段
        if (this._isConfirmationPending()) {
            return;
        }


        // 1. 显示所有玩家的牌（翻牌动画）
        this.showAllPlayersCards(() => {
            // 2. 检查活跃玩家数量
            const activePlayersCount = this._playerManager.getActivePlayersCount();
            let winnerResult: { winner: number; winners: number[] };
            let handType: number;
            let handStrength: number;

            if (activePlayersCount === 1) {
                // 只有一个活跃玩家，直接判定为胜利者
                let singleWinner = 0;
                for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
                    if (!this._playerManager.isPlayerFolded(i) && this._gameManager.getPlayerChips(i) > 0) {
                        singleWinner = i;
                        break;
                    }
                }
                winnerResult = { winner: singleWinner, winners: [singleWinner] };
                // ✅ [修改] 只使用服务端的牌型信息，不进行本地计算
                const playersData = this._gameManager.getPlayersDataFromServer();
                const playerData = playersData ? playersData.find(p => p.seatIndex === singleWinner) : null;
                if (playerData && playerData.handTypeName) {
                    handType = CardManager.getHandTypeFromName(playerData.handTypeName);
                    handStrength = playerData.handValue !== undefined ? Number(playerData.handValue) : 0;
                } else {
                    handType = 9; // 高牌
                    handStrength = 0;
                }
            } else {
                // 多个活跃玩家，计算牌型并比较
                const ranks = this.calculateAllPlayersHandRank();
                winnerResult = this.determineWinner(ranks);
                handType = ranks.find(r => r.player === winnerResult.winner).handType;
                handStrength = ranks.find(r => r.player === winnerResult.winner).handStrength;
            }

            // 3. 分配底池筹码（包括主池和边池）
            const pot = this._gameManager.getPot();
            if (pot > 0) {
                // 计算主池和边池
                const pots = this._gameManager.calculateMainAndSidePots();

                // 分配主池 - 支持多个赢家平分
                if (pots.mainPot > 0 && winnerResult.winners.length > 0) {
                    const winners = winnerResult.winners;
                    const amountPerWinner = Math.floor(pots.mainPot / winners.length);
                    let remainder = pots.mainPot % winners.length;

                    for (const w of winners) {
                        let amount = amountPerWinner;
                        if (remainder > 0) {
                            amount++;
                            remainder--;
                        }
                        const winnerChips = this._gameManager.getPlayerChips(w);
                        this._gameManager.setPlayerChips(w, winnerChips + amount);
                    }
                }

                // 分配边池 - 支持多个赢家平分
                for (let i = 0; i < pots.sidePots.length; i++) {
                    const sidePot = pots.sidePots[i];
                    if (sidePot.amount > 0) {
                        // ✅ [修改] 只使用服务端的牌型信息
                        const eligibleRanks = [];
                        const playersData = this._gameManager.getPlayersDataFromServer();
                        for (const player of sidePot.eligiblePlayers) {
                            const playerData = playersData ? playersData.find(p => p.seatIndex === player) : null;
                            if (playerData && playerData.handTypeName && playerData.handValue !== undefined) {
                                eligibleRanks.push({
                                    player: player,
                                    handType: CardManager.getHandTypeFromName(playerData.handTypeName),
                                    handStrength: Number(playerData.handValue)
                                });
                            }
                        }

                        // 找出边池中牌型最高的玩家（支持平局）
                        if (eligibleRanks.length > 0) {
                            const sidePotResult = this.determineWinner(eligibleRanks);
                            const sidePotWinners = sidePotResult.winners;
                            const amountPerWinner = Math.floor(sidePot.amount / sidePotWinners.length);
                            let remainder = sidePot.amount % sidePotWinners.length;

                            for (const w of sidePotWinners) {
                                let amount = amountPerWinner;
                                if (remainder > 0) {
                                    amount++;
                                    remainder--;
                                }
                                const winnerChips = this._gameManager.getPlayerChips(w);
                                this._gameManager.setPlayerChips(w, winnerChips + amount);
                            }
                        }
                    }
                }
            }

            // 4. 直接显示胜利结果（跳过中间的allHandTypeDisplay）
            this.requestConfirmation(
                this.node,
                this.playersContainer,
                winnerResult.winner,
                handType,
                handStrength,
                pot,
                winnerResult.winners
            );
        });
    }

    // 请求玩家确认（PVP模式：只显示确认按钮，每个玩家确认后立即发送请求到服务端）
    requestConfirmation(node: Node, playersContainer: Node, winnerIndex: number, handType: number, handStrength: number, pot: number, winners?: number[]) {
        // 防止重复显示胜利面板
        if (this._isConfirmationPending()) {
            return;
        }

        // ✅ [修复] 先清除确认状态，再设置为等待确认
        // 之前的顺序错误：先 setConfirmationPending(true) 再 clearConfirmations()
        // clearConfirmations() 会把 _confirmationPending 设为 false，导致后续确认检查失败
        this._settlementPvpHandler?.clearConfirmations();
        this._settlementPvpHandler?.setConfirmationPending(true);

        // 获取胜利者昵称
        const winnerNickname = this._gameManager.getPlayerNickname(winnerIndex);

        // ✅ [新增] 获取公牌和胜利者手牌
        const communityCards = this._gameManager.getCommunityCards();
        const winnerHandCards = this._gameManager.getPlayerHoleCardsFromServer(winnerIndex);


        // 使用 SettlementPresenter 显示胜利面板
        if (this._settlementPresenter) {
            this._settlementPresenter.showWinnerResultWithConfirmation({
                winnerIndex: winnerIndex,
                handTypeName: CardManager.getHandTypeName(handType),
                handStrength: handStrength,
                pot: pot,
                playerSeat: this._playerManager.getPlayerSeat(),
                winnerNickname: winnerNickname,
                communityCards: communityCards,
                winnerHandCards: winnerHandCards,
                winners: winners || [winnerIndex],
                isTie: (winners && winners.length > 1) || false
            }, (confirmedPlayer: number) => {
                this.onPlayerConfirmed(confirmedPlayer);
            });

            // ✅ [新增] 根据牌型播放对应音效
            const handTypeName = CardManager.getHandTypeName(handType);
            const handPatternKey = CardManager.getHandTypeConfigKey(handTypeName);
            SoundManager.getInstance().playHandPatternSound(handPatternKey);
        } else {
            LogService.error('gamingPvp', '[ERROR] requestConfirmation: SettlementPresenter 未初始化，无法显示胜利面板');
        }
    }

    // 玩家确认回调
    onPlayerConfirmed(playerIndex: number) {

        if (!this._isConfirmationPending()) {
            return;
        }
        
        // ✅ [关键修复] 设置结算确认阶段标志，防止确认期间显示遮罩
        this._isInSettlementConfirmation = true;

        const playerSeat = this._playerManager.getPlayerSeat();
        const isLastRound = this._currentRound >= this._maxRounds;

        this._settlementPvpHandler?.confirmPlayer(playerIndex);

        // 最后一局时：
        // - 真实玩家确认后跳转到record场景
        // - AI玩家确认后清理UI，但不发送准备请求
        if (isLastRound) {
            if (playerIndex === playerSeat) {
                // ✅ [修复] 最后一局真实玩家点击确认后跳转到record场景
                this._uiManager.cleanupWinnerUI(this.node, this.playersContainer, false);
                
                // 清理房间数据，防止下次创建房间时进入旧房间
                this.scheduleOnce(() => {
                    this._gameNetwork.resetRoomId();
                    this._gameNetwork.resetRoomCode();
                    this._gameNetwork.setPendingJoinRoomId(null);
                    this._gameNetwork.setRoomConfig(null);
                    this._roomId = 0;
                    this._room_code = null;
                    
                    // 跳转到record场景，查看游戏记录
                    this._transitionToScene('record');
                }, 2.0);
                
                return;
            }
            this._uiManager.cleanupWinnerUI(this.node, this.playersContainer, false);
            return;
        }

        this._uiManager.cleanupWinnerUI(this.node, this.playersContainer, false);

        // ✅ [关键修复] 更新活跃玩家列表，确保重建头像时使用最新的玩家状态
        // 结算后玩家筹码可能已更新，需要重新计算活跃玩家
        if (this._gameManager) {
            this._playerManager.updateActivePlayers(this._gameManager);
        }

        // ✅ [关键修复] 清理胜利面板后立即重建玩家头像
        // 防止场景清空，确保玩家头像保持可见
        // 之前的问题：清理胜利面板后，只有等待服务端推送消息才会重建头像
        // 导致场景空白，需要其他玩家点击准备才能重新渲染
        this.createPlayerAvatars();

        // ✅ [修复] 结算确认后玩家应为未准备状态，发送 continueGame 而非 playerReadyRequest
        // continueGame (cmd=217) 服务端会将玩家设置为未准备状态 (setReady(false))
        // playerReadyRequest (cmd=210) 服务端会将玩家设置为已准备状态 (prepare())
        this._isCurrentPlayerReady = false;
        this.updatePlayerAvatarReadyButtons(true, false);

        const playerChips = this._gameManager.getPlayerChips(playerSeat);

        if (playerChips <= 0) {
            let otherPlayerHasChips = false;
            const playerCount = this._playerManager.getPlayersNum();

            for (let i = 0; i < playerCount; i++) {
                if (i !== playerSeat && this._gameManager.getPlayerChips(i) > 0) {
                    otherPlayerHasChips = true;
                    break;
                }
            }

            if (otherPlayerHasChips) {
                if (this._gameNetwork && this._gameNetwork.sendContinueGame) {
                    this._gameNetwork.sendContinueGame();
                }
                return;
            } else {
                this._settlementPvpHandler?.clearConfirmations();
                this.showGameOver();
                return;
            }
        }

        if (this._gameNetwork && this._gameNetwork.sendContinueGame) {
            this._gameNetwork.sendContinueGame();
            
            // ✅ [新增] 发送 continueGame 后，设置一个超时检查
            // 如果 3 秒内没有收到服务端响应，主动请求同步房间状态，确保场景不会空白
            this.safeSetTimeout(() => {
                if (!this._isSceneUnloading && this._gameNetwork && this._roomId > 0) {
                    LogService.info('gamingPvp', 'onPlayerConfirmed: 检查场景状态，如果玩家头像为空则重建');
                    
                    // 检查玩家头像是否存在，如果不存在则重建
                    if (this.playersContainer && this.playersContainer.children.length === 0) {
                        LogService.warn('gamingPvp', 'onPlayerConfirmed: 玩家头像为空，重新创建');
                        this.createPlayerAvatars();
                    }
                }
            }, 3000);
        } else {
            LogService.error('gamingPvp', '[PVP模式] _gameNetwork 或 sendContinueGame 不存在！');
            this.handleAllPlayersConfirmed();
        }

    }

    /**
     * 处理所有玩家确认完成的通知（由服务端发送）
     */
    handleAllPlayersConfirmed() {

        // 清理确认状态
        this._settlementPvpHandler?.clearConfirmations();

        // ✅ [修复] 先恢复玩家筹码，再清除结算阶段标志
        // 这样可以确保在过渡期间玩家不会因为筹码为0而被标记为不活跃
        // 规则0：计分方式 - 每局恢复1000筹码
        // 规则1：筹码扣减方式 - 从数据库查询积分（TODO）
        // 规则2：代币扣减 - 预留TODO
        if (this._scoreType === 0) {
            const playersNum = this._playerManager.getPlayersNum();
            for (let i = 0; i < playersNum; i++) {
                // ✅ [修复] 在结算阶段，所有玩家都应该恢复筹码（包括筹码为0的玩家）
                if (this._playerManager.isPlayerActive(i) || this._playerManager.isInSettlement()) {
                    this._gameManager.setPlayerChips(i, 1000);
                    this._uiManager.updateAvatarAmount(this.playersContainer, i, 1000);
                }
            }
        } else if (this._scoreType === 1) {
            // TODO: 规则1需要从服务端查询玩家的真实积分
        } else {
            // TODO: 规则2代币扣减方式
        }

        // ✅ [修复] 筹码恢复完成后，再清除结算阶段标志
        this._playerManager.setInSettlement(false);
        LogService.info('gamingPvp', '已清除结算阶段标志');

        // ✅ [修改] 隐藏胜利面板（所有玩家确认后才隐藏），并清理公牌（新局开始）
        this._uiManager.cleanupWinnerUI(this.node, this.playersContainer, true);

        /*
        // 隐藏胜利面板节点
        if (this._winPanelNode) {
            this._winPanelNode.active = false;
        }*/

        // 隐藏 mask 遮罩层（新玩家加入时可能有遮罩）
        if (this._maskNode) {
            this._maskNode.active = false;
        }

        // 重置玩家准备状态（新一局需要重新准备）
        this._isCurrentPlayerReady = false;

        // 更新按钮可见性（隐藏取消准备按钮，因为新一局玩家还没有准备）
        this.updateButtonVisibility();

        // ✅ [修改] 卡牌清理已经在 cleanupWinnerUI 中完成（当 clearCards=true 时）
        // 无需重复调用 clearPlayerCards 和 clearBoardCards

        // 清空底池显示 - 添加详细日志

        this._gameManager.setPot(0);
        this._uiManager.updatePotDisplay(this.potLabel, 0);

        // ✅ [新增] 标记游戏已结束，等待新一局准备
        this._isGameEnded = true;

        // ✅ [新增] 重置所有玩家准备状态
        this.resetReadyStatus();

        // ✅ [新增] 显示准备完毕按钮，让玩家点击准备
        this.showReadyButton();

    }

    // 获取未确认玩家数量（只计算活跃玩家，即还有筹码的玩家）
    // 注意：真实玩家即使筹码为0，也需要点击确认
    getUnconfirmedPlayersCount(): number {
        let activePlayers = 0;
        const playerSeat = this._playerManager.getPlayerSeat();
        for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
            // 真实玩家始终视为活跃，即使筹码为0
            if (i === playerSeat) {
                activePlayers++;
            } else if (this._gameManager.getPlayerChips(i) > 0) {
                activePlayers++;
            }
        }
        return activePlayers - this._getConfirmedCount();
    }

    // 玩家点击确认按钮
    playerConfirm() {
        const playerSeat = this._playerManager.getPlayerSeat();
        this.onPlayerConfirmed(playerSeat);
    }

    // 只显示活跃玩家的牌（跳过弃牌玩家）
    showActivePlayersCards(callback?: () => void): Promise<void> {
        this.enforceShowdownRules();

        return new Promise((resolve) => {
            let flipCount = 0;
            let actualCardsToFlip = 0;
            let callbackCalled = false;
            const playersNum = this._playerManager.getPlayersNum();
            const smallBlindSeat = this._gameManager.getSmallBlindSeat();

            // 计算实际需要翻的牌数（只计算活跃玩家）
            for (let i = 0; i < playersNum; i++) {
                // 跳过弃牌玩家
                if (this._playerManager.isPlayerFolded(i)) {
                    continue;
                }
                // 使用服务端发送的手牌数据，如果没有则使用本地数据
                let cards: number[] = [];
                const serverCards = this._gameManager.getPlayerHoleCardsFromServer(i);
                if (serverCards && serverCards.length === 2) {
                    cards = serverCards;
                } else {
                    const localCards = this._gameManager.getPlayerCards(i);
                    if (localCards && localCards.length === 2) {
                        cards = localCards;
                    }
                }
                if (cards && cards.length === 2) {
                    const cardNodes = this._playerCards[i];
                    if (cardNodes && cardNodes.length >= 2) {
                        actualCardsToFlip += 2;
                    }
                }
            }


            const onAllCardsFlipped = () => {
                if (callbackCalled) return;
                callbackCalled = true;
                this.showAllPlayersHandTypes();
                if (callback) {
                    callback();
                }
                resolve();
            };

            // 按顺时针顺序从小盲开始亮牌（只处理活跃玩家）
            let activeOrder = 0;
            for (let order = 0; order < playersNum; order++) {
                const i = (smallBlindSeat + order) % playersNum;

                // 跳过弃牌玩家
                if (this._playerManager.isPlayerFolded(i)) {
                    continue;
                }

                // 使用服务端发送的手牌数据，如果没有则使用本地手牌数据
                let cards: number[] = [];
                const serverCards = this._gameManager.getPlayerHoleCardsFromServer(i);
                if (serverCards && serverCards.length === 2) {
                    cards = serverCards;
                } else {
                    const localCards = this._gameManager.getPlayerCards(i);
                    if (localCards && localCards.length === 2) {
                        cards = localCards;
                    }
                }
                
                if (cards && cards.length === 2) {
                    LogService.debug('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 的手牌数据: ${cards}`);
                    const poker1 = this._cardManager.getPokerById(cards[0]);
                    const poker2 = this._cardManager.getPokerById(cards[1]);
                    LogService.debug('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 的牌面: ${poker1.suit}${poker1.point}, ${poker2.suit}${poker2.point}`);

                    const cardNodes = this._playerCards[i];
                    if (cardNodes && cardNodes.length >= 2) {
                        LogService.debug('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 的牌节点数量: ${cardNodes.length}`);
                        const pokers = [poker1, poker2];
                        for (let j = 0; j < 2; j++) {
                            const cardNode = cardNodes[j];
                            if (!cardNode) {
                                LogService.warn('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 的牌节点 ${j} 为空`);
                                continue;
                            }
                            const pokerComponent = cardNode.getComponent(pokerCard);
                            if (!pokerComponent) {
                                LogService.warn('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 的牌节点 ${j} 没有 pokerCard 组件`);
                                continue;
                            }
                            const poker = pokers[j];

                            if (pokerComponent) {
                                const delay = (activeOrder * 2 + j) * 200;
                                const finalCardNode = cardNode;
                                const finalPokerComponent = pokerComponent;
                                const finalPoker = poker;
                                
                                this.safeSetTimeout(() => {
                                    tween(finalCardNode)
                                        .to(0.2, { eulerAngles: new Vec3(0, -90, 0) })
                                        .call(() => {
                                            LogService.debug('gamingPvp', `[showActivePlayersCards] 翻牌: seat=${i}, card=${j}, suit=${finalPoker.suit}, point=${finalPoker.point}`);
                                            finalPokerComponent.showPoker(finalPoker.suit, finalPoker.point);
                                        })
                                        .by(0.2, { eulerAngles: new Vec3(0, 90, 0) })
                                        .call(() => {
                                            if (callbackCalled) return;
                                            flipCount++;
                                            if (flipCount >= actualCardsToFlip) {
                                                onAllCardsFlipped();
                                            }
                                        })
                                        .start();
                                }, delay);
                            } else {
                                LogService.warn('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 的牌节点 ${j} 没有 pokerCard 组件`);
                                if (!callbackCalled) {
                                    flipCount++;
                                    if (flipCount >= actualCardsToFlip) {
                                        onAllCardsFlipped();
                                    }
                                }
                            }
                        }
                    } else {
                        LogService.warn('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 的牌节点不足，需要2张，实际有 ${cardNodes ? cardNodes.length : 0} 张`);
                        if (!callbackCalled) {
                            flipCount += 2;
                            if (flipCount >= actualCardsToFlip) {
                                onAllCardsFlipped();
                            }
                        }
                    }
                    activeOrder++;
                } else {
                    LogService.info('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 没有服务端手牌数据，本地也没有备份数据，显示背面牌`);
                    const cardNodes = this._playerCards[i];
                    if (cardNodes && cardNodes.length >= 2) {
                        for (let j = 0; j < 2; j++) {
                            const cardNode = cardNodes[j];
                            if (!cardNode) continue;
                            const pokerComponent = cardNode.getComponent(pokerCard);
                            if (pokerComponent) {
                                const delay = (activeOrder * 2 + j) * 200;
                                this.safeSetTimeout(() => {
                                    tween(cardNode)
                                        .to(0.2, { eulerAngles: new Vec3(0, -90, 0) })
                                        .call(() => {
                                            pokerComponent.backPoker();
                                        })
                                        .by(0.2, { eulerAngles: new Vec3(0, 90, 0) })
                                        .call(() => {
                                            if (!callbackCalled) {
                                                flipCount++;
                                                if (flipCount >= actualCardsToFlip) {
                                                    onAllCardsFlipped();
                                                }
                                            }
                                        })
                                        .start();
                                }, delay);
                            }
                        }
                    } else {
                        if (!callbackCalled) {
                            const expectedCards = cardNodes && cardNodes.length >= 2 ? 2 : (cardNodes ? cardNodes.length : 0);
                            flipCount += expectedCards;
                            if (flipCount >= actualCardsToFlip) {
                                onAllCardsFlipped();
                            }
                        }
                    }
                    activeOrder++;
                }
            }

            // 如果没有需要翻的牌，立即调用回调
            if (actualCardsToFlip === 0) {
                this.safeSetTimeout(() => {
                    onAllCardsFlipped();
                }, 100);
            }
        });
    }

    // 显示所有玩家的牌
    showAllPlayersCards(callback?: () => void): Promise<void> {
        this.enforceShowdownRules();

        return new Promise((resolve) => {
            // 显示所有玩家的底牌（顺时针顺序，从小盲开始）
            let flipCount = 0;
            let actualCardsToFlip = 0;
            let callbackCalled = false; // 防止重复调用回调
            const playersNum = this._playerManager.getPlayersNum();
            const smallBlindSeat = this._gameManager.getSmallBlindSeat();

            // 计算实际需要翻的牌数（优先使用服务端数据）
            for (let i = 0; i < playersNum; i++) {
                // 跳过弃牌玩家
                if (this._playerManager.isPlayerFolded(i)) {
                    continue;
                }
                // 使用服务端发送的手牌数据
                const serverCards = this._gameManager.getPlayerHoleCardsFromServer(i);
                if (serverCards && serverCards.length === 2) {
                    const cardNodes = this._playerCards[i];
                    if (cardNodes && cardNodes.length >= 2) {
                        actualCardsToFlip += 2;
                    }
                }
            }


            // 完成翻牌后的处理函数
            const onAllCardsFlipped = () => {
                if (callbackCalled) return;
                callbackCalled = true;
                this.showAllPlayersHandTypes();
                if (callback) {
                    callback();
                }
                resolve();
            };

            // 按顺时针顺序从小盲开始亮牌（只处理活跃玩家）
            let activeOrder = 0;
            for (let order = 0; order < playersNum; order++) {
                const i = (smallBlindSeat + order) % playersNum;

                // 跳过弃牌玩家
                if (this._playerManager.isPlayerFolded(i)) {
                    continue;
                }

                // 使用服务端发送的手牌数据（关键修复：使用服务端数据而不是本地数据）
                const serverCards = this._gameManager.getPlayerHoleCardsFromServer(i);
                if (serverCards && serverCards.length === 2) {
                    const poker1 = this._cardManager.getPokerById(serverCards[0]);
                    const poker2 = this._cardManager.getPokerById(serverCards[1]);

                    const cardNodes = this._playerCards[i];
                    if (cardNodes && cardNodes.length >= 2) {
                        const pokers = [poker1, poker2];
                        for (let j = 0; j < 2; j++) {
                            const cardNode = cardNodes[j];
                            if (!cardNode) {
                                LogService.warn('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 的牌节点 ${j} 为空`);
                                continue;
                            }
                            const poker = pokers[j];
                            const pokerComponent = cardNode.getComponent(pokerCard);

                            if (pokerComponent) {
                                // 翻牌动画
                                this.safeSetTimeout(() => {
                                    tween(cardNode)
                                        .to(0.2, { eulerAngles: new Vec3(0, -90, 0) })
                                        .call(() => {
                                            pokerComponent.showPoker(poker.suit, poker.point);
                                        })
                                        .by(0.2, { eulerAngles: new Vec3(0, 90, 0) })
                                        .call(() => {
                                            if (callbackCalled) return;
                                            flipCount++;
                                            if (flipCount >= actualCardsToFlip) {
                                                onAllCardsFlipped();
                                            }
                                        })
                                        .start();
                                }, (activeOrder * 2 + j) * 200); // 每个活跃玩家的牌依次翻
                            } else {
                                // 如果没有pokerComponent，直接增加计数
                                if (!callbackCalled) {
                                    flipCount++;
                                    if (flipCount >= actualCardsToFlip) {
                                        onAllCardsFlipped();
                                    }
                                }
                            }
                        }
                    } else {
                        // 如果没有牌节点，直接增加计数
                        if (!callbackCalled) {
                            flipCount += 2;
                            if (flipCount >= actualCardsToFlip) {
                                onAllCardsFlipped();
                            }
                        }
                    }
                    activeOrder++;
                } else {
                    // 如果没有服务端手牌数据，尝试使用本地数据
                    /*
                    const holeCards = this._cardManager.getPlayerHoleCards(i);
                    if (holeCards && holeCards.length === 2) {
                        
                        const cardNodes = this._playerCards[i];
                        if (cardNodes && cardNodes.length >= 2) {
                            for (let j = 0; j < 2; j++) {
                                const cardNode = cardNodes[j];
                                if (!cardNode) {
                                    LogService.warn('gamingPvp', `[showActivePlayersCards] 玩家 ${i} 的牌节点 ${j} 为空`);
                                    continue;
                                }
                                const poker = holeCards[j];
                                const pokerComponent = cardNode.getComponent(pokerCard);
                                
                                if (pokerComponent) {
                                    this.safeSetTimeout(() => {
                                        tween(cardNode)
                                            .to(0.2, { eulerAngles: new Vec3(0, -90, 0) })
                                            .call(() => {
                                                pokerComponent.showPoker(poker.suit, poker.point);
                                            })
                                            .by(0.2, { eulerAngles: new Vec3(0, 90, 0) })
                                            .call(() => {
                                                if (callbackCalled) return;
                                                flipCount++;
                                                if (flipCount >= actualCardsToFlip) {
                                                    onAllCardsFlipped();
                                                }
                                            })
                                            .start();
                                    }, (activeOrder * 2 + j) * 200);
                                }
                            }
                        }
                        activeOrder++;
                    }*/
                }
            }


            // 如果没有需要翻的牌，直接调用回调
            if (actualCardsToFlip === 0) {
                this.safeSetTimeout(() => {
                    onAllCardsFlipped();
                }, 100);
            }
        });
    }

    // 显示所有玩家的牌型
    showAllPlayersHandTypes() {
        const ranks = this.calculateAllPlayersHandRank();

        // 为每个玩家显示牌型
        for (const rank of ranks) {
            const playerSeat = rank.player;

            // 检查玩家是否活跃
            if (!this._playerManager.isPlayerActive(playerSeat)) {
                continue;
            }

            const handType = rank.handType;
            const handTypeName = CardManager.getHandTypeName(handType);


            // 在玩家头像上方显示牌型
            this._playerManager.showPlayerActionNearAvatar(this.playersContainer, playerSeat, handTypeName, 0);
        }
    }

    // ✅ [修改] 只使用服务端的牌型信息，不进行本地计算
    calculateAllPlayersHandRank() {
        const ranks = [];
        // 获取服务端发送的玩家数据
        const playersData = this._gameManager.getPlayersDataFromServer();

        for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
            // 检查玩家是否已弃牌
            const isFolded = this._playerManager.isPlayerFolded(i);
            if (isFolded) {
                // 已弃牌的玩家，使用最低牌力
                ranks.push({
                    player: i,
                    handType: 9, // 高牌
                    handStrength: 0
                });
            } else {
                // ✅ 只使用服务端发送的牌型信息
                const playerData = playersData ? playersData.find(p => p.seatIndex === i) : null;
                if (playerData && playerData.handTypeName && playerData.handValue !== undefined) {
                    // 使用服务端的牌型信息
                    ranks.push({
                        player: i,
                        handType: CardManager.getHandTypeFromName(playerData.handTypeName),
                        handStrength: Number(playerData.handValue)
                    });
                } else {
                    // 服务端没有发送牌型信息，使用最低牌力
                    LogService.info('gamingPvp', `[WARNING] 服务端没有发送玩家 ${i + 1} 的牌型信息`);
                    ranks.push({
                        player: i,
                        handType: 9, // 高牌
                        handStrength: 0
                    });
                }
            }
        }
        return ranks;
    }

    // 确定胜利者（支持平局）
    determineWinner(ranks) {
        // 牌型等级：0-皇家同花顺, 1-同花顺, 2-四条, 3-葫芦, 4-同花, 5-顺子, 6-三条, 7-两对, 8-一对, 9-高牌
        // 牌型等级越低，牌型越好
        let maxHandType = 10;
        let maxHandStrength = 0;
        const winners: number[] = [];

        for (const rank of ranks) {
            if (rank.handType < maxHandType) {
                maxHandType = rank.handType;
                maxHandStrength = rank.handStrength;
                winners.length = 0;
                winners.push(rank.player);
            } else if (rank.handType === maxHandType) {
                if (rank.handStrength > maxHandStrength) {
                    maxHandStrength = rank.handStrength;
                    winners.length = 0;
                    winners.push(rank.player);
                } else if (rank.handStrength === maxHandStrength) {
                    winners.push(rank.player);
                }
            }
        }

        if (winners.length === 0) {
            return { winner: 0, winners: [0] };
        }

        return { winner: winners[0], winners };
    }

    // 显示游戏结束界面
    showGameOver() {
        // 隐藏操作按钮
        if (this.playersActionNode) {
            this.playersActionNode.active = false;
        }

        // 显示开始游戏界面，让玩家可以重新开始
        const isHost = this._hostUserId && this._gameNetwork?.getUserId()?.toString() === this._hostUserId.toString();
        if (isHost) {
            this.startGameNode.active = true;
        }


        // 清理游戏状态（但保留玩家筹码）
        this._gameManager.reset();
        this._playerManager.reset();

        // 清理牌节点
        if (this.container) {
            this.container.removeAllChildren();
        }

        // 清理玩家头像
        if (this.playersContainer) {
            this.playersContainer.removeAllChildren();
        }

    }

    /**
     * 为真实玩家设置特定头像
     * @param avatarNode 头像节点
     */
    private setRealPlayerAvatar(avatarNode: Node): void {

        // 查找头像Sprite组件（通常在avatar_player预制体内部）
        const sprite = avatarNode.getComponent(Sprite);
        if (!sprite) {
            // 如果直接找不到，尝试查找子节点
            const avatarSpriteNode = avatarNode.getChildByName('avatar_player');
            if (avatarSpriteNode) {
                const childSprite = avatarSpriteNode.getComponent(Sprite);
                if (childSprite) {
                    this.loadAndSetAvatar(childSprite);
                    return;
                }
            }
            return;
        }

        this.loadAndSetAvatar(sprite);
    }

    /**
     * 加载并设置头像图片
     * 使用与卡牌相同的方式加载 spriteFrame
     */
    private loadAndSetAvatar(sprite: Sprite): void {
        if (!sprite) {
            return;
        }

        const avatarPath = 'material/avatar/avatar_8/spriteFrame';
        resources.load<SpriteFrame>(avatarPath, SpriteFrame, (err, spriteFrame) => {
            if (err) {
                return;
            }

            if (spriteFrame && sprite && sprite.node && sprite.node.isValid) {
                sprite.spriteFrame = spriteFrame;
            }
        });
    }

    /**
     * 初始化数据结构（已禁用对象池缓存）
     */
    private initializeObjectPools(): void {

        // 确保所有数据结构都被初始化
        if (!this._playerCards) {
            this._playerCards = [];
        }
        if (!this._boardCards) {
            this._boardCards = [];
        }
        if (!this._playerAvatars) {
            this._playerAvatars = new Map();
        }

        // ⚠️ 对象池已禁用，不创建任何缓存
    }

    /**
     * 清理所有玩家头像（直接销毁，不使用对象池）
     */
    private clearPlayerAvatars(): void {
        // 防御性检查：确保 _playerAvatars 是 Map
        if (!this._playerAvatars || !(this._playerAvatars instanceof Map)) {
            LogService.warn('gamingPvp', '[ObjectPool] _playerAvatars 未初始化或不是 Map，跳过清理');
            this._playerAvatars = new Map();
        } else {
            this._playerAvatars.forEach((avatarNode, seatIndex) => {
                if (avatarNode) {
                    // ✅ [修复] 先从父节点移除，再销毁，避免同名节点残留导致 getChildByName 找到旧节点
                    if (avatarNode.parent) {
                        avatarNode.removeFromParent();
                    }
                    avatarNode.destroy();
                }
            });
            this._playerAvatars.clear();
        }

        // ✅ [修复] 同时清理 playersContainer 中所有以 avatar_ 开头的子节点
        // 防止因命名不一致或 Map 未正确记录导致的头像残留
        if (this.playersContainer) {
            const childrenToRemove = [];
            for (const child of this.playersContainer.children) {
                // 清理直接子节点中以 avatar_ 开头的
                if (child.name && child.name.startsWith('avatar_')) {
                    childrenToRemove.push(child);
                }

                // 清理 avatar 容器中的子节点
                if (child.name === 'avatar') {
                    for (const grandChild of child.children) {
                        if (grandChild.name && grandChild.name.startsWith('avatar_')) {
                            childrenToRemove.push(grandChild);
                        }
                    }
                }
            }
            for (const child of childrenToRemove) {
                // ✅ [修复] 先从父节点移除，再销毁
                if (child.parent) {
                    child.removeFromParent();
                }
                child.destroy();
            }
        }
    }

    // 真实玩家点击头像时搓牌（错开手牌位置）
    onAvatarClicked() {
        const playerSeat = this._playerManager.getPlayerSeat();

        // 只有真实玩家才需要此功能
        if (this._playerManager.isAIPlayer(playerSeat)) {
            return;
        }


        const cardNodes = this._playerCards[playerSeat];
        if (!cardNodes || cardNodes.length < 2) {
            return;
        }

        // 检查是否已经错开（如果已经错开则恢复，否则执行错开）
        if (this._cardPresenter && this._cardPresenter.isCardsOffset(playerSeat)) {
            // 已经错开，恢复原始位置
            this._cardPresenter.resetPlayerCardsPosition(playerSeat);
        } else {
            // 未错开，执行搓牌操作
            const playerPos = this.getPlayersPosition();
            const playerVisualPos = playerPos.find(pos => pos.actualSeat === playerSeat);
            if (playerVisualPos) {
                this._cardPresenter?.offsetPlayerCards(playerSeat, playerVisualPos.x, playerVisualPos.y);
            }
        }
    }

    // ====== PVP准备状态相关方法 ======

    /**
     * 显示准备完毕按钮（现在在玩家头像中）
     */
    private showReadyButton() {
        this.updatePlayerAvatarReadyButtons(true, false);
        this._showReadyButton = true;
    }

    /**
     * 隐藏准备完毕按钮（现在在玩家头像中）
     */
    private hideReadyButton() {
        this.updatePlayerAvatarReadyButtons(false, false);
        this._showReadyButton = false;
    }

    /**
     * 隐藏取消准备按钮（现在在玩家头像中）
     */
    private hideCancelReadyButton() {
        // 取消准备按钮现在在玩家头像中
        this.updatePlayerAvatarReadyButtons(false, true);
    }

    /**
     * 显示退出按钮
     */
    private showExitBtn() {
        if (this.exitBtn) {
            this.exitBtn.active = true;
        } else {
            LogService.warn('gamingPvp', '未找到 exitBtn 节点');
        }
    }

    /**
     * 隐藏退出按钮
     */
    private hideExitBtn() {
        if (this.exitBtn) {
            this.exitBtn.active = false;
        } else {
            LogService.warn('gamingPvp', '未找到 exitBtn 节点');
        }
    }

    /**
     * 检查是否所有活跃玩家都已准备
     */
    private checkAllPlayersReady(): boolean {
        const playersNum = this._playerManager.getPlayersNum();

        if (playersNum < 2) {
            return false;
        }

        for (let i = 0; i < playersNum; i++) {
            if (this._playerManager.isPlayerActive(i) && !this._playerReadyStatus.get(i)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 重置所有玩家的准备状态
     */
    private resetReadyStatus() {
        // ✅ [修复] 检查 _playerReadyStatus 是否为 null 或 undefined
        if (this._playerReadyStatus) {
            this._playerReadyStatus.clear();
        }
        this._showReadyButton = false;
        // ✅ [修复] 同时重置当前玩家的准备状态，防止结算后状态残留
        this._isCurrentPlayerReady = false;
        // ✅ [新增] 同时重置 PlayerManager 的准备状态（确保两个数据源同步）
        this._playerManager?.clearReadyStates();
    }

    /**
     * 设置玩家准备状态（用于接收服务端通知）
     */
    setPlayerReady(seatIndex: number, ready: boolean) {
        this._playerReadyStatus.set(seatIndex, ready);

        // ✅ [新增] 同时更新 PlayerManager 的准备状态（确保两个数据源同步）
        const userId = (this._playerManager as any)._seatToUserId.get(seatIndex);
        if (userId) {
            this._playerManager.setPlayerReady(userId, ready);
        }

        // 如果自己是房主且所有玩家都已准备，显示 deal 按钮
        if (this._isRoomOwner && this._isGameEnded && this.checkAllPlayersReady()) {
            this.showDealButton();
        }
    }

    /**
     * 设置是否是房主
     */
    setIsRoomOwner(isOwner: boolean) {
        this._isRoomOwner = isOwner;
    }

    /**
     * 显示Deal按钮（只有房主才能看到）
     */
    private showDealButton() {

        LogService.info('gamingPvp', `showDealButton: 开始显示, _isRoomOwner=${this._isRoomOwner}, _startGameBtn=${this._startGameBtn ? '存在' : 'null'}, _roomId=${this._roomId}`);

        if (!this._isRoomOwner) {
            LogService.warn('gamingPvp', 'showDealButton: 当前不是房主，不显示按钮');
            return;
        }

        if (this._maskNode && this._maskNode.active) {
            this._maskNode.active = false;
            LogService.info('gamingPvp', 'showDealButton: 隐藏 _maskNode 以确保开始按钮可见');
        }

        if (this._startGameBtn) {
            this._startGameBtn.active = true;
            const parent = this._startGameBtn.parent;
            if (parent && parent.name === 'start') {
                parent.active = true;
            }
            LogService.info('gamingPvp', `showDealButton: 已通过 _startGameBtn 显示按钮, parent.name=${parent?.name}, parent.active=${parent?.active}`);
        } else {
            const dealNode = this.findDealNode();
            if (dealNode) {
                dealNode.active = true;
                this._startGameBtn = dealNode;
                const parent = dealNode.parent;
                if (parent && parent.name === 'start') {
                    parent.active = true;
                }
                const buttonComp = dealNode.getComponent(Button);
                if (buttonComp && !dealNode.hasEventListener('click')) {
                    dealNode.on('click', this.onStartGameClicked, this);
                }
                LogService.info('gamingPvp', 'showDealButton: 通过 findDealNode 找到并显示 deal 按钮');
            } else {
                LogService.error('gamingPvp', 'showDealButton: 所有方式均未找到 deal 节点！');
                
                // ✅ [增强] 如果找不到 deal 节点，尝试查找并显示 start 节点（整个开始区域）
                const startNode = find('start');
                if (startNode) {
                    startNode.active = true;
                    LogService.info('gamingPvp', 'showDealButton: 未找到 deal 节点，但找到并显示了 start 节点');
                    
                    // 再次尝试从 start 节点下查找 deal
                    const dealInStart = startNode.getChildByName('deal');
                    if (dealInStart) {
                        dealInStart.active = true;
                        this._startGameBtn = dealInStart;
                        const buttonComp = dealInStart.getComponent(Button);
                        if (buttonComp && !dealInStart.hasEventListener('click')) {
                            dealInStart.on('click', this.onStartGameClicked, this);
                        }
                        LogService.info('gamingPvp', 'showDealButton: 在 start 节点下找到并显示了 deal 按钮');
                    }
                }
            }
        }
    }
}
