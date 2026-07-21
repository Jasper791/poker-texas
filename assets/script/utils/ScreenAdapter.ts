import { view, UITransform, Sprite, Node, Canvas } from 'cc';
import { LogService } from './LogService';

export class ScreenAdapter {
    private static instance: ScreenAdapter;

    public static getInstance(): ScreenAdapter {
        if (!ScreenAdapter.instance) {
            ScreenAdapter.instance = new ScreenAdapter();
        }
        return ScreenAdapter.instance;
    }

    public adaptToScreen(rootNode: Node): void {
        // 检查 rootNode 是否已经是 Canvas 节点
        let canvas = rootNode.getComponent(Canvas) ? rootNode : rootNode.parent;
        
        if (!canvas) {
            LogService.warn('ScreenAdapter', 'Canvas节点不存在');
            return;
        }

        const visibleSize = view.getVisibleSize();
        const targetWidth = visibleSize.width;
        const targetHeight = visibleSize.height;

        view.setDesignResolutionSize(targetWidth, targetHeight, 1);

        const canvasUITransform = canvas.getComponent(UITransform);
        if (canvasUITransform) {
            canvasUITransform.setContentSize(targetWidth, targetHeight);
        }

        canvas.setPosition(0, 0, 0);
        canvas.getComponent(UITransform)?.setAnchorPoint(0.5, 0.5);

        this.setupBackgroundNode(canvas, targetWidth, targetHeight);
    }

    private setupBackgroundNode(parentNode: Node, width: number, height: number): void {
        const bgNode = parentNode.getChildByName('bg');
        if (bgNode) {
            const uiTransform = bgNode.getComponent(UITransform);
            if (uiTransform) {
                uiTransform.setContentSize(width, height);
                uiTransform.setAnchorPoint(0.5, 0.5);
                bgNode.setPosition(0, 0, 0);
            }

            const sprite = bgNode.getComponent(Sprite);
            if (sprite) {
                sprite.sizeMode = Sprite.SizeMode.STRETCH;
                sprite.type = Sprite.Type.SIMPLE;
            }

            bgNode.setSiblingIndex(0);
        }
    }
}
