import { Node, Prefab, instantiate, Vec3, SpriteFrame, tween } from 'cc';
import { ViewPresenter } from './BasePresenter';
import { Card } from '../types';
import { LogService } from '../utils/LogService';
import { pokerCard } from '../pokerCard';

/**
 * 卡牌显示配置
 */
export interface CardDisplayConfig {
    pokerPrefab: Prefab;
    cardParent: Node;
    communityCardParent?: Node;
}

/**
 * 卡牌显示 Presenter
 * 负责管理所有卡牌的显示、隐藏和动画
 * ⚠️ 已禁用对象池缓存，确保每次都使用最新预制体
 */
export class CardDisplayPresenter extends ViewPresenter {
    private _config: CardDisplayConfig | null = null;
    private _communityCards: Node[] = [];
    private _playerCards: Map<number, Node[]> = new Map();

    /**
     * 构造函数
     */
    constructor(pokerPrefab?: Prefab, cardParent?: Node) {
        super(cardParent);
        if (pokerPrefab && cardParent) {
            this._config = { pokerPrefab, cardParent };
        }
        }

    /**
     * 初始化
     */
    initWithConfig(config: CardDisplayConfig): void {
        this._config = config;
        this._view = config.cardParent;
        this.init();
    }

    protected onInit(): void {
        // ⚠️ 已禁用预加载，确保每次都使用最新预制体
    }

    protected onDestroy(): void {
        super.onDestroy();
        this.clearAllCards();
        this._communityCards = [];
        this._playerCards.clear();
        this._config = null;
    }

    protected onReset(): void {
        this.clearAllCards();
        // ✅ [修复] 重置时清空数组，确保与场景中的节点同步
        this._communityCards = [];
    }

    /**
     * 获取卡牌节点（直接实例化，不使用对象池）
     */
    private acquireCard(): Node | null {
        if (this._config?.pokerPrefab) {
            // ⚠️ 直接实例化最新预制体，不使用缓存
            return instantiate(this._config.pokerPrefab);
        }
        return null;
    }

    /**
     * 释放卡牌节点（直接销毁，不归还到对象池）
     */
    private releaseCard(card: Node): void {
        if (!card) return;
        // ⚠️ 直接销毁，不缓存
        card.destroy();
    }

    // ==================== 与 gaming.ts 兼容的公共方法 ====================

    /**
     * 显示单张卡牌
     */
    showCard(parent: Node, cardData: any, position: Vec3): Node | null {
        const card = this.acquireCard();
        if (!card) return null;

        parent.addChild(card);
        card.setPosition(position);
        card.active = true;

        // 更新卡牌显示
        this.updateCardDisplay(card, cardData);

        return card;
    }

    /**
     * 更新卡牌显示
     */
    private updateCardDisplay(card: Node, cardData: any): void {
        const pokerCardComponent = card.getComponent(pokerCard);
        if (pokerCardComponent) {
            if (cardData.suit !== undefined && cardData.rank !== undefined) {
                // 新的格式（rank 与 point 含义相同，都是牌面点数）
                pokerCardComponent.showPoker(cardData.suit, cardData.rank);
            } else if (cardData.point !== undefined) {
                // 兼容旧的格式
                pokerCardComponent.showPoker(cardData.suit, cardData.point);
            }
        }
    }

    /**
     * 显示玩家手牌
     */
    showPlayerCards(seatIndex: number, cards: any[], positions: Vec3[]): void {
        // 先清除旧的手牌
        this.hidePlayerCards(seatIndex);

        if (!this._config?.cardParent) return;

        const cardNodes: Node[] = [];
        cards.forEach((cardData, index) => {
            const pos = positions[index] || new Vec3(0, 0, 0);
            const cardNode = this.showCard(this._config.cardParent, cardData, pos);
            if (cardNode) {
                cardNodes.push(cardNode);
            }
        });

        if (cardNodes.length > 0) {
            this._playerCards.set(seatIndex, cardNodes);
        }
    }

    /**
     * 创建玩家手牌（与 gaming.ts 中的 createPlayerHoleCards 对应）
     */
    createPlayerHoleCards(seatIndex: number, cards: any[], positions: Vec3[]): void {
        this.showPlayerCards(seatIndex, cards, positions);
    }

