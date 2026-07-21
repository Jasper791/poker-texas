import { _decorator, Component, Node, Prefab, instantiate, UITransform, find, director, ScrollView, Layout, Widget, Mask } from 'cc';
const { ccclass, property } = _decorator;

import { QuickMsgItem, QuickMsgData } from './QuickMsgItem';
import { AUDIO_CONFIG, GAME_MSG_LABELS } from '../../config/audioConfig';
import { LogService } from '../../utils/LogService';

@ccclass('QuickMsgSelectWnd')
export class QuickMsgSelectWnd extends Component {
    @property(Node)
    scrollView: Node = null!;

    @property(Prefab)
    msgItemPrefab: Prefab = null!;

    private _isShowing: boolean = false;

    onLoad() {
        this._initMsgList();
        this.hide();
    }

    show() {
        if (this.node) {
            this.node.active = true;
            this._isShowing = true;
            
            this.scheduleOnce(() => {
                this._refreshScrollView();
            }, 0);
        }
    }

    private _refreshScrollView() {
        const scrollViewComp = this.scrollView?.getComponent(ScrollView);
        if (!scrollViewComp) {
            LogService.warn('QuickMsgSelectWnd', 'ScrollView component not found in _refreshScrollView');
            return;
        }

        scrollViewComp.vertical = true;
        scrollViewComp.horizontal = false;
        scrollViewComp.elastic = true;

        const view = this.scrollView.getChildByName('view');
        const content = view?.getChildByName('content');
        
        if (content) {
            const contentUITransform = content.getComponent(UITransform);
            const layout = content.getComponent(Layout);
            
            if (layout) {
                layout.updateLayout();
            }
            
            if (contentUITransform) {
                LogService.info('QuickMsgSelectWnd', `_refreshScrollView: Content size = ${contentUITransform.contentSize.width}x${contentUITransform.contentSize.height}`);
            }
        }

        scrollViewComp.enabled = false;
        scrollViewComp.enabled = true;

        scrollViewComp.scrollToTop(0);
        LogService.info('QuickMsgSelectWnd', '_refreshScrollView completed');
    }

    hide() {
        if (this.node) {
            this.node.active = false;
            this._isShowing = false;
        }
    }

    isShowing(): boolean {
        return this._isShowing;
    }

    toggle() {
        if (this._isShowing) {
            this.hide();
        } else {
            this.show();
        }
    }

