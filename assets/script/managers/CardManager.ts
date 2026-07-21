/**
 * 卡牌管理器
 * 负责牌的管理，包括发牌、烧牌等
 */
import { getPokers } from '../utils/pokers';
import { PlayerManager } from './PlayerManager';
import { LogService } from '../utils/LogService';

interface pokerInfo {
    suit: string;
    point: number;
}

export class CardManager {
    private _allPokers: pokerInfo[] = [];
    private _board: pokerInfo[] = [];
    private _playerHoleCards: { [key: number]: pokerInfo[] } = {};

    private static _handTypes: { type: number, name: string }[] = [
        { type: 1, name: '高牌' },      // index 1: HIGH_CARD
        { type: 2, name: '一对' },      // index 2: ONE_PAIR
        { type: 3, name: '两对' },      // index 3: TWO_PAIR
        { type: 4, name: '三条' },      // index 4: THREE_OF_A_KIND
        { type: 5, name: '顺子' },      // index 5: STRAIGHT
        { type: 6, name: '同花' },      // index 6: FLUSH
        { type: 7, name: '葫芦' },      // index 7: FULL_HOUSE
        { type: 8, name: '四条' },      // index 8: FOUR_OF_A_KIND
        { type: 9, name: '同花顺' },    // index 9: STRAIGHT_FLUSH
        { type: 10, name: '皇家同花顺' } // index 10: ROYAL_FLUSH
    ];

    constructor() {
        this.reset();
    }

    /**
     * 根据牌ID获取牌信息（与服务端PokerUtils.java一致）
     * @param cardId 牌ID (0-51)
     * @returns 牌信息
     */
    getPokerById(cardId: number): pokerInfo {
        // 与服务端PokerUtils.java一致的花色顺序：0=Spade, 1=Heart, 2=Diamond, 3=Club
        const suitList = ['Spade', 'Heart', 'Diamond', 'Club'];
        const suitIndex = Math.floor(cardId / 13);
        const point = (cardId % 13) + 2;
        return {
            suit: suitList[suitIndex],
            point: point
        };
    }

    /**
     * 重置牌堆
     * @param playersNum 玩家数量
     */
    reset(playersNum: number = 9) {
        this._allPokers = getPokers();
        this._board = [];
        this._playerHoleCards = {};
        
        // 根据动态配置的玩家数量生成底牌数组
        for (let i = 0; i < playersNum; i++) {
            this._playerHoleCards[i] = [];
        }
    }

    /**
     * 随机取牌
     * @param num 取牌数量
     * @returns 取出的牌
     */
    takePoker(num: number = 1): pokerInfo[] {
        const arr: pokerInfo[] = [];
        for (let i = 0; i < num; i++) {
            const l = this._allPokers.length;
            if (l === 0) {
                LogService.error('CardManager', '牌堆为空，无法发牌');
                break;
            }
            const index = Math.floor((Math.random() * l));
            arr.push(this._allPokers[index]);
            this._allPokers.splice(index, 1);
        }
        return arr;
    }

    /**
     * 烧牌
     */
    burnCard() {
        this.takePoker(1);
    }

    /**
     * 发底牌
     * @param playerIndex 玩家索引
     * @param cards 牌
     */
    dealHoleCards(playerIndex: number, cards: pokerInfo[]) {
        this._playerHoleCards[playerIndex] = cards;
    }

    /**
     * 发公牌
     * @param cards 牌
     */
    dealBoardCards(cards: pokerInfo[]) {
        this._board = this._board.concat(cards);
    }

    /**
     * 发单张公牌到指定位置
     * @param card 牌
     * @param index 位置索引
     */
    dealBoardCard(card: pokerInfo, index: number) {
        this._board[index] = card;
    }

    /**
     * 获取玩家底牌
     * @param playerIndex 玩家索引
     * @returns 玩家底牌
     */
    getPlayerHoleCards(playerIndex: number): pokerInfo[] {
        return this._playerHoleCards[playerIndex] || [];
    }

    /**
     * 获取公牌
     * @returns 公牌
     */
    getBoard(): pokerInfo[] {
        return this._board;
    }

    /**
     * 设置公共牌（用于同步服务端状态）
     * @param cardIds 卡牌ID数组
     */
    setCommunityCards(cardIds: number[]): void {
        this._board = [];
        if (cardIds && Array.isArray(cardIds)) {
            for (const cardId of cardIds) {
                if (cardId !== null && cardId !== undefined) {
                    this._board.push(this.getPokerById(cardId));
                }
            }
        }
    }

    /**
     * 重置游戏卡牌（用于重新开局）
     */
    resetCards(): void {
        // 使用默认的玩家数量重置
        this.reset(9);
    }

    /**
     * 根据牌型编号获取牌型名称（与服务端PokerHandRank.java一致）
     * @param handType 牌型编号 (1-10)
     * @returns 牌型名称
     */
    static getHandTypeName(handType: number): string {
        const handTypeData = CardManager._handTypes.find(h => h.type === handType);
        return handTypeData ? handTypeData.name : '高牌';
    }

    /**
     * 根据牌型名称获取牌型编号（与服务端PokerHandRank.java一致）
     * @param handTypeName 牌型名称
     * @returns 牌型编号 (1-10)
     */
    static getHandTypeFromName(handTypeName: string): number {
        const handTypeData = CardManager._handTypes.find(h => h.name === handTypeName);
        return handTypeData ? handTypeData.type : 1;
    }

    static getHandTypeConfigKey(handTypeName: string): string {
        const mapping: Record<string, string> = {
            '高牌': 'highCard',
            '一对': 'pair',
            '两对': 'twoPairs',
            '三条': 'threeOfAKind',
            '顺子': 'straight',
            '同花': 'flush',
            '葫芦': 'fullHouse',
            '四条': 'fourOfAKind',
            '同花顺': 'straightFlush',
            '皇家同花顺': 'royalFlush'
        };
        return mapping[handTypeName] || 'highCard';
    }
}
