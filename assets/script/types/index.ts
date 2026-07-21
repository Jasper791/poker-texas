// 响应状态码枚举
// 与服务端 ResponseCode 枚举保持一致，用于统一 API 接口响应
// 状态码分类：
// - 0: 通用成功
// - -1: 通用失败
// - 400-429: HTTP 标准错误码
// - 1000-1999: 用户相关错误
// - 2000-2999: 房间相关错误
// - 3000-3999: 游戏相关错误
// - 4000-4999: 房卡和匹配相关错误
// - 5000-5999: 社交相关错误
export enum ResponseCode {
    SUCCESS = 0,
    FAIL = -1,

    PARAM_ERROR = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    SERVER_ERROR = 500,
    RATE_LIMIT_EXCEEDED = 429,

    USER_NOT_EXIST = 1001,
    USER_ALREADY_EXIST = 1002,
    PASSWORD_ERROR = 1003,
    TOKEN_EXPIRED = 1004,
    TOKEN_INVALID = 1005,
    ALREADY_EXIST = 1006,
    NO_PERMISSION = 1007,
    SIGNATURE_ERROR = 1008,

    ROOM_NOT_EXIST = 2001,
    ROOM_FULL = 2002,
    ROOM_PASSWORD_ERROR = 2003,
    ROOM_PLAYING = 2004,
    NOT_ROOM_OWNER = 2005,
    GAME_NOT_INITIALIZED = 2006,
    INVALID_ACTION = 2007,

    GAME_NOT_STARTED = 3001,
    GAME_ALREADY_STARTED = 3002,
    NOT_YOUR_TURN = 3003,
    INVALID_OPERATION = 3004,
    CARDS_NOT_ENOUGH = 3005,
    BALANCE_NOT_ENOUGH = 3006,
    REPLAY_NOT_FOUND = 3007,

    CARD_NOT_ENOUGH = 4001,
    RECONNECT_TIMEOUT = 4002,
    MATCH_TIMEOUT = 4003,

    SOCIAL_NOT_FRIENDS = 5001,
    SOCIAL_ALREADY_FRIENDS = 5002,
    SOCIAL_REQUEST_EXISTS = 5003
}

// 玩家状态
export enum PlayerStatus {
    ACTIVE = 'ACTIVE',
    FOLDED = 'FOLDED',
    ALLIN = 'ALLIN',
    OUT = 'OUT'
}

// 卡牌花色
export enum CardSuit {
    HEARTS = 'HEARTS',
    DIAMONDS = 'DIAMONDS',
    CLUBS = 'CLUBS',
    SPADES = 'SPADES'
}

// 卡牌点数
export enum CardRank {
    TWO = '2',
    THREE = '3',
    FOUR = '4',
    FIVE = '5',
    SIX = '6',
    SEVEN = '7',
    EIGHT = '8',
    NINE = '9',
    TEN = '10',
    JACK = 'J',
    QUEEN = 'Q',
    KING = 'K',
    ACE = 'A'
}

// 游戏阶段
export enum GamePhase {
    WAITING = 'WAITING',
    PREFLOP = 'PREFLOP',
    FLOP = 'FLOP',
    TURN = 'TURN',
    RIVER = 'RIVER',
    SHOWDOWN = 'SHOWDOWN',
    SETTLEMENT = 'SETTLEMENT'
}

// 玩家动作类型
export enum ActionType {
    FOLD = 'FOLD',
    CALL = 'CALL',
    RAISE = 'RAISE',
    CHECK = 'CHECK',
    BET = 'BET',
    ALLIN = 'ALLIN',
    ALL_IN = 'ALL_IN'
}

// 房间类型
export enum RoomType {
    PVE = 'PVE',
    PVP = 'PVP'
}

// 手牌类型
export enum HandType {
    HIGH_CARD = 'HIGH_CARD',
    ONE_PAIR = 'ONE_PAIR',
    TWO_PAIR = 'TWO_PAIR',
    THREE_OF_A_KIND = 'THREE_OF_A_KIND',
    STRAIGHT = 'STRAIGHT',
    FLUSH = 'FLUSH',
    FULL_HOUSE = 'FULL_HOUSE',
    FOUR_OF_A_KIND = 'FOUR_OF_A_KIND',
    STRAIGHT_FLUSH = 'STRAIGHT_FLUSH',
    ROYAL_FLUSH = 'ROYAL_FLUSH'
}

// 网络连接状态
export enum ConnectionStatus {
    DISCONNECTED = 'DISCONNECTED',
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
    RECONNECTING = 'RECONNECTING',
    ERROR = 'ERROR'
}