    private _initMsgList() {
        LogService.info('QuickMsgSelectWnd', '_initMsgList called');

        if (!this.scrollView) {
            LogService.error('QuickMsgSelectWnd', 'scrollView is null');
            return;
        }

        if (!this.msgItemPrefab) {
            LogService.error('QuickMsgSelectWnd', 'msgItemPrefab is null');
            return;
        }

        const scrollViewComp = this.scrollView.getComponent(ScrollView);

        let content: Node | null = null;

        const scrollViewUITransform = this.scrollView.getComponent(UITransform);
        const scrollViewSize = scrollViewUITransform ? scrollViewUITransform.contentSize : { width: 500, height: 740 };

        const view = this.scrollView.getChildByName('view');
        if (view) {
            let mask = view.getComponent(Mask);
            if (!mask) {
                mask = view.addComponent(Mask);
                LogService.info('QuickMsgSelectWnd', 'Added Mask component to view');
            }

            const viewUITransform = view.getComponent(UITransform);
            if (viewUITransform) {
                viewUITransform.setContentSize(scrollViewSize.width - 20, scrollViewSize.height - 20);
                LogService.info('QuickMsgSelectWnd', `Fixed view size: ${scrollViewSize.width - 20}x${scrollViewSize.height - 20}`);
            }

            content = view.getChildByName('content');
            if (!content) {
                LogService.error('QuickMsgSelectWnd', 'content node not found');
                return;
            }
        } else {
            LogService.error('QuickMsgSelectWnd', 'view node not found');
            return;
        }

        LogService.info('QuickMsgSelectWnd', `content found, current children count: ${content.children.length}`);

        if (scrollViewComp) {
            scrollViewComp.content = content;
            scrollViewComp.vertical = true;
            scrollViewComp.horizontal = false;
            scrollViewComp.elastic = true;
            LogService.info('QuickMsgSelectWnd', 'Set ScrollView content, vertical=true, horizontal=false');
        }

        const contentWidget = content.getComponent(Widget);
        if (contentWidget) {
            contentWidget.enabled = false;
            LogService.info('QuickMsgSelectWnd', 'Disabled Widget component on content');
        }

        const contentUITransform = content.getComponent(UITransform);
        if (contentUITransform) {
            contentUITransform.setContentSize(scrollViewSize.width - 40, 1);
            contentUITransform.setAnchorPoint(0.5, 1);
            LogService.info('QuickMsgSelectWnd', `Fixed content size: ${scrollViewSize.width - 40}x1, anchorY=1`);
        }

        let layout = content.getComponent(Layout);
        if (layout) {
            layout.destroy();
            LogService.info('QuickMsgSelectWnd', 'Removed existing Layout component');
        }

        layout = content.addComponent(Layout);
        layout.paddingTop = 10;
        layout.paddingBottom = 10;
        layout.paddingLeft = 10;
        layout.paddingRight = 10;
        layout.spacingY = 8;
        layout.resizeMode = Layout.ResizeMode.NONE;
        layout.type = Layout.Type.VERTICAL;
        LogService.info('QuickMsgSelectWnd', 'Added Layout component with VERTICAL type');

        const msgKeys = Object.keys(GAME_MSG_LABELS);
        LogService.info('QuickMsgSelectWnd', `GAME_MSG_LABELS keys count: ${msgKeys.length}`);

        let itemHeight = 60;

        msgKeys.forEach((key) => {
            const label = GAME_MSG_LABELS[key] || key;
            const audioPath = AUDIO_CONFIG.gameMsg[key] || '';

            const itemNode = instantiate(this.msgItemPrefab);
            const itemUITransform = itemNode.getComponent(UITransform);
            if (itemUITransform) {
                const prefabHeight = itemUITransform.contentSize.height;
                if (prefabHeight > 0) {
                    itemHeight = prefabHeight;
                } else {
                    itemUITransform.setContentSize(scrollViewSize.width - 60, itemHeight);
                }
            } else {
                const newUITransform = itemNode.addComponent(UITransform);
                newUITransform.setContentSize(scrollViewSize.width - 60, itemHeight);
            }

            const item = itemNode.getComponent(QuickMsgItem);

            if (item) {
                item.init({
                    key: key,
                    label: label,
                    audioPath: audioPath
                }, (data) => {
                    this._handleMsgClick(data);
                });
            }

            content!.addChild(itemNode);
        });

        layout.updateLayout();

        this.scheduleOnce(() => {
            if (scrollViewComp && contentUITransform) {
                const calculatedHeight = layout.paddingTop + layout.paddingBottom + 
                    msgKeys.length * itemHeight + (msgKeys.length - 1) * layout.spacingY;
                
                contentUITransform.setContentSize(scrollViewSize.width - 40, calculatedHeight);
                
                const viewUITransform = view!.getComponent(UITransform);
                const viewHeight = viewUITransform ? viewUITransform.contentSize.height : scrollViewSize.height - 20;
                const contentHeight = contentUITransform.contentSize.height;
                LogService.info('QuickMsgSelectWnd', `View height: ${viewHeight}, Content height: ${contentHeight}, Calculated height: ${calculatedHeight}`);

                scrollViewComp.enabled = false;
                scrollViewComp.enabled = true;

                if (contentHeight > viewHeight) {
                    LogService.info('QuickMsgSelectWnd', 'Content height > View height, scroll should work');
                } else {
                    LogService.warn('QuickMsgSelectWnd', 'Content height <= View height, no scroll needed');
                }

                scrollViewComp.scrollToTop(0);
                LogService.info('QuickMsgSelectWnd', 'Forced scroll refresh completed');
            }
        }, 0);

        LogService.info('QuickMsgSelectWnd', `_initMsgList completed, content children count: ${content.children.length}`);
    }

    private _getPlayerGender(): string {
        return 'male';
    }

    setPlayerGender(gender: string) {
        // 预留方法，用于设置玩家性别
        // 可根据需要扩展实现
    }

    private _handleMsgClick(data: QuickMsgData) {
        const scene = director.getScene();
        if (!scene) {
            LogService.error('QuickMsgSelectWnd', '未找到当前场景');
            return;
        }

        const gamingPvpComp = scene.getComponentInChildren('gamingPvp');
        if (gamingPvpComp) {
            (gamingPvpComp as any).sendQuickMsg(data.key);
        } else {
            LogService.error('QuickMsgSelectWnd', '未找到 gamingPvp 组件');
        }
    }
}
