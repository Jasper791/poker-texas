/**
 * 游戏管理器
 * 负责游戏的流程管理，包括游戏阶段、底池管理等
 */
import { Node, Label, Sprite, UITransform, Color, Vec3, tween, instantiate, Prefab } from 'cc';
import { CardManager } from './CardManager';
import { PlayerManager } from './PlayerManager';
import { pokerCard } from '../pokerCard';
import { SettingsManager } from './SettingsManager';
import { LogService } from '../utils/LogService';

interface pokerInfo {
    suit: string;
    point: number;
}

interface HandRank {
    type: number;
    strength: number;
    cards: pokerInfo[];
}

export class GameManager {
    private _cardManager: CardManager;
    private _playerManager: PlayerManager;
    private _roundGame: number = 0;
    private _pot: number = 0;
    private _blind = {
        smallBlind: 50,
        bigBlind: 100
    };
    private _buttonSeat: number = 0;
    private _boardPos = [
        { x: -165, y: -50 },
        { x: -82.5, y: -50 },
        { x: 0, y: -50 },
        { x: 82.5, y: -50 },
        { x: 165, y: -50 }
    ];
    private _communityCards: number[] = []; // 社区牌

    // 筹码管理
    private _playersChips: number[] = []; // 每个玩家的筹码
    private _playersNicknames: string[] = []; // 每个玩家的昵称
    private _playersBet: number[] = []; // 每个玩家当前轮的下注
    private _minBet: number = 100; // 最小下注额
    private _maxBet: number = 0; // 最大下注额（底池限注）
    private _lastRaiseAmount: number = 0; // 上一轮加注的幅度
    private _playersAllIn: number[] = []; // 每个玩家当前轮的全下金额
    private _currentHighestBet: number = 0; // 当前最高下注额
    private _smallBlindSeat: number = -1; // 小盲位索引（-1表示未设置）
    private _bigBlindSeat: number = -1; // 大盲位索引（-1表示未设置）
    
    // 服务端发送的手牌数据（用于结算时显示正确的牌型）
    private _serverHoleCards: { [key: number]: number[] } = {};
    
    // 服务端发送的玩家数据（用于结算时显示正确的牌型）
    private _serverPlayersData: any[] = [];

    // 边池数据（从服务端同步）
    private _sidePots: { amount: number, eligiblePlayers: number[] }[] = [];

    constructor() {
        this._cardManager = new CardManager();
        this._playerManager = new PlayerManager();
        this.reset();
    }

    /**
     * 重置游戏状态
     */
    reset(randomizePlayerSeat: boolean = true) {
        this._playerManager.reset(randomizePlayerSeat);
        const playersNum = this._playerManager.getPlayersNum();
        this._cardManager.reset(playersNum);
        this._roundGame = 0;
        this._pot = 0;
        this._lastRaiseAmount = 0; // 重置上一轮加注幅度
        
        // ✅ [修复] 清空公牌（防止旧局公牌残留）
        this._communityCards = [];
        
        // 清除服务端手牌数据（重要：防止旧局手牌残留）
        this.clearServerHoleCards();
        
        // 清除边池数据
        this._sidePots = [];

        // 重置盲注位（每局由服务端重新发送）
        this._smallBlindSeat = -1;
        this._bigBlindSeat = -1;
        
        // 保留按钮位，因为它会在 smallOrBig 中被推进
        // 保留玩家筹码，只重置下注
        this._playersBet = new Array(playersNum).fill(0);
        this._playersAllIn = new Array(playersNum).fill(0); // 重置全下金额
        this._playersNicknames = new Array(playersNum).fill(''); // 重置玩家昵称

        // 如果筹码数组为空或长度不对，初始化筹码
        if (this._playersChips.length !== playersNum) {
            const initialChips = SettingsManager.getInstance().getInitialChips();
            this._playersChips = new Array(playersNum).fill(initialChips);
            // 暂时不打印，避免与服务端模式的日志混淆
            // console.log(`初始化所有玩家筹码: ${initialChips}`);
        }
    }

