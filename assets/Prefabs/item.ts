import { _decorator, Component, Label, Node, Color } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('item')
export class item extends Component {
    @property({ type: Node })
    roomNum: Node = null;

    @property({ type: Node })
    playNums: Node = null;

    @property({ type: Node })
    round: Node = null;

    @property({ type: Node })
    ante: Node = null;

    @property({ type: Node })
    cardCost: Node = null;

    @property({ type: Node })
    rule: Node = null;

    @property({ type: Node })
    revenueValue: Node = null;

    @property({ type: Node, tooltip: '状态' })
    status: Node = null

    updateContent(room: any) {
        const setLabel = (node: Node, value: string) => {
            if (!node) return;
            const label = node.getComponent(Label);
            if (label) {
                label.string = value;
            }
        };

        const roomCode = room.roomCode || room.room_code || room.roomNo || room.room_no || '0';
        setLabel(this.roomNum, roomCode);

        const maxPlayers = room.maxPlayers || room.max_players || room.max_player_count || 0;
        let playerRange = '';
        if (maxPlayers === 5) {
            playerRange = '2-5';
        } else if (maxPlayers === 7) {
            playerRange = '2-7';
        } else if (maxPlayers === 9) {
            playerRange = '2-9';
        } else {
            playerRange = `2-${maxPlayers}`;
        }
        setLabel(this.playNums, playerRange);

        const maxRounds = room.maxRounds || room.max_rounds || room.round_count || 0;
        setLabel(this.round, `${maxRounds}`);

        const ante = room.ante || room.base_ante || room.minBet || 0;
        setLabel(this.ante, `${ante}`);

        const cardCost = room.roomCardCost || room.card_cost || room.cardCount || room.card_count || 0;
        setLabel(this.cardCost, `${cardCost}`);

        const status = room.status !== undefined ? room.status : 0;
        setLabel(this.status, `${this.getStatusText(status)}`)

        setLabel(this.rule, '计分');
    }

    updateRevenueValue(totalAmount: number) {
        if (!this.revenueValue) {
            return;
        }
        const label = this.revenueValue.getComponent(Label);
        if (!label) {
            return;
        }

        if (totalAmount > 0) {
            label.string = `${totalAmount}`;
            label.color = new Color(0, 0, 255, 255);
        } else if (totalAmount < 0) {
            label.string = `${totalAmount}`;
            label.color = new Color(255, 0, 0, 255);
        } else {
            label.string = '0';
            label.color = new Color(100, 100, 100, 255);
        }
    }

    private getStatusText(status: number): string {
        const statusMap: { [key: number]: string } = {
            0: '待确认',
            1: '已确认',
            2: '已处理',
            3: '失败'
        };
        return statusMap[status] || `${status}`;
    }
}
