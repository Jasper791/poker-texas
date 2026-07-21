import { _decorator, Component, Label, Node, ProgressBar } from "cc";

const { ccclass, property } = _decorator;

@ccclass("Loading")
export default class Loading extends Component {

    @property(Label)
    public tip: Label = null!;

    @property(Node)
    public spinner: Node = null!;

    @property(Label)
    public progressLabel: Label = null!;

    @property(ProgressBar)
    public progressBar: ProgressBar = null!;

    private _showing = false;

    onLoad() {
        this.node.active = true;
    }

    update(dt: number) {

        if (!this._showing || !this.spinner) {
            return;
        }

        this.spinner.angle = (this.spinner.angle - 220 * dt) % 360;
    }

    /**
     * 显示
     */
    public show(text: string = "Loading...") {

        this._showing = true;

        this.node.active = true;

        if (this.tip) {
            this.tip.string = text;
        }

        this.setProgress(0);
    }

    /**
     * 隐藏
     */
    public hide() {

        this._showing = false;

        this.node.active = false;

    }

    /**
     * 强制隐藏
     */
    public forceHide() {

        this.hide();

    }

    /**
     * 修改文字
     */
    public setText(text: string) {

        if (this.tip) {
            this.tip.string = text;
        }

    }

    /**
     * 设置进度 (0-1)
     */
    public setProgress(progress: number) {
        const clampedProgress = Math.max(0, Math.min(1, progress));
        
        if (this.progressBar) {
            this.progressBar.progress = clampedProgress;
        }
        
        if (this.progressLabel) {
            this.progressLabel.string = `${Math.round(clampedProgress * 100)}%`;
        }
    }

    /**
     * 设置进度和文字
     */
    public setProgressWithText(progress: number, text: string) {
        this.setProgress(progress);
        this.setText(text);
    }

    /**
     * 是否显示
     */
    public isShowing(): boolean {

        return this._showing;

    }

}