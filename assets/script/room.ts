import { LogService } from './utils/LogService';
import { _decorator, Component, Node, director, Button, view, UITransform, Sprite, SpriteFrame, resources, Label, EditBox, Toggle } from 'cc';
import { ScreenAdapter } from './utils/ScreenAdapter';
import { GameNetwork } from './net/GameNetwork';
import { RoomMaxPlayers, RoomRounds, RoomRuleType, RoomAnte, RoomConfigMapper, ResponseCode } from './types';
import { SettingsManager } from './managers/SettingsManager';
import { UserInfoManager } from './managers/UserInfoManager';
import { ToastManager } from './components/Toast/ToastManager';
import { LoadingManager } from './components/Loading/LoadingManager';
import { DialogManager } from './components/Dialog/dialogManager';
import { SceneLoader } from './managers/SceneLoader';
import { NetworkEvent } from './net/NetworkEvent';
import { EventBus } from './utils/EventBus';
const { ccclass, property } = _decorator;

@ccclass('room')
export class room extends Component {
    @property({ type: Node })
    public pvpBtn: Node = null;

    @property({ type: Node })
    public pveBtn: Node = null;

    @property({ type: Node })
    public createBtn: Node = null;

    @property({ type: Node })
    public joinBtn: Node = null;

    // 创建房间配置选项
    private selectedMaxPlayersOption: RoomMaxPlayers = RoomMaxPlayers.OPTION_2_5;
    private selectedRoundsOption: RoomRounds = RoomRounds.ROUNDS_10;
    private selectedRuleTypeOption: RoomRuleType = RoomRuleType.SCORE_MODE;
    private selectedAnteOption: RoomAnte = RoomAnte.ANTE_10;
    private _isLoadingScene: boolean = false;

    @property({ type: Node })
    public roomTitle: Node = null;

    @property({ type: Node })
    public createRoom: Node = null;

    @property({ type: Node })
    public createRoomBtn: Node = null;

    @property({ type: Node })
    public joinRoom: Node = null;

    @property({ type: Node })
    public roomNumber: Node = null;

    @property({ type: Node })
    public joinRoomBtn: Node = null;

    @property({ type: Node })
    public returnBtn: Node = null;

    @property({ type: Label })
    public roomCardValue: Label = null;

    @property(EditBox)
    editBox: EditBox = null!;

    @property([Label])
    labels: Label[] = [];

    maxLength = 4;


    start() {
        // ✅ [新增] 检查登录状态，如果未登录或WebSocket未连接，返回index场景
        const userInfoManager = UserInfoManager.getInstance();
        if (!userInfoManager.canAccessFeatures()) {
            // LogService.warn('room', '⚠️ WebSocket 未连接或未登录，即将返回 index 场景');
            this.scheduleOnce(() => {
                SceneLoader.getInstance().loadScene('index');
            }, 0.5);
            return;
        }

        // ✅ 1. 打印组件状态


        // ✅ 2. 初始化网络连接

        this.initNetwork();
        // ✅ 3. 屏幕适配

        ScreenAdapter.getInstance().adaptToScreen(this.node);
        // ✅ 4. 初始化 UI 状态

        this.initUIState();
        // ✅ 5. 绑定事件

        this.bindEvents();
        // ✅ 6. 设置房间配置选择器

        this.setupRoomConfigToggles();

        // ✅ 进入场景时刷新当前地址的房卡余额
        this.refreshRoomCardBalance();
    }

    onLoad() {
         // 创建房间回调
        EventBus.getInstance().on(NetworkEvent.CreateRoom, this.createRoomCallback, this);
        // 加入房间回调
        EventBus.getInstance().on(NetworkEvent.JoinRoom, this.joinRoomCallback, this);
        
        this.editBox.string = "";
        // 绑定 EditBox 的文本变化事件
        if (this.editBox) {
            this.editBox.node.on(EditBox.EventType.TEXT_CHANGED, this.onTextChanged, this);
        }
        this.refresh("");
    }

    private onTextChanged() {

        let str = this.editBox.string;

        // 只允许数字
        str = str.replace(/\D/g, "");

        if (str.length > this.maxLength) {
            str = str.substring(0, this.maxLength);
        }

        // this.editBox.string = str;

        this.refresh(str);

        if (str.length == this.maxLength) {
            // JoinRoom(str)
        }
    }

