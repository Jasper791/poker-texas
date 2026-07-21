import { director, resources, AudioClip, SpriteFrame, Texture2D } from 'cc';
import { LogService } from '../utils/LogService';
import { AUDIO_CONFIG } from '../config/audioConfig';

export class SceneLoader {
    private static _instance: SceneLoader = null!;
    private _isLoading: boolean = false;
    private _currentScene: string = '';
    private _pendingScene: string | null = null;
    private _preloadedScenes: Set<string> = new Set();
    private _preloadedResources: Set<string> = new Set();

    private constructor() {
    }

    public static getInstance(): SceneLoader {
        if (!SceneLoader._instance) {
            SceneLoader._instance = new SceneLoader();
        }
        return SceneLoader._instance;
    }

    public isLoading(): boolean {
        return this._isLoading;
    }

    public getCurrentScene(): string {
        return this._currentScene;
    }

    public loadScene(sceneName: string, onComplete?: () => void): boolean {
        if (this._isLoading) {
            if (this._currentScene === sceneName) {
                LogService.warn('SceneLoader', `场景 ${sceneName} 正在加载中，无需重复加载`);
                return false;
            }
            
            LogService.info('SceneLoader', `场景 ${sceneName} 加入加载队列，当前正在加载: ${this._currentScene}`);
            this._pendingScene = sceneName;
            return false;
        }

        this._isLoading = true;
        this._currentScene = sceneName;
        this._pendingScene = null;

        const isPreloaded = this._preloadedScenes.has(sceneName);
        LogService.info('SceneLoader', `开始加载场景: ${sceneName}，是否已预加载: ${isPreloaded}`);

        setTimeout(() => {
            director.loadScene(sceneName, () => {
                this._isLoading = false;
                LogService.info('SceneLoader', `场景 ${sceneName} 加载完成`);
                
                if (onComplete) {
                    try {
                        onComplete();
                    } catch (error) {
                        LogService.error('SceneLoader', `场景加载完成回调执行失败:`, error);
                    }
                }

                if (this._pendingScene) {
                    const pending = this._pendingScene;
                    this._pendingScene = null;
                    LogService.info('SceneLoader', `处理排队场景: ${pending}`);
                    this.loadScene(pending);
                }
            });
        }, isPreloaded ? 10 : 50);

        return true;
    }

    public preloadScene(sceneName: string, onProgress?: (completedCount: number, totalCount: number, item: any) => void, onComplete?: (error: any) => void): void {
        if (this._preloadedScenes.has(sceneName)) {
            LogService.info('SceneLoader', `场景 ${sceneName} 已预加载，跳过`);
            if (onComplete) onComplete(null);
            return;
        }
        director.preloadScene(sceneName, onProgress, (error: any) => {
            if (!error) {
                this._preloadedScenes.add(sceneName);
                LogService.info('SceneLoader', `场景 ${sceneName} 预加载完成`);
            }
            if (onComplete) onComplete(error);
        });
    }

    public preloadAllAudio(onComplete?: (successCount: number, totalCount: number) => void): void {
        const audioPaths: string[] = [];
        
        for (const key in AUDIO_CONFIG.bgm) {
            const path = AUDIO_CONFIG.bgm[key];
            if (path) audioPaths.push(path);
        }
        
        for (const key in AUDIO_CONFIG.sfx) {
            const path = AUDIO_CONFIG.sfx[key];
            if (path) audioPaths.push(path);
        }
        
        for (const key in AUDIO_CONFIG.handPattern) {
            const path = AUDIO_CONFIG.handPattern[key];
            if (path) audioPaths.push(path);
        }
        
        for (const key in AUDIO_CONFIG.gameMsg) {
            const path = AUDIO_CONFIG.gameMsg[key];
            if (path) audioPaths.push(path);
        }

        let loadedCount = 0;
        const totalCount = audioPaths.length;

        if (totalCount === 0) {
            if (onComplete) onComplete(0, 0);
            return;
        }

        LogService.info('SceneLoader', `开始预加载 ${totalCount} 个音频资源`);

        audioPaths.forEach((path) => {
            if (this._preloadedResources.has(path)) {
                loadedCount++;
                if (loadedCount === totalCount && onComplete) {
                    onComplete(loadedCount, totalCount);
                }
                return;
            }

            resources.load(path, AudioClip, (err, clip) => {
                loadedCount++;
                if (!err) {
                    this._preloadedResources.add(path);
                }
                if (loadedCount === totalCount) {
                    LogService.info('SceneLoader', `音频资源预加载完成: ${loadedCount}/${totalCount}`);
                    if (onComplete) onComplete(loadedCount, totalCount);
                }
            });
        });
    }

    public preloadTexture(texturePath: string, onComplete?: (err: any, texture: Texture2D | null) => void): void {
        if (this._preloadedResources.has(texturePath)) {
            LogService.info('SceneLoader', `纹理 ${texturePath} 已预加载，跳过`);
            if (onComplete) onComplete(null, null);
            return;
        }
        
        resources.load(texturePath, Texture2D, (err, texture) => {
            if (!err && texture) {
                this._preloadedResources.add(texturePath);
                LogService.info('SceneLoader', `纹理 ${texturePath} 预加载完成`);
            }
            if (onComplete) onComplete(err, texture);
        });
    }

    public preloadSpriteFrame(spriteFramePath: string, onComplete?: (err: any, spriteFrame: SpriteFrame | null) => void): void {
        if (this._preloadedResources.has(spriteFramePath)) {
            LogService.info('SceneLoader', `SpriteFrame ${spriteFramePath} 已预加载，跳过`);
            if (onComplete) onComplete(null, null);
            return;
        }
        
        resources.load(spriteFramePath, SpriteFrame, (err, spriteFrame) => {
            if (!err && spriteFrame) {
                this._preloadedResources.add(spriteFramePath);
                LogService.info('SceneLoader', `SpriteFrame ${spriteFramePath} 预加载完成`);
            }
            if (onComplete) onComplete(err, spriteFrame);
        });
    }

    public preloadTextureDir(dirPath: string, onComplete?: (completedCount: number, totalCount: number) => void): void {
        resources.loadDir(dirPath, Texture2D, (err, textures) => {
            const totalCount = textures ? textures.length : 0;
            if (!err && textures) {
                textures.forEach((texture, index) => {
                    const path = `${dirPath}/${index}`;
                    this._preloadedResources.add(path);
                });
                LogService.info('SceneLoader', `纹理目录 ${dirPath} 预加载完成: ${totalCount}/${totalCount}`);
            }
            if (onComplete) onComplete(totalCount, totalCount);
        });
    }

    public clearPreloadedResources(): void {
        this._preloadedResources.clear();
        this._preloadedScenes.clear();
        LogService.info('SceneLoader', '已清除所有预加载资源');
    }

    public isScenePreloaded(sceneName: string): boolean {
        return this._preloadedScenes.has(sceneName);
    }

    public isResourcePreloaded(resourcePath: string): boolean {
        return this._preloadedResources.has(resourcePath);
    }
}