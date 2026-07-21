import { LogService } from '../utils/LogService';
/**
 * 网络消息处理器
 * 负责处理服务端消息、命令分发、验证和过滤
 */
import { GameUIHandler } from '../ui/GameUIHandler';
import { PlayerManager } from '../managers/PlayerManager';
import { CommandType } from './Protocol';

export class NetworkMessageHandler {
    
    private _handlers: Map<number, (data: any) => void> = new Map();
    
    private _gameFlow: any = null;
    private _uiHandler: GameUIHandler | null = null;
    private _playerManager: PlayerManager | null = null;
    
    // 消息时间戳跟踪（用于去重）
    private _messageTimestamps: Set<string> = new Set();
    private _maxTimestamps: number = 100;
    
    // 消息队列（用于顺序处理）
    private _messageQueue: Array<{ cmd: number; data: any }> = [];
    private _isProcessing: boolean = false;
    
    constructor(gameFlow?: any, uiHandler?: GameUIHandler, playerManager?: PlayerManager) {
        this._gameFlow = gameFlow || null;
        this._uiHandler = uiHandler || null;
        this._playerManager = playerManager || null;
        
        this._registerDefaultHandlers();
    }
    
    /**
     * 设置游戏流程控制器
     */
    setGameFlowController(gameFlow: any) {
        this._gameFlow = gameFlow;
    }
    
    /**
     * 设置 UI 处理器
     */
    setUIHandler(uiHandler: GameUIHandler) {
        this._uiHandler = uiHandler;
    }
    
    /**
     * 设置玩家管理器
     */
    setPlayerManager(playerManager: PlayerManager) {
        this._playerManager = playerManager;
    }
    
    /**
     * 注册消息处理器
     */
    registerHandler(cmd: number, handler: (data: any) => void): void {
        this._handlers.set(cmd, handler);
    }
    
    /**
     * 注销消息处理器
     */
    unregisterHandler(cmd: number): void {
        this._handlers.delete(cmd);
    }
    
    /**
     * 处理服务端消息
     */
    handleServerMessage(cmd: number, data: any): void {
        // 去重检查
        const timestampKey = `${cmd}_${data?.timestamp || Date.now()}`;
        if (this._messageTimestamps.has(timestampKey)) {
            return;
        }
        
        // 添加时间戳到去重集合
        this._messageTimestamps.add(timestampKey);
        if (this._messageTimestamps.size > this._maxTimestamps) {
            // 清理旧的时间戳
            const keys = Array.from(this._messageTimestamps);
            this._messageTimestamps = new Set(keys.slice(-this._maxTimestamps));
        }
        
        // 添加到消息队列
        this._messageQueue.push({ cmd, data });
        
        // 如果没有正在处理，开始处理队列
        if (!this._isProcessing) {
            this._processQueue();
        }
    }
    
    /**
     * 处理消息队列
     */
    private async _processQueue(): Promise<void> {
        this._isProcessing = true;
        
        while (this._messageQueue.length > 0) {
            const item = this._messageQueue.shift();
            if (!item) {
                continue;
            }
            
            try {
                await this._processMessage(item.cmd, item.data);
            } catch (error) {
                LogService.error('NetworkMessageHandler', `处理消息失败: cmd=${item.cmd}`, error);
            }
            
            // 每处理一条消息后延迟一小段时间，避免阻塞主线程
            await this._delay(10);
        }
        
        this._isProcessing = false;
    }
    
    /**
     * 处理单条消息
     */
    private async _processMessage(cmd: number, data: any): Promise<void> {
        // 优先使用自定义注册的处理器
        if (this._handlers.has(cmd)) {
            const handler = this._handlers.get(cmd);
            handler!(data);
            return;
        }
        
        // 使用默认处理器
        switch (cmd) {
            case CommandType.PLAYER_READY:
                this._handlePlayerReady(data);
                break;
                
            case CommandType.NOTIFY_PLAYER_TURN:
                this._handlePlayerTurnNotify(data);
                break;
                
            case CommandType.PLAYER_ACTION_NOTIFY:
                this._handlePlayerActionNotify(data);
                break;
                
            case CommandType.GAME_START_NOTIFY:
                this._handleGameStartNotify(data);
                break;
                
            case CommandType.DEAL_CARDS_NOTIFY:
                this._handleDealCardsNotify(data);
                break;
                
            case CommandType.GAME_SETTLEMENT:
                this._handleGameSettlement(data);
                break;
                
            case CommandType.GAME_STATE_SYNC:
                this._handleGameStateSync(data);
                break;
                
            case CommandType.ACT_OPERATION:
                this._handleActOperation(data);
                break;
                
            case CommandType.DEAL_COMPLETE:
                this._handleDealComplete(data);
                break;
                
            case CommandType.ACTION_COMPLETE:
                this._handleActionComplete(data);
                break;
                
            case CommandType.ERROR_RESPONSE:
                this._handleErrorResponse(data);
                break;
                
            default:
                LogService.warn('NetworkMessageHandler', `未处理的命令: cmd=${cmd}`);
        }
    }
    
