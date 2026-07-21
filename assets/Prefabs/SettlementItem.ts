import { _decorator, Color, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SettlementItem')
export class SettlementItem extends Component {
    @property({ type: Node, tooltip: '房间号' })
    roomCode: Node = null;

    @property({ type: Node, tooltip: '盈亏' })
    amount: Node = null

    @property({ type: Node, tooltip: '局数' })
    currentRound: Node = null

    @property({ type: Node, tooltip: '结算前' })
    beforeBalance: Node = null

    @property({ type: Node, tooltip: '结算后' })
    afterBalance: Node = null;

    @property({ type: Node, tooltip: '时间' })
    updatedAt: Node = null


    start() {

    }

    updateContent(settlement: any) {
        const roomNumLabel = this.roomCode.getComponent(Label);
        // roomCode - 显示房间显示号（支持两种字段名：roomCode 和 room_code）
        const roomCode = settlement.roomCode || settlement.room_code;
        if (roomNumLabel) {
            roomNumLabel.string = `${roomCode}`
        }

        // 盈亏
        const amountLabel = this.amount.getComponent(Label);
        const amount = settlement.amount !== undefined ? settlement.amount : 0;
        if (amountLabel) {
            amountLabel.string = `${amount}`
            amountLabel.color = Number(amount) > 0 ? new Color(0, 0, 255, 255) : new Color(255, 0, 0, 255)
        }

        const currentRoundLabel = this.currentRound.getComponent(Label);
        if (currentRoundLabel) {
            currentRoundLabel.string = `${settlement.current_round || settlement.currentRound}`
        }

        const beforeBalanceLabel = this.beforeBalance.getComponent(Label);
        if (beforeBalanceLabel) {
            beforeBalanceLabel.string = `${settlement.before_balance ?? settlement.beforeBalance}`
        }

        const afterBalanceLabel = this.afterBalance.getComponent(Label);
         // afterBalance - 结算后余额（支持 after_balance 和 afterBalance 两种字段名）
        if (afterBalanceLabel) {
            afterBalanceLabel.string = `${settlement.after_balance ?? settlement.afterBalance ?? 0}`
        }

        const updatedAtLabel = this.updatedAt.getComponent(Label);
        if (updatedAtLabel) {

            let timestamp = settlement.create_time;

            // 如果是字符串时间格式，尝试解析
            if (typeof timestamp === 'string') {
                const date = new Date(timestamp);
                if (!isNaN(date.getTime())) {
                    timestamp = date.getTime();
                } else {
                    const num = Number(timestamp);
                    if (!isNaN(num)) {
                        timestamp = num;
                    }
                }
            }

            let date: Date;
            if (typeof timestamp === 'number') {
                // 如果是秒级时间戳，转换为毫秒
                date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
            } else {
                date = new Date();
            }

            // 仅显示小时和分钟：HH:mm
            const h = date.getHours();
            const m = date.getMinutes();
            const hours = h < 10 ? '0' + h : String(h);
            const minutes = m < 10 ? '0' + m : String(m);

            updatedAtLabel.string = `${hours}:${minutes}`;
        }
    }
}

