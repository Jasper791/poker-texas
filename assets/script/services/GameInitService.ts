import { Node, Prefab, resources, instantiate } from 'cc';
import { LogService } from '../utils/LogService';
import { GameConfig } from '../types';

/**
 * 初始化结果
 */
export interface InitResult {
    success: boolean;
    error?: string;
}

/**
 * 游戏初始化服务
 * 负责游戏资源的加载和初始化
 * ⚠️ 开发模式：禁用所有资源缓存，每次都重新加载
 */
export class GameInitService {
    private static _instance: GameInitService | null = null;

    private _isInitialized: boolean = false;
    private _isLoading: boolean = false;

    /**
     * 获取单例
     */
    static getInstance(): GameInitService {
        if (!GameInitService._instance) {
            GameInitService._instance = new GameInitService();
        }
        return GameInitService._instance;
    }

    /**
     * 私有构造函数
     */
    private constructor() {
    }

    /**
     * 初始化游戏
     */
    async init(config: GameConfig): Promise<InitResult> {
        // ⚠️ 开发模式：每次都重新初始化
        this._isInitialized = false;

        if (this._isLoading) {
            LogService.warn('GameInitService', 'Already loading');
            return { success: false, error: 'Already loading' };
        }

        this._isLoading = true;

        try {
            LogService.info('GameInitService', 'Starting game initialization (development mode - no cache)');

            // 1. 加载基础资源
            await this.loadBaseResources();

            // 2. 加载游戏配置
            this.loadGameConfig(config);

            // 3. 初始化管理器
            this.initManagers();

            this._isInitialized = true;
            this._isLoading = false;

            LogService.info('GameInitService', 'Game initialization completed');
            return { success: true };
        } catch (error) {
            this._isLoading = false;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            LogService.error('GameInitService', `Initialization failed: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * 加载基础资源
     */
    private async loadBaseResources(): Promise<void> {

        // ✅ [修复] pokers 是目录，不是单个资源文件，卡牌图片在 pokerCard.ts 中动态加载
        // 移除了错误的资源加载
    }

    /**
     * 加载单个资源
     * ⚠️ 开发模式：每次都重新加载，不使用缓存
     */
    private async loadResource(path: string, type: string): Promise<any> {
        return new Promise((resolve, reject) => {
            // ⚠️ 开发模式：每次都重新加载，不检查缓存
            LogService.warn('GameInitService', `⚠️ Loading resource without cache: ${path}`);

            resources.load(path, (err, asset) => {
                if (err) {
                    LogService.error('GameInitService', `Failed to load resource: ${path}`, err);
                    reject(err);
                    return;
                }

                // ⚠️ 不缓存资源
                resolve(asset);
            });
        });
    }

    /**
     * 加载游戏配置
     */
    private loadGameConfig(config: GameConfig): void {
        // 保存配置到 SettingsManager 等
    }

    /**
     * 初始化管理器
     */
    private initManagers(): void {
        // 初始化各种管理器
    }

    /**
     * 重置
     */
    reset(): void {
        this._isInitialized = false;
    }

    /**
     * 是否已初始化
     */
    isInitialized(): boolean {
        return this._isInitialized;
    }

    /**
     * 获取已加载的资源
     * ⚠️ 开发模式：返回 undefined，因为不缓存
     */
    getLoadedResource(path: string): any {
        LogService.warn('GameInitService', `⚠️ getLoadedResource called - no cache, returning undefined: ${path}`);
        return undefined;
    }

    /**
     * 清理资源
     * ⚠️ 开发模式：无需清理，因为不缓存
     */
    cleanup(): void {
        this._isInitialized = false;
    }
}
