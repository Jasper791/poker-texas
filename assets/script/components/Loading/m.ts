import { _decorator, Component, Node, Prefab, instantiate, resources, director } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('LoadingManager')
export class LoadingManager {
    private static _instance: LoadingManager = null;
    private _loading: Node = null;

    static get instance(): LoadingManager {
        if (!LoadingManager._instance) {
            LoadingManager._instance = new LoadingManager();
        }
        return LoadingManager._instance;
    }

    showLoading() {
        if (this._loading) {
            return;
        }
        resources.load('', Prefab, (err, prefab) => {
            if (err) {
                console.error('load loading prefab failed', err);
                return;
            }
            this._loading = instantiate(prefab);
            const scene = director.getScene();
            scene.addChild(this._loading);
        });
    }

    hideLoading() {
        if (this._loading) {
            this._loading.destroy();
            this._loading = null;
        }
    }
}