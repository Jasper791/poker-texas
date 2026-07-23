import { _decorator, Component, Node, ScrollView, Button, director, Sprite, SpriteFrame, resources, Label, instantiate, Prefab, UITransform, Layout, Color } from 'cc';
const { ccclass, property } = _decorator;
import { GameNetwork } from './net/GameNetwork';
import { ScreenAdapter } from './utils/ScreenAdapter';
import { LogService } from './utils/LogService';
import { CommandType } from './net/Protocol';
import { SettlementItem } from '../Prefabs/SettlementItem';
import { item } from '../Prefabs/item';
import { SceneLoader } from './managers/SceneLoader';
@ccclass('Record')
export class Record extends Component {
    /** 返回按钮 */
    @property(Node)
    returnBtn: Node = null!;

    /** 滚动视图 */
    @property(ScrollView)
    scrollView: ScrollView = null!;

    // ✅ 面板切换相关属性
    @property({ type: Node, tooltip: '详情按钮' })
    detailBtn: Node = null!;

    @property({ type: Node, tooltip: '其他按钮' })
    otherBtn: Node = null!;

    @property({ type: Node, tooltip: '详情面板' })
    detailPanel: Node = null!;

    @property({ type: Node, tooltip: '其他面板' })
    otherPanel: Node = null!;

    @property({ type: Node, tooltip: '标题节点' })
    recordTitle: Node = null!;

    // ✅ 房间列表相关属性
    @property({ type: Prefab, tooltip: '房间列表项预制体' })
    roomItemPrefab: Prefab = null!;

    @property({ type: Node, tooltip: 'ScrollView的content节点' })
    contentNode: Node = null!;

    // ✅ 结算记录相关属性
    @property({ type: ScrollView, tooltip: '其他面板的ScrollView' })
    settlementScrollView: ScrollView = null!;

    @property({ type: Node, tooltip: '结算记录ScrollView的content节点' })
    settlementContentNode: Node = null!;

    @property({ type: Prefab, tooltip: '结算记录项预制体' })
    settlementItemPrefab: Prefab = null!;

    /** 用户钱包地址 */
    private _walletAddress: string = '';

    /** 用户ID */
    private _userId: number = 0;

    /** 房间ID（可选，从其他场景传递） */
    private _roomId: number = 0;

    /** 房间显示码（可选，从其他场景传递） */
    private _roomCode: string = '';

    onLoad() {
        // ✅ 检查连接状态
        const gameNetwork = GameNetwork.getInstance();

        // 如果未连接或未登录，返回 index 场景
        if (!gameNetwork.isConnected() || !gameNetwork.getWalletAddress()) {
           
            this.scheduleOnce(() => {
                SceneLoader.getInstance().loadScene('index');
            }, 0.5);
            return;
        }

        // 获取传递的参数（优先从全局对象获取，兼容旧方式）
        const recordParams = (window as any).recordParams;
        if (recordParams) {
            this._userId = recordParams.userId || gameNetwork.getUserId();
            this._walletAddress = recordParams.walletAddress || gameNetwork.getWalletAddress() || '';
            this._roomId = recordParams.roomId || 0;
            this._roomCode = recordParams.roomCode || '';
        } else {
            this._userId = gameNetwork.getUserId();
            this._walletAddress = gameNetwork.getWalletAddress() || '';

            // ✅ 获取可选的房间参数（从其他场景传递）
            const roomIdParam = gameNetwork.getRoomId();
            const roomCodeParam = gameNetwork.getRoomCode();
            if (roomIdParam) {
                this._roomId = roomIdParam;
            }
            if (roomCodeParam) {
                this._roomCode = roomCodeParam;
            }
        }

      
        // 绑定返回按钮事件
        if (this.returnBtn) {
            const button = this.returnBtn.getComponent(Button);
            if (button) {
                button.clickEvents = [];
                this.returnBtn.on('click', this._onReturnClick, this);
            }
        }

        // ✅ 绑定面板切换按钮
        if (this.detailBtn) {
            const detailBtnComp = this.detailBtn.getComponent(Button);
            if (detailBtnComp) {
                detailBtnComp.clickEvents = []; // 清空原有事件
                this.detailBtn.on('click', this.onDetailBtnClick, this);
                
            } else {
               
            }
        } else {
           
        }

        if (this.otherBtn) {
            const otherBtnComp = this.otherBtn.getComponent(Button);
            if (otherBtnComp) {
                otherBtnComp.clickEvents = []; // 清空原有事件
                this.otherBtn.on('click', this.onOtherBtnClick, this);
               
            } else {
               
            }
        } else {
           
        }

        // ✅ 初始化：显示详情面板，隐藏其他面板
        this.showDetailPanel();

        // ✅ 设置 ScrollView 白色背景
        this.setScrollViewWhiteBackground();
        this.setSettlementScrollViewWhiteBackground();

        // ✅ 注册 WebSocket 消息监听器
        this.registerMessageListener();

        // ✅ 自动查找 contentNode（如果未绑定）
        this.autoFindContentNode();
        // ✅ 自动查找 settlementContentNode（如果未绑定）
        this.autoFindSettlementContentNode();
    }