    private refresh(str: string) {

        for (let i = 0; i < this.labels.length; i++) {

            this.labels[i].string = str[i] ?? "";
        }
    }


    /**
     * 从服务端刷新当前地址的房卡余额
     */
    private async refreshRoomCardBalance(): Promise<void> {
        try {
            await GameNetwork.getInstance().fetchRoomCardBalance();
        } catch (error) {
            // LogService.warn('room', '刷新房卡余额失败:', error);
        }
    }

    /**
     * ✅ [新增] 初始化 UI 状态
     */
    private initUIState() {
        // 隐藏加入房间面板，显示创建房间面板
        if (this.joinRoom) {
            this.joinRoom.active = false;
        }
        if (this.createRoom) {
            this.createRoom.active = true;
        }

        // 清空房间号输入框
        if (this.roomNumber) {
            const editBox = this.roomNumber.getComponent(EditBox);
            if (editBox) {
                editBox.string = '';
            }
        }
    }

    /**
     * ✅ [新增] 绑定事件
     */
    private bindEvents() {
        if (this.pvpBtn) {
            this.pvpBtn.on('click', this.onPvpButtonClick, this);
        }

        if (this.pveBtn) {
            this.pveBtn.on('click', this.onPveButtonClick, this);
        }

        if (this.createBtn) {
            this.createBtn.on('click', this.onCreateButtonClick, this);
        }

        if (this.joinBtn) {
            this.joinBtn.on('click', this.onJoinButtonClick, this);
        }

        if (this.joinRoomBtn) {
            this.joinRoomBtn.on('click', this.onEnterRoomClick, this);
        }

        if (this.createRoomBtn) {
            const btn = this.createRoomBtn.getComponent(Button);
            if (btn) {
                this.createRoomBtn.on('click', this.onCreateRoomBtnClick, this);
            }
        }

        if (this.returnBtn) {
            this.returnBtn.on('click', this.onReturnButtonClick, this);
        }
    }

    update(deltaTime: number) {

    }

    private setupRoomConfigToggles() {
        // ✅ [修正] 初始化房卡显示
        this.updateRoomCardValue();

        // 绑定人数选择 ToggleGroup
        const peoplesGroup = this.createRoom?.getChildByName('peoples')?.getChildByName('ToggleGroup');
        if (peoplesGroup) {
            this.bindToggleGroup(peoplesGroup, (index) => {
                this.selectedMaxPlayersOption = index as RoomMaxPlayers;
                // ✅ [新增] 人数改变时更新房卡费用
                this.updateRoomCardValue();
            });
        }

        // 绑定局数选择 ToggleGroup
        const roundsGroup = this.createRoom?.getChildByName('rounds')?.getChildByName('ToggleGroup');
        if (roundsGroup) {
            this.bindToggleGroup(roundsGroup, (index) => {
                this.selectedRoundsOption = index as RoomRounds;
                // ✅ [新增] 局数改变时更新房卡费用
                this.updateRoomCardValue();
            });
        }

        // 绑定规则选择 ToggleGroup
        const ruleGroup = this.createRoom?.getChildByName('rule')?.getChildByName('ToggleGroup');
        if (ruleGroup) {
            this.bindToggleGroup(ruleGroup, (index) => {
                this.selectedRuleTypeOption = index as RoomRuleType;
                // ✅ [新增] 规则改变时更新房卡费用（如果规则类型影响房卡费用）
                this.updateRoomCardValue();
            });
        }

        // 绑定底注选择 ToggleGroup
        const anteGroup = this.createRoom?.getChildByName('ante')?.getChildByName('ToggleGroup');
        if (anteGroup) {
            // 动态设置底注选项文本，确保只有3个正确选项
            this.setupAnteOptions(anteGroup);

            this.bindToggleGroup(anteGroup, (index) => {
                this.selectedAnteOption = index as RoomAnte;
                // ✅ [新增] 底注改变时更新房卡费用
                this.updateRoomCardValue();
            });
        }
    }

