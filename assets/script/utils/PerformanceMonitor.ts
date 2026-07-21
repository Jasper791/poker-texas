import { LogService } from './LogService';

/**
 * 性能指标接口
 */
export interface PerformanceMetrics {
    fps: number;
    frameTime: number;
    memoryUsed?: number;
    drawCalls?: number;
    triangles?: number;
}

/**
 * 性能记录项
 */
interface PerformanceRecord {
    timestamp: number;
    metrics: PerformanceMetrics;
}

/**
 * 性能标记
 */
interface Mark {
    name: string;
    startTime: number;
}

/**
 * 性能测量结果
 */
export interface MeasureResult {
    name: string;
    duration: number;
    avgDuration: number;
    count: number;
}

/**
 * 性能监控器
 * 监控 FPS、内存、函数执行时间等
 */
export class PerformanceMonitor {
    private static _instance: PerformanceMonitor | null = null;

    private _enabled: boolean = true;
    private _frames: number[] = [];
    private _lastFrameTime: number = 0;
    private _lastSecond: number = 0;
    private _frameCount: number = 0;
    private _currentFps: number = 0;

    private _marks: Map<string, Mark> = new Map();
    private _measures: Map<string, { durations: number[], count: number }> = new Map();
    private _history: PerformanceRecord[] = [];
    private readonly _maxHistorySize: number = 300; // 5分钟历史记录

    // 回调
    private _onMetricsUpdate?: (metrics: PerformanceMetrics) => void;

    /**
     * 获取单例
     */
    static getInstance(): PerformanceMonitor {
        if (!PerformanceMonitor._instance) {
            PerformanceMonitor._instance = new PerformanceMonitor();
        }
        return PerformanceMonitor._instance;
    }

    /**
     * 私有构造函数
     */
    private constructor() {
    }

    /**
     * 启用/禁用监控
     */
    setEnabled(enabled: boolean): void {
        this._enabled = enabled;
    }

    /**
     * 是否启用
     */
    isEnabled(): boolean {
        return this._enabled;
    }

    /**
     * 设置指标更新回调
     */
    setOnMetricsUpdate(callback?: (metrics: PerformanceMetrics) => void): void {
        this._onMetricsUpdate = callback;
    }

    /**
     * 每帧更新（需要在游戏循环中调用）
     */
    update(deltaTime: number): void {
        if (!this._enabled) return;

        const now = Date.now();

        // 计算 FPS
        this._frameCount++;
        if (now - this._lastSecond >= 1000) {
            this._currentFps = Math.round(this._frameCount);
            this._frameCount = 0;
            this._lastSecond = now;

            // 记录指标
            const metrics = this.getMetrics();
            this._recordMetrics(metrics);

            // 触发回调
            if (this._onMetricsUpdate) {
                this._onMetricsUpdate(metrics);
            }
        }

        // 记录帧时间
        this._frames.push(deltaTime * 1000);
        if (this._frames.length > 60) {
            this._frames.shift();
        }
    }

    /**
     * 开始性能标记
     */
    mark(name: string): void {
        if (!this._enabled) return;

        this._marks.set(name, {
            name,
            startTime: performance.now()
        });
    }

    /**
     * 结束性能标记并测量
     */
    measure(name: string): number {
        if (!this._enabled) return 0;

        const mark = this._marks.get(name);
        if (!mark) {
            LogService.warn('PerformanceMonitor', `Mark '${name}' not found`);
            return 0;
        }

        const duration = performance.now() - mark.startTime;
        this._marks.delete(name);

        // 记录测量结果
        let measureData = this._measures.get(name);
        if (!measureData) {
            measureData = { durations: [], count: 0 };
            this._measures.set(name, measureData);
        }

        measureData.durations.push(duration);
        measureData.count++;

        // 保留最近 100 个样本
        if (measureData.durations.length > 100) {
            measureData.durations.shift();
        }

        return duration;
    }

