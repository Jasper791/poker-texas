import { _decorator, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('depositItem')
export class depositItem extends Component {
    @property({ type: Node, tooltip: '区块' })
    blockNum: Node = null;

    @property({type:Node, tooltip: '交易哈希容器'})
    txHash:Node = null

    @property({type:Node, tooltip: '花费容器'})
    costNum:Node = null

    @property({type:Node,})
    status:Node = null

    start() {
    }

    updateContent(data: any) {
        const blockNumber = data.blockNumber !== undefined ? data.blockNumber : (data.block_number !== undefined ? data.block_number : 0);
        const blockLabel = this.findValueLabel(this.blockNum, ['block_number', 'blockHash']);
        if (blockLabel) {
            blockLabel.string = `${blockNumber}`;
        }
        
        const txHash = data.txHash !== undefined ? data.txHash : (data.tx_hash !== undefined ? data.tx_hash : '');
        const formattedTxHash = this.formatTxHash(txHash);
        const txHashLabel = this.findValueLabel(this.txHash, ['tx_hash', 'txHash']);
        if(txHashLabel) {
            txHashLabel.enableWrapText = true;
            txHashLabel.string = formattedTxHash;
        }

        const cardCost = data.tokenAmountDisplay !== undefined ? data.tokenAmountDisplay : (data.token_amount_display !== undefined ? data.token_amount_display : (data.amountDisplay !== undefined ? data.amountDisplay : 0));
        const cardCostLabel = this.findValueLabel(this.costNum, ['cardCost']);
        if(cardCostLabel) {
            cardCostLabel.string = `${cardCost}`;
        }

        const status = data.status !== undefined ? data.status : 0;
        const statusLabel = this.findValueLabel(this.status, ['status']);
        if(statusLabel) {
            statusLabel.string = `${this.getDepositStatusText(status)}`;
        }
    }

    private findValueLabel(parentNode: Node, valueNodeNames: string[]): Label | null {
        if (!parentNode) return null;
        const selfLabel = parentNode.getComponent(Label);
        if (selfLabel) return selfLabel;
        for (const name of valueNodeNames) {
            const child = parentNode.getChildByName(name);
            if (child) {
                const childLabel = child.getComponent(Label);
                if (childLabel) return childLabel;
            }
        }
        return null;
    }

    private formatTxHash(txHash: string): string {
        if (!txHash || txHash.length <= 34) return txHash;
        return txHash.substring(0, 34) + '\n' + txHash.substring(34);
    }

    private getDepositStatusText(status: number): string {
        const statusMap: { [key: number]: string } = {
            0: '待确认',
            1: '已确认',
            2: '已处理',
            3: '失败'
        };
        return statusMap[status] || `状态${status}`;
    }

    update(deltaTime: number) {

    }
}