    // 设置底注选项
    private setupAnteOptions(toggleGroup: Node) {
        // 正确的底注选项应该只有3个：10, 50, 100
        const anteValues = [10, 50, 100];
        const children = toggleGroup.children;

        children.forEach((child, index) => {
            // 只处理前3个选项，隐藏多余的选项
            if (index >= anteValues.length) {
                child.active = false;
                return;
            }

            // 尝试多种方式获取 Label 组件
            let label: Label | null = null;

            // 方式1: 直接获取子节点 Label
            const labelNode = child.getChildByName('Label');
            if (labelNode) {
                label = labelNode.getComponent(Label);
            }

            // 方式2: 如果没有找到 Label，尝试获取第一个子节点
            if (!label) {
                const firstChild = child.children[0];
                if (firstChild) {
                    label = firstChild.getComponent(Label);
                }
            }

            // 方式3: 直接获取 Toggle 节点上的 Label 组件
            if (!label) {
                label = child.getComponent(Label);
            }

            if (label) {
                label.string = String(anteValues[index]);
            }

            child.active = true;
        });
    }

    private bindToggleGroup(toggleGroup: Node, callback: (index: number) => void) {
        toggleGroup.children.forEach((child, index) => {
            const toggle = child.getComponent(Toggle);
            if (toggle) {
                toggle.node.on('toggle', () => {
                    if (toggle.isChecked) {
                        callback(index);
                    }
                }, this);
            }
        });
    }

    onPvpButtonClick() {
        if (SceneLoader.getInstance().isLoading()) return;
        SceneLoader.getInstance().loadScene('scene_pvp');
    }

    onPveButtonClick() {
        SceneLoader.getInstance().loadScene('scene');
    }

    onReturnButtonClick() {
        SceneLoader.getInstance().loadScene('index');
    }

    onCreateButtonClick() {
        const sprite = this.roomTitle?.getComponent(Sprite);
        if (sprite) {
            resources.load('material/texture/tabs-chuanjianfangjian/spriteFrame', SpriteFrame, (err, frame) => {
                if (!err && frame) {
                    sprite.spriteFrame = frame;
                }
            });
        }

        if (this.createRoom) {
            this.createRoom.active = true;
        }
        if (this.joinRoom) {
            this.joinRoom.active = false;
        }
    }

    private initNetwork() {
        const gameNetwork = GameNetwork.getInstance();

        // 设置重连失败回调
        gameNetwork.setOnReconnectFailed(() => {
            LogService.error('room', '❌ WebSocket 重连失败，返回大厅');

            DialogManager.show({
                title: '网络连接失败',
                content: '网络连接已断开，重连失败，请检查网络后重新登录',
                confirmText: '确定',
            });

            gameNetwork.disconnect();
            SceneLoader.getInstance().loadScene('index');
        });

        // 加入房间回调
        // gameNetwork.setOnJoinRoom((data) => {
        //     if (data.code === ResponseCode.SUCCESS) {
        //         // 加入成功
        //         this.loadPvpScene()
        //     } else {
        //         LoadingManager.hide();
        //         DialogManager.show({
        //             title: '提示',
        //             content: data.msg || data.message || '加入房间失败',
        //             confirmText: '确定',
        //         })
        //         LogService.error('room', '加入房间失败:', data.msg || data.message);
        //     }
        // });

        // 检查是否已经登录并且 WebSocket 已连接
        if (gameNetwork.isConnected() && gameNetwork.getWalletAddress()) {
            return;
        }

        // WebSocket 未连接或未登录，返回 index 场景
        this.scheduleOnce(() => {
            SceneLoader.getInstance().loadScene('index');
        }, 0.5);
    }

    /**
     * ✅ [新增] 重置游戏状态
     * 确保从其他场景（如 PVP）退出后进入 room 场景时，所有状态都被正确重置
     * 
     * ⚠️ 注意：不会断开已有的 WebSocket 连接，保留已登录状态
     */
    private resetGameState() {

        const gameNetwork = GameNetwork.getInstance();

        // 1. 重置房间相关状态
        gameNetwork.resetRoomId();

        // ✅ [修复] 不再断开 WebSocket 连接
        // 如果已经登录，保留现有连接，避免重复签名
        if (gameNetwork.isConnected()) {
        }

        // 2. 重置房间配置
        gameNetwork.setRoomConfig(null);

        // 3. 重置 UI 状态
        this.resetUIState();

    }