    /**
     * ✅ 自动查找 contentNode
     */
    private autoFindContentNode() {
        // 如果已经绑定，不需要查找
        if (this.contentNode) {
           // LogService.debug('record', 'contentNode 已绑定');
            return;
        }

        // 方式1: 尝试从 scrollView 获取 content（最可靠）
        if (this.scrollView) {
            this.contentNode = this.scrollView.content;
            if (this.contentNode) {
               
                return;
            }
        }

        // 方式2: 尝试从父节点查找 ScrollView（this.node 可能是 recordNode）
        const scrollViewNode = this.node.getChildByName('ScrollView');
        if (scrollViewNode) {
            const view = scrollViewNode.getChildByName('view');
            if (view) {
                this.contentNode = view.getChildByName('content');
                if (this.contentNode) {
                   
                    return;
                }
            }
        }

        // 方式3: 尝试从 detailPanel 查找
        const detailPanel = this.node.getChildByName('detailPanel');
        if (detailPanel) {
            const svNode = detailPanel.getChildByName('ScrollView');
            if (svNode) {
                const view = svNode.getChildByName('view');
                if (view) {
                    this.contentNode = view.getChildByName('content');
                    if (this.contentNode) {
                        
                        return;
                    }
                }
            }
        }

        // 方式4: 尝试从 Canvas 查找（完整路径）
        let canvas = this.node;
        while (canvas && canvas.name !== 'Canvas') {
            canvas = canvas.parent;
        }
        if (canvas) {
            const recordNode = canvas.getChildByName('recordNode');
            if (recordNode) {
                const dp = recordNode.getChildByName('detailPanel');
                if (dp) {
                    const svNode = dp.getChildByName('ScrollView');
                    if (svNode) {
                        const view = svNode.getChildByName('view');
                        if (view) {
                            this.contentNode = view.getChildByName('content');
                            if (this.contentNode) {
                               
                                return;
                            }
                        }
                    }
                }
            }
        }

        // 方式5: 递归查找所有 ScrollView 的 content
        this.findContentNodeRecursive(this.node);
        
        if (!this.contentNode) {
           
        }
    }

    /**
     * 递归查找 contentNode
     */
    private findContentNodeRecursive(node: Node) {
        if (this.contentNode) return;
        
        if (node.name === 'content') {
            const parent = node.parent;
            if (parent && parent.name === 'view') {
                const grandParent = parent.parent;
                if (grandParent && grandParent.name === 'ScrollView') {
                    this.contentNode = node;
                    //LogService.info('record', '通过递归查找找到 contentNode');
                    return;
                }
            }
        }

        for (const child of node.children) {
            this.findContentNodeRecursive(child);
        }
    }

    /**
     * ✅ 自动查找 settlementContentNode
     */
    private autoFindSettlementContentNode() {
        if (this.settlementContentNode) {
            //LogService.debug('record', 'settlementContentNode 已绑定');
            return;
        }

        // 方式1: 尝试从 settlementScrollView 获取 content
        if (this.settlementScrollView) {
            this.settlementContentNode = this.settlementScrollView.content;
            if (this.settlementContentNode) {
                //LogService.info('record', '通过 settlementScrollView.content 自动找到 settlementContentNode');
                return;
            }
        }

        // 方式2: 尝试通过节点名称查找（从 otherPanel 下找）
        if (this.otherPanel) {
            const scrollViewNode = this.otherPanel.getChildByName('ScrollView');
            if (scrollViewNode) {
                const view = scrollViewNode.getChildByName('view');
                if (view) {
                    this.settlementContentNode = view.getChildByName('content');
                    if (this.settlementContentNode) {
                        //LogService.info('record', '通过 otherPanel 节点路径自动找到 settlementContentNode');
                        return;
                    }
                }
            }
        }

        // 方式3: 尝试从 this.node 下找 otherPanel
        const otherPanel = this.node.getChildByName('otherPanel');
        if (otherPanel) {
            const scrollViewNode = otherPanel.getChildByName('ScrollView');
            if (scrollViewNode) {
                const view = scrollViewNode.getChildByName('view');
                if (view) {
                    this.settlementContentNode = view.getChildByName('content');
                    if (this.settlementContentNode) {
                        //LogService.info('record', '通过 this.node 子节点找到 settlementContentNode');
                        return;
                    }
                }
            }
        }

        // 方式4: 尝试从 Canvas 查找（完整路径）
        let canvas = this.node;
        while (canvas && canvas.name !== 'Canvas') {
            canvas = canvas.parent;
        }
        if (canvas) {
            const recordNode = canvas.getChildByName('recordNode');
            if (recordNode) {
                const op = recordNode.getChildByName('otherPanel');
                if (op) {
                    const scrollViewNode = op.getChildByName('ScrollView');
                    if (scrollViewNode) {
                        const view = scrollViewNode.getChildByName('view');
                        if (view) {
                            this.settlementContentNode = view.getChildByName('content');
                            if (this.settlementContentNode) {
                                //LogService.info('record', '通过 Canvas 完整路径找到 settlementContentNode');
                                return;
                            }
                        }
                    }
                }
            }
        }

        // 方式5: 递归查找第二个 ScrollView 的 content（第一个是房间列表的）
        this.findSettlementContentNodeRecursive(this.node, 0);
        
        if (!this.settlementContentNode) {
           // LogService.warn('record', '未能自动找到 settlementContentNode，请在编辑器中绑定');
        }
    }

