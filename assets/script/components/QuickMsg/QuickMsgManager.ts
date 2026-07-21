import { resources, Prefab, Node, director, instantiate } from 'cc';
import { LogService } from '../../utils/LogService';
import { QuickMsgSelectWnd } from './QuickMsgSelectWnd';

export class QuickMsgManager {
    private static _instance: QuickMsgManager = null;
    private _panel: QuickMsgSelectWnd | null = null;
    private _panelNode: Node | null = null;
    private _isInitialized: boolean = false;

    private constructor() {
    }

    static getInstance(): QuickMsgManager {
        if (QuickMsgManager._instance === null) {
            QuickMsgManager._instance = new QuickMsgManager();
        }
        return QuickMsgManager._instance;
    }

    async init(playerGender: string = 'male'): Promise<void> {
        if (this._isInitialized) {
            if (this._panel) {
                this._panel.setPlayerGender(playerGender);
            }
            return;
        }

        return new Promise((resolve) => {
            resources.load('Components/QuickMsg/QuickMsgSelectWnd', Prefab, (err: any, prefab: Prefab) => {
                if (err) {
                    LogService.error('QuickMsgManager', 'Failed to load QuickMsgSelectWnd prefab', err);
                    this._isInitialized = false;
                    resolve();
                    return;
                }

                const currentScene = director.getScene();
                if (!currentScene) {
                    LogService.error('QuickMsgManager', 'No active scene');
                    this._isInitialized = false;
                    resolve();
                    return;
                }

                this._panelNode = instantiate(prefab);
                this._panel = this._panelNode.getComponent(QuickMsgSelectWnd);

                if (this._panel) {
                    this._panel.setPlayerGender(playerGender);
                    this._panel.hide();
                }

                currentScene.addChild(this._panelNode);

                this._isInitialized = true;
                LogService.info('QuickMsgManager', 'QuickMsgManager initialized');
                resolve();
            });
        });
    }

    show() {
        if (this._panel) {
            this._panel.show();
        }
    }

    hide() {
        if (this._panel) {
            this._panel.hide();
        }
    }

    toggle() {
        if (this._panel) {
            this._panel.toggle();
        }
    }

    isShowing(): boolean {
        return this._panel ? this._panel.isShowing() : false;
    }

    setPlayerGender(gender: string) {
        if (this._panel) {
            this._panel.setPlayerGender(gender);
        }
    }

    destroy() {
        if (this._panelNode && this._panelNode.isValid) {
            this._panelNode.destroy();
        }
        this._panel = null;
        this._panelNode = null;
        this._isInitialized = false;
    }
}
