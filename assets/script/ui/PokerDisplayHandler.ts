import { LogService } from '../utils/LogService';
/**
 * 扑克牌显示处理器
 * 负责管理扑克牌的显示、清除和动画
 * ⚠️ 已禁用对象池，确保每次都使用最新预制体
 */
import { Node, Prefab, Vec3, instantiate } from 'cc';
import { CardManager } from '../managers/CardManager';
import { GameManager } from '../managers/GameManager';
import { PlayerManager } from '../managers/PlayerManager';
import { pokerCard } from '../pokerCard';

export class PokerDisplayHandler {
    
    private _container: Node;
    private _pokerPrefab: Prefab;
    private _cardManager: CardManager;
    private _gameManager: GameManager;
    private _playerManager: PlayerManager;
    private _playerCards: any[];
    
    constructor(
        container: Node,
        pokerPrefab: Prefab,
        cardManager: CardManager,
        gameManager: GameManager,
        playerManager: PlayerManager
    ) {
        this._container = container;
        this._pokerPrefab = pokerPrefab;
        this._cardManager = cardManager;
        this._gameManager = gameManager;
        this._playerManager = playerManager;
        
        // 初始化玩家牌数组
        this._playerCards = [];
        
        }
    
    /**
     * 显示玩家手牌
     */
    async showPlayerCards(seatIndex: number, cards: any[]): Promise<void> {
        
        // 获取玩家位置
        const playerPos = this._getPlayerPositions();
        if (!playerPos || playerPos.length <= seatIndex) {
            LogService.error('PokerDisplayHandler', `无法获取玩家位置: seatIndex=${seatIndex}`);
            return;
        }
        
        const pos = playerPos[seatIndex];
        
        // 确保玩家牌数组已初始化
        if (!this._playerCards[seatIndex]) {
            this._playerCards[seatIndex] = [];
        }
        
        // 创建手牌
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const poker = this._cardManager.getPokerById(card);
            
            if (!poker) {
                LogService.error('PokerDisplayHandler', `无法获取扑克牌: cardId=${card}`);
                continue;
            }
            
            // ⚠️ 直接实例化最新预制体，不使用对象池
            const pokerCardNode = instantiate(this._pokerPrefab);
            
            const pokerComponent = pokerCardNode.getComponent(pokerCard);
            pokerComponent.showPoker(poker.suit, poker.point);
            
            // 设置节点名称用于识别（使用从1开始的索引，与 deal() 方法保持一致）
            pokerCardNode.name = `player_card_${seatIndex}_${i + 1}`;
            
            // 设置位置（两张牌稍微偏移）
            const offsetX = (i - 0.5) * 30; // 每张牌偏移15像素
            pokerCardNode.setPosition(new Vec3(
                pos.x + offsetX,
                pos.y + 50, // 在头像上方
                0
            ));
            
            pokerCardNode.setSiblingIndex(1000 + seatIndex * 10 + i);
            
            this._container.addChild(pokerCardNode);
            
            // 保存引用
            this._playerCards[seatIndex][i] = pokerCardNode;
        }
    }
    
    /**
     * 显示公共牌（增量更新模式）
     * 只创建不存在的公牌，避免重复清除和重建
     */
    async showCommunityCards(cards: number[]): Promise<void> {
        
        // 根据公牌数量决定显示哪个阶段的公牌（增量更新，不清除已有牌）
        if (cards.length >= 3) {
            // 翻牌阶段：显示3张公牌
            for (let i = 0; i < 3 && i < cards.length; i++) {
                // 检查该位置是否已有卡牌，避免重复创建
                const existingCard = this._container.getChildByName(`board_card_${i}`);
                if (!existingCard || !existingCard.isValid) {
                    await this._dealBoardCardWithDelay(cards[i], i);
                } else {
                }
            }
        }
        if (cards.length >= 4) {
            // 转牌阶段：显示第4张公牌
            const existingCard3 = this._container.getChildByName(`board_card_3`);
            if (!existingCard3 || !existingCard3.isValid) {
                await this._dealBoardCardWithDelay(cards[3], 3);
            } else {
            }
        }
        if (cards.length >= 5) {
            // 河牌阶段：显示第5张公牌
            const existingCard4 = this._container.getChildByName(`board_card_4`);
            if (!existingCard4 || !existingCard4.isValid) {
                await this._dealBoardCardWithDelay(cards[4], 4);
            } else {
            }
        }
    }
    
    /**
     * 带延迟的公牌发牌
     */
    private async _dealBoardCardWithDelay(cardId: number, index: number, delay: number = 300): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => {
                this.dealBoardCardImmediate(cardId, index);
                resolve();
            }, delay);
        });
    }
    
    /**
     * 立即显示公牌（不带动画）
     */
    dealBoardCardImmediate(cardId: number, index: number) {
        const poker = this._cardManager.getPokerById(cardId);
        if (!poker) {
            LogService.error('PokerDisplayHandler', `无法获取扑克牌: cardId=${cardId}`);
            return;
        }
        
        this._cardManager.dealBoardCard(poker, index);
        
        // ⚠️ 直接实例化最新预制体，不使用对象池
        const pokerCardPrefab = instantiate(this._pokerPrefab);
        
        let pokerComponent = pokerCardPrefab.getComponent(pokerCard);
        pokerComponent.showPoker(poker.suit, poker.point);
        pokerCardPrefab.name = 'board_card_' + index;
        this._container.addChild(pokerCardPrefab);
        
        const boardPos = this._gameManager.getBoardPositions()[index];
        pokerCardPrefab.setPosition(new Vec3(boardPos.x, boardPos.y, 0));
        pokerCardPrefab.setSiblingIndex(2000);
    }
    
    /**
     * 从服务端状态更新公共牌（增量更新模式）
     * 只创建不存在的公牌，避免重复清除和重建
     */
    updateCommunityCardsFromState(cards: number[]) {
        if (!cards || !Array.isArray(cards)) {
            return;
        }
        
        // 根据公牌数量决定显示哪个阶段的公牌（增量更新，不清除已有牌）
        if (cards.length >= 3) {
            for (let i = 0; i < 3 && i < cards.length; i++) {
                // 检查该位置是否已有卡牌，避免重复创建
                const existingCard = this._container.getChildByName(`board_card_${i}`);
                if (!existingCard || !existingCard.isValid) {
                    this.dealBoardCardImmediate(cards[i], i);
                } else {
                }
            }
        }
        if (cards.length >= 4) {
            const existingCard3 = this._container.getChildByName(`board_card_3`);
            if (!existingCard3 || !existingCard3.isValid) {
                this.dealBoardCardImmediate(cards[3], 3);
            } else {
            }
        }
        if (cards.length >= 5) {
            const existingCard4 = this._container.getChildByName(`board_card_4`);
            if (!existingCard4 || !existingCard4.isValid) {
                this.dealBoardCardImmediate(cards[4], 4);
            } else {
            }
        }
    }
    
    /**
     * 从服务端状态更新玩家手牌
     */
    updatePlayerHoleCardsFromState(players: any[]) {
        if (!players || !Array.isArray(players)) {
            return;
        }
        
        // 先清除现有的手牌
        this.clearPlayerCards();
        
        // 初始化玩家牌引用数组
        this._playerCards = new Array(this._playerManager.getPlayersNum()).fill(0).map(() => []);
        
        // 获取玩家位置
        const playerPos = this._getPlayerPositions();
        
        // 遍历每个玩家并显示手牌
        for (const playerState of players) {
            const seatIndex = playerState.seatIndex;
            if (seatIndex === undefined || seatIndex === null) {
                continue;
            }
            
            const holeCards = playerState.holeCards;
            if (!holeCards || !Array.isArray(holeCards)) {
                continue;
            }
            
            // 只显示当前玩家的手牌（其他玩家显示背面）
            // ⚠️ [修复] PlayerManager 没有 isCurrentPlayer 方法，使用 getPlayerSeat() 判断真实玩家
            if (this._playerManager.getPlayerSeat() === seatIndex) {
                this.showPlayerCards(seatIndex, holeCards);
            } else {
                // 其他玩家显示背面
                this._showPlayerCardsBack(seatIndex);
            }
        }
    }
    
    /**
     * 显示玩家手牌背面
     */
    private _showPlayerCardsBack(seatIndex: number) {
        const playerPos = this._getPlayerPositions();
        if (!playerPos || playerPos.length <= seatIndex) {
            return;
        }
        
        const pos = playerPos[seatIndex];
        
        if (!this._playerCards[seatIndex]) {
            this._playerCards[seatIndex] = [];
        }
        
        // 显示两张背面牌
        for (let i = 0; i < 2; i++) {
            // ⚠️ 直接实例化最新预制体，不使用对象池
            const pokerCardNode = instantiate(this._pokerPrefab);
            
            const pokerComponent = pokerCardNode.getComponent(pokerCard);
            pokerComponent.backPoker();
            
            // 使用从1开始的索引，与 deal() 方法保持一致
            pokerCardNode.name = `player_card_${seatIndex}_${i + 1}`;
            
            const offsetX = (i - 0.5) * 30;
            pokerCardNode.setPosition(new Vec3(
                pos.x + offsetX,
                pos.y + 50,
                0
            ));
            
            pokerCardNode.setSiblingIndex(1000 + seatIndex * 10 + i);
            this._container.addChild(pokerCardNode);
            
            this._playerCards[seatIndex][i] = pokerCardNode;
        }
    }
    
    /**
     * 清除所有公牌
     */
    clearBoardCards() {
        // 移除所有公牌节点
        const boardCards = this._container.children.filter(child => {
            return child.name && child.name.startsWith('board_card_');
        });
        
        for (const card of boardCards) {
            // ⚠️ 直接销毁，不归还到对象池
            card.destroy();
        }
        
        // 重置CardManager中的公牌数据
        this._cardManager.setCommunityCards([]);
    }
    
    /**
     * 清除所有玩家手牌
     */
    clearPlayerCards() {
        // 移除所有玩家手牌节点
        const playerCards = this._container.children.filter(child => {
            return child.name && child.name.startsWith('player_card_');
        });
        
        for (const card of playerCards) {
            // ⚠️ 直接销毁，不归还到对象池
            card.destroy();
        }
        
        // 重置玩家牌数组
        this._playerCards = [];
    }
    
    /**
     * 清除上一局的所有牌节点（包括手牌和公牌）
     */
    clearPreviousRoundCards() {
        
        // 先清除公牌
        this.clearBoardCards();
        
        // 清除所有玩家手牌
        this.clearPlayerCards();
        
        // 重置CardManager中的公牌数据
        this._cardManager.setCommunityCards([]);
    }
    
    /**
     * 获取玩家位置
     */
    private _getPlayerPositions(): any[] {
        // 这里需要根据实际情况获取玩家位置
        // 可以从 gamingPvp 传入的回调获取
        return [];
    }
    
    /**
     * 设置玩家位置获取回调
     */
    setGetPlayerPositionsCallback(callback: () => any[]) {
        // 可选：如果需要动态获取玩家位置
    }
}
