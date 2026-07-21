/**
 * UI 事件处理器
 * 负责处理 UI 交互相关的事件
 */
import { BaseEventHandler } from './BaseEventHandler';
import { LogService } from '../utils/LogService';
import { Node, EventTouch } from 'cc';

export class UIEventHandler extends BaseEventHandler {
    private _uiCallbacks: Map<string, Function[]> = new Map();
    private _boundNodes: Set<Node> = new Set();

    constructor() {
        super('UIEventHandler');
    }

    /**
     * 初始化 UI 事件处理器
     */
    init(): void {
        if (this._isInitialized) {
            //LogService.warn(this._handlerName, '已经初始化过，跳过');
            return;
        }

        this._isInitialized = true;
    }

    /**
     * 销毁 UI 事件处理器
     */
    destroy(): void {
        // 清除所有绑定的事件
        this._boundNodes.forEach(node => {
            node.off(Node.EventType.TOUCH_START);
            node.off(Node.EventType.TOUCH_END);
            node.off(Node.EventType.TOUCH_CANCEL);
        });

        this._uiCallbacks.clear();
        this._boundNodes.clear();
        this._isInitialized = false;
        //LogService.info(this._handlerName, 'UI 事件处理器已销毁');
    }

    /**
     * 处理按钮点击事件
     */
    onButtonClick(buttonId: string, eventData: any): void {
        this.logEvent('BUTTON_CLICK', { buttonId, eventData });
        this.emit('button', { buttonId, eventData });
    }

    /**
     * 处理玩家头像点击事件
     */
    onAvatarClick(seatIndex: number, event: EventTouch): void {
        this.logEvent('AVATAR_CLICK', { seatIndex });
        this.emit('avatar_click', { seatIndex, event });
    }

    /**
     * 处理卡牌点击事件
     */
    onCardClick(cardIndex: number, seatIndex: number, event: EventTouch): void {
        this.logEvent('CARD_CLICK', { cardIndex, seatIndex });
        this.emit('card_click', { cardIndex, seatIndex, event });
    }

    /**
     * 处理操作按钮事件
     */
    onActionButton(action: string, amount?: number): void {
        this.logEvent('ACTION_BUTTON', { action, amount });
        this.emit('action', { action, amount });
    }

    /**
     * 处理返回按钮点击
     */
    onBackButtonClick(): void {
        this.logEvent('BACK_BUTTON_CLICK');
        this.emit('back');
    }

    /**
     * 处理继续游戏按钮点击
     */
    onContinueButtonClick(): void {
        this.logEvent('CONTINUE_BUTTON_CLICK');
        this.emit('continue');
    }

    /**
     * 注册 UI 事件回调
     * @param eventName 事件名称
     * @param callback 回调函数
     */
    on(eventName: string, callback: Function): void {
        if (!this._uiCallbacks.has(eventName)) {
            this._uiCallbacks.set(eventName, []);
        }
        this._uiCallbacks.get(eventName)!.push(callback);
    }

    /**
     * 注销 UI 事件回调
     * @param eventName 事件名称
     * @param callback 回调函数
     */
    off(eventName: string, callback: Function): void {
        const callbacks = this._uiCallbacks.get(eventName);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 触发 UI 事件
     * @param eventName 事件名称
     * @param data 事件数据
     */
    private emit(eventName: string, data?: any): void {
        const callbacks = this._uiCallbacks.get(eventName);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    this.logError(`UI 事件回调执行错误: ${eventName}`, error);
                }
            });
        }
    }

    /**
     * 绑定节点点击事件
     * @param node 节点
     * @param callback 回调
     */
    bindNodeClick(node: Node, callback: Function): void {
        if (!this._boundNodes.has(node)) {
            this._boundNodes.add(node);
            node.on(Node.EventType.TOUCH_END, callback);
        }
    }

    /**
     * 解绑节点点击事件
     * @param node 节点
     * @param callback 回调
     */
    unbindNodeClick(node: Node, callback: Function): void {
        if (this._boundNodes.has(node)) {
            node.off(Node.EventType.TOUCH_END, callback);
            this._boundNodes.delete(node);
        }
    }
}
