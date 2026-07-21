import { LogService } from './LogService';
import { Prefab } from 'cc';

/**
 * 预制体刷新助手
 * ⚠️ 开发模式：确保每次都使用最新预制体，禁用所有缓存
 */
export class PrefabRefreshHelper {
    
    private static _instance: PrefabRefreshHelper | null = null;
    
    // 标记是否已初始化
    private _isInitialized = false;
    
    // 存储预制体引用（仅用于开发模式下的调试）
    private _prefabRegistry: Map<string, Prefab> = new Map();
    
    static getInstance(): PrefabRefreshHelper {
        if (!PrefabRefreshHelper._instance) {
            PrefabRefreshHelper._instance = new PrefabRefreshHelper();
        }
        return PrefabRefreshHelper._instance;
    }
    
    private constructor() {
        //LogService.warn('PrefabRefreshHelper', '⚠️ 预制体刷新助手已启动 - 开发模式：禁用所有缓存');
    }
    
    /**
     * 初始化刷新助手
     */
    init(): void {
        if (this._isInitialized) {
            return;
        }
        
        this._isInitialized = true;
        //LogService.warn('PrefabRefreshHelper', '⚠️ 预制体刷新助手已初始化 - 每次都会使用最新预制体');
    }
    
    /**
     * 注册预制体（仅用于调试，不缓存）
     */
    registerPrefab(name: string, prefab: Prefab): void {
        this._prefabRegistry.set(name, prefab);
    }
    
    /**
     * 获取预制体（每次都返回原始引用，不做缓存处理
     */
    getPrefab(name: string): Prefab | undefined {
        return this._prefabRegistry.get(name);
    }
    
    /**
     * 强制刷新所有预制体引用
     * 在 Cocos Creator 中通过 @property 绑定的预制体是由编辑器在运行时
     * 自动处理的，这里主要是清理本地对象池和缓存
     */
    forceRefresh(): void {
        //LogService.warn('PrefabRefreshHelper', '⚠️ 强制刷新所有预制体缓存');
        
        // 清理本地引用
        this._prefabRegistry.clear();
        
        //LogService.warn('PrefabRefreshHelper', '⚠️ 预制体引用已清空，请确保重新加载');
    }
    
    /**
     * 清理所有缓存（在游戏启动时调用
     */
    clearAllCaches(): void {
        // ✅ [修复] 改为 debug 级别，避免打印不必要的日志
        //LogService.debug('PrefabRefreshHelper', '清理所有缓存');

        this._prefabRegistry.clear();

        //LogService.debug('PrefabRefreshHelper', '所有缓存已清空');
    }
}
