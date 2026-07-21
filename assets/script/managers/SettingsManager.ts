/**
 * 设置管理器
 * 负责游戏设置的管理，包括盲注金额、玩家数量、游戏类型等
 */

import { GAME_CONFIG } from '../config';

export interface GameSettings {
    // 盲注设置
    ante: number;
    smallBlind: number;
    bigBlind: number;

    // 玩家设置
    playerCount: number;
    initialChips: number;

    // 游戏类型
    gameType: 'no_limit' | 'limit' | 'pot_limit';

    // 下注限制
    minBet: number;
    maxBet: number;

    // 其他设置
    actionTimeout: number; // 操作超时时间（秒）
    soundEnabled: boolean; // 音效是否启用

    // AI配置
    useServerAI?: boolean; // 是否使用服务端AI

    // 服务器配置
    serverUrl: string; // WebSocket服务器地址
}

export class SettingsManager {
    private static _instance: SettingsManager = null;
    private _settings: GameSettings;

    private constructor() {
        this._settings = this.getDefaultSettings();
    }

    /**
     * 获取单例实例
     */
    static getInstance(): SettingsManager {
        if (SettingsManager._instance === null) {
            SettingsManager._instance = new SettingsManager();
        }
        return SettingsManager._instance;
    }

    /**
     * 获取默认设置
     */
    getDefaultSettings(): GameSettings {
        return {
            ante: 50,
            smallBlind: 50,
            bigBlind: 100,
            playerCount: 9,
            initialChips: 1000,
            gameType: 'pot_limit',
            minBet: 100,
            maxBet: 400,
            actionTimeout: GAME_CONFIG.DEFAULT_ACTION_TIMEOUT,
            soundEnabled: GAME_CONFIG.DEFAULT_SOUND_ENABLED,
            useServerAI: GAME_CONFIG.DEFAULT_USE_SERVER_AI,
            serverUrl: GAME_CONFIG.SERVER_URL
        };
    }

    /**
     * 设置是否使用服务端AI
     * @param useServerAI 是否使用服务端AI
     */
    setUseServerAI(useServerAI: boolean) {
        this._settings.useServerAI = useServerAI;
    }

    /**
     * 获取是否使用服务端AI
     */
    isUseServerAI(): boolean {
        return this._settings.useServerAI ?? true;
    }

    /**
     * 获取当前设置
     */
    getSettings(): GameSettings {
        return { ...this._settings };
    }

    /**
     * 更新设置
     * @param settings 部分设置
     */
    updateSettings(settings: Partial<GameSettings>) {
        this._settings = { ...this._settings, ...settings };
    }

    /**
     * 重置为默认设置
     */
    resetToDefault() {
        this._settings = this.getDefaultSettings();
    }

    /**
     * 设置盲注
     * @param smallBlind 小盲注
     * @param bigBlind 大盲注
     */
    setBlinds(smallBlind: number, bigBlind: number) {
        this._settings.smallBlind = smallBlind;
        this._settings.bigBlind = bigBlind;
        this._settings.minBet = bigBlind;
    }

    /**
     * 设置底注(ante)
     * @param ante 底注金额
     */
    setAnte(ante: number) {
        this._settings.ante = ante;
        this._settings.smallBlind = ante;
        this._settings.bigBlind = ante * 2;
        this._settings.minBet = ante * 2;
    }

    /**
     * 获取底注(ante)
     */
    getAnte(): number {
        return this._settings.ante;
    }

    /**
     * 设置玩家数量
     * @param playerCount 玩家数量
     */
    setPlayerCount(playerCount: number) {
        this._settings.playerCount = Math.max(2, Math.min(10, playerCount));
    }

    /**
     * 设置初始筹码
     * @param chips 初始筹码
     */
    setInitialChips(chips: number) {
        this._settings.initialChips = chips;
    }

    /**
     * 设置游戏类型
     * @param gameType 游戏类型
     */
    setGameType(gameType: 'no_limit' | 'limit' | 'pot_limit') {
        this._settings.gameType = gameType;
        this.updateBetLimits();
    }

    /**
     * 更新下注限制
     */
    updateBetLimits() {
        switch (this._settings.gameType) {
            case 'no_limit':
                // 无限注：无最大限制
                this._settings.minBet = this._settings.bigBlind;
                this._settings.maxBet = Infinity;
                break;
            case 'limit':
                // 有限注：固定限制
                this._settings.minBet = this._settings.bigBlind;
                this._settings.maxBet = this._settings.bigBlind * 2;
                break;
            case 'pot_limit':
                // 底池限注：最大下注=底池金额
                this._settings.minBet = this._settings.bigBlind;
                this._settings.maxBet = this._settings.bigBlind * 4;
                break;
        }
    }

    /**
     * 设置操作超时时间
     * @param seconds 秒数
     */
    setActionTimeout(seconds: number) {
        this._settings.actionTimeout = Math.max(5, Math.min(120, seconds));
    }

    /**
     * 设置音效启用状态
     * @param enabled 是否启用
     */
    setSoundEnabled(enabled: boolean) {
        this._settings.soundEnabled = enabled;
    }

    /**
     * 获取小盲注
     */
    getSmallBlind(): number {
        return this._settings.smallBlind;
    }

    /**
     * 获取大盲注
     */
    getBigBlind(): number {
        return this._settings.bigBlind;
    }

    /**
     * 获取玩家数量
     */
    getPlayerCount(): number {
        return this._settings.playerCount;
    }

    /**
     * 获取初始筹码
     */
    getInitialChips(): number {
        return this._settings.initialChips;
    }

    /**
     * 获取游戏类型
     */
    getGameType(): string {
        return this._settings.gameType;
    }

    /**
     * 获取最小下注
     */
    getMinBet(): number {
        return this._settings.minBet;
    }

    /**
     * 获取最大下注
     */
    getMaxBet(): number {
        return this._settings.maxBet;
    }

    /**
     * 获取操作超时时间
     */
    getActionTimeout(): number {
        return this._settings.actionTimeout;
    }

    /**
     * 获取音效启用状态
     */
    isSoundEnabled(): boolean {
        return this._settings.soundEnabled;
    }

    /**
     * 获取服务器地址
     */
    getServerUrl(): string {
        return this._settings.serverUrl;
    }

    /**
     * 设置服务器地址
     * @param url 服务器地址
     */
    setServerUrl(url: string) {
        this._settings.serverUrl = url;
    }
}
