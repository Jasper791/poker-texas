import { LogService } from './utils/LogService';
/**
 * 扑克牌组件
 * 负责显示和管理扑克牌的显示状态
 */
import { _decorator, Component, Node, SpriteFrame, Sprite, resources } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('pokerCard')
export class pokerCard extends Component {

    @property({ type: SpriteFrame })
    public backSpriteFrame: SpriteFrame = null

    private _currentSuit: string = '';
    private _currentPoint: number = 0;
    private _loadingPromise: Promise<SpriteFrame> | null = null;
    private _isBack: boolean = true;

    start() {

    }

    public showPoker(suit: string, point: number, onComplete?: () => void) {
        const img = this.node.getChildByName('img');
        if (!img) {
            LogService.warn('pokerCard', 'img 节点不存在');
            return;
        }
        
        const sprite = img.getComponent(Sprite);
        if (!sprite) {
            LogService.warn('pokerCard', 'img 节点没有 Sprite 组件');
            return;
        }
        
        const path = `pokers/${suit}/${suit}_${point}/spriteFrame`;
        
        // 如果正在加载，先取消之前的加载
        if (this._loadingPromise) {
            this._loadingPromise = null;
        }
        
        this._currentSuit = suit;
        this._currentPoint = point;
        this._isBack = false;
        
        this._doShowPoker(suit, point, sprite, path, onComplete);
    }
    
    private _doShowPoker(suit: string, point: number, sprite: Sprite, path: string, onComplete?: () => void) {
        const loadPromise = new Promise<SpriteFrame>((resolve, reject) => {
            resources.load(path, SpriteFrame, (err, spriteFrame) => {
                if (err) {
                    LogService.error('pokerCard', `加载牌面失败: ${path}`, err);
                    reject(err);
                    return;
                }
                resolve(spriteFrame as SpriteFrame);
            });
        });
        
        this._loadingPromise = loadPromise;
        
        loadPromise.then((spriteFrame) => {
            // 再次检查，确保还是同一张牌（防止异步竞态）
            if (this._currentSuit === suit && this._currentPoint === point && !this._isBack) {
                sprite.spriteFrame = spriteFrame;
                if (onComplete) {
                    onComplete();
                }
            }
        }).catch((err) => {
            LogService.error('pokerCard', `显示牌面失败: ${path}`, err);
        });
    }

    public backPoker() {
        // 取消任何正在进行的加载
        this._loadingPromise = null;
        this._currentSuit = '';
        this._currentPoint = 0;
        this._isBack = true;
        
        const img = this.node.getChildByName('img');
        if (img && img.getComponent(Sprite)) {
            img.getComponent(Sprite).spriteFrame = this.backSpriteFrame;
        }
    }
    
    /**
     * 重置卡牌状态（用于对象池归还时）
     */
    public resetToPool() {
        // 取消任何正在进行的加载
        this._loadingPromise = null;
        this._currentSuit = '';
        this._currentPoint = 0;
        this._isBack = true;
        
        // 重置牌面到背面
        const img = this.node.getChildByName('img');
        if (img && img.getComponent(Sprite)) {
            img.getComponent(Sprite).spriteFrame = this.backSpriteFrame;
        }
        
        // 重置节点状态
        if (this.node) {
            this.node.active = true;
        }
    }
    
    public isCardShowing(): boolean {
        return this._currentSuit !== '' && this._currentPoint > 0 && !this._isBack;
    }
    
    public getCurrentCard(): { suit: string, point: number } | null {
        if (this._currentSuit && this._currentPoint > 0 && !this._isBack) {
            return { suit: this._currentSuit, point: this._currentPoint };
        }
        return null;
    }

    /**
     * 获取当前卡牌信息的字符串表示（用于调试）
     */
    public getCardInfoString(): string {
        if (this._isBack) {
            return '[背面]';
        }
        if (this._currentSuit && this._currentPoint) {
            return `[${this._currentSuit} ${this._currentPoint}]`;
        }
        return '[未初始化]';
    }


    update(deltaTime: number) {

    }
}
