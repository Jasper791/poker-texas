import { _decorator, Component, Node, director, Sprite, SpriteFrame, resources, Label, Button } from 'cc';
const { ccclass, property } = _decorator;
import { LogService } from './utils/LogService';
import { GameNetwork } from './net/GameNetwork';
import { UserInfoManager } from './managers/UserInfoManager';
import { maskWalletAddress } from './utils/Tools';
import { SceneLoader } from './managers/SceneLoader';
import { SoundManager } from './managers/SoundManager';

@ccclass('me')
export class me extends Component {
    @property(Node)
    returnBtn: Node = null;

    @property({ type: Node, tooltip: '详情按钮' })
    detailBtn: Node = null;

    @property({ type: Node, tooltip: '其他按钮' })
    otherBtn: Node = null;

    @property({ type: Node, tooltip: '详情面板' })
    detailPanel: Node = null;

    @property({ type: Node, tooltip: '其他面板' })
    otherPanel: Node = null;

    @property({ type: Node, tooltip: '标题节点' })
    meTitle: Node = null;

    @property({ type: Label, tooltip: '昵称' })
    nickname: Label = null;

    @property({ type: Label, tooltip: '房卡数' })
    roomCardNum: Label = null;

    @property({ type: Label, tooltip: '钱包地址' })
    walletAddress: Label = null;

    @property({ type: Node, tooltip: '音效开关按钮' })
    offSoundBtn: Node = null;

    @property({ type: Node, tooltip: '背景音乐开关按钮' })
    offBackGroundMusicBtn: Node = null;

    private _openMusicSpriteFrame: SpriteFrame = null;
    private _closeMusicSpriteFrame: SpriteFrame = null;

    start() {
        if (this.returnBtn) {
            this.returnBtn.on('click', this.onReturnBtnClick, this);
        }

        // 绑定面板切换按钮
        if (this.detailBtn) {
            this.detailBtn.on('click', this.onDetailBtnClick, this);
        }
        if (this.otherBtn) {
            this.otherBtn.on('click', this.onOtherBtnClick, this);
        }

        // 初始化：显示详情面板，隐藏其他面板
        this.showDetailPanel();

        // 加载音乐开关图片
        this._loadMusicSpriteFrames();

        // 绑定音效和背景音乐按钮事件
        this._bindAudioButtons();

        const gameNetwork = GameNetwork.getInstance();

        if (!gameNetwork.isConnected() || !gameNetwork.getWalletAddress()) {
            this.scheduleOnce(() => {
                SceneLoader.getInstance().loadScene('index');
            }, 0.5);
            return;
        }
    }

    private _loadMusicSpriteFrames() {
        resources.load('material/texture/open_music/spriteFrame', SpriteFrame, (err, frame) => {
            if (err) {
                LogService.error('me', 'Failed to load open_music spriteFrame', err);
                return;
            }
            if (frame) {
                this._openMusicSpriteFrame = frame;
                LogService.info('me', `open_music spriteFrame loaded, updating button states`);
                this._updateSoundButtonState();
                this._updateBgmButtonState();
            }
        });
        
        resources.load('material/texture/close_music/spriteFrame', SpriteFrame, (err, frame) => {
            if (err) {
                LogService.error('me', 'Failed to load close_music spriteFrame', err);
                return;
            }
            if (frame) {
                this._closeMusicSpriteFrame = frame;
                LogService.info('me', `close_music spriteFrame loaded, updating button states`);
                this._updateSoundButtonState();
                this._updateBgmButtonState();
            }
        });
    }