    /**
     * ✅ [新增] 重置 UI 状态
     */
    private resetUIState() {

        // 重置输入框
        if (this.roomNumber) {
            const editBox = this.roomNumber.getComponent(EditBox);
            if (editBox) {
                editBox.string = '';
            }
        }

        // 重置选择的配置
        this.selectedMaxPlayersOption = RoomMaxPlayers.OPTION_2_5;
        this.selectedRoundsOption = RoomRounds.ROUNDS_10;
        this.selectedRuleTypeOption = RoomRuleType.SCORE_MODE;
        this.selectedAnteOption = RoomAnte.ANTE_10;

        // 重置房间面板显示状态
        if (this.createRoom) {
            this.createRoom.active = true;
        }
        if (this.joinRoom) {
            this.joinRoom.active = false;
        }
    }

    private tryCreateRoom() {

        // 获取选择的配置
        const maxPlayers = RoomConfigMapper.getMaxPlayers(this.selectedMaxPlayersOption);
        const rounds = RoomConfigMapper.getRounds(this.selectedRoundsOption);
        const ruleType = RoomConfigMapper.getRuleType(this.selectedRuleTypeOption);
        const ante = RoomConfigMapper.getAnte(this.selectedAnteOption);
        const smallBlind = ante;
        const bigBlind = ante * 2;

        if (SceneLoader.getInstance().isLoading()) return;
        LoadingManager.show('正在创建房间...');

        const requestData = {
            gameType: 'TEXAS',
            roomType: 'PVP',
            minPlayers: RoomConfigMapper.getMinPlayers(this.selectedMaxPlayersOption),
            maxPlayers: maxPlayers,
            rounds: rounds,
            ruleType: ruleType,
            ante: ante,
            smallBlind: smallBlind,
            bigBlind: bigBlind,
            initialScore: RoomConfigMapper.getInitialScore(this.selectedRuleTypeOption),
            maxPlayersOption: this.selectedMaxPlayersOption,
            roundsOption: this.selectedRoundsOption,
            ruleTypeOption: this.selectedRuleTypeOption,
            anteOption: this.selectedAnteOption
        };

         GameNetwork.getInstance().setRoomConfig(requestData);
         GameNetwork.getInstance().setRoomType('PVP');

        GameNetwork.getInstance().createRoom()

        // SceneLoader.getInstance().preloadScene('scene_pvp', (completedCount, totalCount, item) => {
        // }, (error) => {
        //     if (error) {
        //         LogService.error('room', '预加载 scene_pvp 场景失败:', error);
        //         LoadingManager.hide();
        //         DialogManager.show({
        //             title: '提示',
        //             content: '场景加载失败，请重试',
        //             confirmText: '确定',
        //         });
        //         return;
        //     }

        //     // ✅ [关键修复] 设置房间配置，等待场景加载完成后再创建房间
        //     // 这样可以确保 gamingPvp.ts 已经初始化，能够正确处理服务端消息
        //     const requestData = {
        //         gameType: 'TEXAS',
        //         roomType: 'PVP',
        //         minPlayers: RoomConfigMapper.getMinPlayers(this.selectedMaxPlayersOption),
        //         maxPlayers: maxPlayers,
        //         rounds: rounds,
        //         ruleType: ruleType,
        //         ante: ante,
        //         smallBlind: smallBlind,
        //         bigBlind: bigBlind,
        //         initialScore: RoomConfigMapper.getInitialScore(this.selectedRuleTypeOption),
        //         maxPlayersOption: this.selectedMaxPlayersOption,
        //         roundsOption: this.selectedRoundsOption,
        //         ruleTypeOption: this.selectedRuleTypeOption,
        //         anteOption: this.selectedAnteOption
        //     };

        //     GameNetwork.getInstance().setRoomConfig(requestData);
        //     GameNetwork.getInstance().setRoomType('PVP');

        //     // 加载场景，场景加载完成后由 gamingPvp.ts 负责创建房间
        //     SceneLoader.getInstance().loadScene('scene_pvp', () => {
        //         LoadingManager.hide();
        //     });
        // });
    }