    /**
     * 包装函数以自动测量性能
     */
    wrap<T extends (...args: any[]) => any>(name: string, fn: T): T {
        const self = this;
        return function(...args: Parameters<T>): ReturnType<T> {
            self.mark(name);
            try {
                return fn(...args);
            } finally {
                self.measure(name);
            }
        } as T;
    }

    /**
     * 包装异步函数以自动测量性能
     */
    wrapAsync<T extends (...args: any[]) => Promise<any>>(name: string, fn: T): T {
        const self = this;
        return (async function(...args: Parameters<T>): Promise<ReturnType<T>> {
            self.mark(name);
            try {
                return await fn(...args);
            } finally {
                self.measure(name);
            }
        }) as T;
    }

    /**
     * 获取当前性能指标
     */
    getMetrics(): PerformanceMetrics {
        const avgFrameTime = this._frames.length > 0
            ? this._frames.reduce((a, b) => a + b, 0) / this._frames.length
            : 0;

        return {
            fps: this._currentFps,
            frameTime: avgFrameTime
        };
    }

    /**
     * 获取测量结果
     */
    getMeasure(name: string): MeasureResult | null {
        const measureData = this._measures.get(name);
        if (!measureData || measureData.durations.length === 0) {
            return null;
        }

        const durations = measureData.durations;
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

        return {
            name,
            duration: durations[durations.length - 1],
            avgDuration,
            count: measureData.count
        };
    }

    /**
     * 获取所有测量结果
     */
    getAllMeasures(): MeasureResult[] {
        const results: MeasureResult[] = [];
        for (const name of this._measures.keys()) {
            const measure = this.getMeasure(name);
            if (measure) {
                results.push(measure);
            }
        }
        return results;
    }

    /**
     * 获取历史记录
     */
    getHistory(): PerformanceRecord[] {
        return [...this._history];
    }

    /**
     * 重置所有测量
     */
    resetMeasures(): void {
        this._marks.clear();
        this._measures.clear();
    }

    /**
     * 重置历史记录
     */
    resetHistory(): void {
        this._history = [];
    }

    /**
     * 重置所有
     */
    reset(): void {
        this.resetMeasures();
        this.resetHistory();
        this._frames = [];
        this._frameCount = 0;
        this._currentFps = 0;
    }

    /**
     * 记录性能指标
     */
    private _recordMetrics(metrics: PerformanceMetrics): void {
        this._history.push({
            timestamp: Date.now(),
            metrics: { ...metrics }
        });

        // 限制历史记录大小
        if (this._history.length > this._maxHistorySize) {
            this._history.shift();
        }
    }

    /**
     * 生成性能报告
     */
    generateReport(): string {
        const metrics = this.getMetrics();
        const measures = this.getAllMeasures();

        let report = '\n========== Performance Report ==========\n';
        report += `FPS: ${metrics.fps}\n`;
        report += `Avg Frame Time: ${metrics.frameTime.toFixed(2)}ms\n`;

        if (measures.length > 0) {
            report += '\n--- Measures ---\n';
            for (const measure of measures) {
                report += `${measure.name}: ${measure.duration.toFixed(2)}ms (avg: ${measure.avgDuration.toFixed(2)}ms, count: ${measure.count})\n`;
            }
        }

        report += '========================================\n';
        return report;
    }

    /**
     * 打印性能报告
     */
    printReport(): void {
        LogService.info('PerformanceMonitor', this.generateReport());
    }
}

// ==================== 便捷函数 ====================

/**
 * 测量函数执行时间
 */
export function measureTime<T>(name: string, fn: () => T): T {
    const monitor = PerformanceMonitor.getInstance();
    monitor.mark(name);
    try {
        return fn();
    } finally {
        monitor.measure(name);
    }
}

/**
 * 测量异步函数执行时间
 */
export async function measureTimeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const monitor = PerformanceMonitor.getInstance();
    monitor.mark(name);
    try {
        return await fn();
    } finally {
        monitor.measure(name);
    }
}