    private _bindAudioButtons() {
        if (this.offSoundBtn) {
            const btn = this.offSoundBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onOffSoundBtnClick, this);
            }
        }

        if (this.offBackGroundMusicBtn) {
            const btn = this.offBackGroundMusicBtn.getComponent(Button);
            if (btn) {
                btn.node.on('click', this.onOffBackGroundMusicBtnClick, this);
            }
        }
    }

    private _updateSoundButtonState() {
        if (!this.offSoundBtn) {
            return;
        }
        
        const sprite = this.offSoundBtn.getComponent(Sprite);
        const btn = this.offSoundBtn.getComponent(Button);
        
        const soundManager = SoundManager.getInstance();
        const isEnabled = soundManager.isSoundEnabled();
        
        const targetFrame = isEnabled ? this._openMusicSpriteFrame : this._closeMusicSpriteFrame;
        
        if (sprite && targetFrame) {
            sprite.spriteFrame = targetFrame;
        }
        
        if (btn && targetFrame) {
            btn.normalSprite = targetFrame;
            btn.hoverSprite = targetFrame;
            btn.pressedSprite = targetFrame;
        }
        
        LogService.info('me', `_updateSoundButtonState: isEnabled=${isEnabled}, sprite=${!!sprite}, btn=${!!btn}, targetFrame=${!!targetFrame}`);
    }

    private _updateBgmButtonState() {
        if (!this.offBackGroundMusicBtn) {
            return;
        }
        
        const sprite = this.offBackGroundMusicBtn.getComponent(Sprite);
        const btn = this.offBackGroundMusicBtn.getComponent(Button);
        
        const soundManager = SoundManager.getInstance();
        const isEnabled = soundManager.isBgmEnabled();
        
        const targetFrame = isEnabled ? this._openMusicSpriteFrame : this._closeMusicSpriteFrame;
        
        if (sprite && targetFrame) {
            sprite.spriteFrame = targetFrame;
        }
        
        if (btn && targetFrame) {
            btn.normalSprite = targetFrame;
            btn.hoverSprite = targetFrame;
            btn.pressedSprite = targetFrame;
        }
        
        LogService.info('me', `_updateBgmButtonState: isEnabled=${isEnabled}, sprite=${!!sprite}, btn=${!!btn}, targetFrame=${!!targetFrame}`);
    }

    onOffSoundBtnClick() {
        LogService.info('me', `onOffSoundBtnClick: called`);
        
        const soundManager = SoundManager.getInstance();
        const currentState = soundManager.isSoundEnabled();
        const newState = !currentState;
        
        LogService.info('me', `onOffSoundBtnClick: currentState=${currentState}, newState=${newState}`);
        
        soundManager.setSoundEnabled(newState);
        
        const soundManagerState = soundManager.isSoundEnabled();
        LogService.info('me', `onOffSoundBtnClick: soundManager state after set = ${soundManagerState}`);
        
        this._updateSoundButtonState();
    }

    onOffBackGroundMusicBtnClick() {
        LogService.info('me', `onOffBackGroundMusicBtnClick: called`);
        
        const soundManager = SoundManager.getInstance();
        const currentState = soundManager.isBgmEnabled();
        const newState = !currentState;
        
        LogService.info('me', `onOffBackGroundMusicBtnClick: currentState=${currentState}, newState=${newState}`);
        
        soundManager.setBgmEnabled(newState);
        
        const soundManagerState = soundManager.isBgmEnabled();
        LogService.info('me', `onOffBackGroundMusicBtnClick: soundManager state after set = ${soundManagerState}`);
        
        this._updateBgmButtonState();
    }

    onReturnBtnClick() {
        SceneLoader.getInstance().loadScene('index');
    }

    /**
     * 点击详情按钮
     */
    private onDetailBtnClick() {
        this.showDetailPanel();
    }

    /**
     * 点击其他按钮
     */
    private onOtherBtnClick() {
        this.showOtherPanel();
    }

    /**
     * 显示详情面板
     */
    private showDetailPanel() {
        if (this.detailPanel) {
            this.detailPanel.active = true;
            this.updateUserInfo()
        }
        if (this.otherPanel) {
            this.otherPanel.active = false;
        }
        const sprite = this.meTitle?.getComponent(Sprite);
        if (sprite) {
            resources.load('material/mePanelbg/spriteFrame', SpriteFrame, (err, frame) => {
                if (!err && frame && sprite && sprite.node && sprite.node.isValid) {
                    sprite.spriteFrame = frame;
                }
            });
        }
    }

    /**
     * 显示其他面板
     */
    private showOtherPanel() {
        if (this.detailPanel) {
            this.detailPanel.active = false;
        }
        if (this.otherPanel) {
            this.otherPanel.active = true;
        }
        const sprite = this.meTitle?.getComponent(Sprite);
        if (sprite) {
            resources.load('material/otherPanel/spriteFrame', SpriteFrame, (err, frame) => {
                if (!err && frame && sprite && sprite.node && sprite.node.isValid) {
                    sprite.spriteFrame = frame;
                }
            });
        }
    }

    public async updateUserInfo() {
        await GameNetwork.getInstance().fetchRoomCardBalance();
        const userInfo = UserInfoManager.getInstance().getUserInfo()
        const addressNode = this.detailPanel.getChildByName('address').getComponent(Label)
        addressNode.string = `${maskWalletAddress(userInfo?.walletAddress || '')}`
        const roomCardNode = this.roomCardNum.getComponent(Label)
        const nickNameNode = this.nickname.getComponent(Label)
        roomCardNode.string = `${userInfo?.roomCard}`
        nickNameNode.string = `${userInfo?.nickname}`
        // this.nickname.string = `${userInfo?.nickname}`
        // this.roomCardNum.string = `${userInfo?.roomCard}`
        // this.walletAddress.string = `${maskWalletAddress(userInfo?.walletAddress || '')}`
    }

    update(deltaTime: number) {

    }
}