    /**
     * 注册默认消息处理器
     */
    private _registerDefaultHandlers(): void {
        // 默认处理器会在没有自定义注册时使用
        // 这里不需要注册，因为 switch 会处理
    }
    
    /**
     * 处理玩家准备消息
     */
    private _handlePlayerReady(data: any): void {
        
        // 更新玩家准备状态
        if (this._playerManager && data.userId !== undefined) {
            this._playerManager.setPlayerReady(data.userId, !!data.isReady);
        }
        
        // 更新所有玩家准备状态
        if (data.allReadyStates) {
            this._playerManager?.setAllReadyStates(data.allReadyStates);
        }
    }
    
    /**
     * 处理玩家回合通知
     */
    private _handlePlayerTurnNotify(data: any): void {
    
    // 更新 UI 显示操作按钮
    if (this._uiHandler && data.isMyTurn) {
        const availableActions = data.actionNotify?.availableActions || data.availableActions || [];
        this._uiHandler.showPlayerActions({ availableActions }, data);
    }
}
    
    /**
     * 处理玩家操作通知
     */
    private _handlePlayerActionNotify(data: any): void {
        
        // 更新玩家操作状态
        if (this._playerManager && data.playerId !== undefined) {
            // 更新玩家操作
        }
        
        // 更新 UI
        if (this._uiHandler && data.seatIndex !== undefined) {
            this._uiHandler.updateSinglePlayerUI(data.seatIndex, data);
        }
    }
    
    /**
     * 处理游戏开始通知
     */
    private _handleGameStartNotify(data: any): void {
        
        // 更新游戏状态
        if (this._gameFlow) {
            this._gameFlow.startGame();
        }
        
        // 隐藏准备按钮
        // 需要通过 UIHandler 或直接操作
    }
    
    /**
     * 处理发牌通知
     */
    private _handleDealCardsNotify(data: any): void {
        
        // 更新公牌显示
        if (this._uiHandler && data.communityCards) {
            this._uiHandler.updateUIFromState({ communityCards: data.communityCards });
        }
        
        // 更新玩家手牌
        if (this._uiHandler && data.players) {
            this._uiHandler.updateUIFromState({ players: data.players });
        }
    }
    
    /**
     * 处理游戏结算
     */
    private _handleGameSettlement(data: any): void {
        
        // 更新结算 UI
        if (this._uiHandler) {
            // 显示结算信息
        }
        
        // 清理牌显示
        if (this._uiHandler) {
            this._uiHandler.clearAllCards();
        }
    }
    
    /**
     * 处理游戏状态同步
     */
    private _handleGameStateSync(data: any): void {
        
        // 更新 UI 状态
        if (this._uiHandler) {
            this._uiHandler.updateUIFromState(data);
        }
    }
    
    /**
     * 处理操作通知
     */
    private _handleActOperation(data: any): void {
        
        // 更新操作按钮
        if (this._uiHandler && data.actionNotify) {
            this._uiHandler.showPlayerActions(data, data.actionNotify);
        }
    }
    
    /**
     * 处理发牌完成
     */
    private _handleDealComplete(data: any): void {
        
        // 更新公牌显示
        if (this._uiHandler && data.communityCards) {
            this._uiHandler.updateUIFromState({ communityCards: data.communityCards });
        }
    }
    
    /**
     * 处理操作完成
     */
    private _handleActionComplete(data: any): void {
        
        // 更新玩家状态
        if (this._uiHandler && data.playerState) {
            this._uiHandler.updateSinglePlayerUI(data.seatIndex, data.playerState);
        }
    }
    
    /**
     * 处理错误响应
     */
    private _handleErrorResponse(data: any): void {
        LogService.error('NetworkMessageHandler', '收到错误响应:', data);
        
        // 显示错误消息
        // 需要通过 UIHandler 显示
    }
    
    /**
     * 延迟辅助函数
     */
    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 获取注册的处理器数量
     */
    getHandlerCount(): number {
        return this._handlers.size;
    }
    
    /**
     * 清理资源
     */
    cleanup(): void {
        this._handlers.clear();
        this._messageTimestamps.clear();
        this._messageQueue = [];
        this._isProcessing = false;
    }
}