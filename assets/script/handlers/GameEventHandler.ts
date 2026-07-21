/**
 * 游戏事件处理器
 * 负责处理游戏流程相关的事件
 */
import { BaseEventHandler } from './BaseEventHandler';
import { LogService } from '../utils/LogService';
import { GameManager } from '../managers/GameManager';
import { PlayerManager } from '../managers/PlayerManager';

export class GameEventHandler extends BaseEventHandler {
    private _gameManager: GameManager;
    private _playerManager: PlayerManager;
    private _eventCallbacks: Map<string, Function[]> = new Map();

    constructor(gameManager: GameManager, playerManager: PlayerManager) {
        super('GameEventHandler');
        this._gameManager = gameManager;
        this._playerManager = playerManager;
    }

    /**
     * 初始化游戏事件处理器
     */
    init(): void {
        if (this._isInitialized) {
            //LogService.warn(this._handlerName, '已经初始化过，跳过');
            return;
        }

        this._isInitialized = true;
    }

    /**
     * 销毁游戏事件处理器
     */
    destroy(): void {
        this._eventCallbacks.clear();
        this._isInitialized = false;
        //LogService.info(this._handlerName, '游戏事件处理器已销毁');
    }

    /**
     * 处理游戏开始事件
     */
    onGameStart(gameData: any): void {
        this.logEvent('GAME_START', gameData);
    }

    /**
     * 处理游戏阶段切换事件
     */
    onPhaseChange(phase: string, phaseData: any): void {
        this.logEvent('PHASE_CHANGE', { phase, phaseData });
    }

    /**
     * 处理玩家行动事件
     */
    onPlayerAction(seatIndex: number, action: string, amount: number): void {
        this.logEvent('PLAYER_ACTION', { seatIndex, action, amount });
    }

    /**
     * 处理结算事件
     */
    onSettlement(winnerInfo: any, potAmount: number): void {
        this.logEvent('SETTLEMENT', { winnerInfo, potAmount });
    }

    /**
     * 注册游戏事件回调
     * @param eventName 事件名称
     * @param callback 回调函数
     */
    on(eventName: string, callback: Function): void {
        if (!this._eventCallbacks.has(eventName)) {
            this._eventCallbacks.set(eventName, []);
        }
        this._eventCallbacks.get(eventName)!.push(callback);
    }

    /**
     * 注销游戏事件回调
     * @param eventName 事件名称
     * @param callback 回调函数
     */
    off(eventName: string, callback: Function): void {
        const callbacks = this._eventCallbacks.get(eventName);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 触发游戏事件
     * @param eventName 事件名称
     * @param data 事件数据
     */
    emit(eventName: string, data?: any): void {
        const callbacks = this._eventCallbacks.get(eventName);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    this.logError(`事件回调执行错误: ${eventName}`, error);
                }
            });
        }
    }
}
