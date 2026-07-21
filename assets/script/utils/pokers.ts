/**
 * 扑克牌生成工具
 * 负责生成和洗牌
 */

export interface PokerInfo {
    suit: string;
    point: number;
}

// 与服务端PokerUtils.java一致的花色顺序：0=Spade, 1=Heart, 2=Diamond, 3=Club
const suitList: string[] = ['Spade', 'Heart', 'Diamond', 'Club'];

const pokers = (): PokerInfo[] => {
    let list: PokerInfo[] = [];
    suitList.forEach(suit => {
        for (let i = 2; i <= 14; i++) {
            list.push({
                suit,
                point: i
            });
        }
    });
    return list;
};

// 为Array添加shuffle方法
if (!Array.prototype.shuffle) {
    Array.prototype.shuffle = function <T>(this: T[]): T[] {
        for (let j: number, x: T, i: number = this.length; i; j = Math.floor(Math.random() * i), x = this[--i], this[i] = this[j], this[j] = x);
        return this;
    };
}

export const getPokers = (): PokerInfo[] => {
    const list = pokers();
    return list.shuffle();
};

/**
 * 获取牌的名称（用于日志显示）
 * @param point 牌的点数 (2-14)
 * @returns 牌的名称 (2-10, J, Q, K, A)
 */
export const getCardName = (point: number): string => {
    if (point >= 2 && point <= 10) {
        return point.toString();
    }
    switch (point) {
        case 11: return 'J';
        case 12: return 'Q';
        case 13: return 'K';
        case 14: return 'A';
        default: return '?';
    }
};