    private createRoomCallback(data: any) {
        if (data.code === ResponseCode.SUCCESS) {
            // 加入成功
            this.loadPvpScene()
        } else {
            LoadingManager.hide();
            DialogManager.show({
                title: '提示',
                content: data.msg || data.message || '创建房间失败',
                confirmText: '确定',
            })
            LogService.error('room', '创建房间失败:', data.msg || data.message);
        }
    }

    private joinRoomCallback(data: any) {
        if (data.code === ResponseCode.SUCCESS) {
            // 加入成功
            this.loadPvpScene()
        } else {
            LoadingManager.hide();
            DialogManager.show({
                title: '提示',
                content: data.msg || data.message || '加入房间失败',
                confirmText: '确定',
            })
            LogService.error('room', '加入房间失败:', data.msg || data.message);
        }
    }

    onJoinButtonClick() {
        const sprite = this.roomTitle?.getComponent(Sprite);
        if (sprite) {
            resources.load('material/texture/tabs-jiarufangjian/spriteFrame', SpriteFrame, (err, frame) => {
                if (!err && frame) {
                    sprite.spriteFrame = frame;
                }
            });
        }

        if (this.joinRoom) {
            this.joinRoom.active = true;
        }
        if (this.createRoom) {
            this.createRoom.active = false;
        }

        // 修复：joinBtn 仅用于显示加入房间面板，不直接加入房间
        // 真正的加入房间操作由 joinRoomBtn 触发
    }

    private tryJoinRoom() {
        const editBox = this.roomNumber?.getComponent(EditBox);
        if (editBox) {
            const roomCode = editBox.string || '';

            if (roomCode && /^\d+$/.test(roomCode)) {
                if (SceneLoader.getInstance().isLoading()) return;
                LoadingManager.show('正在进入房间...');
                // 先加入房间
                GameNetwork.getInstance().joinRoom(roomCode, 'PVP', 'Player', '');
                // 

                // SceneLoader.getInstance().preloadScene('scene_pvp', (completedCount, totalCount, item) => {
                // }, (error) => {
                //     if (error) {
                //         LogService.error('room', '预加载 scene_pvp 场景失败:', error);
                //         LoadingManager.hide();
                //         DialogManager.show({
                //             title: '提示',
                //             content: '场景加载失败，请重试',
                //             confirmText: '确定',
                //         });
                //         return;
                //     }

                //     // ✅ [关键修复] 设置房间号，等待场景加载完成后再加入房间
                //     // 这样可以确保 gamingPvp.ts 已经初始化，能够正确处理服务端消息
                //     GameNetwork.getInstance().setPendingJoinRoomId(parseInt(roomCode));
                //     GameNetwork.getInstance().setRoomCode(roomCode);

                //     // 加载场景，场景加载完成后由 gamingPvp.ts 负责加入房间
                //     SceneLoader.getInstance().loadScene('scene_pvp', () => {
                //         LoadingManager.hide();
                //     });
                // });
            } else {
                DialogManager.show({
                    title: '提示',
                    content: '请输入有效的房间号（仅数字）',
                    confirmText: '确定',
                })
                //ToastManager.show('请输入有效的房间号（仅数字）')
            }
        }
    }

    /**
     * ✅ [修正] 计算房卡费用 - 与服务端逻辑保持一致
     * 规则：默认配置消耗1张房卡，选择任何非默认选项消耗2张房卡
     * 非默认选项包括：
     *   - 人数：2-7 或 2-9（不是2-5）
     *   - 局数：15局 或 20局（不是10局）
     *   - 规则：代币模式（TOKEN_MODE）
     */
    private calculateRoomCardCost(): number {
        // 默认消耗1张房卡
        let cost = 1;

        // 检查是否选择了非默认选项
        const isNonDefaultPlayers = this.selectedMaxPlayersOption !== RoomMaxPlayers.OPTION_2_5;
        const isNonDefaultRounds = this.selectedRoundsOption !== RoomRounds.ROUNDS_10;
        const isTokenMode = this.selectedRuleTypeOption === RoomRuleType.TOKEN_MODE;

        // 如果选择了任何非默认选项，消耗2张房卡
        if (isNonDefaultPlayers || isNonDefaultRounds || isTokenMode) {
            cost = 2;
        }

        return cost;
    }