    /**
     * 递归查找 settlementContentNode（查找第二个 ScrollView 的 content）
     */
    private findSettlementContentNodeRecursive(node: Node, scrollViewCount: number) {
        if (this.settlementContentNode) return;
        
        if (node.name === 'content') {
            const parent = node.parent;
            if (parent && parent.name === 'view') {
                const grandParent = parent.parent;
                if (grandParent && grandParent.name === 'ScrollView') {
                    scrollViewCount++;
                    // 第一个 ScrollView 是房间列表的，第二个是结算记录的
                    if (scrollViewCount === 2) {
                        this.settlementContentNode = node;
                        //LogService.info('record', '通过递归查找找到 settlementContentNode');
                        return;
                    }
                }
            }
        }

        for (const child of node.children) {
            this.findSettlementContentNodeRecursive(child, scrollViewCount);
        }
    }

    /**
     * ✅ 设置 ScrollView 白色背景
     */
    private setScrollViewWhiteBackground() {
        if (!this.scrollView) {
            //LogService.warn('record', 'scrollView 未设置');
            return;
        }

        // 获取 ScrollView 的 view 节点
        const viewNode = this.scrollView.node.getChildByName('view');
        if (!viewNode) {
            //LogService.warn('record', 'scrollView 的 view 节点未找到');
            return;
        }

        // 尝试获取或创建 Sprite 组件来设置背景
        let sprite = viewNode.getComponent(Sprite);
        if (!sprite) {
            sprite = viewNode.addComponent(Sprite);
        }

        // 设置白色背景颜色
        sprite.color = new Color(255, 255, 255, 255); // 纯白色

        //LogService.info('record', 'ScrollView 白色背景设置成功');
    }

    /**
     * ✅ 设置结算记录 ScrollView 白色背景
     */
    private setSettlementScrollViewWhiteBackground() {
        if (!this.settlementScrollView) {
            //LogService.warn('record', 'settlementScrollView 未设置');
            return;
        }

        const viewNode = this.settlementScrollView.node.getChildByName('view');
        if (!viewNode) {
           // LogService.warn('record', 'settlementScrollView 的 view 节点未找到');
            return;
        }

        let sprite = viewNode.getComponent(Sprite);
        if (!sprite) {
            sprite = viewNode.addComponent(Sprite);
        }

        sprite.color = new Color(255, 255, 255, 255);

       // LogService.info('record', '结算记录 ScrollView 白色背景设置成功');
    }

    onDestroy() {
        // ✅ 移除 WebSocket 消息监听器
        this.unregisterMessageListener();
    }

    /**
     * 注册 WebSocket 消息监听器
     */
    private registerMessageListener() {
        const gameNetwork = GameNetwork.getInstance();
        gameNetwork.addMessageListener(CommandType.GAME_RECORD_LIST_RESPONSE, this.onGameRecordListResponse.bind(this));
        gameNetwork.addMessageListener(CommandType.ROOM_GAME_FLOW_RESPONSE, this.onRoomGameFlowResponse.bind(this));
        //LogService.info('record', '已注册游戏记录列表响应监听器');
    }

    /**
     * 移除 WebSocket 消息监听器
     */
    private unregisterMessageListener() {
        const gameNetwork = GameNetwork.getInstance();
        gameNetwork.removeMessageListener(CommandType.GAME_RECORD_LIST_RESPONSE, this.onGameRecordListResponse.bind(this));
        gameNetwork.removeMessageListener(CommandType.ROOM_GAME_FLOW_RESPONSE, this.onRoomGameFlowResponse.bind(this));
       // LogService.info('record', '已移除游戏记录列表响应监听器');
    }

    /**
     * 处理游戏记录列表响应
     */
    private onGameRecordListResponse(data: any) {
       // LogService.info('record', `收到游戏记录列表响应`);
        
        try {
            let result = data;
            if (typeof data === 'string') {
                try {
                    result = JSON.parse(data);
                } catch (e) {
                   // LogService.error('record', `解析响应数据失败: ${e.message}`);
                    return;
                }
            }

           // LogService.info('record', `响应数据类型: ${typeof result}, code=${result.code}, data.length=${result.data ? result.data.length : 'undefined'}, rooms.length=${result.rooms ? result.rooms.length : 'undefined'}`);

            let rooms: Array<any> = [];
            
            if (result.rooms && Array.isArray(result.rooms)) {
                rooms = result.rooms;
            } else if (result.code === 0 && result.data && Array.isArray(result.data)) {
                const firstItem = result.data[0];
                if (!(firstItem && firstItem.$ref)) {
                    rooms = result.data;
                }
            } else if (Array.isArray(result)) {
                rooms = result;
            }

           // LogService.info('record', `解析到房间列表数量: ${rooms.length}`);

            if (rooms.length > 0) {
                this.renderRoomList(rooms);
            } else {
                //LogService.warn('record', `查询房间列表失败或数据为空`);
            }
        } catch (e) {
            LogService.error('record', `处理游戏记录列表响应异常: ${e.message}`, e);
        }
    }

