import { _decorator, Button, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

export interface QuickMsgData {
    key: string;
    label: string;
    audioPath: string;
}

@ccclass('QuickMsgItem')
export class QuickMsgItem extends Component {
    @property(Label)
    msgLabel: Label = null!;

    @property(Button)
    clickBtn: Button = null!;

    private _data: QuickMsgData | null = null;
    private _onClick: ((data: QuickMsgData) => void) | null = null;

    onLoad() {
        if (this.clickBtn?.node) {
            this.clickBtn.node.on('click', this._handleClick, this);
        } else if (this.node) {
            this.node.on('click', this._handleClick, this);
        }
    }

    onDestroy() {
        if (this.clickBtn?.node) {
            this.clickBtn.node.off('click', this._handleClick, this);
        } else if (this.node) {
            this.node.off('click', this._handleClick, this);
        }
    }

    init(data: QuickMsgData, onClick: (data: QuickMsgData) => void) {
        this._data = data;
        this._onClick = onClick;

        if (this.msgLabel) {
            this.msgLabel.string = data.label;
        }
    }

    private _handleClick() {
        if (this._data && this._onClick) {
            this._onClick(this._data);
        }
    }

    get data(): QuickMsgData | null {
        return this._data;
    }
}