    /**
     * 重置玩家筹码
     */
    resetPlayersChips() {
        const initialChips = SettingsManager.getInstance().getInitialChips();
        const playersNum = this._playerManager.getPlayersNum();
        this._playersChips = new Array(playersNum).fill(initialChips);
    }

    /**
     * 从服务端数据更新玩家信息
     * @param players 服务端玩家数据数组
     */
    updatePlayersFromServer(players: any[]) {
        // ✅ 保存服务端发送的完整玩家数据
        this._serverPlayersData = [...players];
        
        LogService.debug('GameManager', `[updatePlayersFromServer] 收到 ${players.length} 个玩家数据`);
        
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            // ✅ [修复] 明确检查 undefined，避免 0 值被当作 falsy
            const gameCoin = player.gameCoin !== undefined ? player.gameCoin : player.game_coin;
            const seatIndex = player.seatIndex !== undefined ? player.seatIndex : i;
            if (gameCoin !== undefined) {
                this._playersChips[seatIndex] = gameCoin;
            }
            
            // 保存服务端发送的手牌数据
            if ((player.holeCards && player.holeCards.length === 2) || (player.handCards && player.handCards.length === 2)) {
                const cards = player.holeCards || player.handCards;
                this._serverHoleCards[seatIndex] = cards;
                LogService.debug('GameManager', `[updatePlayersFromServer] 玩家 ${seatIndex} (userId=${player.userId}) 的手牌: ${cards}`);
            } else {
                // 警告：服务端没有发送玩家手牌数据
                LogService.warn('GameManager', `[WARNING] 服务端没有发送玩家 ${seatIndex} (userId=${player.userId}) 的手牌数据`);
                LogService.debug('GameManager', `[updatePlayersFromServer] 玩家 ${seatIndex} 的完整数据: ${JSON.stringify(player)}`);
            }
        }
        