    /**
     * 翻牌动画（与 gaming.ts 中的 flipPlayerCards 对应）
     */
    flipPlayerCards(seatIndex: number): void {
        const cards = this._playerCards.get(seatIndex);
        if (!cards) return;

        cards.forEach(card => {
            const pokerCardComponent = card.getComponent(pokerCard);
            if (pokerCardComponent) {
                // ✅ [修复] pokerCard 类没有 flip() 方法，使用 getCurrentCard() 获取当前牌面信息
                // 如果牌当前显示背面，则翻到正面；如果已经是正面，则保持不变
                const currentCard = pokerCardComponent.getCurrentCard();
                if (currentCard) {
                    // 牌已显示正面，不需要翻转
                    LogService.info('CardDisplayPresenter', `卡牌已经显示正面: ${currentCard.suit} ${currentCard.point}`);
                } else {
                    // 牌当前显示背面，但没有牌面数据，无法翻转
                    LogService.warn('CardDisplayPresenter', '卡牌显示背面但没有牌面数据，无法翻转');
                }
            }
        });
    }

    /**
     * 显示公共牌（与 gaming.ts 中的 showCommunityCards 对应）
     */
    showCommunityCards(cards: any[], positions: Vec3[]): void {
        const parent = this._config?.communityCardParent || this._config?.cardParent;
        if (!parent) return;

        cards.forEach((cardData, index) => {
            // 如果该位置已有卡牌，跳过
            if (this._communityCards[index]) {
                return;
            }
            const pos = positions[index] || new Vec3(0, 0, 0);
            const cardNode = this.showCard(parent, cardData, pos);
            if (cardNode) {
                this._communityCards[index] = cardNode;
            }
        });
    }

    /**
     * 立即发公共牌（与 gaming.ts 中的 dealBoardCardImmediate 对应）
     * @param cardData - 卡牌数据
     * @param index - 公牌位置索引（0-4）
     * @param position - 卡牌位置
     * @param forceReplace - 是否强制替换已有的卡牌（默认false，即已发的牌不再处理）
     */
    dealBoardCardImmediate(cardData: any, index: number, position?: Vec3, forceReplace: boolean = false): void {
        const parent = this._config?.communityCardParent || this._config?.cardParent;
        if (!parent) return;

        // ✅ [修复] 双重检查：同时检查内部数组和场景中的节点
        // 防止状态不同步导致的卡牌被错误替换或隐藏
        
        // 检查内部数组中是否已有卡牌
        const hasInArray = this._communityCards[index] && this._communityCards[index].isValid;
        
        // 检查场景中是否已存在同名节点
        const existingNode = parent.getChildByName(`board_card_${index}`);
        const hasInScene = existingNode && existingNode.isValid;

        // 如果任一检查发现已存在卡牌且不强制替换，则跳过
        if ((hasInArray || hasInScene) && !forceReplace) {
            
            // ✅ [修复] 如果内部数组与场景不同步，同步数组状态
            if (hasInScene && !hasInArray) {
                this._communityCards[index] = existingNode;
            }
            
            return;
        }

        // 如果需要替换或强制替换，则先移除原有卡牌
        if (hasInArray) {
            this.releaseCard(this._communityCards[index]);
        }
        // 如果场景中有但数组中没有，也需要移除
        if (hasInScene && !hasInArray) {
            existingNode.destroy();
        }

        const pos = position || new Vec3(0, 0, 0);
        const cardNode = this.showCard(parent, cardData, pos);
        if (cardNode) {
            cardNode.name = `board_card_${index}`;
            this._communityCards[index] = cardNode;
        }
    }

    /**
     * 隐藏所有玩家手牌
     */
    hideAllPlayerCards(): void {
        for (const [seatIndex, cards] of this._playerCards.entries()) {
            cards.forEach(card => this.releaseCard(card));
        }
        this._playerCards.clear();
    }

