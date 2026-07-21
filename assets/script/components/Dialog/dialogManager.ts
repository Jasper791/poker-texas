import { _decorator, Component, Node, Prefab, instantiate, director, resources, Canvas } from 'cc';
import { Dialog, DialogOptions } from './Dialog';

const { ccclass, property } = _decorator;

@ccclass('DialogManager')
export class DialogManager extends Component {
    // 先初始化实例为 null，更安全
    private static _instance: DialogManager | null = null;
    private dialogPrefab: Prefab | null = null;

    onLoad() {
        DialogManager._instance = this;
        director.addPersistRootNode(this.node); // 跨场景不销毁
    }

    // 安全获取单例：如果不存在就自动创建
    public static get instance(): DialogManager {
        if (!this._instance) {
            // 自动创建管理器节点，不用手动在编辑器里挂
            const node = new Node('DialogManager');
            director.getScene()?.addChild(node);
            this._instance = node.addComponent(DialogManager);
            console.log('DialogManager 已自动创建');
        }
        return this._instance;
    }

    static show(options: DialogOptions) {
        const self = this.instance;
        // 修复：先判断实例是否存在，不存在会在上面自动创建
        if (!self) {
            console.error('DialogManager 实例获取失败');
            return;
        }

        if (!self.dialogPrefab) {
            // 加载预制体，加载完成再创建弹窗
            resources.load('Components/Dialog/Dialog', Prefab, (err, prefab) => {
                if (err) {
                    console.error('加载 Dialog 预制体失败：', err.message);
                    return;
                }
                self.dialogPrefab = prefab;
                self.createDialog(options);
            });
        } else {
            self.createDialog(options);
        }
    }

    private createDialog(options: DialogOptions) {
        if (!this.dialogPrefab) return;
        const dialogNode = instantiate(this.dialogPrefab);

        // ✅ 关键：找到 Canvas，把弹窗挂在 Canvas 下
        const canvas = director.getScene()?.getComponentInChildren(Canvas);
        if (canvas) {
            canvas.node.addChild(dialogNode);
        } else {
            director.getScene()?.addChild(dialogNode);
        }

        const dialogComp = dialogNode.getComponent(Dialog);
        dialogComp?.init(options);
    }
}