    /**
     * ✅ 处理房间游戏流水（结算记录）响应
     */
    private onRoomGameFlowResponse(data: any) {
       // LogService.info('record', `收到房间游戏流水响应: ${JSON.stringify(data)}`);

        let result = data;
        if (typeof data === 'string') {
            try {
                result = JSON.parse(data);
            } catch (e) {
                //LogService.error('record', `解析结算记录数据失败: ${e.message}`);
                return;
            }
        }

        if (result.code === 0 && result.data && Array.isArray(result.data)) {
            //LogService.info('record', `结算记录数据解析成功，共 ${result.data.length} 条记录`);
            if (result.data.length === 0) {
                //LogService.info('record', '结算记录为空，可能服务端没有返回数据或没有符合条件的数据');
            }
            this.renderSettlementList(result.data);
        } else {
           // LogService.warn('record', `查询结算记录失败: ${result.message || '未知错误'}, code=${result.code}, data=${JSON.stringify(result.data)}`);
        }
    }

    start() {
        // 屏幕适配
        ScreenAdapter.getInstance().adaptToScreen(this.node);

        // 初始化滚动视图
        if (this.scrollView) {
            this.scrollView.scrollToTop();
        }

        // ✅ 先加载预制体，然后查询房间列表
        this.loadRoomItemPrefab();
    }

    /**
     * ✅ 自动加载房间项预制体
     */
    private loadRoomItemPrefab() {
        // 如果已经绑定，不需要加载
        if (this.roomItemPrefab) {
           // LogService.debug('record', 'roomItemPrefab 已绑定');
            this.queryRoomList();
            return;
        }

        // 尝试从 resources/Prefabs 目录加载预制体
        const prefabPath = 'Prefabs/item';
        resources.load(prefabPath, Prefab, (err, prefab) => {
            if (!err && prefab) {
                this.roomItemPrefab = prefab;
               // LogService.info('record', `成功从 resources/${prefabPath} 加载房间项预制体`);
                // 加载成功后查询房间列表
                this.queryRoomList();
            } else {
               // LogService.warn('record', `从 resources/${prefabPath} 加载预制体失败: ${err ? err.message : '文件不存在'}`);
                //LogService.warn('record', '请确保预制体已放入 resources/Prefabs 目录，或在编辑器中直接绑定 roomItemPrefab 属性');
                // 即使加载失败也尝试查询（可能在编辑器中运行时已绑定）
                this.queryRoomList();
            }
        });
    }

    /**
     * 通过 WebSocket 查询用户的房间列表
     * 查询时间范围：当前时间至往前48小时
     */
    private queryRoomList() {
        const gameNetwork = GameNetwork.getInstance();
        this._userId = gameNetwork.getUserId();
        this._walletAddress = gameNetwork.getWalletAddress() || '';

       // LogService.info('record', `查询房间列表: userId=${this._userId}, walletAddress=${this._walletAddress}`);

        if (!this._userId) {
           // LogService.warn('record', '用户未登录，无法查询房间列表');
            return;
        }

        // 计算时间范围：当前时间至往前48小时
        const now = Date.now();
        const endTime = Math.floor(now / 1000); // 当前时间戳（秒）
        const startTime = endTime - (48 * 60 * 60); // 48小时前的时间戳（秒）

        // 通过 WebSocket 发送请求，包含时间范围和排序参数
        gameNetwork.sendMessage(CommandType.GET_GAME_RECORD_LIST, {
            userId: this._userId,
            walletAddress: this._walletAddress,
            startTime: startTime, // 查询开始时间（48小时前）
            endTime: endTime, // 查询结束时间（当前时间）
            sort: 'desc' // 倒序排序
        });

        //LogService.info('record', `已发送游戏记录列表请求: startTime=${startTime}, endTime=${endTime}, sort=desc`);
    }

    /**
     * ✅ 通过 WebSocket 查询用户的结算记录（房间游戏流水）
     * 查询时间范围：当前时间至往前48小时，倒序排序
     * 支持传入 roomId 和 roomCode 进行条件查询
     * @param roomId 房间ID（可选）
     * @param roomCode 房间显示码（可选）
     */
    private querySettlementList(roomId?: number, roomCode?: string) {
        const gameNetwork = GameNetwork.getInstance();
        const userId = gameNetwork.getUserId();
        const walletAddress = gameNetwork.getWalletAddress() || '';

        // 使用传入的参数或实例变量
        const queryRoomId = roomId || this._roomId;
        const queryRoomCode = roomCode || this._roomCode;

       // LogService.info('record', `查询结算记录: userId=${userId}, walletAddress=${walletAddress}, roomId=${queryRoomId}, roomCode=${queryRoomCode}`);

        if (!userId) {
           // LogService.warn('record', '用户未登录，无法查询结算记录');
            return;
        }

        // 构建请求参数
        const requestData: any = {
            user_id: userId,
            address: walletAddress
        };

        // 如果有传入 roomId，添加到查询条件
        // if (queryRoomId && queryRoomId > 0) {
        //     requestData.room_id = queryRoomId;
        // }

        // // 如果有传入 roomCode，添加到查询条件
        // if (queryRoomCode && queryRoomCode.length > 0) {
        //     requestData.room_code = queryRoomCode;
        // }

        // 发送请求
        gameNetwork.sendMessage(CommandType.GET_ROOM_GAME_FLOW, requestData);

        //LogService.info('record', `已发送结算记录请求: userId=${userId}, roomId=${queryRoomId}, roomCode=${queryRoomCode}, address=${walletAddress}`);
       // LogService.info('record', `命令类型: GET_ROOM_GAME_FLOW(${CommandType.GET_ROOM_GAME_FLOW}), 等待响应: ROOM_GAME_FLOW_RESPONSE(${CommandType.ROOM_GAME_FLOW_RESPONSE})`);
    }

