/**
 * 卡牌服务
 * 负责卡牌相关的业务逻辑
 */
import { LogService } from '../utils/LogService';
import { CardManager } from '../managers/CardManager';
import { GameManager } from '../managers/GameManager';

export class CardService {
    private _cardManager: CardManager;
    private _gameManager: GameManager;

    constructor(cardManager: CardManager, gameManager: GameManager) {
        this._cardManager = cardManager;
        this._gameManager = gameManager;
    }

    /**
     * 获取服务端发的玩家手牌
     * @param seatIndex 玩家座位索引
     * @returns 卡牌ID数组
     */
    getServerHoleCards(seatIndex: number): number[] | undefined {
        return this._gameManager.getPlayerHoleCardsFromServer(seatIndex);
    }

    /**
     * 获取玩家手牌信息对象数组
     * @param seatIndex 玩家座位索引
     * @returns 卡牌信息对象数组
     */
    getPlayerHoleCardInfos(seatIndex: number): any[] {
        const cards = this._cardManager.getPlayerHoleCards(seatIndex);
        return cards || [];
    }

    /**
     * 根据卡牌ID获取卡牌信息
     * @param cardId 卡牌ID
     * @returns 卡牌信息对象
     */
    getCardInfoById(cardId: number): any {
        return this._cardManager.getPokerById(cardId);
    }

    /**
     * 获取公共牌
     * @returns 公共牌数组
     */
    getCommunityCards(): any[] {
        return this._cardManager.getBoard();
    }

    /**
     * 设置公共牌
     * @param cardIds 卡牌ID数组
     */
    setCommunityCards(cardIds: number[]): void {
        this._cardManager.setCommunityCards(cardIds);
    }

    /**
     * 重置所有卡牌
     */
    resetCards(): void {
        this._cardManager.resetCards();
    }

    /**
     * 发单张公牌
     * @param cardId 卡牌ID
     * @param positionIndex 位置索引
     */
    dealBoardCard(cardId: number, positionIndex: number): void {
        const cardInfo = this._cardManager.getPokerById(cardId);
        this._cardManager.dealBoardCard(cardInfo, positionIndex);
    }

    /**
     * 批量发公牌
     * @param cardIds 卡牌ID数组
     */
    dealBoardCards(cardIds: number[]): void {
        const cards = cardIds.map(id => this._cardManager.getPokerById(id));
        this._cardManager.dealBoardCards(cards);
    }

    /**
     * 检查玩家是否有有效手牌
     * @param seatIndex 玩家座位索引
     * @returns 是否有有效手牌
     */
    hasValidHoleCards(seatIndex: number): boolean {
        const cards = this._cardManager.getPlayerHoleCards(seatIndex);
        return cards && cards.length === 2;
    }
}