    /**
     * 隐藏指定玩家的手牌
     * @returns 是否成功隐藏了手牌
     */
    hidePlayerCards(seatIndex: number): boolean {
        const cards = this._playerCards.get(seatIndex);
        if (cards) {
            cards.forEach(card => this.releaseCard(card));
            this._playerCards.delete(seatIndex);
            return true;
        } else {
            // ✅ [关键修复] 如果 _playerCards Map 中没有记录，通过节点名称查找
            // 手牌节点命名规则：player_card_${seatIndex}_${i}（使用从1开始的索引，与 deal() 方法保持一致）
            if (this._config?.cardParent) {
                const cardNodes: Node[] = [];
                for (let i = 1; i <= 2; i++) {
                    const cardNode = this._config.cardParent.getChildByName(`player_card_${seatIndex}_${i}`);
                    if (cardNode) {
                        cardNodes.push(cardNode);
                    }
                }
                if (cardNodes.length > 0) {
                    cardNodes.forEach(card => this.releaseCard(card));
                    LogService.info("CardDisplayPresenter", `✅ 通过节点名称找到并隐藏玩家 ${seatIndex} 的手牌`);
                    return true;
                }
            }
            LogService.info("CardDisplayPresenter", `⚠️ 玩家 ${seatIndex} 的手牌不在 _playerCards 中，无法通过 Presenter 隐藏`);
            return false;
        }
    }

    /**
     * 清除公共牌
     */
    clearCommunityCards(): void {
        this._communityCards.forEach(card => {
            if (card) this.releaseCard(card);
        });
        this._communityCards = [];
    }

    /**
     * 隐藏所有卡牌（与 gaming.ts 中的 hideAllCards 对应）
     */
    hideAllCards(): void {
        this.hideAllPlayerCards();
        this.clearCommunityCards();
    }

    /**
     * 清除所有卡牌
     */
    clearAllCards(): void {
        this.hideAllCards();
    }

    /**
     * 清除公共牌（别名，与 gaming.ts 函数名一致）
     */
    clearBoardCards(): void {
        this.clearCommunityCards();
    }

    // ==================== 获取方法 ====================

    /**
     * 获取玩家手牌节点
     */
    getPlayerCards(seatIndex: number): Node[] | undefined {
        return this._playerCards.get(seatIndex);
    }

    /**
     * 获取公共牌节点
     */
    getCommunityCards(): Node[] {
        return [...this._communityCards];
    }

    // ==================== 搓牌相关方法 ====================
    private _originalCardPositions: Map<number, Vec3[]> = new Map();

    /**
     * 错开玩家手牌位置（搓牌效果）
     * @param seatIndex 座位索引
     * @param playerX 玩家X位置（用于判断偏移方向）
     * @param playerY 玩家Y位置（用于判断偏移方向）
     */
    offsetPlayerCards(seatIndex: number, playerX: number, playerY: number): void {
        const cardNodes = this._playerCards.get(seatIndex);
        if (!cardNodes || cardNodes.length < 2) {
            return;
        }

        let offsetX = 60;
        let offsetY = 60;

        if (playerX < 0) {
            offsetX = Math.abs(offsetX);
        } else {
            offsetX = -Math.abs(offsetX);
        }

        if (playerY < 0) {
            offsetY = Math.abs(offsetY);
        } else {
            offsetY = -Math.abs(offsetY);
        }

        const originalPositions: Vec3[] = [];
        for (let i = 0; i < cardNodes.length; i++) {
            const cardNode = cardNodes[i];
            const originalPos = cardNode.getPosition().clone();
            originalPositions.push(originalPos);

            const cardOffsetX = offsetX * (i === 0 ? -0.5 : 0.5);
            const cardOffsetY = offsetY;

            const newPos = new Vec3(
                originalPos.x + cardOffsetX,
                originalPos.y + cardOffsetY,
                originalPos.z
            );

            tween(cardNode).to(0.2, { position: newPos }).start();
        }

        this._originalCardPositions.set(seatIndex, originalPositions);
    }

    /**
     * 重置玩家手牌到原始位置（搓牌恢复）
     */
    resetPlayerCardsPosition(seatIndex: number): void {
        if (!this._originalCardPositions) {
            return;
        }

        const originalPositions = this._originalCardPositions.get(seatIndex);
        if (!originalPositions) {
            return;
        }

        const cardNodes = this._playerCards.get(seatIndex);
        if (!cardNodes || cardNodes.length !== originalPositions.length) {
            return;
        }

        for (let i = 0; i < cardNodes.length; i++) {
            const cardNode = cardNodes[i];
            const originalPos = originalPositions[i];

            tween(cardNode).to(0.2, { position: originalPos }).start();
        }

        this._originalCardPositions.delete(seatIndex);
    }

    /**
     * 检查手牌是否已经错开
     */
    isCardsOffset(seatIndex: number): boolean {
        return this._originalCardPositions.has(seatIndex);
    }
}
