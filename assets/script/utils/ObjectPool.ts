/**
 * 通用对象池管理器
 * 注意：为了确保预制体修改后能立即生效，已禁用缓存功能
 * 每次 acquire() 都会从预制体实例化新对象
 */

import { instantiate, Node, Prefab } from 'cc';

interface PoolConfig {
    prefab: Prefab;
    initialSize?: number;
    maxSize?: number;
    onAcquire?: (node: Node) => void;
    onRelease?: (node: Node) => void;
}

export class ObjectPool {
    private _prefab: Prefab;
    private _onAcquire?: (node: Node) => void;
    private _onRelease?: (node: Node) => void;

    constructor(config: PoolConfig) {
        this._prefab = config.prefab;
        this._onAcquire = config.onAcquire;
        this._onRelease = config.onRelease;
    }

    /**
     * 从池中获取对象（每次都从预制体实例化，确保使用最新的预制体）
     * @returns 节点对象
     */
    acquire(): Node {
        const node = instantiate(this._prefab);
        node.active = true;

        if (this._onAcquire) {
            this._onAcquire(node);
        }

        return node;
    }

    /**
     * 将对象归还到池中（直接销毁，不缓存）
     * @param node 要归还的节点
     */
    release(node: Node): void {
        if (!node) return;

        if (this._onRelease) {
            this._onRelease(node);
        }

        node.destroy();
    }

    /**
     * 批量归还对象
     * @param nodes 要归还的节点数组
     */
    releaseAll(nodes: Node[]): void {
        nodes.forEach(node => this.release(node));
    }

    /**
     * 清空对象池（已禁用缓存，此方法为空实现）
     */
    clear(): void {
        // 已禁用缓存，无需清空
    }

    /**
     * 获取当前池大小（始终返回0，因为已禁用缓存）
     */
    get size(): number {
        return 0;
    }
}