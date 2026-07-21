import { LogService } from '../utils/LogService';
import { ErrorService, ErrorType } from '../utils/ErrorService';
import { NetworkMessage, SuccessCallback, ErrorCallback, GenericCallback } from '../types';

/**
 * 请求状态
 */
export enum RequestStatus {
    PENDING = 'PENDING',
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR',
    TIMEOUT = 'TIMEOUT'
}

/**
 * 请求配置
 */
export interface RequestConfig {
    cmd: number;
    data: any;
    timeout?: number;
    retries?: number;
    requestId?: string;
}

/**
 * 请求记录
 */
interface RequestRecord {
    id: string;
    config: RequestConfig;
    status: RequestStatus;
    startTime: number;
    retries: number;
    successCallbacks: SuccessCallback<any>[];
    errorCallbacks: ErrorCallback[];
    timeoutTimer?: any;
}

/**
 * 网络请求管理器
 * 提供类型安全的请求包装、超时处理、重试机制
 */
export class NetworkRequestManager {
    private static _instance: NetworkRequestManager | null = null;
    private _pendingRequests: Map<string, RequestRecord> = new Map();
    private _defaultTimeout: number = 30000; // 默认30秒超时
    private _defaultRetries: number = 0; // 默认不重试
    private _requestCounter: number = 0;
    private _sendMessageFn: ((cmd: number, data: any) => void) | null = null;

    /**
     * 获取单例
     */
    static getInstance(): NetworkRequestManager {
        if (!NetworkRequestManager._instance) {
            NetworkRequestManager._instance = new NetworkRequestManager();
        }
        return NetworkRequestManager._instance;
    }

    /**
     * 初始化，设置实际发送消息的函数
     */
    init(sendMessageFn: (cmd: number, data: any) => void): void {
        this._sendMessageFn = sendMessageFn;
    }

    /**
     * 发送请求
     */
    sendRequest<T = any>(config: RequestConfig): Promise<T> {
        return new Promise((resolve, reject) => {
            this.sendRequestWithCallbacks(
                config,
                (data: T) => resolve(data),
                (error: string) => reject(error)
            );
        });
    }

    /**
     * 发送请求，带回调函数
     */
    sendRequestWithCallbacks<T = any>(
        config: RequestConfig,
        onSuccess?: SuccessCallback<T>,
        onError?: ErrorCallback
    ): void {
        const requestId = config.requestId || this._generateRequestId();
        const timeout = config.timeout || this._defaultTimeout;
        const retries = config.retries !== undefined ? config.retries : this._defaultRetries;

        // 创建请求记录
        const record: RequestRecord = {
            id: requestId,
            config: { ...config, requestId },
            status: RequestStatus.PENDING,
            startTime: Date.now(),
            retries: 0,
            successCallbacks: onSuccess ? [onSuccess] : [],
            errorCallbacks: onError ? [onError] : []
        };

        // 设置超时
        record.timeoutTimer = setTimeout(() => {
            this._handleTimeout(requestId);
        }, timeout);

        // 保存请求
        this._pendingRequests.set(requestId, record);

        // 发送请求
        this._sendRequest(record);
    }

    /**
     * 处理响应
     */
    handleResponse(response: any): boolean {
        // 尝试从响应中提取 requestId
        const requestId = this._extractRequestId(response);
        
        if (!requestId) {
            return false;
        }

        const record = this._pendingRequests.get(requestId);
        if (!record) {
            return false;
        }

        // 清除超时计时器
        this._clearTimeout(record);

        // 更新状态
        record.status = RequestStatus.SUCCESS;

        // 调用成功回调
        record.successCallbacks.forEach(callback => {
            try {
                callback(response);
            } catch (e) {
                LogService.error('NetworkRequestManager', '成功回调执行失败:', e);
            }
        });

        // 移除请求
        this._pendingRequests.delete(requestId);

        const duration = Date.now() - record.startTime;

        return true;
    }