// 卡牌接口
export interface Card {
    suit: CardSuit;
    rank: CardRank;
    isVisible: boolean;
    node?: any;
}

// 玩家信息接口
export interface PlayerInfo {
    seatIndex: number;
    nickname: string;
    chips: number;
    isAI: boolean;
    isSelf: boolean;
    cards?: Card[];
    status: PlayerStatus;
    avatarUrl?: string;
    userId?: string | number;
}

// 游戏动作接口
export interface GameAction {
    actionType: ActionType | string;
    betAmount?: number;
    playerIndex: number;
    timestamp: number;
}

// 可用动作接口
export interface AvailableAction {
    actionType: ActionType | string;
    betAmount?: number;
    minAmount?: number;
    maxAmount?: number;
}

// 游戏状态接口
export interface GameState {
    phase: GamePhase | string;
    currentTurn: number;
    pot: number;
    currentBet: number;
    players: PlayerInfo[];
    communityCards: Card[];
    availableActions?: AvailableAction[];
    gameId?: string;
}

// 游戏结果接口
export interface GameResult {
    winnerIndex: number;
    handTypeName: string;
    handStrength: number;
    totalPot: number;
    winners?: PlayerInfo[];
    handType?: HandType;
}

// 房间信息接口
export interface RoomInfo {
    roomId: number;
    maxPlayers: number;
    currentPlayers: number;
    buyIn: number;
    smallBlind: number;
    bigBlind: number;
    roomType?: RoomType;
    roomName?: string;
}

// 网络消息接口
export interface NetworkMessage {
    type: string;
    data: any;
    timestamp?: number;
    requestId?: string;
}

// 动作通知接口
export interface ActionNotify {
    targetUserSeatIndex: number;
    targetUserNickname: string;
    predictedAction: string;
    predictedAmount: number;
    isMyTurn?: boolean;
    isAI?: boolean;
    playerChips?: number;
    currentBet?: number;
    needToCall?: number;
    availableActions?: AvailableAction[];
    timestamp?: number;
    timeRemaining?: number;
}

// 玩家动作响应接口
export interface PlayerActionResponse {
    success: boolean;
    players?: PlayerInfo[];
    actionNotify?: ActionNotify;
    error?: string;
}

// 手牌信息接口
export interface HandInfo {
    cards: Card[];
    handType: HandType;
    handStrength: number;
    handTypeName: string;
}

// 游戏配置接口
export interface GameConfig {
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    buyIn: number;
    timeLimit: number;
    roomType: RoomType;
}

// UI 配置接口
export interface UIConfig {
    showAnimation: boolean;
    soundEnabled: boolean;
    musicEnabled: boolean;
    language: string;
}

// 回调函数类型
export type GenericCallback<T = any> = (data?: T) => void;
export type ErrorCallback = (error: string) => void;
export type SuccessCallback<T = any> = (data: T) => void;

// 游戏事件类型
export interface GameEvent {
    type: string;
    data?: any;
    timestamp: number;
}

// 玩家座位位置
export interface SeatPosition {
    x: number;
    y: number;
    angle: number;
}

// 底池信息
export interface PotInfo {
    mainPot: number;
    sidePots?: SidePotInfo[];
}

// 边池信息
export interface SidePotInfo {
    amount: number;
    eligibleSeats: number[];
}

// WebSocket 配置
export interface WebSocketConfig {
    url: string;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    heartbeatInterval?: number;
}

// 验证规则
export interface ValidationRule {
    field: string;
    type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
    value?: any;
    message: string;
    validator?: (value: any) => boolean;
}

// 验证结果
export interface ValidationResult {
    isValid: boolean;
    errors: { field: string; message: string }[];
}

// 缓存配置
export interface CacheConfig {
    key: string;
    value: any;
    ttl?: number; // 过期时间（毫秒）
}

// 性能指标
export interface PerformanceMetrics {
    fps: number;
    memoryUsage: number;
    loadTime: number;
    networkLatency: number;
}

// 房间配置选项 - 人数
// 0: 2-5人（最少2人，最多5人）
// 1: 2-7人（最少2人，最多7人）
// 2: 2-9人（最少2人，最多9人）
export enum RoomMaxPlayers {
    OPTION_2_5 = 0,
    OPTION_2_7 = 1,
    OPTION_2_9 = 2
}

// 房间配置选项 - 局数
// 0: 10局
// 1: 15局
// 2: 20局
export enum RoomRounds {
    ROUNDS_10 = 0,
    ROUNDS_15 = 1,
    ROUNDS_20 = 2
}

