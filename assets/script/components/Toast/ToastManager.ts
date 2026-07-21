import {
    director,
    Canvas,
    instantiate,
    isValid,
    Prefab,
    resources
} from "cc";

import { Toast } from "./Toast";

export class ToastManager {

    private static toast: Toast;

    private static loading = false;

    private static queue: string[] = [];

    private static playing = false;

    /**
     * 显示Toast
     */
    static show(msg: string) {

        this.queue.push(msg);

        this.playNext();

    }

    /**
     * 播放下一条
     */
    private static async playNext() {

        if (this.playing) {
            return;
        }

        if (this.queue.length == 0) {
            return;
        }

        this.playing = true;

        let toast = await this.getToast();

        toast.show(this.queue.shift()!, () => {

            this.playing = false;

            this.playNext();

        });

    }

    /**
     * 获取Toast实例
     */
    private static async getToast(): Promise<Toast> {

        if (
            this.toast &&
            isValid(this.toast.node)
        ) {
            return this.toast;
        }

        while (this.loading) {

            await new Promise(r => setTimeout(r, 100));

        }

        if (
            this.toast &&
            isValid(this.toast.node)
        ) {
            return this.toast;
        }

        this.loading = true;

        return new Promise((resolve, reject) => {

            resources.load(
                "Components/Toast/Toast",
                Prefab,
                (err, prefab) => {

                    this.loading = false;

                    if (err) {

                        reject(err);

                        return;
                    }

                    const canvas = director
                        .getScene()
                        .getComponentInChildren(Canvas);

                    if (!canvas) {

                        reject("Canvas不存在");

                        return;

                    }

                    const node = instantiate(prefab);

                    canvas.node.addChild(node);

                    this.toast = node.getComponent(Toast)!;

                    resolve(this.toast);

                });

        });

    }

}