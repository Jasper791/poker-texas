import { Node } from 'cc';

export interface IPresenter {
    init(): void;
    destroy(): void;
    reset(): void;
}

export abstract class BasePresenter implements IPresenter {
    protected _isInitialized: boolean = false;
    protected _isDestroyed: boolean = false;

    init(): void {
        if (this._isInitialized) {
            console.warn('Presenter already initialized');
            return;
        }
        this._isInitialized = true;
        this.onInit();
    }

    destroy(): void {
        if (this._isDestroyed) {
            console.warn('Presenter already destroyed');
            return;
        }
        this._isDestroyed = true;
        this.onDestroy();
    }

    reset(): void {
        if (this._isDestroyed) {
            console.warn('Cannot reset destroyed presenter');
            return;
        }
        this.onReset();
    }

    isInitialized(): boolean {
        return this._isInitialized;
    }

    isDestroyed(): boolean {
        return this._isDestroyed;
    }

    protected abstract onInit(): void;
    protected abstract onDestroy(): void;
    protected abstract onReset(): void;
}

export abstract class ViewPresenter extends BasePresenter {
    protected _view: Node | null = null;

    constructor(view?: Node) {
        super();
        this._view = view || null;
    }

    getView(): Node | null {
        return this._view;
    }

    setView(view: Node): void {
        this._view = view;
    }

    protected onDestroy(): void {
        this._view = null;
    }
}