    /**
     * 处理错误
     */
    handleError(requestId: string, error: string): boolean {
        const record = this._pendingRequests.get(requestId);
        if (!record) {
            return false;
        }

        this._handleRequestError(record, error);
        return true;
    }

    /**
     * 取消请求
     */
    cancelRequest(requestId: string): boolean {
        const record = this._pendingRequests.get(requestId);
        if (!record) {
            return false;
        }

        this._clearTimeout(record);
        this._pendingRequests.delete(requestId);
        return true;
    }

    /**
     * 取消所有请求
     */
    cancelAllRequests(): void {
        this._pendingRequests.forEach((record) => {
            this._clearTimeout(record);
        });
        this._pendingRequests.clear();
    }

    /**
     * 获取待处理请求数量
     */
    getPendingRequestCount(): number {
        return this._pendingRequests.size;
    }

    /**
     * 设置默认超时
     */
    setDefaultTimeout(timeout: number): void {
        this._defaultTimeout = timeout;
    }

    /**
     * 设置默认重试次数
     */
    setDefaultRetries(retries: number): void {
        this._defaultRetries = retries;
    }

    // ==================== 私有方法 ====================

    /**
     * 生成请求ID
     */
    private _generateRequestId(): string {
        return `${Date.now()}_${++this._requestCounter}`;
    }

    /**
     * 发送请求
     */
    private _sendRequest(record: RequestRecord): void {
        if (!this._sendMessageFn) {
            this._handleRequestError(record, 'NetworkRequestManager 未初始化');
            return;
        }

        try {
            const requestData = {
                ...record.config.data,
                requestId: record.id
            };
            this._sendMessageFn(record.config.cmd, requestData);
        } catch (e) {
            this._handleRequestError(record, e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * 处理超时
     */
    private _handleTimeout(requestId: string): void {
        const record = this._pendingRequests.get(requestId);
        if (!record) {
            return;
        }

        // 检查是否可以重试
        const maxRetries = record.config.retries !== undefined ? record.config.retries : this._defaultRetries;
        if (record.retries < maxRetries) {
            record.retries++;
            
            // 重置超时
            const timeout = record.config.timeout || this._defaultTimeout;
            record.timeoutTimer = setTimeout(() => {
                this._handleTimeout(requestId);
            }, timeout);
            
            // 重新发送
            this._sendRequest(record);
            return;
        }

        // 无法重试，处理错误
        record.status = RequestStatus.TIMEOUT;
        this._handleRequestError(record, '请求超时');
        
        // 记录错误
        ErrorService.getInstance().handleNetworkError(
            'REQUEST_TIMEOUT',
            `请求超时: cmd=${record.config.cmd}`,
            { requestId, cmd: record.config.cmd }
        );
    }

    /**
     * 处理请求错误
     */
    private _handleRequestError(record: RequestRecord, error: string): void {
        this._clearTimeout(record);
        record.status = RequestStatus.ERROR;

        // 调用错误回调
        record.errorCallbacks.forEach(callback => {
            try {
                callback(error);
            } catch (e) {
                LogService.error('NetworkRequestManager', '错误回调执行失败:', e);
            }
        });

        // 移除请求
        this._pendingRequests.delete(record.id);

        const duration = Date.now() - record.startTime;
        LogService.error('NetworkRequestManager', `请求失败 [${record.id}] 错误: ${error} 耗时: ${duration}ms`);
    }

    /**
     * 清除超时计时器
     */
    private _clearTimeout(record: RequestRecord): void {
        if (record.timeoutTimer) {
            clearTimeout(record.timeoutTimer);
            record.timeoutTimer = undefined;
        }
    }

    /**
     * 从响应中提取请求ID
     * 可根据实际协议调整此方法
     */
    private _extractRequestId(response: any): string | null {
        // 尝试从多个位置提取
        if (response.requestId) {
            return response.requestId;
        }
        if (response.body?.requestId) {
            return response.body.requestId;
        }
        if (response.data?.requestId) {
            return response.data.requestId;
        }
        return null;
    }
}
