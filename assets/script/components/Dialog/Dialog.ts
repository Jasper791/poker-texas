import { _decorator, Button, Component, Label, UITransform } from 'cc';
const { ccclass, property } = _decorator;


// 定义弹窗配置类型
export interface DialogOptions {
    title?: string;
    content?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
}

// ✅ [修复] Label 尺寸常量
const CONTENT_LABEL_MAX_WIDTH = 550;
const CONTENT_LABEL_MAX_HEIGHT = 250;

@ccclass('Dialog')
export class Dialog extends Component {
    @property(Label)
    titleLabel: Label = null!;

    @property(Label)
    contentLabel: Label = null!;

    @property(Label)
    confirmLabel: Label = null!;
  
    @property(Button)
    confirmBtn: Button = null!;

    @property(Button)
    cancelBtn: Button = null!;

    private _onConfirm: (() => void) | null = null;
    private _onCancel: (() => void) | null = null;
    // ✅ [修复] 防止快速连点导致回调被重复触发 / 重复关闭
    private _closed: boolean = false;

    onLoad() {
        // 绑定按钮点击事件
        if (this.confirmBtn?.node) {
            this.confirmBtn.node.on('click', this.onConfirmClick, this);
        }

        if (this.cancelBtn?.node) {
            this.cancelBtn.node.on('click', this.onCancelClick, this);
        }

        // ✅ [修复] 初始化 contentLabel 的换行设置
        this._initContentLabelSettings();
    }

    onDestroy() {
        if (this.confirmBtn?.node) {
            this.confirmBtn.node.off('click', this.onConfirmClick, this);
        }

        if (this.cancelBtn?.node) {
            this.cancelBtn.node.off('click', this.onCancelClick, this);
        }
    }

    /**
     * ✅ [修复] 初始化 contentLabel 的换行和尺寸设置
     */
    private _initContentLabelSettings(): void {
        if (!this.contentLabel) {
            return;
        }

        // 开启自动换行
        this.contentLabel.enableWrapText = true;

        // 设置文本溢出策略为截断
        this.contentLabel.overflow = Label.Overflow.SHRINK;

        // 设置对齐方式
        this.contentLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.contentLabel.verticalAlign = Label.VerticalAlign.CENTER;

        // 获取或添加 UITransform 组件
        let uiTransform = this.contentLabel.node.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = this.contentLabel.node.addComponent(UITransform);
        }

        // 设置最大宽度和高度
        uiTransform.setContentSize(CONTENT_LABEL_MAX_WIDTH, CONTENT_LABEL_MAX_HEIGHT);
    }

    /**
     * ✅ [修复] 根据文本长度调整字体大小，确保内容在限制尺寸内
     */
    private _adjustContentLabelFontSize(): void {
        if (!this.contentLabel) {
            return;
        }

        const content = this.contentLabel.string;
        if (!content) {
            return;
        }

        const uiTransform = this.contentLabel.node.getComponent(UITransform);
        if (!uiTransform) {
            return;
        }

        const currentFontSize = this.contentLabel.fontSize;
        const maxWidth = CONTENT_LABEL_MAX_WIDTH;
        const maxHeight = CONTENT_LABEL_MAX_HEIGHT;

        // 简单估算：中文每个字大约占 fontSize * 0.8 的宽度
        // 如果文本过长，适当缩小字体
        const estimatedWidth = content.length * currentFontSize * 0.8;
        if (estimatedWidth > maxWidth * 1.5) {
            // 文本较长，缩小字体
            const newFontSize = Math.floor(currentFontSize * (maxWidth * 1.5) / estimatedWidth);
            this.contentLabel.fontSize = Math.max(newFontSize, 20); // 最小字号为20
        } else {
            // 恢复默认字号
            this.contentLabel.fontSize = 32;
        }
    }

    // 初始化内容
    init(options: DialogOptions) {
        // ✅ [修复] 每次 init 时重置关闭状态，避免节点被复用（对象池等场景）时按钮失效
        this._closed = false;

        if (this.titleLabel) {
            this.titleLabel.string = options.title ?? '提示';
        }

        if (this.contentLabel) {
            this.contentLabel.string = options.content ?? '';
            // ✅ [修复] 设置内容后调整字体大小
            this._adjustContentLabelFontSize();
        }

        if (this.confirmLabel) {
            this.confirmLabel.string = options.confirmText ?? '确定';
        }

        this._onConfirm = options.onConfirm ?? null;
        this._onCancel = options.onCancel ?? null;

        // ✅ [修复] 显示/隐藏取消按钮：只有传了 onCancel 才显示取消按钮
        if (this.cancelBtn?.node) {
            this.cancelBtn.node.active = !!options.onCancel;
        }
    }

    // 确定
    onConfirmClick() {
        // ✅ [修复] 防止重复点击导致回调被多次触发
        if (this._closed) {
            return;
        }
        this._closed = true;
        this._onConfirm?.();
        this.close();
    }

    // 取消
    onCancelClick() {
        // ✅ [修复] 防止重复点击导致回调被多次触发
        if (this._closed) {
            return;
        }
        this._closed = true;
        this._onCancel?.();
        this.close();
    }

    // 关闭弹窗
    close() {
        if (this.node?.isValid) {
            this.node.destroy();
        }
    }
}