        // 打印所有保存的手牌数据
        LogService.debug('GameManager', `[updatePlayersFromServer] 所有玩家手牌数据: ${JSON.stringify(this._serverHoleCards)}`);
    }
    
    /**
     * 获取服务端发送的玩家数据
     * @returns 玩家数据数组
     */
    getPlayersDataFromServer(): any[] {
        return this._serverPlayersData;
    }

    /**
     * 获取服务端发送的手牌数据
     * @param seatIndex 玩家座位索引
     * @returns 手牌数组（cardId），如果没有则返回undefined
     */
    getPlayerHoleCardsFromServer(seatIndex: number): number[] | undefined {
        return this._serverHoleCards[seatIndex];
    }

    /**
     * 获取玩家手牌（cardId数组）
     * @param seatIndex 玩家座位索引
     * @returns 手牌数组（cardId），如果没有则返回undefined
     */
    getPlayerCards(seatIndex: number): number[] | undefined {
        if (this._serverHoleCards[seatIndex]) {
            return this._serverHoleCards[seatIndex];
        }
        
        const pokerInfos = this._cardManager.getPlayerHoleCards(seatIndex);
        if (pokerInfos && pokerInfos.length === 2) {
            return pokerInfos.map(card => {
                const suitList = ['Spade', 'Heart', 'Diamond', 'Club'];
                const suitIndex = suitList.indexOf(card.suit);
                const point = card.point - 2;
                return suitIndex * 13 + point;
            });
        }
        
        return undefined;
    }

    /**
     * 设置服务端发送的手牌数据
     * @param seatIndex 玩家座位索引
     * @param handCards 手牌数组（cardId）
     */
    setPlayerHoleCardsFromServer(seatIndex: number, handCards: number[]): void {
        this._serverHoleCards[seatIndex] = handCards;
    }

    /**
     * 清除服务端手牌数据
     */
    clearServerHoleCards() {
        this._serverHoleCards = {};
    }

    /**
     * 从服务端数据初始化玩家筹码
     * @param players 服务端玩家数据数组（已经按seatIndex排序）
     */
    initializePlayersChipsFromServer(players: any[]) {
        const playersNum = this._playerManager.getPlayersNum();
        
        // 初始化所有位置为0筹码（不活跃）
        this._playersChips = new Array(playersNum).fill(0);
        this._playersNicknames = new Array(playersNum).fill('');
        
        // 只遍历有玩家数据的位置
        players.forEach((player, idx) => {
            if (!player) {
                return;
            }
            
            // ✅ [修复] 明确检查 undefined，避免 0 值被当作 falsy
            const gameCoin = player.gameCoin !== undefined ? player.gameCoin : (player.game_coin !== undefined ? player.game_coin : 1000);
            // seatIndex为-1时使用数组索引作为默认值（服务端创建房间时可能未返回seatIndex）
            let seatIndex = player.seatIndex;
            if (seatIndex === undefined || seatIndex === null || seatIndex < 0) {
                seatIndex = idx;
            }
            
            if (seatIndex >= 0 && seatIndex < playersNum) {
                this._playersChips[seatIndex] = gameCoin;
                this._playersNicknames[seatIndex] = player.nickname || '';
                
                // 保存服务端发送的手牌数据（发牌阶段）
                if ((player.holeCards && player.holeCards.length === 2) || (player.handCards && player.handCards.length === 2)) {
                    const cards = player.holeCards || player.handCards;
                    this._serverHoleCards[seatIndex] = cards;
                }
            }
        });
    }

    /**
     * 记录玩家下注金额（累加到当前下注金额）
     * @param playerIndex 玩家索引
     * @param amount 下注金额
     */
    recordPlayerBet(playerIndex: number, amount: number) {
        this._playersBet[playerIndex] += amount;
    }

    /**
     * 重置所有玩家在当前轮的下注金额
     */
    resetPlayersBetInRound() {
        const playersNum = this._playerManager.getPlayersNum();
        this._playersBet = new Array(playersNum).fill(0);
        this._lastRaiseAmount = 0; // 重置加注幅度
        this._playersAllIn = new Array(playersNum).fill(0); // 重置全下金额
    }

    /**
     * 获取上一轮加注的幅度
     * @returns 加注幅度
     */
    getLastRaiseAmount(): number {
        return this._lastRaiseAmount;
    }

    /**
     * 设置上一轮加注的幅度
     * @param amount 加注幅度
     */
    setLastRaiseAmount(amount: number) {
        this._lastRaiseAmount = amount;
    }

    /**
     * 记录玩家全下金额
     * @param playerIndex 玩家索引
     * @param amount 全下金额
     */
    recordPlayerAllIn(playerIndex: number, amount: number) {
        this._playersAllIn[playerIndex] = amount;
    }

    /**
     * 获取玩家全下金额
     * @param playerIndex 玩家索引
     * @returns 全下金额
     */
    getPlayerAllIn(playerIndex: number): number {
        return this._playersAllIn[playerIndex] || 0;
    }

    /**
     * 获取所有全下玩家中的最小全下金额（排除指定玩家）
     * 用于计算加注上限
     * @param excludePlayerIndex 排除的玩家索引，-1表示不排除
     * @returns 最小全下金额，如果没有任何全下玩家则返回0
     */
    getMinAllInAmount(excludePlayerIndex: number = -1): number {
        let minAmount = 0;
        for (let i = 0; i < this._playersAllIn.length; i++) {
            if (i === excludePlayerIndex) continue;
            if (this._playersAllIn[i] > 0) {
                if (minAmount === 0 || this._playersAllIn[i] < minAmount) {
                    minAmount = this._playersAllIn[i];
                }
            }
        }
        return minAmount;
    }

    /**
     * 计算主池和边池
     * @returns 包含主池和边池信息的对象
     */
    calculateMainAndSidePots(): { mainPot: number, sidePots: { amount: number, eligiblePlayers: number[] }[] } {
        const playersNum = this._playerManager.getPlayersNum();
        
        // 收集所有玩家的全下金额和活跃玩家
        const allInAmounts: number[] = [];
        const allInPlayers: number[] = [];
        const activePlayers: number[] = [];
        
        for (let i = 0; i < playersNum; i++) {
            if (this._playerManager.isPlayerActive(i)) {
                activePlayers.push(i);
                const allIn = this._playersAllIn[i];
                if (allIn > 0) {
                    allInAmounts.push(allIn);
                    allInPlayers.push(i);
                }
            }
        }
        
        if (allInAmounts.length === 0) {
            // 没有玩家全下，只有主池
            return {
                mainPot: this._pot,
                sidePots: []
            };
        }
        
        // 按全下金额排序（从小到大）
        const sortedAmounts = [...allInAmounts].sort((a, b) => a - b);
        const minAllIn = sortedAmounts[0];
        
        // 计算主池：每个活跃玩家投入最小全下金额
        const mainPot = minAllIn * activePlayers.length;
        
        // 计算边池
        const sidePots: { amount: number, eligiblePlayers: number[] }[] = [];
        let remainingPot = this._pot - mainPot;
        
        // 对于每个比最小全下更大的金额，创建边池
        for (let i = 1; i < sortedAmounts.length; i++) {
            const currentAmount = sortedAmounts[i];
            const diff = currentAmount - sortedAmounts[i - 1];
            
            // 找出有资格参与这个边池的玩家（全下金额 >= currentAmount 或不是全下玩家）
            const eligiblePlayers: number[] = [];
            for (let j = 0; j < playersNum; j++) {
                if (this._playerManager.isPlayerActive(j) && (this._playersAllIn[j] >= currentAmount || this._playersAllIn[j] === 0)) {
                    eligiblePlayers.push(j);
                }
            }
            
            const sidePotAmount = diff * eligiblePlayers.length;
            if (sidePotAmount > 0) {
                sidePots.push({
                    amount: sidePotAmount,
                    eligiblePlayers: eligiblePlayers
                });
                remainingPot -= sidePotAmount;
            }
        }
        
        // 如果还有剩余，加入主池
        const resultMainPot = mainPot + Math.max(0, remainingPot);
        
        return {
            mainPot: resultMainPot,
            sidePots: sidePots
        };
    }

    /**
     * 获取玩家筹码
     * @param playerIndex 玩家索引
     * @returns 玩家筹码
     */
    getPlayerChips(playerIndex: number): number {
        return this._playersChips[playerIndex] || 0;
    }

    /**
     * 获取玩家昵称
     * @param playerIndex 玩家索引
     * @returns 玩家昵称
     */
    getPlayerNickname(playerIndex: number): string {
        return this._playersNicknames[playerIndex] || '';
    }

    /**
     * 设置玩家筹码
     * @param playerIndex 玩家索引
     * @param chips 筹码数量
     */
    setPlayerChips(playerIndex: number, chips: number) {
        this._playersChips[playerIndex] = chips;
    }

    /**
     * 设置玩家昵称
     * @param playerIndex 玩家索引
     * @param nickname 玩家昵称
     */
    setPlayerNickname(playerIndex: number, nickname: string) {
        this._playersNicknames[playerIndex] = nickname;
    }

    /**
     * 减少玩家筹码
     * @param playerIndex 玩家索引
     * @param amount 减少数量
     * @returns 实际减少的筹码数量
     */
    reducePlayerChips(playerIndex: number, amount: number): number {
        const currentChips = this._playersChips[playerIndex];
        if (currentChips >= amount) {
            this._playersChips[playerIndex] -= amount;
            return amount;
        } else {
            const allIn = currentChips;
            this._playersChips[playerIndex] = 0;
            return allIn;
        }
    }

    /**
     * 增加玩家筹码
     * @param playerIndex 玩家索引
     * @param amount 增加数量
     */
    addPlayerChips(playerIndex: number, amount: number) {
        this._playersChips[playerIndex] += amount;
    }

    /**
     * 获取玩家当前轮下注
     * @param playerIndex 玩家索引
     * @returns 玩家当前轮下注
     */
    getPlayerBet(playerIndex: number): number {
        return this._playersBet[playerIndex] || 0;
    }

    /**
     * 设置玩家当前轮下注
     * @param playerIndex 玩家索引
     * @param amount 下注金额
     */
    setPlayerBet(playerIndex: number, amount: number) {
        this._playersBet[playerIndex] = amount;
    }

    /**
     * 设置玩家当前轮下注（别名，兼容服务端同步）
     * @param playerIndex 玩家索引
     * @param amount 下注金额
     */
    setPlayerRoundBet(playerIndex: number, amount: number) {
        this._playersBet[playerIndex] = amount;
    }

    /**
     * 重置所有玩家当前轮下注
     */
    resetPlayersBet() {
        const playersNum = this._playerManager.getPlayersNum();
        this._playersBet = new Array(playersNum).fill(0);
    }

    /**
     * 获取最小下注额
     * @returns 最小下注额
     */
    getMinBet(): number {
        return this._minBet;
    }

    /**
     * 设置最小下注额
     * @param minBet 最小下注额
     */
    setMinBet(minBet: number) {
        this._minBet = minBet;
    }

    /**
     * 获取最大下注额
     * @returns 最大下注额
     */
    getMaxBet(): number {
        return this._maxBet;
    }

    /**
     * 设置最大下注额
     * @param maxBet 最大下注额
     */
    setMaxBet(maxBet: number) {
        this._maxBet = maxBet;
    }

    /**
     * 获取当前最高下注
     * @returns 当前最高下注金额
     */
    getCurrentHighestBet(): number {
        return Math.max(...this._playersBet);
    }

    /**
     * 获取当前下注金额（用于跟注计算）
     * @returns 当前下注金额（等同于 getCurrentHighestBet）
     */
    getCurrentBet(): number {
        return this.getCurrentHighestBet();
    }
    
    /**
     * 更新当前最高下注
     * 确保_currentHighestBet与所有玩家的下注金额同步
     */
    updateCurrentHighestBet(): number {
        this._currentHighestBet = this.getCurrentHighestBet();
        return this._currentHighestBet;
    }

    /**
     * 设置当前下注金额（用于同步服务端状态）
     * @param amount 下注金额
     */
    setCurrentBet(amount: number): void {
        this._currentHighestBet = amount;
    }

    /**
     * 获取玩家需要跟注的金额
     * @param playerIndex 玩家索引
     * @returns 需要跟注的金额
     */
    getCallAmount(playerIndex: number): number {
        const highestBet = this.getCurrentHighestBet();
        return highestBet - this._playersBet[playerIndex];
    }

    /**
     * 设置盲注金额
     * @param smallBlind 小盲注
     * @param bigBlind 大盲注
     */
    setBlinds(smallBlind: number, bigBlind: number) {
        this._blind.smallBlind = smallBlind;
        this._blind.bigBlind = bigBlind;
        this._minBet = bigBlind; // 最小下注额等于大盲注
    }

    /**
     * 获取小盲注
     * @returns 小盲注金额
     */
    getSmallBlind(): number {
        return this._blind.smallBlind;
    }

    /**
     * 获取大盲注
     * @returns 大盲注金额
     */
    getBigBlind(): number {
        return this._blind.bigBlind;
    }

    /**
     * 获取底池
     * @returns 底池金额
     */
    getPot(): number {
        return this._pot;
    }

    /**
     * 设置底池
     * @param pot 底池金额
     */
    setPot(pot: number) {
        this._pot = pot;
    }

    /**
     * 设置主底池（用于同步服务端状态）
     * @param mainPot 主底池金额
     */
    setMainPot(mainPot: number): void {
        this._pot = mainPot;
    }

    /**
     * 设置社区牌（用于同步服务端状态）
     * @param cards 社区牌数组
     */
    setCommunityCards(cards: number[]): void {
        this._communityCards = cards;
    }

    /**
     * 获取社区牌
     * @returns 社区牌数组
     */
    getCommunityCards(): number[] {
        return this._communityCards;
    }

    /**
     * 设置边池数据（用于同步服务端状态）
     * @param sidePots 边池数组，每个边池包含金额和合格玩家ID列表
     */
    setSidePots(sidePots: { amount: number, eligiblePlayers: number[] }[]): void {
        this._sidePots = sidePots || [];
    }

    /**
     * 获取边池数据
     * @returns 边池数组
     */
    getSidePots(): { amount: number, eligiblePlayers: number[] }[] {
        return this._sidePots;
    }

    /**
     * 增加底池金额
     * @param amount 增加金额
     */
    addPot(amount: number) {
        this._pot += amount;
    }

    /**
     * 增加底池金额
     * @param amount 增加金额
     */
    addToPot(amount: number) {
        this._pot += amount;
    }

    /**
     * 获取卡牌管理器
     * @returns 卡牌管理器
     */
    getCardManager(): CardManager {
        return this._cardManager;
    }

    /**
     * 获取玩家管理器
     * @returns 玩家管理器
     */
    getPlayerManager(): PlayerManager {
        return this._playerManager;
    }

    /**
     * 获取按钮位
     * @returns 按钮位索引
     */
    getButtonSeat(): number {
        return this._buttonSeat;
    }

    /**
     * 设置按钮位
     * @param seat 座位索引
     */
    setButtonSeat(seat: number) {
        this._buttonSeat = seat;
    }

    /**
     * 推进按钮位（只推进到活跃玩家）
     */
    advanceButtonSeat() {
        const playersNum = this._playerManager.getPlayersNum();
        const oldButton = this._buttonSeat;
        let nextSeat = (this._buttonSeat + 1) % playersNum;
        // 只推进到活跃玩家（还有筹码的玩家）
        let iterations = 0;
        while (!this._playerManager.isPlayerActive(nextSeat) && nextSeat !== this._buttonSeat && iterations < playersNum) {
            nextSeat = (nextSeat + 1) % playersNum;
            iterations++;
        }
        this._buttonSeat = nextSeat;
    }

    /**
     * 获取小盲位
     * @returns 小盲位索引
     */
    getSmallBlindSeat(): number {
        // 如果有存储的值（服务端提供），优先使用
        if (this._smallBlindSeat >= 0 && this._smallBlindSeat < this._playerManager.getPlayersNum()) {
            return this._smallBlindSeat;
        }
        // 否则动态计算
        const playersNum = this._playerManager.getPlayersNum();
        if (playersNum === 2) {
            // 2人桌：Button = SB
            return this._buttonSeat;
        }
        let seat = (this._buttonSeat + 1) % playersNum;
        let iterations = 0;
        while (!this._playerManager.isPlayerActive(seat) && seat !== this._buttonSeat && iterations < playersNum) {
            seat = (seat + 1) % playersNum;
            iterations++;
        }
        return seat;
    }

    /**
     * 设置小盲位
     * @param seat 小盲位索引
     */
    setSmallBlindSeat(seat: number): void {
        this._smallBlindSeat = seat;
    }

    /**
     * 获取大盲位
     * @returns 大盲位索引
     */
    getBigBlindSeat(): number {
        // 如果有存储的值（服务端提供），优先使用
        if (this._bigBlindSeat >= 0 && this._bigBlindSeat < this._playerManager.getPlayersNum()) {
            return this._bigBlindSeat;
        }
        // 否则动态计算
        const playersNum = this._playerManager.getPlayersNum();
        if (playersNum === 2) {
            // 2人桌：非Button = BB
            return (this._buttonSeat + 1) % playersNum;
        }
        const sbSeat = this.getSmallBlindSeat();
        let seat = (sbSeat + 1) % playersNum;
        // 找到下一个活跃玩家作为大盲位
        let iterations = 0;
        while (!this._playerManager.isPlayerActive(seat) && seat !== sbSeat && iterations < playersNum) {
            seat = (seat + 1) % playersNum;
            iterations++;
        }
        return seat;
    }

    /**
     * 设置大盲位
     * @param seat 大盲位索引
     */
    setBigBlindSeat(seat: number): void {
        this._bigBlindSeat = seat;
    }

    /**
     * 获取枪口位（Under the Gun）
     * @returns 枪口位索引
     */
    getUTGSeat(): number {
        const playersNum = this._playerManager.getPlayersNum();
        const bbSeat = this.getBigBlindSeat();
        let seat = (bbSeat + 1) % playersNum;
        // 找到下一个活跃玩家作为枪口位
        let iterations = 0;
        while (!this._playerManager.isPlayerActive(seat) && seat !== bbSeat && iterations < playersNum) {
            seat = (seat + 1) % playersNum;
            iterations++;
        }
        return seat;
    }



    /**
     * 获取位置名称
     * @param seat 座位索引
     * @returns 位置名称
     */
    getPositionName(seat: number): string {
        const playersNum = this._playerManager.getPlayersNum();
        const normalizedSeat = seat % playersNum;

        if (normalizedSeat === this._buttonSeat) {
            return 'BTN（按钮位）';
        } else if (normalizedSeat === this.getSmallBlindSeat()) {
            return 'SB（小盲）';
        } else if (normalizedSeat === this.getBigBlindSeat()) {
            return 'BB（大盲）';
        } else if (normalizedSeat === this.getUTGSeat()) {
            return 'UTG（枪口位）';
        } else {
            return `玩家 ${seat + 1}`;
        }
    }

    /**
     * 获取位置权重（按钮位优势）
     * @param seat 座位索引
     * @returns 位置权重（0-100）
     */
    getPositionWeight(seat: number): number {
        const playersNum = this._playerManager.getPlayersNum();
        const normalizedSeat = seat % playersNum;
        const buttonSeat = this._buttonSeat;

        // 计算与按钮位的相对位置
        let relativePosition = (normalizedSeat - buttonSeat + playersNum) % playersNum;

        // 按钮位权重最高，依次递减
        return 100 - (relativePosition * (100 / playersNum));
    }

    /**
     * 获取公共牌位置
     * @returns 公共牌位置数组
     */
    getBoardPositions(): { x: number, y: number }[] {
        return this._boardPos;
    }

    /**
     * 检查座位是否在盲注位
     * @param seat 座位索引
     * @returns 是否在盲注位
     */
    isBlindPosition(seat: number): boolean {
        const normalizedSeat = seat % this._playerManager.getPlayersNum();
        return normalizedSeat === this.getSmallBlindSeat() || normalizedSeat === this.getBigBlindSeat();
    }

    /**
     * 检查座位是否在死盲注状态（筹码为0的盲注位）
     * @param seat 座位索引
     * @returns 是否死盲
     */
    isDeadBlind(seat: number): boolean {
        if (!this.isBlindPosition(seat)) {
            return false;
        }
        return this._playersChips[seat] === 0;
    }

    /**
     * 检查座位是否是有效玩家（有筹码且未弃牌）
     * @param seat 座位索引
     * @returns 是否有效玩家
     */
    isActivePlayer(seat: number): boolean {
        // 全下的玩家仍然是活跃的，即使他们的筹码为0
        return (this._playersChips[seat] > 0 || this._playersAllIn[seat] > 0) && !this._playerManager.isPlayerFolded(seat);
    }

    /**
     * 获取活跃玩家数量
     * @returns 活跃玩家数量
     */
    getActivePlayerCount(): number {
        let count = 0;
        for (let i = 0; i < this._playerManager.getPlayersNum(); i++) {
            if (this.isActivePlayer(i)) {
                count++;
            }
        }
        return count;
    }

    /**
     * 获取下一阶段
     * @returns 阶段编号
     */
    nextStage(): number {
        this._roundGame++;
        return this._roundGame;
    }

    /**
     * 获取当前阶段
     * @returns 阶段编号
     */
    getRoundGame(): number {
        return this._roundGame;
    }

    /**
     * 设置当前阶段
     * @param round 阶段编号
     */
    setRoundGame(round: number) {
        this._roundGame = round;
    }

    // ============================================
    // 牌型评估系统
    // ============================================

    /**
     * 评估手牌等级
     * @param cards 牌（底牌+公牌）
     * @returns 手牌等级
     */
    // ✅ [已删除] 客户端牌型评估相关方法已移除，所有牌型信息均来自服务端

    /**
     * 获取牌型名称
     */
    getHandTypeName(type: number): string {
        return CardManager.getHandTypeName(type);
    }

}
