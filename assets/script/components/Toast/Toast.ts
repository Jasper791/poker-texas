import {
    _decorator,
    Component,
    Label,
    tween,
    UIOpacity,
    Vec3
} from "cc";

const { ccclass, property } = _decorator;

@ccclass("Toast")
export class Toast extends Component {

    @property(Label)
    label: Label = null!;

    @property
    duration = 2;

    private opacity!: UIOpacity;

    onLoad() {

        this.opacity = this.getComponent(UIOpacity);

        if (!this.opacity) {
            this.opacity = this.addComponent(UIOpacity);
        }

        this.node.active = false;
    }

    show(msg: string, finish?: Function) {

        this.label.string = msg;

        this.node.active = true;

        this.opacity.opacity = 0;

        let pos = this.node.position.clone();

        this.node.setPosition(pos.x, pos.y - 30);

        tween(this.opacity)
            .to(0.2, {
                opacity: 255
            })
            .start();

        tween(this.node)
            .to(0.2, {
                position: new Vec3(pos.x, pos.y)
            })
            .delay(this.duration)
            .call(() => {

                tween(this.opacity)
                    .to(0.2, {
                        opacity: 0
                    })
                    .call(() => {

                        this.node.active = false;

                        finish && finish();

                    })
                    .start();

            })
            .start();

    }
}