    /**
     * ✅ [新增] 获取当前选择的玩家数量
     */
    private getSelectedMaxPlayers(): number {
        switch (this.selectedMaxPlayersOption) {
            case RoomMaxPlayers.OPTION_2_5:
                return 5;
            case RoomMaxPlayers.OPTION_2_7:
                return 7;
            case RoomMaxPlayers.OPTION_2_9:
                return 9;
            default:
                return 5;
        }
    }

    /**
     * ✅ [新增] 获取当前选择的底注值
     */
    private getSelectedAnte(): number {
        switch (this.selectedAnteOption) {
            case RoomAnte.ANTE_10:
                return 10;
            case RoomAnte.ANTE_50:
                return 50;
            case RoomAnte.ANTE_100:
                return 100;
            default:
                return 10;
        }
    }

    /**
     * ✅ [新增] 获取当前选择的局数
     */
    private getSelectedRounds(): number {
        switch (this.selectedRoundsOption) {
            case RoomRounds.ROUNDS_10:
                return 10;
            case RoomRounds.ROUNDS_15:
                return 15;
            case RoomRounds.ROUNDS_20:
                return 20;
            default:
                return 10;
        }
    }

    /**
     * ✅ [新增] 更新房卡显示
     * 根据当前选择的配置计算并更新房卡费用显示
     */
    private updateRoomCardValue(): void {
        if (this.roomCardValue) {
            const cost = this.calculateRoomCardCost();
            this.roomCardValue.string = cost.toString();
        }
    }

    async onCreateRoomBtnClick() {
        const requiredCard = this.calculateRoomCardCost();
        const userInfoManager = UserInfoManager.getInstance();

        // 创建房间前从服务端获取当前地址的真实房卡余额
        try {
            await GameNetwork.getInstance().fetchRoomCardBalance();
        } catch (error) {
            ToastManager.show('获取房卡余额失败，请稍后再试')
            // this.showErrorTip('获取房卡余额失败，请稍后再试');
            LogService.warn('room', '获取房卡余额失败:', error);
            return;
        }

        const checkResult = userInfoManager.checkCreateRoomConditions(requiredCard);

        if (!checkResult.canCreate) {
            DialogManager.show({
                title: '提示',
                content: checkResult.reason || '无法创建房间',
                confirmText: '确定',
            });
            // ToastManager.show(checkResult.reason || '无法创建房间')
            // this.showErrorTip(checkResult.reason || '无法创建房间');
            LogService.warn('room', `创建房间失败: ${checkResult.reason}`);
            return;
        }
        this.tryCreateRoom();
    }

    onEnterRoomClick() {
        this.tryJoinRoom();
    }

    // 加载场景
    loadPvpScene() {
        if (SceneLoader.getInstance().isLoading()) return;
        LoadingManager.show('正在进入房间...');
        SceneLoader.getInstance().preloadScene('scene_pvp', (completedCount, totalCount, item) => {
        }, (error) => {
            if (error) {
                LogService.error('room', `预加载 scene_pvp 场景失败:`, error);
                LoadingManager.hide();
                DialogManager.show({
                    title: '提示',
                    content: '场景加载失败，请重试',
                    confirmText: '确定',
                });
                return;
            }

            // ✅ [关键修复] 设置房间号，等待场景加载完成后再加入房间
            // 这样可以确保 gamingPvp.ts 已经初始化，能够正确处理服务端消息
            const roomCode = this.roomNumber?.getComponent(EditBox)?.string || '';
            GameNetwork.getInstance().setPendingJoinRoomId(parseInt(roomCode));
            GameNetwork.getInstance().setRoomCode(roomCode);


            SceneLoader.getInstance().loadScene('scene_pvp', () => {
                LoadingManager.hide();
            });
        });
    }

    onDestroy() {
        // 移除事件监听，避免内存泄漏
        EventBus.getInstance().off(NetworkEvent.CreateRoom, this.createRoomCallback, this);
        EventBus.getInstance().off(NetworkEvent.JoinRoom, this.joinRoomCallback, this);
    }
}