    /**
     * 渲染房间列表
     */
    private renderRoomList(rooms: Array<any>) {
        const content = this.contentNode || (this.scrollView && this.scrollView.content);
        if (!content) {
           // LogService.warn('record', 'renderRoomList: content is null');
            return;
        }

        //LogService.info('record', `renderRoomList: rooms.length=${rooms.length}, content.children.length=${content.children.length}`);
        
        for (let i = 0; i < Math.min(3, rooms.length); i++) {
            const room = rooms[i];
            //LogService.debug('record', `renderRoomList room ${i}: has $ref=${!!room.$ref}, roomCode=${room.roomCode || room.room_code}`);
        }

        this.clearRoomItems();

       // LogService.info('record', `renderRoomList: 清空后 content.children.length=${content.children.length}`);

        rooms.forEach((room, index) => {
           // LogService.debug('record', `renderRoomList: creating item ${index}, roomCode=${room.roomCode || room.room_code}`);
            this.createRoomItem(room, index);
        });

        //LogService.info('record', `renderRoomList: 创建完成后 content.children.length=${content.children.length}`);

        this.updateScrollViewContentSize();

        if (this.scrollView) {
            this.scrollView.scrollToTop();
        }
    }

    /**
     * ✅ 更新 ScrollView content 高度以支持滚动
     */
    private updateScrollViewContentSize() {
        const content = this.contentNode || (this.scrollView && this.scrollView.content);
        if (!content || !this.scrollView) return;

        const firstChild = content.children[0];
        if (!firstChild) return;

        const itemHeight = firstChild.getComponent(UITransform)?.contentSize.height || 120;
        const itemCount = content.children.length;
        const spacing = 10;
        const topOffset = 100;

        const totalHeight = itemCount * (itemHeight + spacing) + spacing + topOffset;

        const uiTransform = content.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(uiTransform.contentSize.width, totalHeight);
        }
    }

    /**
     * 清空现有房间项（保留原始item节点作为模板）
     */
    private clearRoomItems() {
        const content = this.contentNode || (this.scrollView && this.scrollView.content);
        if (!content) return;

        const childrenToDestroy: Node[] = [];
        for (let i = 0; i < content.children.length; i++) {
            const child = content.children[i];
            if (child.name.startsWith('roomItem_')) {
                childrenToDestroy.push(child);
            }
        }

        childrenToDestroy.forEach(child => {
            child.destroy();
        });
    }

    /**
     * ✅ 渲染结算记录列表
     */
    private renderSettlementList(records: Array<any>) {
        if (!this.settlementContentNode) {
            //LogService.warn('record', 'settlementContentNode 未设置');
            return;
        }

        // 清空现有内容
        this.clearSettlementItems();

        //LogService.info('record', `渲染结算记录列表: ${records.length} 条记录`);

        if (records.length === 0) {
            // 更新 ScrollView content 高度（空列表）
            this.updateSettlementContentSize();
            return;
        }

        // 由于 resources.load 是异步的，需要等待所有预制体加载完成后再更新高度
        let loadedCount = 0;
        const totalCount = records.length;

        const onItemLoaded = () => {
            loadedCount++;
            if (loadedCount >= totalCount) {
                // 所有预制体加载完成后更新 content 高度
                this.updateSettlementContentSize();
                // 滚动到顶部
                if (this.settlementScrollView) {
                    this.settlementScrollView.scrollToTop();
                }
               // LogService.info('record', `所有结算记录项加载完成: ${loadedCount}/${totalCount}`);
            }
        };

        // 遍历记录列表，创建预制体
        records.forEach((record, index) => {
            this.createSettlementItem(record, index, onItemLoaded);
        });
    }

    /**
     * ✅ 更新结算记录 ScrollView content 高度
     */
    private updateSettlementContentSize() {
        if (!this.settlementContentNode || !this.settlementScrollView) {
            return;
        }

        const firstChild = this.settlementContentNode.children[0];
        if (!firstChild) return;

        const firstChildTransform = firstChild.getComponent(UITransform);
        const itemHeight = firstChildTransform ? firstChildTransform.contentSize.height : 120;
        const itemCount = this.settlementContentNode.children.length;
        const spacing = 10;
        const topOffset = 100;

        const totalHeight = itemCount * (itemHeight + spacing) + spacing + topOffset;
        const uiTransform = this.settlementContentNode.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(uiTransform.contentSize.width, totalHeight);
        }

       // LogService.info('record', `更新结算记录 content 高度: ${totalHeight}`);
    }

    /**
     * ✅ 清空结算记录项
     */
    private clearSettlementItems() {
        if (!this.settlementContentNode) return;

        const childrenToDestroy: Node[] = [];
        for (let i = 0; i < this.settlementContentNode.children.length; i++) {
            const child = this.settlementContentNode.children[i];
            if (child.name.startsWith('settlementItem_')) {
                childrenToDestroy.push(child);
            }
        }

        childrenToDestroy.forEach(child => {
            child.destroy();
        });

       // LogService.info('record', `已清空结算记录列表，删除了 ${childrenToDestroy.length} 个动态创建的项`);
    }

    /**
     * ✅ 创建单个结算记录项（支持动态加载预制体）
     */
    private createSettlementItem(record: any, index: number, onLoaded?: () => void) {
        if (!this.settlementContentNode) {
           // LogService.warn('record', 'settlementContent节点未设置');
            onLoaded?.();
            return;
        }

        // 优先使用属性绑定的预制体  
        if (this.settlementItemPrefab) {
            this.createSettlementItemWithPrefab(record, index, onLoaded);
            return;
        }

        // ✅ 动态加载预制体（从 resources/Prefabs/settlement_item 加载）
        const prefabPath = 'Prefabs/settlement_item';
        resources.load(prefabPath, Prefab, (err, prefab) => {
            if (err || !prefab) {
                //LogService.error('record', `动态加载结算记录预制体失败: ${err ? err.message : '预制体不存在'}, path=${prefabPath}`);
                onLoaded?.();
                return;
            }

            //LogService.info('record', `成功动态加载结算记录预制体: ${prefabPath}`);

            const itemNode = instantiate(prefab);
            itemNode.name = `settlementItem_${index}`;

            // 设置位置
            const uiTransform = itemNode.getComponent(UITransform);
            const itemHeight = uiTransform ? uiTransform.contentSize.height : 120;
            const spacing = 10;
            const topOffset = 100;
            const yPosition = -topOffset - (index * (itemHeight + spacing));
            itemNode.setPosition(0, yPosition, 0);

            // 添加到 content
            this.settlementContentNode.addChild(itemNode);

            //LogService.info('record', `结算项 ${index} 创建成功，位置: (0, ${yPosition})`);

            // 更新显示内容
            this.updateSettlementItemInfo(itemNode, record);

            // 回调通知加载完成
            onLoaded?.();
        });
    }

    /**
     * 使用已绑定的预制体创建结算记录项
     */
    private createSettlementItemWithPrefab(record: any, index: number, onLoaded?: () => void) {
        const itemNode = instantiate(this.settlementItemPrefab);
        itemNode.name = `settlementItem_${index}`;

        // 设置位置
        const uiTransform = itemNode.getComponent(UITransform);
        const itemHeight = uiTransform ? uiTransform.contentSize.height : 120;
        const spacing = 10;
        const topOffset = 100;
        const yPosition = -topOffset - (index * (itemHeight + spacing));
        itemNode.setPosition(0, yPosition, 0);

        // 添加到 content
        this.settlementContentNode.addChild(itemNode);

       // LogService.info('record', `结算项 ${index} 创建成功（使用绑定预制体），位置: (0, ${yPosition})`);
        const itemComp = itemNode.getComponent(SettlementItem)
        if (itemComp) {
            itemComp.updateContent(record)
        }
        // 更新显示内容
        //this.updateSettlementItemInfo(itemNode, record);

        // 回调通知加载完成
        onLoaded?.();
    }

    /**
     * ✅ 更新结算记录项的显示内容
     * 数据库表 t_room_game_flow 字段：
     *   user_id, address, room_id, room_code, current_round, amount,
     *   before_balance, after_balance, updated_at
     * 预制体中带有 Label 后缀的为标题，不需要赋值
     * 不带 Label 后缀的为需要赋值的字段
     */
    private updateSettlementItemInfo(itemNode: Node, record: any) {
        // 打印所有子节点名称用于调试
        const childNames = itemNode.children.map(child => child.name).join(', ');
       //// LogService.debug('record', `settlement_item 子节点: ${childNames}`);
        //LogService.debug('record', `结算记录数据: ${JSON.stringify(record)}`);

        // roomCode - 房间显示号（支持 room_code 和 roomCode 两种字段名）
        const roomCode = record.room_code !== undefined ? record.room_code : (record.roomCode !== undefined ? record.roomCode : '');
        const roomCodeNode = itemNode.getChildByName('roomCode')?.getComponent(Label);
        if (roomCodeNode) {
            roomCodeNode.string = `${roomCode}`;
           // LogService.debug('record', `设置 roomCode: ${roomCode}`);
        } else {
           // LogService.warn('record', 'roomCode 节点未找到');
        }

        // amount - 金额（负数红色，正数绿色）（支持 amount 字段）
        const amount = record.amount !== undefined ? record.amount : 0;
        const amountNode = itemNode.getChildByName('amount')?.getComponent(Label);
        if (amountNode) {
            amountNode.string = `${amount}`;

            // 设置颜色
            const amountNum = Number(amount);
            if (amountNum < 0) {
                amountNode.color = new Color(255, 0, 0, 255);  // 红色
            } else if (amountNum > 0) {
                amountNode.color = new Color(0, 255, 0, 255);  // 绿色
            }
            // 等于0时保持默认颜色
           // LogService.debug('record', `设置 amount: ${amount}, color: ${amountNum > 0 ? 'green' : amountNum < 0 ? 'red' : 'default'}`);
        } else {
           // LogService.warn('record', 'amount 节点未找到');
        }

        // currentRound - 当前已玩局数（支持 current_round 和 currentRound 两种字段名）
        const currentRound = record.current_round !== undefined ? record.current_round : (record.currentRound !== undefined ? record.currentRound : 0);
        const currentRoundNode = itemNode.getChildByName('currentRound')?.getComponent(Label);
        if (currentRoundNode) {
            currentRoundNode.string = `${currentRound}`;
           // LogService.debug('record', `设置 currentRound: ${currentRound}`);
        } else {
          //  LogService.warn('record', 'currentRound 节点未找到');
        }

        // beforeBalance - 结算前余额（支持 before_balance 和 beforeBalance 两种字段名）
        const beforeBalance = record.before_balance !== undefined ? record.before_balance : (record.beforeBalance !== undefined ? record.beforeBalance : 0);
        const beforeBalanceNode = itemNode.getChildByName('beforeBalance')?.getComponent(Label);
        if (beforeBalanceNode) {
            beforeBalanceNode.string = `${beforeBalance}`;
            //LogService.debug('record', `设置 beforeBalance: ${beforeBalance}`);
        } else {
           // LogService.warn('record', 'beforeBalance 节点未找到');
        }

        // afterBalance - 结算后余额（支持 after_balance 和 afterBalance 两种字段名）
        const afterBalance = record.after_balance !== undefined ? record.after_balance : (record.afterBalance !== undefined ? record.afterBalance : 0);
        const afterBalanceNode = itemNode.getChildByName('afterBalance')?.getComponent(Label);
        if (afterBalanceNode) {
            afterBalanceNode.string = `${afterBalance}`;
           // LogService.debug('record', `设置 afterBalance: ${afterBalance}`);
        } else {
           // LogService.warn('record', 'afterBalance 节点未找到');
        }

        // updatedAt - 更新时间（仅显示时分 HH:mm）
        const updatedAtNode = itemNode.getChildByName('updatedAt')?.getComponent(Label);
        if (updatedAtNode && record.create_time != null) {
            let timestamp = record.create_time;

            // 如果是字符串时间格式，尝试解析
            if (typeof timestamp === 'string') {
                const date = new Date(timestamp);
                if (!isNaN(date.getTime())) {
                    timestamp = date.getTime();
                } else {
                    const num = Number(timestamp);
                    if (!isNaN(num)) {
                        timestamp = num;
                    }
                }
            }

            let date: Date;
            if (typeof timestamp === 'number') {
                // 如果是秒级时间戳，转换为毫秒
                date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
            } else {
                date = new Date();
            }

            const hours = date.getHours();
            const minutes = date.getMinutes();
            const hoursStr = hours < 10 ? '0' + hours : String(hours);
            const minutesStr = minutes < 10 ? '0' + minutes : String(minutes);

            updatedAtNode.string = `${hoursStr}:${minutesStr}`;
        }

       // LogService.debug('record', `更新结算项 ${itemNode.name} 显示完成`);
    }

    /**
     * 创建单个房间项
     */
    private createRoomItem(room: any, index: number) {
        try {
            const content = this.contentNode || (this.scrollView && this.scrollView.content);
            if (!content) {
                //LogService.warn('record', 'contentNode 为空，无法创建房间项');
                return;
            }

           // LogService.debug('record', `创建房间项 ${index}: roomCode=${room.roomCode || room.room_code}`);

            let itemNode: Node;
            if (this.roomItemPrefab) {
                itemNode = instantiate(this.roomItemPrefab);
               // LogService.debug('record', '使用 roomItemPrefab 创建房间项');
            } else {
                const existingItem = content.getChildByName('item');
                if (!existingItem) {
                   // LogService.warn('record', '未找到 item 模板节点');
                    return;
                }
                itemNode = instantiate(existingItem);
               // LogService.debug('record', '使用现有 item 节点创建房间项');
            }

            itemNode.name = `roomItem_${index}`;

            const itemHeight = itemNode.getComponent(UITransform)?.contentSize.height || 120;
            const spacing = 10;
            const topOffset = 100;
            const yPosition = -topOffset - (index * (itemHeight + spacing));
            itemNode.setPosition(0, yPosition, 0);

            const itemComp = itemNode.getComponent(item);
            //LogService.info('record', `createRoomItem: index=${index}, itemComp=${!!itemComp}, roomCode=${room.roomCode || room.room_code}`);
            
            if (itemComp) {
               // LogService.debug('record', `调用 item.updateContent`);
                itemComp.updateContent(room);
            } else {
               // LogService.warn('record', `房间项 ${index} 没有 item 组件，尝试直接更新`);
                this.updateRoomItemInfo(itemNode, room);
            }

            content.addChild(itemNode);

            const totalAmount = room.totalAmount !== undefined ? room.totalAmount : (room.total_amount !== undefined ? room.total_amount : 0);
            //LogService.info('record', `createRoomItem: index=${index}, totalAmount=${totalAmount}, itemComp=${!!itemComp}`);
            
            if (itemComp) {
                itemComp.updateRevenueValue(totalAmount);
            }
           // LogService.debug('record', `房间项 ${index} 添加到 content`);
        } catch (e) {
            LogService.error('record', `createRoomItem 异常: index=${index}, error=${e.message}`, e);
        }
    }

    /**
     * 更新房间项信息
     * 注意：预制体内带有 Label 后缀的节点不修改，仅作为文本标签显示
     * 只修改不带 Label 后缀的节点来显示数据
     */
    private updateRoomItemInfo(itemNode: Node, room: any) {
        const findValueNode = (parentNames: string[], valueNames: string[]): Label | null => {
            for (const parentName of parentNames) {
                const parent = itemNode.getChildByName(parentName);
                if (parent) {
                    const parentLabel = parent.getComponent(Label);
                    if (parentLabel) return parentLabel;
                    for (const valueName of valueNames) {
                        const child = parent.getChildByName(valueName);
                        if (child) {
                            return child.getComponent(Label);
                        }
                    }
                }
            }
            for (const valueName of valueNames) {
                const valueNode = itemNode.getChildByName(valueName);
                if (valueNode) {
                    const label = valueNode.getComponent(Label);
                    if (label) return label;
                }
            }
            return null;
        };

        const roomCode = room.roomCode || room.room_code || '';
        const roomNumLabel = findValueNode(['roomNum'], ['roomCode']);
        if (roomNumLabel) {
            roomNumLabel.string = roomCode || '0000';
           // LogService.info('record', `设置 roomCode: ${roomCode}`);
        } else {
           // LogService.warn('record', 'roomCode 节点未找到');
        }

        if (room.status != null) {
            const statusLabel = findValueNode(['status'], ['status']);
            if (statusLabel) {
                statusLabel.string = `${room.status}`;
                //LogService.info('record', `设置 status: ${room.status}`);
            } else {
               // LogService.warn('record', 'status 节点未找到');
            }
        }

        const currentPlayers = room.currentPlayers !== undefined ? room.currentPlayers : (room.current_players !== undefined ? room.current_players : 0);
        const maxPlayers = room.maxPlayers !== undefined ? room.maxPlayers : (room.max_players !== undefined ? room.max_players : 0);
        if (maxPlayers > 0) {
            const playNumsLabel = findValueNode(['playerNums', 'playNums'], ['maxPlayers']);
            if (playNumsLabel) {
                playNumsLabel.string = `${currentPlayers}-${maxPlayers}`;
               // LogService.info('record', `设置 playerNums: ${currentPlayers}-${maxPlayers}`);
            } else {
               // LogService.warn('record', 'playerNums/maxPlayers 节点未找到');
            }
        }

        const currentRound = room.currentRound || room.current_round || 0;
        const maxRounds = room.maxRounds || room.max_rounds || 0;
        const roundLabel = findValueNode(['Round', 'round'], ['roundValue']);
        if (roundLabel) {
            roundLabel.string = `${currentRound}/${maxRounds}`;
           // LogService.info('record', `设置 round: ${currentRound}/${maxRounds}`);
        } else {
           // LogService.warn('record', 'Round/roundValue 节点未找到');
        }

        if (room.ante != null) {
            const anteLabel = findValueNode(['Ante', 'ante'], ['ante']);
            if (anteLabel) {
                anteLabel.string = `${room.ante}`;
                //LogService.info('record', `设置 ante: ${room.ante}`);
            } else {
               // LogService.warn('record', 'Ante/ante 节点未找到');
            }
        }

        const cardCost = room.roomCardCost !== undefined ? room.roomCardCost : (room.card_cost !== undefined ? room.card_cost : 0);
        const cardCostLabel = findValueNode(['Cost', 'cost'], ['cardCost']);
        if (cardCostLabel) {
            cardCostLabel.string = `${cardCost}`;
           // LogService.info('record', `设置 cardCost: ${cardCost}`);
        } else {
            //LogService.warn('record', 'Cost/cardCost 节点未找到');
        }

        const ruleLabel = findValueNode(['rule'], ['gameRules']);
        if (ruleLabel) {
            ruleLabel.string = `计分`;
           // LogService.info('record', `设置 rule: 计分`);
        } else {
           // LogService.warn('record', 'rule/gameRules 节点未找到');
        }
    }

    /**
     * 获取状态文本
     */
    private getStatusText(status: string): string {
        const statusMap: { [key: string]: string } = {
            'WAITING': '等待中',
            'PLAYING': '游戏中',
            'SETTLEMENT': '结算中',
            'CLOSED': '已关闭'
        };
        return statusMap[status] || status;
    }

    update(deltaTime: number) {

    }

    /**
     * 点击详情按钮
     */
    private onDetailBtnClick() {
        //LogService.info('record', 'detailBtn 被点击');
        this.showDetailPanel();
    }

    /**
     * 点击其他按钮
     */
    private onOtherBtnClick() {
        //LogService.info('record', 'otherBtn 被点击');
        this.showOtherPanel();
        // ✅ 切换到其他面板时自动查询结算记录（真实数据库数据）
        this.querySettlementList();
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
        const sprite = this.recordTitle?.getComponent(Sprite);
        if (sprite) {
            resources.load('material/gameRecordbg/spriteFrame', SpriteFrame, (err, frame) => {
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
        const sprite = this.recordTitle?.getComponent(Sprite);
        if (sprite) {
            resources.load('material/recordLogbg/spriteFrame', SpriteFrame, (err, frame) => {
                if (!err && frame && sprite && sprite.node && sprite.node.isValid) {
                    sprite.spriteFrame = frame;
                }
            });
        }
    }

    /**
     * 返回按钮点击处理
     */
    private _onReturnClick() {
        SceneLoader.getInstance().loadScene('index');
    }
}