// 房间配置选项 - 规则类型
// 0: 计分方式（每局默认1000积分，不写入数据库）
// 1: 筹码积分扣减方式（查询数据库积分，实际扣除/增加）
// 2: 代币扣减方式（使用实际代币作为筹码）
export enum RoomRuleType {
    SCORE_MODE = 0,
    CHIPS_MODE = 1,
    TOKEN_MODE = 2
}

// 房间配置选项 - 底注(ante)
// ante = 10 → 小盲位=10, 大盲位=20
// ante = 50 → 小盲位=50, 大盲位=100
// ante = 100 → 小盲位=100, 大盲位=200
export enum RoomAnte {
    ANTE_10 = 0,
    ANTE_50 = 1,
    ANTE_100 = 2
}

// 兼容旧命名
export enum RoomSmallBlind {
    BLIND_50 = 0,
    BLIND_100 = 1,
    BLIND_150 = 2
}

// 房间配置映射器
export class RoomConfigMapper {
    private static maxPlayersMap: Map<RoomMaxPlayers, { minPlayers: number; maxPlayers: number }> = new Map([
        [RoomMaxPlayers.OPTION_2_5, { minPlayers: 2, maxPlayers: 5 }],
        [RoomMaxPlayers.OPTION_2_7, { minPlayers: 2, maxPlayers: 7 }],
        [RoomMaxPlayers.OPTION_2_9, { minPlayers: 2, maxPlayers: 9 }]
    ]);

    private static roundsMap: Map<RoomRounds, number> = new Map([
        [RoomRounds.ROUNDS_10, 10],
        [RoomRounds.ROUNDS_15, 15],
        [RoomRounds.ROUNDS_20, 20]
    ]);

    private static ruleTypeMap: Map<RoomRuleType, string> = new Map([
        [RoomRuleType.SCORE_MODE, 'SCORE_MODE'],
        [RoomRuleType.CHIPS_MODE, 'CHIPS_MODE'],
        [RoomRuleType.TOKEN_MODE, 'TOKEN_MODE']
    ]);

    private static anteMap: Map<RoomAnte, number> = new Map([
        [RoomAnte.ANTE_10, 10],
        [RoomAnte.ANTE_50, 50],
        [RoomAnte.ANTE_100, 100]
    ]);

    private static smallBlindMap: Map<RoomSmallBlind, number> = new Map([
        [RoomSmallBlind.BLIND_50, 50],
        [RoomSmallBlind.BLIND_100, 100],
        [RoomSmallBlind.BLIND_150, 150]
    ]);

    private static initialScoreMap: Map<RoomRuleType, number> = new Map([
        [RoomRuleType.SCORE_MODE, 1000],
        [RoomRuleType.CHIPS_MODE, 0],
        [RoomRuleType.TOKEN_MODE, 0]
    ]);

    public static getMaxPlayers(option: RoomMaxPlayers): number {
        const config = this.maxPlayersMap.get(option);
        return config ? config.maxPlayers : 5;
    }

    public static getMinPlayers(option?: RoomMaxPlayers): number {
        if (option !== undefined) {
            const config = this.maxPlayersMap.get(option);
            return config ? config.minPlayers : 2;
        }
        return 2;
    }

    public static getRounds(option: RoomRounds): number {
        return this.roundsMap.get(option) || 10;
    }

    public static getRuleType(option: RoomRuleType): string {
        return this.ruleTypeMap.get(option) || 'SCORE_MODE';
    }

    public static getAnte(option: RoomAnte): number {
        return this.anteMap.get(option) || 50;
    }

    public static getSmallBlind(option: RoomSmallBlind): number {
        return this.smallBlindMap.get(option) || 50;
    }

    public static getBigBlind(smallBlind: number): number {
        return smallBlind * 2;
    }

    public static getInitialScore(option: RoomRuleType): number {
        return this.initialScoreMap.get(option) || 0;
    }

    public static getRoomConfig(
        maxPlayersOption: RoomMaxPlayers,
        roundsOption: RoomRounds,
        ruleTypeOption: RoomRuleType,
        smallBlindOption: RoomSmallBlind
    ): {
        minPlayers: number;
        maxPlayers: number;
        rounds: number;
        ruleType: string;
        smallBlind: number;
        bigBlind: number;
        initialScore: number;
    } {
        const smallBlind = this.getSmallBlind(smallBlindOption);
        return {
            minPlayers: this.getMinPlayers(maxPlayersOption),
            maxPlayers: this.getMaxPlayers(maxPlayersOption),
            rounds: this.getRounds(roundsOption),
            ruleType: this.getRuleType(ruleTypeOption),
            smallBlind: smallBlind,
            bigBlind: this.getBigBlind(smallBlind),
            initialScore: this.getInitialScore(ruleTypeOption)
        };
    }
}