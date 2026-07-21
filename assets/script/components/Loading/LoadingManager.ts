import {
    find,
    instantiate,
    Prefab,
    resources,
    director,
    Node,
} from "cc";

import Loading from "./Loading";

export class LoadingManager {

    /** 预制体 */
    private static _prefab: Prefab | null = null;

    /** Loading组件 */
    private static _loading: Loading | null = null;

    /** 是否正在加载Prefab */
    private static _loadingPrefab = false;

    /**
     * 显示Loading
     */
    public static show(text: string = "Loading..."): void {

        // 已经存在
        if (this.hasValidLoading()) {

            this.attachToCanvas();

            this._loading!.show(text);

            return;
        }

        // Prefab已经加载
        if (this._prefab) {

            this.createNode(text);

            return;
        }

        // 正在加载Prefab
        if (this._loadingPrefab) {
            return;
        }

        this._loadingPrefab = true;

        resources.load(
            "Components/Loading/Loading",
            Prefab,
            (err, prefab) => {

                this._loadingPrefab = false;

                if (err) {
                    console.error("Loading Prefab 加载失败：", err);
                    return;
                }

                this._prefab = prefab;

                this.createNode(text);
            }
        );
    }

    /**
     * 隐藏
     */
    public static hide(): void {

        if (!this.hasValidLoading()) {
            return;
        }

        this._loading!.hide();
    }

    /**
     * 修改文字
     */
    public static setText(text: string): void {

        if (!this.hasValidLoading()) {
            return;
        }

        this._loading!.setText(text);
    }

    /**
     * 是否显示
     */
    public static isShowing(): boolean {

        if (!this.hasValidLoading()) {
            return false;
        }

        return this._loading!.isShowing();
    }

    private static hasValidLoading(): boolean {

        if (!this._loading || !this._loading.node) {
            this._loading = null;
            return false;
        }

        if (!this._loading.node.isValid) {
            this._loading = null;
            return false;
        }

        return true;
    }

    /**
     * 创建节点
     */
    private static createNode(text: string): void {

        if (!this._prefab) {
            return;
        }

        const canvas = find("Canvas");

        if (!canvas) {
            console.error("未找到 Canvas");
            return;
        }

        const node = instantiate(this._prefab);

        node.parent = canvas;

        node.setSiblingIndex(canvas.children.length - 1);

        this._loading = node.getComponent(Loading);

        if (!this._loading) {
            console.error("Loading.ts 未挂载到Prefab根节点");
            return;
        }

        this._loading.show(text);
    }

    /**
     * 场景切换后重新挂到Canvas
     */
    private static attachToCanvas(): void {

        if (!this.hasValidLoading()) {
            return;
        }

        const canvas = find("Canvas");

        if (!canvas) {
            return;
        }

        if (this._loading!.node.parent !== canvas) {
            this._loading!.node.parent = canvas;
        }

        this._loading!.node.setSiblingIndex(canvas.children.length - 1);
    }

}