/**
 * 协议常量
 * 定义所有命令类型
 */
export class CommandType {
    public static readonly UNKNOWN = 0;
    public static readonly HEARTBEAT = 1;
    public static readonly HEARTBEAT_REQUEST = 2;
    public static readonly LOGIN = 3;
    public static readonly RECONNECT = 4;
    public static readonly ERROR = 5;
    public static readonly ERROR_RESPONSE = 5;
    public static readonly WALLET_LOGIN_V2 = 6;

    // 用户管理相关 (7-16)
    public static readonly REGISTER = 7;               // 账号密码注册
    public static readonly CHANGE_PASSWORD = 8;        // 修改密码
    public static readonly UPDATE_USER_INFO = 9;       // 更新用户信息(昵称/头像)

    public static readonly GET_LOGIN_CHALLENGE = 10;
    public static readonly WALLET_LOGIN = 11;
    public static readonly LOGIN_VERIFY = 12;
    public static readonly GET_USER_INFO = 13;

    public static readonly GET_USER_DEVICES = 14;      // 获取设备列表
    public static readonly LOGOUT_DEVICE = 15;         // 退出指定设备
    public static readonly LOGOUT_ALL_DEVICES = 16;    // 退出所有设备

    public static readonly GAME_LIST = 100;
    public static readonly ROOM_LIST = 101;
    public static readonly CREATE_ROOM = 102;
    public static readonly JOIN_ROOM = 103;
    public static readonly EXIT_ROOM = 104;
    public static readonly ROOM_INFO = 105;

    public static readonly GAME_STATE_SYNC = 200;
    public static readonly PLAYER_READY = 201;
    public static readonly GAME_START = 202;
    public static readonly ACT_OPERATION = 203;
    public static readonly GAME_SETTLEMENT = 204;
    public static readonly PLAYER_JOIN = 205;
    public static readonly PLAYER_EXIT = 206;
    public static readonly PLAYER_DISCONNECTED = 207;
    public static readonly DEAL_BUTTON_SHOW_NOTIFY = 208;
    public static readonly GAME_STATE_UPDATE = 220;
    public static readonly WAITING_CONFIRMATION = 221;

    public static readonly GET_ROOM_CARD_BALANCE = 300;
    public static readonly GET_ROOM_CARD_FLOW = 301;
    public static readonly GET_ROOM_CARD_ORDER = 302;
    public static readonly CREATE_ROOM_CARD_ORDER = 303;
    public static readonly GET_ROOMCARD_TOKEN_CONFIG = 304; // ✅ 获取房卡代币配置
    public static readonly BUY_ROOM_CARD = 305;             // 购买房卡

    // ✅ 房卡扣除/退还/流水/游戏记录
    public static readonly DEDUCT_ROOM_CARD = 306;          // 扣除房卡
    public static readonly REFUND_ROOM_CARD = 307;          // 退还房卡
    public static readonly SAVE_ROOM_GAME_FLOW = 308;       // 写入房间游戏结算流水
    public static readonly SAVE_GAME_RECORD = 309;          // 保存游戏结算记录

    // ✅ 房间玩家关系管理
    public static readonly GET_ROOM_PLAYERS = 312;          // 获取房间玩家列表
    public static readonly GET_USER_ROOMS = 313;            // 获取用户加入的房间列表
    public static readonly SAVE_ROOM_USER = 314;           // 保存房间用户关系
    public static readonly GET_ROOM_PLAYER = 315;           // 获取房间玩家关系

    public static readonly GAME_START_NOTIFY = 209;
    public static readonly PLAYER_READY_REQUEST = 210;
    public static readonly DEAL_CARDS_NOTIFY = 211;
    public static readonly DEAL_COMPLETE = 212;
    public static readonly DEAL_REQUEST = 224;

    public static readonly NOTIFY_PLAYER_TURN = 215;
    public static readonly PLAYER_ACTION_RESPONSE = 216;
    public static readonly CONTINUE_GAME = 217;
    public static readonly PLAYER_CANCEL_READY_REQUEST = 218;
    public static readonly ROOM_END = 219;

    public static readonly PLAYER_ACTION_NOTIFY = 222;
    public static readonly ACTION_COMPLETE = 223;
    
    public static readonly SEAT_INDEX_REORDER = 231;   // seatIndex重新排序通知

    public static readonly CHAT_MESSAGE = 400;
    public static readonly GET_PLAYER_LIST = 401;
    public static readonly QUICK_MSG = 402;

    // 游戏记录相关
    public static readonly GET_GAME_RECORD_LIST = 500; // 获取游戏记录列表
    public static readonly GAME_RECORD_LIST_RESPONSE = 501; // 游戏记录列表响应

    // 结算记录相关
    public static readonly GET_ROOM_GAME_FLOW = 510; // 获取房间游戏流水
    public static readonly ROOM_GAME_FLOW_RESPONSE = 511; // 房间游戏流水响应
    public static readonly GET_ROOM_REVENUE = 512; // 获取房间输赢统计
    public static readonly ROOM_REVENUE_RESPONSE = 513; // 房间输赢统计响应

    // ✅ 链上充值记录相关（t_chain_deposit）
    public static readonly GET_CHAIN_DEPOSIT_LIST = 520; // 获取链上充值记录
    public static readonly CHAIN_DEPOSIT_LIST_RESPONSE = 521; // 链上充值记录响应

    // ✅ 游戏管理扩展（对应旧架构 TexasGameControllerPvp）
    public static readonly PLAYER_RECONNECT = 530;       // 玩家重连
    public static readonly CLOSE_GAME = 531;             // 关闭游戏
    public static readonly REMOVE_PLAYER = 532;          // 移除玩家
    public static readonly KICK_PLAYER = 533;            // 请退离线玩家
}

/**
 * 玩家操作类型
 */
export class ActionType {
    public static readonly FOLD = 0;
    public static readonly CHECK = 1;
    public static readonly CALL = 2;
    public static readonly RAISE = 3;
    public static readonly ALL_IN = 4;
    public static readonly BET = 5;
}