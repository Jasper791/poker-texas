import { _decorator, Component, Node, Prefab, instantiate, director, resources, Canvas } from 'cc';
import { Dialog, DialogOptions } from './Dialog';

const { ccclass, property } = _decorator;

@ccclass('DialogManager')
export class DialogManager extends Component {
    // 先初始化实例为 null，更安全
    private static _instance: DialogManager | null = null;
    private dialogPrefab: Prefab | null = null;
    // ✅ [修复] 标记是否正在加载预制体，避免并发调用 show() 时重复加载/创建多个弹窗
    private isLoadingPrefab: boolean = false;
    // ✅ [修复] 加载期间收到的 show() 请求先缓存，加载完成后统一创建
    private pendingOptions: DialogOptions[] = [];

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
            // ✅ [修复] 已经在加载中，先把本次请求缓存起来，避免重复 resources.load 造成多个弹窗叠加
            if (self.isLoadingPrefab) {
                self.pendingOptions.push(options);
                return;
            }

            self.isLoadingPrefab = true;
            // 加载预制体，加载完成再创建弹窗
            resources.load('Components/Dialog/Dialog', Prefab, (err, prefab) => {
                self.isLoadingPrefab = false;

                if (err) {
                    console.error('加载 Dialog 预制体失败：', err.message);
                    self.pendingOptions.length = 0; // 加载失败，清空等待队列
                    return;
                }

                self.dialogPrefab = prefab;
                self.createDialog(options);

                // 处理加载期间堆积的请求
                const queued = self.pendingOptions;
                self.pendingOptions = [];
                queued.forEach(o => self.createDialog(o));
            });
        } else {
            self.createDialog(options);
        }
    }

    private createDialog(options: DialogOptions) {
        if (!this.dialogPrefab) return;
        const dialogNode = instantiate(this.dialogPrefab);

        // ✅ [修复] 找到 Canvas，把弹窗挂在 Canvas 下；
        // 找不到 Canvas 时不要静默挂到 Scene 根节点——那样弹窗大概率无法接收点击（看得见点不到）
        const canvas = director.getScene()?.getComponentInChildren(Canvas);
        if (!canvas) {
            console.error('DialogManager: 未找到 Canvas，弹窗可能无法正常显示/交互，已取消创建');
            dialogNode.destroy();
            return;
        }
        canvas.node.addChild(dialogNode);

        // ✅ [修复] 预制体上缺少 Dialog 组件时给出明确报错，而不是静默失败
        const dialogComp = dialogNode.getComponent(Dialog);
        if (!dialogComp) {
            console.error('DialogManager: Dialog 预制体上未找到 Dialog 组件，已取消创建');
            dialogNode.destroy();
            return;
        }
        dialogComp.init(options);
    }
}